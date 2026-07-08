/**
 * 派件异常催取 — 凭证号 / 免费次数 / 激活码（独立 UI 模块，不介入页面检测与扫描主流程）
 */
(function (global) {
  "use strict";

  const DU_S = {
    LOCK_TITLE: "5YWN6LS55qyh5pWw5bey55So5a6M",
    LOCK_DESC:
      "5oKo55qE5YWN6LS55L2/55So5qyh5pWw5bey55So5ruh77yM6K+36IGU57O75oiR5Lus77yB",
    CRED_LABEL: "5Yet6K+B5Y+377ya",
    BTN_COPY: "5aSN5Yi2",
    INPUT_PH: "6K+36L6T5YWl5oKo55qE5r+A5rS756CB",
    BTN_SUBMIT: "56Gu6K6k5rC45LmF5r+A5rS7",
    BTN_CONTACT: "6IGU57O75oiR5Lus",
    E_EMPTY: "6K+36L6T5YWl5pyJ5pWI55qE5r+A5rS756CB",
    E_FMT: "5r+A5rS756CB5qC85byP5peg5pWI",
    E_MOD: "5Yqg5a+G5qih5Z2X5pyq5Yqg6L2977yM6K+35Yi35paw5o+S5Lu25ZCO6YeN6K+V",
    E_SIG: "562+5ZCN6aqM6K+B5aSx6LSl77yM6K+356Gu6K6k56CB5pyq6KKr56+h5pS5",
    E_DEV: "5Yet6K+B5Y+35LiO5b2T5YmN6K6+5aSH5LiN5Yy56YWN",
    E_USED: "6K+l56CB5bey6KKr5L2/55So77yM5LiA56CB5LuF6IO96Kej6ZSB5LiA5qyh",
    E_FAIL: "6Kej6ZSB5aSx6LSl77yM6K+36YeN6K+V",
    OK_UNLOCK: "5rC45LmF6Kej6ZSB5oiQ5Yqf77yB",
    COPY_FAIL: "5aSN5Yi25aSx6LSl77yM6K+35omL5Yqo5aSN5Yi2",
    CRED_COPIED: "5Yet6K+B5Y+35bey5aSN5Yi2",
    SCAN_LOCKED: "5YWN6LS56aKd5bqm5bey55So5a6M77yM6K+35YWI5a6M5oiQ6Kej6ZSB5ZCO5YaN5omr5o+P",
    QR_TITLE: "6IGU57O75oiR5Lus",
    QR_IMG: "aW1hZ2VzL2NvbW11bml0eS13ZWNoYXQtcXIucG5n",
  };

  const COPY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  let licenseStatus = null;
  let lockedAutoCopied = false;
  let credentialCopyTipTimer = null;
  let onUnlocked = null;

  function duTxt(b64) {
    if (!b64) return "";
    try {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch (_e) {
      return "";
    }
  }

  function duLicenseErr(code) {
    const map = {
      E_FMT: DU_S.E_FMT,
      E_MOD: DU_S.E_MOD,
      E_SIG: DU_S.E_SIG,
      E_DEV: DU_S.E_DEV,
      E_USED: DU_S.E_USED,
      E_FAIL: DU_S.E_FAIL,
    };
    return duTxt(map[code] || DU_S.E_FAIL);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function isBlocked() {
    return (
      !!licenseStatus &&
      !licenseStatus.isActivated &&
      !!licenseStatus.isFreeTierExhausted
    );
  }

  /** 扫描前调用：仅当免费次数用尽且未激活时拦截 */
  function requireForScan(showToast) {
    if (!isBlocked()) return true;
    showLockScreen(true);
    if (typeof showToast === "function") {
      showToast(duTxt(DU_S.SCAN_LOCKED));
    }
    return false;
  }

  async function refresh() {
    if (typeof DuLicense === "undefined") {
      licenseStatus = { isAllowed: true, isActivated: false, freeUsesUsed: 0, freeUsesTotal: 50 };
      await syncUsageBanner();
      return licenseStatus;
    }
    if (typeof DuLicense.invalidateLicenseCache === "function") {
      DuLicense.invalidateLicenseCache();
    }
    licenseStatus = await DuLicense.refreshLicenseStatus();
    await syncUsageBanner();
    syncLockScreen();
    return licenseStatus;
  }

  async function resolveCredentialId() {
    if (typeof DuLicense === "undefined") return "";
    try {
      if (typeof DuLicense.getOrCreateCredentialId === "function") {
        return (await DuLicense.getOrCreateCredentialId()) || "";
      }
      if (typeof DuLicense.getPublicCredentialIdFromStorage === "function") {
        return (await DuLicense.getPublicCredentialIdFromStorage()) || "";
      }
    } catch (_e) {
      return "";
    }
    return "";
  }

  async function syncUsageBanner() {
    const banner = el("duUsageBanner");
    const main = el("duUsageBannerMain");
    if (!banner || !main) return;

    const credentialId = (await resolveCredentialId()) || licenseStatus?.credentialId || licenseStatus?.deviceId || "";
    if (licenseStatus) {
      licenseStatus.credentialId = credentialId;
      licenseStatus.deviceId = credentialId;
    }

    main.replaceChildren();

    if (licenseStatus?.isActivated) {
      main.appendChild(document.createTextNode("永久激活成功，凭证号："));
      const credSpan = document.createElement("span");
      credSpan.className = "du-usage-banner-hint-text";
      credSpan.id = "duUsageBannerHintText";
      credSpan.textContent = credentialId || "加载中…";
      if (credentialId) credSpan.title = "点击复制凭证号";
      main.appendChild(credSpan);
      banner.hidden = false;
      return;
    }

    const used = licenseStatus?.freeUsesUsed ?? 0;
    const total = licenseStatus?.freeUsesTotal ?? 50;
    const remaining = Math.max(0, total - used);

    main.appendChild(document.createTextNode("剩余免费次数："));
    const countSpan = document.createElement("span");
    countSpan.className = "du-usage-banner-count";
    countSpan.id = "duUsageBannerCount";
    countSpan.textContent = String(remaining);
    main.appendChild(countSpan);
    const metaSpan = document.createElement("span");
    metaSpan.className = "du-usage-banner-hint-text";
    metaSpan.id = "duUsageBannerHintText";
    metaSpan.textContent = ` (共${total}次)，凭证号：${credentialId || "加载中…"}`;
    if (credentialId) metaSpan.title = "点击复制凭证号";
    main.appendChild(metaSpan);

    banner.hidden = false;
  }

  function showCredentialCopyTip() {
    const tip = el("duCredentialCopyTip");
    if (!tip) return;
    tip.textContent = duTxt(DU_S.CRED_COPIED);
    tip.hidden = false;
    clearTimeout(credentialCopyTipTimer);
    credentialCopyTipTimer = setTimeout(() => {
      tip.hidden = true;
    }, 2000);
  }

  async function copyCredentialId(showFeedback) {
    let id = licenseStatus?.credentialId || licenseStatus?.deviceId;
    if (!id && typeof DuLicense?.getPublicCredentialIdFromStorage === "function") {
      id = await DuLicense.getPublicCredentialIdFromStorage();
      if (licenseStatus) {
        licenseStatus.credentialId = id;
        licenseStatus.deviceId = id;
      }
      await syncUsageBanner();
    }
    if (!id || typeof copyText !== "function") return false;
    const ok = await copyText(id);
    if (showFeedback !== false) {
      if (ok) showCredentialCopyTip();
      else if (typeof global.duShowToast === "function") global.duShowToast(duTxt(DU_S.COPY_FAIL));
    }
    return ok;
  }

  function renderLockedView(root) {
    root.innerHTML = `
      <div class="du-locked-inner">
        <div class="du-locked-icon">🔒</div>
        <h3 class="du-locked-title">${duTxt(DU_S.LOCK_TITLE)}</h3>
        <p class="du-locked-desc">${duTxt(DU_S.LOCK_DESC)}</p>
        <div class="du-locked-credential-row">
          <span class="du-locked-credential-label">${duTxt(DU_S.CRED_LABEL)}</span>
          <code class="du-locked-device-id" id="duDeviceId">—</code>
          <button type="button" class="du-locked-copy-btn" id="duCopyDeviceIdBtn" title="${duTxt(DU_S.BTN_COPY)}" aria-label="${duTxt(DU_S.BTN_COPY)}">${COPY_ICON}</button>
        </div>
        <div class="du-locked-form">
          <textarea class="du-locked-input" id="duActivationCode" placeholder="${duTxt(DU_S.INPUT_PH)}" autocomplete="off" spellcheck="false" rows="3"></textarea>
          <p class="du-locked-error" id="duActivationError" hidden></p>
          <button type="button" class="du-locked-submit" id="duActivateBtn">${duTxt(DU_S.BTN_SUBMIT)}</button>
        </div>
        <button type="button" class="du-locked-community-btn" id="duLockedCommunityBtn">${duTxt(DU_S.BTN_CONTACT)}</button>
      </div>`;
  }

  function syncLockScreen() {
    const lockedRoot = el("duLocked");
    if (!lockedRoot) return;

    if (!isBlocked()) {
      lockedRoot.hidden = true;
      lockedRoot.setAttribute("aria-hidden", "true");
      lockedRoot.innerHTML = "";
      lockedAutoCopied = false;
      return;
    }

    if (!lockedRoot.childElementCount) {
      renderLockedView(lockedRoot);
    }

    const credentialId = licenseStatus?.credentialId || licenseStatus?.deviceId || "—";
    const deviceNode = el("duDeviceId");
    if (deviceNode) deviceNode.textContent = credentialId;

    lockedRoot.hidden = false;
    lockedRoot.setAttribute("aria-hidden", "false");
  }

  function showLockScreen(autoCopy) {
    if (!isBlocked()) return;
    syncLockScreen();
    if (typeof global.duSetViewState === "function") {
      global.duSetViewState("locked");
    }
    const credentialId = licenseStatus?.credentialId || licenseStatus?.deviceId;
    if (autoCopy && !lockedAutoCopied && credentialId && typeof copyText === "function") {
      lockedAutoCopied = true;
      copyText(credentialId);
    }
  }

  function showActivationError(message) {
    const node = el("duActivationError");
    if (!node) return;
    if (message) {
      node.textContent = message;
      node.hidden = false;
      return;
    }
    node.textContent = "";
    node.hidden = true;
  }

  async function handleActivateSubmit() {
    const input = el("duActivationCode");
    const btn = el("duActivateBtn");
    const code = input?.value?.trim();
    if (!code) {
      showActivationError(duTxt(DU_S.E_EMPTY));
      return;
    }
    if (typeof DuLicense === "undefined") return;

    showActivationError("");
    if (btn) btn.disabled = true;

    try {
      const result = await DuLicense.activateWithCode(code);
      if (!result.ok) {
        showActivationError(duLicenseErr(result.code));
        return;
      }
      licenseStatus = result.status;
      lockedAutoCopied = false;
      if (typeof global.duShowToast === "function") {
        global.duShowToast(duTxt(DU_S.OK_UNLOCK));
      }
      if (input) input.value = "";
      await syncUsageBanner();
      syncLockScreen();
      if (typeof onUnlocked === "function") onUnlocked();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function duShowContactQr() {
    if (typeof global.showCommunityQrModal === "function") {
      global.showCommunityQrModal(duTxt(DU_S.QR_TITLE));
      return;
    }
    const body = el("moreModalBody");
    const modal = el("moreModal");
    if (!body || !modal) return;
    body.innerHTML = `
      <p class="more-modal-label">${duTxt(DU_S.QR_TITLE)}</p>
      <img class="more-modal-qr" src="${duTxt(DU_S.QR_IMG)}" alt="" width="220" height="220">`;
    modal.hidden = false;
  }

  async function onScanSuccess(scanSessionId) {
    if (typeof DuLicense !== "undefined") {
      if (typeof DuLicense.invalidateLicenseCache === "function") {
        DuLicense.invalidateLicenseCache();
      }
      licenseStatus = await DuLicense.recordSuccessfulUse(scanSessionId);
      await syncUsageBanner();
      syncLockScreen();
      return licenseStatus;
    }
    return refresh();
  }

  function bindStorageSync() {
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "DU_USAGE_UPDATED") {
          void refresh();
        }
      });
    }
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const usageKey =
      typeof DuLicense !== "undefined" && DuLicense.DU_LICENSE_STORAGE
        ? DuLicense.DU_LICENSE_STORAGE.usage
        : "shopee_delivery_urge_usage_v1";
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[usageKey]) return;
      void refresh();
    });
  }

  /** 页面进入时强制刷新横幅（凭证号 + 剩余次数） */
  async function ensureBannerReady() {
    await refresh();
  }

  function handleScanBlockedFromBackground(showToast) {
    refresh().then(() => {
      showLockScreen(true);
      if (typeof showToast === "function") {
        showToast(duTxt(DU_S.SCAN_LOCKED));
      }
    });
  }

  function initCredentialCopyButton() {
    const btn = el("duCopyCredentialBtn");
    if (!btn) return;
    btn.innerHTML = COPY_ICON;
    btn.setAttribute("aria-label", "复制凭证号");
  }

  function bindEvents() {
    const lockedRoot = el("duLocked");
    if (lockedRoot && !lockedRoot.dataset.delegateBound) {
      lockedRoot.dataset.delegateBound = "1";
      lockedRoot.addEventListener("click", (e) => {
        if (e.target.closest("#duCopyDeviceIdBtn")) {
          copyCredentialId(true);
          return;
        }
        if (e.target.closest("#duActivateBtn")) {
          handleActivateSubmit();
          return;
        }
        if (e.target.closest("#duLockedCommunityBtn")) {
          duShowContactQr();
        }
      });
      lockedRoot.addEventListener("keydown", (e) => {
        if (e.target.id !== "duActivationCode") return;
        if (e.key !== "Enter" || e.shiftKey) return;
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleActivateSubmit();
        }
      });
    }

    el("duCopyCredentialBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      copyCredentialId(true);
    });
    el("duUsageBanner")?.addEventListener("click", (e) => {
      if (e.target.closest(".du-credential-copy-btn")) return;
      if (e.target.closest("#duUsageBannerHintText") || e.target.closest("#duUsageBannerMain")) {
        copyCredentialId(true);
      }
    });
    el("duUsageBannerHint")?.addEventListener("click", (e) => {
      if (e.target.closest(".du-credential-copy-btn")) return;
      copyCredentialId(true);
    });
  }

  function init(options) {
    if (options?.onUnlocked) onUnlocked = options.onUnlocked;
    initCredentialCopyButton();
    bindEvents();
    bindStorageSync();
    void refresh();
  }

  global.DuLicenseUI = {
    init,
    refresh,
    ensureBannerReady,
    requireForScan,
    isBlocked,
    showLockScreen,
    onScanSuccess,
    handleScanBlockedFromBackground,
    copyCredentialId,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
