/**
 * 派件异常催取 — 凭证号、免费次数 & RSA 许可校验
 * 可在 sidepanel 与 service worker（importScripts）中共用。
 */
(function (global) {
  "use strict";

  const DU_FREE_USE_LIMIT = 50;
  /** 临时测试：true 时强制显示剩余 0 次并进入锁定态，测完改回 false */
  const DU_DEV_FORCE_EXHAUSTED = true;
  const DU_LICENSE_SALT = "LICENSE_VERIFIED_SUCCESS_2026";
  /** 用户可见凭证号长度；激活码 Ed25519 签名绑定该 8 位凭证号 */
  const DU_CREDENTIAL_LEN = 8;

  /** Ed25519 公钥（SPKI DER Base64），私钥仅用于本地签发 */
  const DU_ED25519_PUBLIC_SPKI_B64 =
    "MCowBQYDK2VwAyEAZWFJ1wWi8cSTrC/NlCSpGnq+pzi5oU4+iFvv/09yOuM=";

  let cachedEd25519PublicKey = null;

  const DU_LICENSE_STORAGE = {
    credentialId: "shopee_delivery_urge_credential_id_v2",
    deviceId: "shopee_delivery_urge_device_id_v1",
    usage: "shopee_delivery_urge_usage_v1",
    sysDataStatus: "sys_data_status",
    sysConfigVer: "sys_config_ver",
    redeemedList: "shopee_delivery_urge_redeemed_v1",
  };

  let cachedStatus = null;
  let cachedSha256Hex = null;

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime?.lastError) {
            resolve({});
            return;
          }
          resolve(result || {});
        });
        return;
      }
      const out = {};
      keys.forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (raw != null) out[key] = raw;
        } catch (_e) { /* ignore */ }
      });
      resolve(out);
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set(data, () => resolve());
        return;
      }
      Object.entries(data).forEach(([key, value]) => {
        try {
          if (value == null) localStorage.removeItem(key);
          else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        } catch (_e) { /* ignore */ }
      });
      resolve();
    });
  }

  function parseJSON(value, fallback) {
    if (value == null) return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch (_e) {
      return fallback;
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  function randomCredentialId(length = DU_CREDENTIAL_LEN) {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    const bytes = new Uint8Array(length);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
      for (let i = 0; i < length; i++) out += chars[bytes[i] % 36];
    } else {
      for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * 36)];
    }
    return out;
  }

  async function fingerprintCredentialId() {
    const seed = [
      typeof navigator !== "undefined" ? navigator.userAgent : "",
      typeof screen !== "undefined" ? screen.width : 0,
      typeof screen !== "undefined" ? screen.height : 0,
      typeof screen !== "undefined" ? screen.colorDepth : 0,
      typeof navigator !== "undefined" ? navigator.language : "",
      new Date().getTimezoneOffset(),
    ].join("|");

    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      return bytesToHex(new Uint8Array(buf)).slice(0, DU_CREDENTIAL_LEN);
    }
    return randomCredentialId();
  }

  function normalizeCredentialId(value) {
    return String(value || "").trim().toUpperCase().slice(0, DU_CREDENTIAL_LEN);
  }

  function credentialIdsMatch(storedId, currentId) {
    const saved = normalizeCredentialId(storedId);
    const current = normalizeCredentialId(currentId);
    if (!saved || !current) return false;
    if (saved === current) return true;
    return saved.slice(0, DU_CREDENTIAL_LEN) === current.slice(0, DU_CREDENTIAL_LEN);
  }

  async function getOrCreateCredentialId() {
    const stored = await storageGet([
      DU_LICENSE_STORAGE.credentialId,
      DU_LICENSE_STORAGE.deviceId,
    ]);
    const existing =
      stored[DU_LICENSE_STORAGE.credentialId] || stored[DU_LICENSE_STORAGE.deviceId];
    if (existing) {
      const normalized = normalizeCredentialId(existing);
      if (normalized !== String(existing).trim().toUpperCase()) {
        await storageSet({ [DU_LICENSE_STORAGE.credentialId]: normalized });
      }
      return normalized;
    }

    const credentialId = normalizeCredentialId(await fingerprintCredentialId());
    await storageSet({ [DU_LICENSE_STORAGE.credentialId]: credentialId });
    return credentialId;
  }

  async function getPublicCredentialIdFromStorage() {
    return getOrCreateCredentialId();
  }

  function md5(str) {
    function cmn(q, a, b, x, s, t) {
      const updated = add32(add32(a, q), add32(x, t));
      return add32((updated << s) | (updated >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) {
      return cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function gg(a, b, c, d, x, s, t) {
      return cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function hh(a, b, c, d, x, s, t) {
      return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function ii(a, b, c, d, x, s, t) {
      return cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    function md5cycle(x, k) {
      let a = x[0];
      let b = x[1];
      let c = x[2];
      let d = x[3];
      a = ff(a, b, c, d, k[0], 7, -680876936);
      d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819);
      b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897);
      d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341);
      b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416);
      d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063);
      b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682);
      d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290);
      b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510);
      d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713);
      b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691);
      d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335);
      b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438);
      d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961);
      b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467);
      d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473);
      b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558);
      d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562);
      b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060);
      d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632);
      b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174);
      d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979);
      b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487);
      d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520);
      b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844);
      d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905);
      b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571);
      d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523);
      b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359);
      d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380);
      b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070);
      d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259);
      b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]);
      x[1] = add32(b, x[1]);
      x[2] = add32(c, x[2]);
      x[3] = add32(d, x[3]);
    }
    function md51(s) {
      let txt = unescape(encodeURIComponent(s));
      const n = txt.length;
      const state = [1732584193, -271733879, -1732584194, 271733878];
      let i;
      for (i = 64; i <= n; i += 64) {
        md5cycle(state, md5blk(txt.substring(i - 64, i)));
      }
      txt = txt.substring(i - 64);
      const tail = new Array(16).fill(0);
      for (i = 0; i < txt.length; i++) tail[i >> 2] |= txt.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) {
        md5cycle(state, tail);
        for (let j = 0; j < 16; j++) tail[j] = 0;
      }
      tail[14] = n * 8;
      md5cycle(state, tail);
      return state;
    }
    function md5blk(s) {
      const md5blks = [];
      for (let i = 0; i < 64; i += 4) {
        md5blks[i >> 2] =
          s.charCodeAt(i) +
          (s.charCodeAt(i + 1) << 8) +
          (s.charCodeAt(i + 2) << 16) +
          (s.charCodeAt(i + 3) << 24);
      }
      return md5blks;
    }
    function rhex(n) {
      let s = "";
      for (let j = 0; j < 4; j++) {
        s += ("0" + ((n >> (j * 8)) & 255).toString(16)).slice(-2);
      }
      return s;
    }
    function add32(a, b) {
      return (a + b) & 0xffffffff;
    }
    return md51(str).map(rhex).join("");
  }

  function computeActivationToken(credentialId) {
    return md5(String(credentialId || "") + DU_LICENSE_SALT);
  }

  function decodeActivationSignature(token) {
    const normalized = String(token || "").trim().replace(/\s+/g, "");
    const b64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const bin = atob(b64 + pad);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function getEd25519PublicKey() {
    if (cachedEd25519PublicKey) return cachedEd25519PublicKey;
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const spki = Uint8Array.from(atob(DU_ED25519_PUBLIC_SPKI_B64), (c) => c.charCodeAt(0));
    cachedEd25519PublicKey = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return cachedEd25519PublicKey;
  }

  async function verifyEd25519Signature(credentialId, signatureToken) {
    const key = await getEd25519PublicKey();
    if (!key) return false;
    try {
      const signature = decodeActivationSignature(signatureToken);
      return await crypto.subtle.verify(
        { name: "Ed25519" },
        key,
        signature,
        new TextEncoder().encode(String(credentialId || ""))
      );
    } catch (_err) {
      return false;
    }
  }

  function parseLicenseCode(inputCode) {
    const trimmed = String(inputCode || "").trim().replace(/\s+/g, "");
    const dashIdx = trimmed.indexOf("-");
    if (dashIdx <= 0) return null;
    const inputCredential = normalizeCredentialId(trimmed.slice(0, dashIdx));
    const signature = trimmed.slice(dashIdx + 1).trim();
    if (!inputCredential || !signature) return null;
    if (inputCredential.length > DU_CREDENTIAL_LEN) return null;
    return { inputCredential, signature, fullCode: `${inputCredential}-${signature}` };
  }

  async function loadRedeemedList(stored) {
    const list = parseJSON(stored[DU_LICENSE_STORAGE.redeemedList], []);
    return Array.isArray(list) ? list.map(String) : [];
  }

  async function verifyLicense(inputCode) {
    const parsed = parseLicenseCode(inputCode);
    if (!parsed) {
      return { ok: false, code: "E_FMT" };
    }

    if (typeof crypto === "undefined" || !crypto.subtle) {
      return { ok: false, code: "E_MOD" };
    }

    const credentialId = await getOrCreateCredentialId();
    const input = parsed.inputCredential;

    let signPayload = "";
    if (input === credentialId) {
      signPayload = credentialId;
    } else if (input.length > DU_CREDENTIAL_LEN && input.slice(0, DU_CREDENTIAL_LEN) === credentialId) {
      signPayload = input;
    } else {
      return { ok: false, code: "E_DEV" };
    }

    if (!(await verifyEd25519Signature(signPayload, parsed.signature))) {
      return { ok: false, code: "E_SIG" };
    }

    const stored = await storageGet([DU_LICENSE_STORAGE.redeemedList]);
    const redeemed = await loadRedeemedList(stored);
    if (redeemed.includes(parsed.fullCode)) {
      return { ok: false, code: "E_USED" };
    }

    return { ok: true, credentialId, fullCode: parsed.fullCode };
  }

  function normalizeUsedCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function buildStatus(credentialId, activated, usedCount) {
    const id = normalizeCredentialId(credentialId);
    const used = activated
      ? 0
      : DU_DEV_FORCE_EXHAUSTED
        ? DU_FREE_USE_LIMIT
        : normalizeUsedCount(usedCount);
    const freeUsesLeft = activated ? DU_FREE_USE_LIMIT : Math.max(0, DU_FREE_USE_LIMIT - used);
    const isFreeTierActive = !activated && used < DU_FREE_USE_LIMIT;
    const isFreeTierExhausted = !activated && used >= DU_FREE_USE_LIMIT;

    return {
      credentialId: id,
      deviceId: id,
      isActivated: activated,
      isFreeTierActive,
      isFreeTierExhausted,
      isAllowed: activated || isFreeTierActive,
      freeUsesTotal: DU_FREE_USE_LIMIT,
      freeUsesUsed: used,
      freeUsesLeft: freeUsesLeft,
      isTrialActive: isFreeTierActive,
      isTrialExpired: isFreeTierExhausted,
    };
  }

  async function isActivatedForCredential(credentialId, stored) {
    const expected = computeActivationToken(credentialId);
    const actual =
      stored[DU_LICENSE_STORAGE.sysDataStatus] || stored[DU_LICENSE_STORAGE.sysConfigVer];
    return typeof actual === "string" && actual === expected;
  }

  async function readUsageRecordFromStorage(stored) {
    const snapshot = stored || (await storageGet([DU_LICENSE_STORAGE.usage]));
    return parseJSON(snapshot[DU_LICENSE_STORAGE.usage], null);
  }

  /** 只读 usage，刷新 UI 时绝不写 storage，避免覆盖刚扣减的次数 */
  async function readUsageRecord(credentialId) {
    const id = normalizeCredentialId(credentialId);
    const usage = await readUsageRecordFromStorage(null);
    if (!usage) {
      return { deviceId: id, usedCount: 0, lastRecordedSessionId: "" };
    }

    const savedRaw = usage.deviceId || usage.credentialId || "";
    const usedCount = normalizeUsedCount(usage.usedCount);
    const lastRecordedSessionId = usage.lastRecordedSessionId || "";

    if (credentialIdsMatch(savedRaw, id)) {
      return { deviceId: id, usedCount, lastRecordedSessionId };
    }

    // 凭证号变更时保留已用次数，避免误显示为 50 次满额
    return { deviceId: id, usedCount, lastRecordedSessionId };
  }

  /** 写入前确保 usage 记录存在（仅用于扣减/初始化） */
  async function ensureUsageRecord(credentialId) {
    const id = normalizeCredentialId(credentialId);
    const usage = await readUsageRecordFromStorage(null);
    const savedRaw = usage?.deviceId || usage?.credentialId || "";
    const preservedCount = normalizeUsedCount(usage?.usedCount);
    const preservedSession = usage?.lastRecordedSessionId || "";

    if (usage && credentialIdsMatch(savedRaw, id)) {
      const normalized = {
        deviceId: id,
        usedCount: preservedCount,
        lastRecordedSessionId: preservedSession,
      };
      if (normalizeCredentialId(savedRaw) !== id) {
        await storageSet({ [DU_LICENSE_STORAGE.usage]: normalized });
      }
      return normalized;
    }

    const created = {
      deviceId: id,
      usedCount: preservedCount,
      lastRecordedSessionId: preservedSession,
    };
    await storageSet({ [DU_LICENSE_STORAGE.usage]: created });
    return created;
  }

  async function refreshLicenseStatus() {
    const stored = await storageGet(Object.values(DU_LICENSE_STORAGE));
    const credentialId = await getOrCreateCredentialId();

    if (await isActivatedForCredential(credentialId, stored)) {
      cachedStatus = buildStatus(credentialId, true, 0);
      return cachedStatus;
    }

    const usage = await readUsageRecord(credentialId);
    cachedStatus = buildStatus(credentialId, false, usage.usedCount);
    return cachedStatus;
  }

  async function recordSuccessfulUse(scanSessionId) {
    const credentialId = await getOrCreateCredentialId();
    const stored = await storageGet(Object.values(DU_LICENSE_STORAGE));
    const sessionKey = scanSessionId != null && scanSessionId !== "" ? String(scanSessionId) : "";

    if (await isActivatedForCredential(credentialId, stored)) {
      cachedStatus = buildStatus(credentialId, true, 0);
      return cachedStatus;
    }

    let usage = await ensureUsageRecord(credentialId);
    const fresh = await readUsageRecordFromStorage(null);
    const freshRaw = fresh?.deviceId || fresh?.credentialId || "";
    if (fresh && credentialIdsMatch(freshRaw, credentialId)) {
      usage.usedCount = Math.max(usage.usedCount, normalizeUsedCount(fresh.usedCount));
      usage.lastRecordedSessionId = fresh.lastRecordedSessionId || usage.lastRecordedSessionId || "";
    }

    if (sessionKey && usage.lastRecordedSessionId === sessionKey) {
      cachedStatus = buildStatus(credentialId, false, usage.usedCount);
      return cachedStatus;
    }
    if (usage.usedCount >= DU_FREE_USE_LIMIT) {
      cachedStatus = buildStatus(credentialId, false, usage.usedCount);
      return cachedStatus;
    }

    usage.usedCount += 1;
    if (sessionKey) usage.lastRecordedSessionId = sessionKey;
    await storageSet({ [DU_LICENSE_STORAGE.usage]: usage });
    cachedStatus = buildStatus(credentialId, false, usage.usedCount);
    return cachedStatus;
  }

  async function activateWithCode(code) {
    const verifyResult = await verifyLicense(code);
    if (!verifyResult.ok) {
      return { ok: false, code: verifyResult.code || "E_FAIL" };
    }

    const credentialId = verifyResult.credentialId || (await getOrCreateCredentialId());
    const stored = await storageGet([DU_LICENSE_STORAGE.redeemedList]);
    const redeemed = await loadRedeemedList(stored);
    redeemed.push(verifyResult.fullCode);

    await storageSet({
      [DU_LICENSE_STORAGE.sysDataStatus]: computeActivationToken(credentialId),
      [DU_LICENSE_STORAGE.redeemedList]: redeemed,
    });

    cachedStatus = buildStatus(credentialId, true, 0);
    return { ok: true, status: cachedStatus };
  }

  function getCachedLicenseStatus() {
    return cachedStatus;
  }

  function invalidateLicenseCache() {
    cachedStatus = null;
  }

  function formatCredentialPreview(credentialId) {
    return normalizeCredentialId(credentialId);
  }

  global.DuLicense = {
    DU_FREE_USE_LIMIT,
    DU_CREDENTIAL_LEN,
    DU_ED25519_PUBLIC_SPKI_B64,
    DU_LICENSE_STORAGE,
    getOrCreateCredentialId,
    getPublicCredentialIdFromStorage,
    verifyLicense,
    verifyEd25519Signature,
    computeActivationToken,
    formatCredentialPreview,
    refreshLicenseStatus,
    recordSuccessfulUse,
    activateWithCode,
    getCachedLicenseStatus,
    invalidateLicenseCache,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
