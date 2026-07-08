importScripts("js/delivery-urge-license.js");

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const SHOP_IDS_STORAGE_KEY = "shopee_delivery_urge_shop_ids_v1";
const SCAN_SESSION_KEY = "shopee_delivery_urge_scan_session_v1";
const SHOPEE_SELLER_URL_RE =
  /^https:\/\/seller\.(?:shopee\.cn|ph\.shopee\.cn|th\.shopee\.cn|my\.shopee\.cn|sg\.shopee\.cn)\//i;

let activeScanTabId = null;
let scanEpoch = 0;

function notifyDeliveryUrgeTabChanged() {
  chrome.runtime.sendMessage({ type: "DELIVERY_URGE_TAB_CHANGED" }).catch(() => {});
}

function shouldInjectWebchatHelper(url) {
  return typeof url === "string" && url.includes("/webchat/") && url.includes("du_buyer=");
}

function injectWebchatHelper(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) return;
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["content/shopee-webchat-helper.js"],
    })
    .catch(() => {});
}

function watchWebchatHelperInjection(tabId, url) {
  if (!shouldInjectWebchatHelper(url)) return;

  const listener = (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(listener);
    injectWebchatHelper(tabId);
  };

  chrome.tabs.onUpdated.addListener(listener);
}

function parseTabUrl(url) {
  try {
    return new URL(url);
  } catch (_err) {
    return null;
  }
}

function isShippingListUrl(url) {
  if (typeof url !== "string" || !SHOPEE_SELLER_URL_RE.test(url)) return false;
  const parsed = parseTabUrl(url);
  if (!parsed) return false;
  if (parsed.hostname === "seller.shopee.cn") {
    if (parsed.searchParams.get("type") === "shipping") return true;
    return /\/portal\/sale\/shipping(\/|\?|$)/i.test(parsed.pathname);
  }
  return /\/portal\/sale\/shipping(\/|\?|$)/i.test(parsed.pathname);
}

async function getFocusedActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

/** 仅当指定或当前聚焦标签页为运送中订单页时返回，不在其他标签页中 fallback */
async function resolveShippingTab(preferredTabId) {
  if (preferredTabId != null) {
    try {
      const tab = await chrome.tabs.get(preferredTabId);
      if (tab?.url && isShippingListUrl(tab.url)) return tab;
    } catch (_err) {
      /* ignore */
    }
    return null;
  }

  const active = await getFocusedActiveTab();
  if (active?.url && isShippingListUrl(active.url)) return active;
  return null;
}

async function ensureOrderScanner(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTEXT" });
    return true;
  } catch (_err) {
    if (!chrome.scripting?.executeScript) return false;
    try {
      // manifest content_scripts 已注入 core 依赖，避免重复注入导致 const 冲突
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/shopee-order-scanner.js"],
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTEXT" });
      return true;
    } catch (_injectErr) {
      return false;
    }
  }
}

function isScanSessionExpired(session) {
  if (!session || session.status !== "scanning") return false;
  const started = Number(session.startedAt) || 0;
  if (!started) return true;
  return Date.now() - started > 5 * 60 * 1000;
}

function isWebchatConversationsUrl(url) {
  return typeof url === "string" && /\/webchat\/conversations/i.test(url);
}

function findExistingTab(tabs, matcher) {
  return tabs.find((tab) => matcher(tab.url));
}

async function focusTab(tab) {
  if (!tab?.id) return null;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return tab.id;
}

async function openOrActivateTab(url) {
  const active = await getFocusedActiveTab();
  const windowId = active?.windowId;
  const tabs = await chrome.tabs.query({});

  if (isShippingListUrl(url)) {
    const inCurrentWindow = tabs.filter(
      (tab) => tab.windowId === windowId && tab.url && isShippingListUrl(tab.url)
    );
    if (inCurrentWindow.length) {
      const target = inCurrentWindow.find((tab) => !tab.active) || inCurrentWindow[0];
      return focusTab(target);
    }

    const tab = await chrome.tabs.create({ url, active: true, windowId });
    if (tab?.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return tab?.id ?? null;
  }

  if (isWebchatConversationsUrl(url)) {
    const existing = findExistingTab(tabs, (tabUrl) => isWebchatConversationsUrl(tabUrl));
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true, url });
      await chrome.windows.update(existing.windowId, { focused: true });
      watchWebchatHelperInjection(existing.id, url);
      return existing.id;
    }
  }

  const tab = await chrome.tabs.create({ url, active: true, windowId });
  if (tab?.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  watchWebchatHelperInjection(tab?.id, url);
  return tab?.id ?? null;
}

function clearScanSession() {
  activeScanTabId = null;
  scanEpoch += 1;
  chrome.storage.local.remove(SCAN_SESSION_KEY);
}

function updateScanSession(payload) {
  const epoch = scanEpoch;
  chrome.storage.local.get([SCAN_SESSION_KEY], (result) => {
    if (epoch !== scanEpoch) return;
    const prev = result[SCAN_SESSION_KEY];
    if (!prev || prev.status !== "scanning") return;
    if (payload.phase === "done") {
      clearScanSession();
      return;
    }
    const next = {
      ...prev,
      phase: payload.phase ?? prev.phase,
      fetched: payload.fetched ?? prev.fetched,
      page: payload.page ?? prev.page,
      total_pages: payload.total_pages ?? prev.total_pages,
      total_orders: payload.total_orders ?? prev.total_orders,
      current_step: payload.current_step ?? prev.current_step,
      total_step: payload.total_step ?? prev.total_step,
      detail_queue_total: payload.detail_queue_total ?? prev.detail_queue_total,
      skipped_delivered: payload.skipped_delivered ?? prev.skipped_delivered,
      skipped_recent: payload.skipped_recent ?? prev.skipped_recent,
      full_tracking: payload.full_tracking ?? prev.full_tracking,
      stream_first_delivering: payload.stream_first_delivering ?? prev.stream_first_delivering,
      stream_abnormal_warning: payload.stream_abnormal_warning ?? prev.stream_abnormal_warning,
      use_fast_scan: payload.use_fast_scan ?? prev.use_fast_scan,
      message: payload.message ?? prev.message,
    };
    if (epoch !== scanEpoch) return;
    chrome.storage.local.set({ [SCAN_SESSION_KEY]: next });
  });
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab?.url || !SHOPEE_SELLER_URL_RE.test(tab.url)) return;
  if (changeInfo.url || changeInfo.status === "complete") {
    notifyDeliveryUrgeTabChanged();
  }
});

