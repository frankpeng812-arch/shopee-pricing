/* Shopee 聊聊 — 点击「去催取」后仅自动定位一次，不干扰后续手动切换 */

(function () {
  "use strict";

  if (window.__DU_WEBCHAT_HELPER_STARTED__) return;
  window.__DU_WEBCHAT_HELPER_STARTED__ = true;

  if (!location.pathname.includes("/webchat/conversations")) return;

  const DONE_KEY = "du_webchat_done_v1";
  const READY_WAIT_MS = 20000;
  const RESULT_WAIT_MS = 12000;
  const LEFT_PANEL_RATIO = 0.42;
  const HEADER_TOP_MAX = 160;

  function taskKey(pending) {
    return [pending.username, pending.buyerUserId, pending.shopId, pending.ts].join("|");
  }

  function readPendingFromUrl() {
    const params = new URLSearchParams(location.search);
    const username = (params.get("du_buyer") || "").trim();
    const buyerUserId = (params.get("du_buyer_id") || "").trim();
    const shopId = (params.get("cnsc_shop_id") || "").trim();
    const ts = (params.get("du_ts") || "").trim();
    if (!username) return null;
    return { username, buyerUserId, shopId, ts };
  }

  function isTaskDone(pending) {
    try {
      return sessionStorage.getItem(DONE_KEY) === taskKey(pending);
    } catch (_e) {
      return false;
    }
  }

  function markTaskDone(pending) {
    try {
      sessionStorage.setItem(DONE_KEY, taskKey(pending));
    } catch (_e) { /* ignore */ }
  }

  function cleanupUrl() {
    const params = new URLSearchParams(location.search);
    if (!params.has("du_buyer") && !params.has("du_buyer_id") && !params.has("du_ts")) return;
    params.delete("du_buyer");
    params.delete("du_buyer_id");
    params.delete("du_ts");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? `?${query}` : ""));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el || el.disabled) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function isInLeftPanel(el) {
    const rect = el.getBoundingClientRect();
    return rect.left < window.innerWidth * LEFT_PANEL_RATIO;
  }

  function isInChatHeader(el) {
    const rect = el.getBoundingClientRect();
    return rect.left > window.innerWidth * (LEFT_PANEL_RATIO - 0.05) && rect.top < HEADER_TOP_MAX;
  }

  function findSearchInput() {
    const candidates = [];
    document.querySelectorAll("input").forEach((input) => {
      if (!isVisible(input)) return;
      const type = (input.type || "text").toLowerCase();
      if (type !== "text" && type !== "search" && type !== "") return;

      const rect = input.getBoundingClientRect();
      const placeholder = String(input.placeholder || "").toLowerCase();
      const aria = String(input.getAttribute("aria-label") || "").toLowerCase();
      let score = 0;

      if (isInLeftPanel(input)) score += 4;
      if (rect.top < window.innerHeight * 0.25) score += 2;
      if (placeholder.includes("search") || placeholder.includes("搜索") || placeholder.includes("找")) {
        score += 4;
      }
      if (aria.includes("search") || aria.includes("搜索")) score += 3;
      if (input.closest('[class*="search"]')) score += 2;

      candidates.push({ input, score, top: rect.top });
    });

    candidates.sort((a, b) => b.score - a.score || a.top - b.top);
    return candidates[0]?.input || null;
  }

  function setReactInputValue(input, value) {
    input.focus();
    input.click();

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, "");
    else input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    if (setter) setter.call(input, value);
    else input.value = value;

    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: value,
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));

    try {
      input.select();
      document.execCommand("insertText", false, value);
    } catch (_e) { /* ignore */ }
  }

  function dispatchKey(target, key, keyCode) {
    const opts = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent("keydown", opts));
    target.dispatchEvent(new KeyboardEvent("keypress", opts));
    target.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  function simulateClick(el) {
    if (!el || !isVisible(el)) return;

    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.min(rect.width - 4, Math.max(4, rect.width / 2));
    const y = rect.top + Math.min(rect.height - 4, Math.max(4, rect.height / 2));
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
    };

    const target = document.elementFromPoint(x, y) || el;

    if (window.PointerEvent) {
      target.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", button: 0 }));
    }
    target.dispatchEvent(new MouseEvent("mousedown", { ...base, button: 0 }));
    if (window.PointerEvent) {
      target.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", button: 0 }));
    }
    target.dispatchEvent(new MouseEvent("mouseup", { ...base, button: 0 }));
    target.dispatchEvent(new MouseEvent("click", { ...base, button: 0 }));
    if (typeof target.click === "function") target.click();
  }

  function collectResultCandidates(username) {
    const needle = username.toLowerCase();
    const seen = new Set();
    const rows = [];

    const pushCandidate = (el) => {
      if (!el || !isVisible(el) || !isInLeftPanel(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < 70) return;
      const key = `${Math.round(rect.top)}|${Math.round(rect.left)}|${Math.round(rect.width)}`;
      if (seen.has(key)) return;
      seen.add(key);

      const text = (el.textContent || "").toLowerCase();
      if (!text.includes(needle)) return;

      const area = rect.width * rect.height;
      if (area > window.innerWidth * window.innerHeight * 0.2) return;

      rows.push({ el, top: rect.top, area, exact: text.trim() === needle });
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      if (!text || text.toLowerCase() !== needle) continue;

      let el = walker.currentNode.parentElement;
      for (let depth = 0; el && depth < 8; depth += 1) {
        pushCandidate(el);
        const cls = String(el.className || "");
        if (
          el.getAttribute("role") === "listitem" ||
          cls.includes("cell") ||
          cls.includes("conversation") ||
          cls.includes("Conversation") ||
          cls.includes("result") ||
          cls.includes("item")
        ) {
          break;
        }
        el = el.parentElement;
      }
    }

    rows.sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return a.top - b.top || a.area - b.area;
    });

    return rows.map((row) => row.el);
  }

  function isTargetChatOpen(username) {
    const needle = username.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      if (!text || text.toLowerCase() !== needle) continue;
      const host = walker.currentNode.parentElement;
      if (host && isInChatHeader(host) && isVisible(host)) return true;
    }
    return false;
  }

  async function tryKeyboardOpen(input, username) {
    input.focus();
    await sleep(200);
    dispatchKey(input, "ArrowDown", 40);
    await sleep(300);
    dispatchKey(input, "Enter", 13);
    await sleep(600);
    return isTargetChatOpen(username);
  }

  async function tryClickOpen(username) {
    const candidates = collectResultCandidates(username);
    if (!candidates.length) return false;

    const el = candidates[0];
    simulateClick(el);
    await sleep(600);
    if (isTargetChatOpen(username)) return true;

    let parent = el.parentElement;
    for (let i = 0; i < 4 && parent; i += 1) {
      if (isInLeftPanel(parent) && isVisible(parent)) {
        simulateClick(parent);
        await sleep(600);
        if (isTargetChatOpen(username)) return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  function chatReady() {
    return !!(
      findSearchInput() ||
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('[role="listitem"]')
    );
  }

  async function waitForChatReady(deadline) {
    while (Date.now() < deadline) {
      if (chatReady()) return true;
      await sleep(400);
    }
    return false;
  }

  async function openBuyerChatOnce(pending) {
    const username = String(pending.username || "").trim();
    if (!username) return false;

    await waitForChatReady(Date.now() + READY_WAIT_MS);

    const input = findSearchInput();
    if (!input) return false;

    setReactInputValue(input, username);

    let triedClick = false;
    let triedKeyboard = false;
    const deadline = Date.now() + RESULT_WAIT_MS;

    while (Date.now() < deadline) {
      await sleep(500);
      if (isTargetChatOpen(username)) return true;

      const hasResults = collectResultCandidates(username).length > 0;
      if (!hasResults) continue;

      if (!triedClick) {
        triedClick = true;
        if (await tryClickOpen(username)) return true;
      }
      if (!triedKeyboard) {
        triedKeyboard = true;
        if (await tryKeyboardOpen(input, username)) return true;
      }
      if (triedClick && triedKeyboard) break;
    }

    return isTargetChatOpen(username);
  }

  async function run() {
    const pending = readPendingFromUrl();
    if (!pending) return;
    if (isTaskDone(pending)) {
      cleanupUrl();
      return;
    }
    if (window.__DU_WEBCHAT_HELPER_RUNNING__) return;

    window.__DU_WEBCHAT_HELPER_RUNNING__ = true;
    markTaskDone(pending);
    cleanupUrl();

    try {
      await openBuyerChatOnce(pending);
    } finally {
      window.__DU_WEBCHAT_HELPER_RUNNING__ = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