chrome.tabs.onActivated.addListener(() => {
  notifyDeliveryUrgeTabChanged();
});

const FX_API = "https://open.er-api.com/v6/latest/CNY";

async function fetchExchangeRatesInBackground() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(FX_API, { signal: controller.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCAN_PROGRESS") {
    updateScanSession(message);
    return false;
  }

  if (message.type === "OPEN_TAB") {
    openOrActivateTab(message.url)
      .then((tabId) => sendResponse({ ok: true, tabId, reused: tabId != null }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message.type === "GET_ACTIVE_TAB") {
    (async () => {
      const tab = await getFocusedActiveTab();
      sendResponse({ tab: tab || null });
    })();
    return true;
  }

  if (message.type === "GET_SCAN_SESSION") {
    chrome.storage.local.get([SCAN_SESSION_KEY], (result) => {
      const session = result[SCAN_SESSION_KEY] || null;
      if (
        session?.status === "scanning" &&
        (activeScanTabId == null || isScanSessionExpired(session))
      ) {
        clearScanSession();
        sendResponse(null);
        return;
      }
      sendResponse(session);
    });
    return true;
  }

  if (message.type === "CANCEL_SCAN") {
    const tabId = activeScanTabId || message.tabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: "CANCEL_SCAN" }).catch(() => {});
    }
    clearScanSession();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SAVE_CNSC_SHOP_ID") {
    const region = message.region;
    const shopId = message.shopId != null ? String(message.shopId) : "";
    if (!region || !shopId) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.storage.local.get([SHOP_IDS_STORAGE_KEY], (result) => {
      const saved = result[SHOP_IDS_STORAGE_KEY] || {};
      if (saved[region] === shopId) {
        sendResponse({ ok: true, unchanged: true });
        return;
      }
      saved[region] = shopId;
      chrome.storage.local.set({ [SHOP_IDS_STORAGE_KEY]: saved }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === "GET_PAGE_CONTEXT") {
    (async () => {
      const tab = await resolveShippingTab(message.tabId);
      if (!tab?.id) {
        sendResponse({ ok: false, isShippingPage: false, error: "当前标签页不是运送中订单页" });
        return;
      }
      try {
        await ensureOrderScanner(tab.id);
        const resp = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" });
        sendResponse(resp);
      } catch (err) {
        sendResponse({
          ok: false,
          error: "无法读取卖家中心页面，请刷新订单页后重试",
          detail: String(err?.message || err),
        });
      }
    })();
    return true;
  }

  if (message.type === "SCAN_SHIPPING_ORDERS") {
    (async () => {
      try {
        try {
          if (typeof DuLicense !== "undefined") {
            const license = await DuLicense.refreshLicenseStatus();
            if (!license.isAllowed) {
              sendResponse({
                ok: false,
                error: "DU_LICENSE_LOCKED",
                licenseLocked: true,
              });
              return;
            }
          }
        } catch (_licenseErr) {
          /* 许可模块异常时不阻断扫描主流程 */
        }

        const tab = await resolveShippingTab(message.tabId);
        const tabId = tab?.id;
        if (!tabId) {
          sendResponse({ ok: false, error: "请先打开 Shopee「运送中」订单页后再扫描" });
          return;
        }

        activeScanTabId = tabId;
        await chrome.storage.local.set({
          [SCAN_SESSION_KEY]: {
            status: "scanning",
            tabId,
            phase: "start",
            fetched: 0,
            message: "准备中…",
            startedAt: Date.now(),
          },
        });

        const injected = await ensureOrderScanner(tabId);
        if (!injected) {
          clearScanSession();
          sendResponse({
            ok: false,
            error: "无法注入订单扫描脚本，请刷新运送中订单页后重试",
          });
          return;
        }

        const resp = await chrome.tabs.sendMessage(tabId, {
          type: "SCAN_SHIPPING_ORDERS",
          skipRecentDays: message.skipRecentDays,
        });
        clearScanSession();
        if (resp?.ok) {
          chrome.runtime.sendMessage({ type: "DU_USAGE_UPDATED", scanSessionId: message.scanSessionId }).catch(() => {});
        }
        chrome.runtime.sendMessage({ type: "SCAN_FINISHED", ...resp }).catch(() => {});
        sendResponse(resp);
      } catch (err) {
        clearScanSession();
        const failResp = {
          ok: false,
          error: "无法连接 Shopee 后台页面，请刷新运送中订单页后重试",
          detail: String(err?.message || err),
        };
        chrome.runtime.sendMessage({ type: "SCAN_FINISHED", ...failResp }).catch(() => {});
        sendResponse(failResp);
      }
    })();
    return true;
  }

  if (message.type === "FETCH_EXCHANGE_RATES") {
    (async () => {
      try {
        const data = await fetchExchangeRatesInBackground();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  return false;
});
