/* 派件异常催取 — 侧边栏 UI 与交互 */

(function () {
  "use strict";

  const ORDER_TAB_KEYS = ["first_delivering", "abnormal_warning"];
  const TAB_KEYS = [...ORDER_TAB_KEYS, "message_config"];
  const TAB_LABELS = {
    first_delivering: "首次派送中",
    abnormal_warning: "异常预警",
    message_config: "⚙️ 催取话术",
  };

  let activeTab = "first_delivering";
  let groupedOrders = {
    in_transit: [],
    delivered: [],
    first_delivering: [],
    abnormal_warning: [],
  };
  let currentSiteCode = "";
  let scannedSiteCode = "";
  let currentShopId = "";
  let toastTimer = null;
  let isScanning = false;
  let hasScanResults = false;
  let viewState = "guide";
  let pageStatePollId = null;
  let scanTabId = null;
  let resultsCanScan = false;
  let lastResultsStatusText = "";
  let lastResultsStatusType = "";
  let lastScannedAt = 0;
  let lastScanMeta = null;
  let scanTiming = { startedAt: 0, listingStartedAt: 0, trackingStartedAt: 0 };
  let streamScanActive = false;
  let skipRecentDays = DU_SKIP_RECENT_DAYS_DEFAULT;
  let scanWatchdogId = null;
  let lastScanProgressAt = 0;
  let activeScanSessionId = 0;
  let handledScanSessionId = 0;

  function clearScanWatchdog() {
    if (scanWatchdogId) {
      clearTimeout(scanWatchdogId);
      scanWatchdogId = null;
    }
  }

  function startScanWatchdog() {
    clearScanWatchdog();
    lastScanProgressAt = Date.now();
    scanWatchdogId = setTimeout(() => {
      if (!isScanning) return;
      if (Date.now() - lastScanProgressAt < 90000) return;
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "CANCEL_SCAN", tabId: scanTabId }, () => {
          finishScan({ ok: false, error: "扫描超时，请刷新运送中订单页后重试" });
        });
        return;
      }
      finishScan({ ok: false, error: "扫描超时，请刷新运送中订单页后重试" });
    }, 120000);
  }

  function touchScanWatchdog() {
    lastScanProgressAt = Date.now();
  }

  function el(id) {
    return document.getElementById(id);
  }

  function showToast(text) {
    const node = el("duToast");
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 3200);
  }

  window.duShowToast = showToast;

  function setStatus(text, type) {
    const nodeId = viewState === "results" ? "duResultsStatus" : "duStatus";
    const node = el(nodeId);
    if (!node) return;
    node.textContent = text || "";
    const baseClass = viewState === "ready" ? "du-status du-ready-status" : "du-status";
    node.className = baseClass + (type ? " " + type : "");
  }

  function setViewState(state) {
    viewState = state;
    const main = el("duMain");
    if (main) main.setAttribute("data-du-state", state);
    syncScanChrome();
    syncPageStatePolling();
  }

  window.duSetViewState = setViewState;

  function syncTabPanels() {
    const isMessageTab = activeTab === "message_config";
    const listEl = el("duOrderList");
    const messagePanel = el("duMessageTabPanel");
    if (listEl) listEl.hidden = isMessageTab;
    if (messagePanel) messagePanel.hidden = !isMessageTab;
  }

  /** 扫描进度条 / 内联条 / 取消按钮与当前步骤对齐 */
  function syncScanChrome(phase) {
    const showInline = isScanning && viewState === "streaming";
    setInlineScanVisible(showInline);

    const cancelBtn = el("duCancelScanBtn");
    const inlineCancel = el("duInlineCancelScanBtn");
    if (cancelBtn) cancelBtn.hidden = !isScanning || viewState === "streaming";
    if (inlineCancel) inlineCancel.hidden = !showInline;
  }

  function syncPageStatePolling() {
    if (pageStatePollId) {
      clearInterval(pageStatePollId);
      pageStatePollId = null;
    }
    const onDeliveryPage = el("page-deliveryUrge")?.classList.contains("active");
    const shouldPoll =
      onDeliveryPage &&
      !isScanning &&
      (viewState === "guide" || viewState === "ready" || (viewState === "results" && hasScanResults));
    if (shouldPoll) {
      pageStatePollId = setInterval(refreshPageState, 2500);
    }
  }

  function queryActiveTabUrl(cb) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      cb(null);
      return;
    }
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" }, (resp) => {
      cb(resp?.tab?.url || null);
    });
  }

  function openTab(url, onDone) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      window.open(url, "_blank");
      if (typeof onDone === "function") onDone({ ok: true });
      return;
    }
    chrome.runtime.sendMessage({ type: "OPEN_TAB", url }, (resp) => {
      if (chrome.runtime.lastError) {
        if (typeof onDone === "function") {
          onDone({ ok: false, error: chrome.runtime.lastError.message || "无法打开页面" });
        }
        return;
      }
      if (typeof onDone === "function") onDone(resp || { ok: false });
    });
  }

  function openShippingPage() {
    openTab(DU_GENERIC_SHIPPING_URL, (resp) => {
      if (!resp?.ok) {
        showToast(resp?.error || "无法打开 Shopee 运送中订单页");
        return;
      }
      syncPageStatePolling();
      setTimeout(refreshPageState, 800);
      setTimeout(refreshPageState, 2000);
      setTimeout(refreshPageState, 4500);
    });
  }

  function getSkipRecentDaysLabel(days) {
    const n = typeof duNormalizeSkipRecentDays === "function"
      ? duNormalizeSkipRecentDays(days)
      : Number(days) || DU_SKIP_RECENT_DAYS_DEFAULT;
    return n;
  }

  function readSkipRecentDaysInput() {
    const input = el("duSkipRecentDays");
    if (!input) return skipRecentDays;
    return getSkipRecentDaysLabel(input.value);
  }

  function applySkipRecentDaysInput(days) {
    const normalized = getSkipRecentDaysLabel(days);
    skipRecentDays = normalized;
    const input = el("duSkipRecentDays");
    if (input) input.value = String(normalized);
  }

  function setSkipRecentDaysInputDisabled(disabled) {
    const input = el("duSkipRecentDays");
    if (input) input.disabled = !!disabled;
  }

  function loadSkipRecentDaysSetting() {
    loadPersistedState(STORAGE.deliveryUrgeSkipRecentDays, (val) => {
      applySkipRecentDaysInput(val ?? DU_SKIP_RECENT_DAYS_DEFAULT);
    });
  }

  function saveSkipRecentDaysSetting() {
    const normalized = readSkipRecentDaysInput();
    applySkipRecentDaysInput(normalized);
    savePref(STORAGE.deliveryUrgeSkipRecentDays, String(normalized));
  }

  function resetSkipRecentDaysSetting() {
    applySkipRecentDaysInput(DU_SKIP_RECENT_DAYS_DEFAULT);
    savePref(STORAGE.deliveryUrgeSkipRecentDays, String(DU_SKIP_RECENT_DAYS_DEFAULT));
  }

  function getProgressTargets() {
    const useInline = viewState === "streaming";
    return {
      fillEl: el(useInline ? "duInlineProgressFill" : "duProgressFill"),
      countEl: el(useInline ? "duInlineProgressCount" : "duProgressCount"),
      detailEl: el(useInline ? "duInlineProgressDetail" : "duProgressDetail"),
      etaEl: el("duProgressEta"),
      phaseEl: el("duScanPhase"),
      descEl: el("duScanDesc"),
    };
  }

  function setInlineScanVisible(visible) {
    const node = el("duInlineScan");
    if (node) node.hidden = !visible;
    streamScanActive = !!visible;
  }

  function updateScanWarnings(phase) {
    const listingWarn = el("duScanWarningListing");
    const trackingWarn = el("duScanWarningTracking");
    const isListing = phase === "start" || phase === "listing";
    const isTracking = phase === "tracking";
    if (listingWarn) listingWarn.hidden = !isListing;
    if (trackingWarn) trackingWarn.hidden = !isTracking;
  }

  function buildTrackingSubtitle(totalOrders, skippedDelivered, skippedRecent, skipDays) {
    const skippedTotal = skippedDelivered + skippedRecent;
    if (!skippedTotal) {
      return `整店共 ${totalOrders} 单`;
    }
    const skipParts = [];
    if (skippedDelivered > 0) skipParts.push(`已送达 ${skippedDelivered} 单`);
    if (skippedRecent > 0) skipParts.push(`${skipDays}天内新单 ${skippedRecent} 单`);
    return `整店共 ${totalOrders} 单，已智能免检 ${skippedTotal} 单（自动跳过${skipParts.join("、")}）`;
  }

  function formatEtaMs(ms) {
    if (!ms || ms < 1500) return "不到 1 分钟";
    const sec = Math.ceil(ms / 1000);
    if (sec < 60) return `约 ${sec} 秒`;
    const min = Math.ceil(sec / 60);
    if (min < 60) return `约 ${min} 分钟`;
    const hours = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin ? `约 ${hours} 小时 ${remMin} 分钟` : `约 ${hours} 小时`;
  }

  function estimateScanEta(data) {
    const now = Date.now();
    const phase = data?.phase || "";
    const page = Number(data?.page) || 0;
    const totalPages = Number(data?.total_pages) || 0;
    const fetched = Number(data?.fetched) || 0;
    const totalOrders = Number(data?.total_orders) || fetched;
    const currentStep = Number(data?.current_step) || 0;
    const totalStep = Number(data?.total_step) || Number(data?.detail_queue_total) || 0;
    const detailQueueTotal = Number(data?.detail_queue_total) || totalStep;

    if (phase === "listing" || phase === "start") {
      if (!scanTiming.startedAt) return "";
      const listingElapsed = now - (scanTiming.listingStartedAt || scanTiming.startedAt);
      let listingRemaining = 0;
      if (page > 0 && totalPages > page) {
        listingRemaining = Math.max(3000, 8000 - listingElapsed);
      } else if (page > 0) {
        listingRemaining = Math.max(0, 6000 - listingElapsed);
      } else {
        listingRemaining = 8000;
      }
      const trackingOrders = detailQueueTotal || Math.round(totalOrders * 0.55);
      return formatEtaMs(listingRemaining + trackingOrders * 800);
    }

    if (phase === "tracking") {
      const trackingElapsed = scanTiming.trackingStartedAt ? now - scanTiming.trackingStartedAt : 0;
      const queueTotal = detailQueueTotal || totalStep;
      const remainingSteps = Math.max(0, queueTotal - currentStep);
      let trackingRemaining = 0;
      if (currentStep > 0 && trackingElapsed > 0) {
        trackingRemaining = (trackingElapsed / currentStep) * remainingSteps;
      } else {
        trackingRemaining = remainingSteps * 800;
      }
      return formatEtaMs(trackingRemaining);
    }

    return "";
  }

  function updateScanProgress(data) {
    if (!isScanning) return;
    touchScanWatchdog();

    const phase = data?.phase || "";
    if ((phase === "start" || phase === "listing") && !scanTiming.listingStartedAt) {
      scanTiming.listingStartedAt = Date.now();
    }
    if (phase === "tracking" && !scanTiming.trackingStartedAt) {
      scanTiming.trackingStartedAt = Date.now();
    }
    updateScanWarnings(phase);
    syncScanChrome(phase);

    const targets = getProgressTargets();
    const fetched = Number(data?.fetched) || 0;
    const currentStep = Number(data?.current_step) || 0;
    const totalStep = Number(data?.total_step) || Number(data?.detail_queue_total) || 0;
    const page = Number(data?.page) || 0;
    const totalPages = Number(data?.total_pages) || 0;
    const totalOrders = Number(data?.total_orders) || fetched;
    const skippedDelivered = Number(data?.skipped_delivered) || 0;
    const skippedRecent = Number(data?.skipped_recent) || 0;
    const skipDays = getSkipRecentDaysLabel(data?.skip_recent_days ?? lastScanMeta?.skipRecentDays ?? skipRecentDays);
    const streamFound =
      (Number(data?.stream_first_delivering) || 0) + (Number(data?.stream_abnormal_warning) || 0);
    const message = data?.message || "";

    if (targets.phaseEl && viewState !== "streaming") {
      if (phase === "listing") {
        targets.phaseEl.textContent = totalPages
          ? `正在拉取运送中订单（${page}/${totalPages} 页）…`
          : "正在拉取运送中订单…";
      } else if (phase === "tracking") {
        targets.phaseEl.textContent = totalStep
          ? `正在分析订单物流 (${currentStep}/${totalStep}) ...`
          : "正在分析订单物流 ...";
      } else {
        targets.phaseEl.textContent = message || "正在扫描运送中订单…";
      }
    }

    if (targets.descEl && viewState !== "streaming") {
      if (phase === "listing" || phase === "start") {
        targets.descEl.textContent =
          "请保持 Shopee「运送中」页面所在标签页打开，不要刷新、关闭或在 Shopee 内跳转；可切换到其他浏览器标签";
      } else if (phase === "tracking") {
        targets.descEl.textContent = buildTrackingSubtitle(
          totalOrders,
          skippedDelivered,
          skippedRecent,
          skipDays
        );
      } else {
        targets.descEl.textContent = "正在处理订单，需关注的包裹会实时显示在结果列表";
      }
    }

    if (targets.countEl) {
      if (phase === "listing") {
        targets.countEl.textContent = totalPages
          ? `已拉取 ${page}/${totalPages} 页，共 ${fetched} 单`
          : `已拉取 ${fetched} 单`;
      } else if (phase === "tracking" && totalStep > 0) {
        targets.countEl.textContent = `分析进度 ${currentStep} / ${totalStep} 单`;
      } else {
        targets.countEl.textContent = `已拉取 ${fetched} 单`;
      }
    }

    if (targets.detailEl) {
      targets.detailEl.textContent =
        phase === "tracking" ? `已发现 ${streamFound} 单需关注` : message || "处理中…";
      targets.detailEl.hidden = false;
    }

    if (targets.etaEl && viewState !== "streaming") {
      const eta = estimateScanEta(data);
      targets.etaEl.textContent = eta ? `预计剩余 ${eta}` : "";
      targets.etaEl.hidden = !eta;
    }

    if (targets.fillEl) {
      let pct = 8;
      if (phase === "listing") {
        if (totalPages > 0 && page > 0) {
          pct = Math.min(44, 8 + Math.round((page / totalPages) * 36));
        } else {
          pct = Math.min(45, 8 + Math.min(fetched, 20) * 2);
        }
      } else if (phase === "tracking" && totalStep > 0) {
        pct = 45 + Math.round((currentStep / totalStep) * 52);
      } else if (phase === "done") {
        pct = 100;
      }
      targets.fillEl.style.width = `${pct}%`;
    }
  }

  function handleStreamOrder(message) {
    if (!isScanning || !message?.order) return;

    const siteCode = message.siteCode || currentSiteCode;
    const shopId = message.shopId || currentShopId;
    const normalized = duNormalizeOrder(message.order, siteCode, shopId);
    const category = normalized.category;

    if (category !== "first_delivering" && category !== "abnormal_warning") return;

    const list = groupedOrders[category] || [];
    if (list.some((item) => item.orderSn && item.orderSn === normalized.orderSn)) return;

    groupedOrders[category].push(normalized);
    hasScanResults = true;
    scannedSiteCode = siteCode;

    if (!streamScanActive) {
      if (groupedOrders.abnormal_warning.length) {
        activeTab = "abnormal_warning";
      } else if (groupedOrders.first_delivering.length) {
        activeTab = "first_delivering";
      }
      setViewState("streaming");
    }

    syncScanChrome("tracking");

    renderSummary(true);
    renderTabs();
    renderOrderList(false);
  }

  function resetScanProgress() {
    scanTiming = { startedAt: Date.now(), listingStartedAt: 0, trackingStartedAt: 0 };
    streamScanActive = false;
    setInlineScanVisible(false);
    syncScanChrome("start");
    updateScanWarnings("start");
    updateScanProgress({ phase: "start", fetched: 0, message: "准备中…" });
    const fillEl = el("duProgressFill");
    if (fillEl) fillEl.style.width = "0%";
    const inlineFill = el("duInlineProgressFill");
    if (inlineFill) inlineFill.style.width = "0%";
    const etaEl = el("duProgressEta");
    if (etaEl) {
      etaEl.textContent = "";
      etaEl.hidden = true;
    }
  }

  function slimOrderForStorage(order) {
    if (!order || typeof order !== "object") return order;
    const { raw, ...rest } = order;
    return rest;
  }

  function persistScanResults(statusText, statusType) {
    const slimGrouped = {};
    Object.keys(groupedOrders).forEach((key) => {
      slimGrouped[key] = (groupedOrders[key] || []).map(slimOrderForStorage);
    });
    saveJSON(STORAGE.deliveryUrgeScanResults, {
      groupedOrders: slimGrouped,
      currentSiteCode,
      currentShopId,
      activeTab,
      statusText: statusText || "",
      statusType: statusType || "",
      scannedAt: lastScannedAt || Date.now(),
      scanMeta: lastScanMeta,
    });
  }

  function clearPersistedScanResults(done) {
    try {
      localStorage.removeItem(STORAGE.deliveryUrgeScanResults);
    } catch (_e) { /* ignore */ }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.remove(STORAGE.deliveryUrgeScanResults, () => {
        if (typeof done === "function") done();
      });
      return;
    }
    if (typeof done === "function") done();
  }

  function touchPluginLastAccessAt() {
    savePref(STORAGE.deliveryUrgeLastAccessAt, String(Date.now()));
  }

  function applyExpiredScanResults(showToastMsg) {
    if (hasScanResults) hideResults();
    if (el("page-deliveryUrge")?.classList.contains("active")) {
      setViewState("guide");
      refreshPageState();
      if (showToastMsg) showToast("扫描结果已超过 8 小时，请重新扫描");
    }
  }

  /** 超过 8 小时未再打开插件则清空扫描结果，并刷新最后访问时间 */
  function runScanResultsIdlePolicy(cb) {
    const finish = (expired) => {
      touchPluginLastAccessAt();
      cb(!!expired);
    };

    if (typeof loadPersistedState !== "function") {
      finish(false);
      return;
    }

    loadPersistedState(STORAGE.deliveryUrgeLastAccessAt, (lastAccessRaw) => {
      const expired =
        typeof duIsScanResultsIdleExpired === "function" &&
        duIsScanResultsIdleExpired(lastAccessRaw);

      if (expired) {
        clearPersistedScanResults(() => {
          applyExpiredScanResults(false);
          finish(true);
        });
        return;
      }

      finish(false);
    });
  }

  function handleSidePanelVisible() {
    if (isScanning) return;
    runScanResultsIdlePolicy((expired) => {
      if (!expired) return;
      applyExpiredScanResults(hasScanResults);
    });
  }

  function openScanSettingsDrawer() {
    const drawer = el("duSettingsDrawer");
    if (!drawer) return;
    applySkipRecentDaysInput(skipRecentDays);
    drawer.hidden = false;
  }

  function closeScanSettingsDrawer() {
    const drawer = el("duSettingsDrawer");
    if (drawer) drawer.hidden = true;
  }

  function restorePersistedResults(data) {
    if (!data?.groupedOrders) return false;
    isScanning = false;
    streamScanActive = false;
    setScanButtonsLoading(false);
    setInlineScanVisible(false);
    groupedOrders = data.groupedOrders;
    currentSiteCode = data.currentSiteCode || "";
    scannedSiteCode = data.currentSiteCode || "";
    currentShopId = data.currentShopId || "";
    activeTab = TAB_KEYS.includes(data.activeTab) ? data.activeTab : "first_delivering";
    lastScannedAt = data.scannedAt || 0;
    lastScanMeta = data.scanMeta || null;
    hasScanResults = true;
    renderSummary();
    renderTabs();
    renderOrderList();
    setViewState("results");
    return true;
  }

  function formatScanTime(ts) {
    const d = new Date(ts);
    if (!ts || Number.isNaN(d.getTime())) return "—";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function renderResultsStatus(canScan) {
    const node = el("duResultsStatus");
    if (!node || !hasScanResults) return;

    const siteLabel = duSiteLabelFromCode(currentSiteCode);
    const type = canScan ? "success" : "warn";
    const siteHtml = `<span class="du-status-site">${escapeHtml(siteLabel)}</span>`;

    node.className = `du-status ${type}`;
    node.hidden = false;
    if (canScan) {
      node.innerHTML = `已识别${siteHtml}「运送中」订单页，可以重新扫描`;
    } else {
      node.innerHTML = "请打开【运送中】订单页后再重新扫描";
    }

    lastResultsStatusType = type;
    lastResultsStatusText = node.textContent || "";
  }

  function updateResultsTopAction(canScan) {
    resultsCanScan = !!canScan;
    const btn = el("duRescanBtn");
    if (!btn) return;
    btn.textContent = canScan
      ? "🔍 重新扫描当前站点包裹"
      : "📦 前往运送中订单页 →";
  }

  function applyResultsPageContext(canScan) {
    updateResultsTopAction(canScan);
    if (!hasScanResults) return;
    renderResultsStatus(canScan);
  }
  function setScanButtonsLoading(loading) {
    [el("duScanBtn"), el("duRescanBtn")].forEach((btn) => {
      if (!btn) return;
      btn.disabled = loading;
      btn.classList.toggle("is-loading", loading);
    });
    setSkipRecentDaysInputDisabled(loading);
    const cancelBtn = el("duCancelScanBtn");
    if (cancelBtn) cancelBtn.hidden = !loading;
  }

  function refreshPageState() {
    if (isScanning) return;

    queryActiveTabUrl((url) => {
      const shopIds = duLoadShopIds();
      let onPage = duIsShippingPageUrl(url);
      let hasShopContext = false;

      const pageInfo = duParseShippingPage(url);
      if (pageInfo?.shopId) {
        currentShopId = pageInfo.shopId;
        hasShopContext = true;
        const siteFromId = duSiteCodeFromShopId(pageInfo.shopId, shopIds);
        if (siteFromId) {
          currentSiteCode = siteFromId;
          duSaveShopId(siteFromId, pageInfo.shopId);
        }
      }

      const applyContext = (ctx) => {
        if (onPage && ctx?.ok && ctx.isShippingPage) {
          if (ctx.shopId) {
            currentShopId = ctx.shopId;
            hasShopContext = true;
          } else if (ctx.siteCode) {
            const savedId = duLoadShopIds()[ctx.siteCode];
            if (savedId) {
              currentShopId = savedId;
              hasShopContext = true;
            }
          }
          if (ctx.siteCode) currentSiteCode = ctx.siteCode;
          if (ctx.shopId && ctx.siteCode) {
            duSaveShopId(ctx.siteCode, ctx.shopId);
          }
        }

        const cnscReady =
          !pageInfo ||
          pageInfo.host !== "cnsc" ||
          hasShopContext ||
          !!currentShopId ||
          (onPage && ctx?.ok && ctx.isShippingPage && !!ctx.siteCode);
        const canScan = onPage && cnscReady;

        if (viewState === "results" || hasScanResults) {
          if (hasScanResults) {
            setViewState("results");
            applyResultsPageContext(canScan);
          } else if (canScan) {
            setViewState("ready");
          } else {
            setViewState("guide");
          }
          return;
        }

        if (viewState === "scanning" || viewState === "streaming") {
          return;
        }

        if (canScan) {
          setViewState("ready");
          const siteLabel = currentSiteCode || "当前";
          if (pageInfo?.host === "cnsc" && !currentShopId) {
            setStatus(`已识别 ${siteLabel} 站运送中页面，确认左上角店铺后点击扫描`, "warn");
          } else {
            setStatus(`已检测到 ${siteLabel} 站运送中订单页，可开始扫描`, "success");
          }
        } else {
          if (!hasScanResults) {
            setViewState("guide");
            setStatus("", "");
          }
        }
      };

      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, (ctx) => {
          if (chrome.runtime.lastError) {
            applyContext(null);
            return;
          }
          applyContext(ctx);
        });
      } else {
        applyContext(null);
      }
    });
  }

  function hideResults() {
    hasScanResults = false;
    resultsCanScan = false;
    scannedSiteCode = "";
    lastResultsStatusText = "";
    lastResultsStatusType = "";
    lastScannedAt = 0;
    lastScanMeta = null;
    streamScanActive = false;
    setInlineScanVisible(false);
    groupedOrders = {
      in_transit: [],
      delivered: [],
      first_delivering: [],
      abnormal_warning: [],
    };
    clearPersistedScanResults();
    const resultsStatus = el("duResultsStatus");
    if (resultsStatus) {
      resultsStatus.textContent = "";
      resultsStatus.className = "du-status";
      resultsStatus.hidden = true;
    }
    syncTabPanels();
  }

  function renderSummary(streamingPartial) {
    const node = el("duSummary");
    if (!node) return;
    const normalTransit = groupedOrders.in_transit?.length || 0;
    const delivered = groupedOrders.delivered?.length || 0;
    const firstDelivering = groupedOrders.first_delivering?.length || 0;
    const abnormal = groupedOrders.abnormal_warning?.length || 0;
    const siteLabel = duSiteLabelFromCode(scannedSiteCode || currentSiteCode);
    const scanTime = lastScannedAt ? formatScanTime(lastScannedAt) : "扫描进行中…";
    const streamingNote = streamingPartial
      ? `<div class="du-summary-fast-note">实时扫描中：已发现 ${firstDelivering + abnormal} 单需关注，其余统计将在扫描完成后更新</div>`
      : "";
    node.innerHTML = `
      <div class="du-summary-head">
        <span class="du-summary-site">${escapeHtml(siteLabel)}</span>
        <span class="du-summary-time">扫描时间：${escapeHtml(scanTime)}</span>
      </div>
      <div class="du-summary-stats">
        <div class="du-summary-stat">
          <span class="du-summary-stat-num">${normalTransit}</span>
          <span class="du-summary-stat-label">正常运输中</span>
        </div>
        <div class="du-summary-stat">
          <span class="du-summary-stat-num">${delivered}</span>
          <span class="du-summary-stat-label">已送达</span>
        </div>
        <div class="du-summary-stat">
          <span class="du-summary-stat-num">${firstDelivering}</span>
          <span class="du-summary-stat-label">首次派送中</span>
        </div>
        <div class="du-summary-stat">
          <span class="du-summary-stat-num du-summary-stat-num-warn">${abnormal}</span>
          <span class="du-summary-stat-label">异常预警</span>
        </div>
      </div>${streamingNote}`;
  }

  function renderTabs() {
    const tabsEl = el("duTabs");
    if (!tabsEl) return;
    tabsEl.innerHTML = TAB_KEYS.map((key) => {
      const active = key === activeTab ? " active" : "";
      const label =
        key === "message_config"
          ? TAB_LABELS[key]
          : `${TAB_LABELS[key]} (${groupedOrders[key]?.length || 0})`;
      return `<button type="button" class="du-tab-btn${active}" data-tab="${key}">${label}</button>`;
    }).join("");
  }

  function renderOrderList(scrollToBottom) {
    syncTabPanels();
    if (activeTab === "message_config") return;

    const listEl = el("duOrderList");
    if (!listEl) return;
    const orders = groupedOrders[activeTab] || [];

    if (!orders.length) {
      listEl.innerHTML = `<div class="du-empty">暂无${TAB_LABELS[activeTab]}订单</div>`;
      return;
    }

    listEl.innerHTML = orders
      .map((order, index) => {
        const user = order.username || "—";
        const sn = order.orderSn || "—";
        const track = order.trackingText || "暂无物流轨迹";
        const chatDisabled = !order.username ? " disabled" : "";
        const detailDisabled = !order.orderId ? " disabled" : "";
        const siteCode = order.siteCode || currentSiteCode || "";
        return `
          <article class="du-order-card">
            <div class="du-order-head">
              <span class="du-order-sn-main">${escapeHtml(sn)}</span>
              <span class="du-order-buyer">${escapeHtml(user)}</span>
            </div>
            <div class="du-order-track-main">
              <span class="du-order-text-main">${escapeHtml(track)}</span>
            </div>
            <div class="du-order-foot">
              <span class="du-order-site">${escapeHtml(siteCode || "—")}</span>
              <div class="du-order-actions">
                <button type="button" class="du-action-btn du-action-track du-track-full-btn" data-order-index="${index}">完整物流</button>
                <button type="button" class="du-action-btn du-action-detail"${detailDisabled} data-order-id="${escapeAttr(order.orderId)}" data-shop-id="${escapeAttr(order.shopId || currentShopId)}">查看详情</button>
                <button type="button" class="du-action-btn du-action-urge"${chatDisabled} data-username="${escapeAttr(order.username)}" data-buyer-id="${escapeAttr(order.buyerUserId)}" data-site="${escapeAttr(order.siteCode || currentSiteCode)}" data-shop-id="${escapeAttr(order.shopId || currentShopId)}">去催取</button>
              </div>
            </div>
          </article>`;
      })
      .join("");

    if (scrollToBottom) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function openLogisticsDrawer(order) {
    const overlay = el("duDrawerOverlay");
    const title = el("duDrawerTitle");
    const body = el("duDrawerBody");
    if (!overlay || !body) return;

    if (title) {
      title.textContent = order.orderSn ? `物流轨迹 · ${order.orderSn}` : "完整物流轨迹";
    }

    const history = order.trackingHistory || [];
    if (!history.length) {
      body.innerHTML = `<div class="du-drawer-empty">暂无完整物流轨迹数据</div>`;
    } else {
      body.innerHTML = `<div class="du-timeline">${history
        .map(
          (item) => `
          <div class="du-timeline-item">
            <span class="du-timeline-time">${escapeHtml(duFormatTrackingTime(item.ctime))}</span>
            <span class="du-timeline-text">${escapeHtml(item.description || "")}</span>
          </div>`
        )
        .join("")}</div>`;
    }

    overlay.hidden = false;
  }

  function closeLogisticsDrawer() {
    const overlay = el("duDrawerOverlay");
    if (overlay) overlay.hidden = true;
  }

  function showResults(orders, scanMeta) {
    groupedOrders = duGroupOrders(orders);
    hasScanResults = true;
    scannedSiteCode = currentSiteCode;
    lastScannedAt = Date.now();
    lastScanMeta = scanMeta || null;
    setInlineScanVisible(false);

    if (groupedOrders.abnormal_warning.length) {
      activeTab = "abnormal_warning";
    } else if (groupedOrders.first_delivering.length) {
      activeTab = "first_delivering";
    } else {
      activeTab = "first_delivering";
    }

    renderSummary(false);
    renderTabs();
    renderOrderList(false);
    setViewState("results");
    persistScanResults("", "");
    refreshPageState();
  }

  function restoreViewAfterScanError(message) {
    setInlineScanVisible(false);
    streamScanActive = false;
    setViewState(hasScanResults ? "results" : "ready");
    if (hasScanResults) {
      refreshPageState();
      return;
    }
    setStatus(message, "error");
  }

  function finishScan(resp) {
    clearScanWatchdog();
    const wasScanning = isScanning;
    const sessionId = activeScanSessionId;
    isScanning = false;
    scanTabId = null;
    streamScanActive = false;
    setScanButtonsLoading(false);
    setInlineScanVisible(false);
    syncScanChrome();

    if (!wasScanning && !resp?.ok) return;

    if (!resp?.ok) {
      if (resp?.licenseLocked) {
        if (typeof DuLicenseUI !== "undefined") {
          DuLicenseUI.handleScanBlockedFromBackground(showToast);
        }
        restoreViewAfterScanError("免费次数已用尽，请输入激活码解锁后继续扫描");
        return;
      }
      if (resp?.cancelled) {
        restoreViewAfterScanError("扫描已取消");
        showToast("扫描已取消");
        return;
      }
      restoreViewAfterScanError(resp?.error || "扫描失败");
      return;
    }

    if (sessionId > 0 && handledScanSessionId === sessionId) return;
    if (sessionId > 0) handledScanSessionId = sessionId;

    const siteCode = resp.siteCode || currentSiteCode;
    const shopId = resp.shopId || currentShopId;
    if (resp.shopId && resp.siteCode) {
      duSaveShopId(resp.siteCode, resp.shopId);
      currentShopId = resp.shopId;
      currentSiteCode = resp.siteCode;
    }
    const normalized = (resp.orders || []).map((raw) => duNormalizeOrder(raw, siteCode, shopId));
    void (async () => {
      if (typeof DuLicenseUI !== "undefined") {
        await DuLicenseUI.onScanSuccess(sessionId);
      }
      showResults(normalized, resp.scanMeta || null);
    })();
  }

  function handleCancelScan() {
    if (!isScanning) return;
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: "CANCEL_SCAN", tabId: scanTabId }, () => {
      finishScan({ ok: false, cancelled: true, error: "扫描已取消" });
    });
  }

  function handleRescanClick() {
    if (typeof DuLicenseUI !== "undefined" && !DuLicenseUI.requireForScan(showToast)) return;
    if (hasScanResults && !resultsCanScan) {
      openShippingPage();
      return;
    }
    if (hasScanResults) {
      hideResults();
    }
    handleScan();
  }

  async function handleScan() {
    if (typeof DuLicenseUI !== "undefined" && !DuLicenseUI.requireForScan(showToast)) return;
    if (isScanning) return;

    activeScanSessionId += 1;
    isScanning = true;
    groupedOrders = {
      in_transit: [],
      delivered: [],
      first_delivering: [],
      abnormal_warning: [],
    };
    hasScanResults = false;
    resetScanProgress();
    setViewState("scanning");
    setScanButtonsLoading(true);
    startScanWatchdog();

    const startScan = (tabId) => {
      scanTabId = tabId || null;
      const days = readSkipRecentDaysInput();
      saveSkipRecentDaysSetting();
      const scanSessionId = activeScanSessionId;
      chrome.runtime.sendMessage(
        { type: "SCAN_SHIPPING_ORDERS", tabId, skipRecentDays: days, scanSessionId },
        (resp) => {
        if (chrome.runtime.lastError) {
          finishScan({ ok: false, error: chrome.runtime.lastError.message || "扫描失败" });
          return;
        }
        if (resp && !resp.ok) {
          finishScan(resp);
        }
      });
    };

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      finishScan({ ok: false, error: "扩展环境不可用" });
      return;
    }

    chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" }, (tabResp) => {
      if (chrome.runtime.lastError) {
        finishScan({ ok: false, error: chrome.runtime.lastError.message || "无法获取当前标签页" });
        return;
      }
      const tabId = tabResp?.tab?.id;
      if (!tabId) {
        finishScan({ ok: false, error: "未找到 Shopee 后台标签页，请先打开运送中订单页" });
        return;
      }
      startScan(tabId);
    });
  }

  async function copyAndOpenChat(username, siteCode, shopId, buyerUserId, withMessage) {
    if (
      typeof DuLicenseUI !== "undefined" &&
      DuLicenseUI.isBlocked() &&
      !hasScanResults
    ) {
      DuLicenseUI.showLockScreen(true);
      return;
    }
    const site = siteCode || currentSiteCode;
    const id = shopId || currentShopId;
    if (!username) return;

    if (withMessage) {
      const template = getMessageTemplate();
      const text = duApplyMessageTemplate(template, username);
      const ok = await copyText(text);
      if (ok) {
        showToast("催取文案已复制！已为您自动跳转，请直接在聊聊框 Ctrl+V 粘贴发送。");
      } else {
        showToast("文案复制失败，请手动复制后发送");
      }
    }

    openTab(duGetWebchatUrl(site, username, id, buyerUserId));
  }

  function getMessageTemplate() {
    const ta = el("duMessageTemplate");
    return ta?.value?.trim() || DU_DEFAULT_MESSAGE;
  }

  function clearSavedMessageTemplate() {
    try {
      localStorage.removeItem(STORAGE.deliveryUrgeMessage);
    } catch (_e) { /* ignore */ }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.remove(STORAGE.deliveryUrgeMessage);
    }
  }

  function loadMessageTemplate() {
    loadPersistedState(STORAGE.deliveryUrgeMessage, (val) => {
      const ta = el("duMessageTemplate");
      if (!ta) return;
      if (duIsBuiltinMessage(val)) {
        ta.value = DU_DEFAULT_MESSAGE;
        if (val && String(val).trim() !== DU_DEFAULT_MESSAGE.trim()) {
          clearSavedMessageTemplate();
        }
      } else {
        ta.value = val;
      }
    });
  }

  function saveMessageTemplate() {
    const ta = el("duMessageTemplate");
    if (!ta) return;
    const val = ta.value.trim();
    if (duIsBuiltinMessage(val)) {
      clearSavedMessageTemplate();
      return;
    }
    savePref(STORAGE.deliveryUrgeMessage, val);
  }

  function resetMessageTemplate() {
    const ta = el("duMessageTemplate");
    if (!ta) return;
    ta.value = DU_DEFAULT_MESSAGE;
    clearSavedMessageTemplate();
    showToast("已恢复默认英文催取话术");
  }

  function bindEvents() {
    el("duGoShippingBtn")?.addEventListener("click", openShippingPage);

    el("duScanBtn")?.addEventListener("click", handleScan);
    el("duRescanBtn")?.addEventListener("click", handleRescanClick);
    el("duCancelScanBtn")?.addEventListener("click", handleCancelScan);
    el("duInlineCancelScanBtn")?.addEventListener("click", handleCancelScan);

    el("duTabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".du-tab-btn");
      if (!btn?.dataset.tab) return;
      activeTab = btn.dataset.tab;
      renderTabs();
      renderOrderList();
    });

    el("duOrderList")?.addEventListener("click", (e) => {
      const trackBtn = e.target.closest(".du-track-full-btn");
      if (trackBtn) {
        const index = Number(trackBtn.dataset.orderIndex);
        const orders = groupedOrders[activeTab] || [];
        const order = orders[index];
        if (order) openLogisticsDrawer(order);
        return;
      }

      const detailBtn = e.target.closest(".du-action-detail");
      if (detailBtn && !detailBtn.disabled) {
        openTab(duGetOrderDetailUrl(detailBtn.dataset.orderId, detailBtn.dataset.shopId));
        return;
      }

      const urgeBtn = e.target.closest(".du-action-urge");
      if (urgeBtn && !urgeBtn.disabled) {
        copyAndOpenChat(
          urgeBtn.dataset.username,
          urgeBtn.dataset.site,
          urgeBtn.dataset.shopId,
          urgeBtn.dataset.buyerId,
          true
        );
      }
    });

    el("duDrawerClose")?.addEventListener("click", closeLogisticsDrawer);
    el("duDrawerBackdrop")?.addEventListener("click", closeLogisticsDrawer);

    el("duMessageTemplate")?.addEventListener("input", saveMessageTemplate);
    el("duMessageReset")?.addEventListener("click", resetMessageTemplate);

    el("duSkipRecentDays")?.addEventListener("change", saveSkipRecentDaysSetting);
    el("duSkipRecentDays")?.addEventListener("blur", saveSkipRecentDaysSetting);

    el("duScanSettingsBtn")?.addEventListener("click", openScanSettingsDrawer);
    el("duSettingsClose")?.addEventListener("click", closeScanSettingsDrawer);
    el("duSettingsBackdrop")?.addEventListener("click", closeScanSettingsDrawer);

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "SCAN_PROGRESS") {
          updateScanProgress(message);
          return;
        }
        if (message?.type === "SCAN_STREAM_ORDER") {
          handleStreamOrder(message);
          return;
        }
        if (message?.type === "SCAN_FINISHED") {
          finishScan(message);
          return;
        }
        if (message?.type === "DELIVERY_URGE_TAB_CHANGED") {
          if (el("page-deliveryUrge")?.classList.contains("active") && !isScanning) {
            refreshPageState();
          }
        }
      });
    }
  }

  function isStaleScanSession(session) {
    if (!session || session.status !== "scanning") return false;
    if (session.phase === "done") return true;
    const msg = String(session.message || "");
    if (msg.includes("扫描完成") || msg.includes("扫描分析完成")) return true;
    const started = Number(session.startedAt) || 0;
    if (started && Date.now() - started > 5 * 60 * 1000) return true;
    return false;
  }

  function loadPersistedResultsOrGuide(afterInit, options) {
    const onExpired = options?.onExpired;
    runScanResultsIdlePolicy((expired) => {
      if (expired) {
        setViewState("guide");
        refreshPageState();
        if (typeof onExpired === "function") onExpired();
        afterInit();
        return;
      }

      loadPersistedState(STORAGE.deliveryUrgeScanResults, (saved) => {
        if (restorePersistedResults(saved)) {
          refreshPageState();
          afterInit();
          return;
        }
        setViewState("guide");
        refreshPageState();
        afterInit();
      });
    });
  }

  function resumeScanSession(session) {
    if (!session || session.status !== "scanning") return false;
    if (isStaleScanSession(session)) {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "CANCEL_SCAN", tabId: session.tabId });
      }
      return false;
    }
    activeScanSessionId += 1;
    isScanning = true;
    scanTabId = session.tabId || null;
    resetScanProgress();
    updateScanProgress(session);
    setViewState("scanning");
    setScanButtonsLoading(true);
    startScanWatchdog();
    return true;
  }

  function initDeliveryUrgeUI() {
    if (!el("page-deliveryUrge")) return;
    setInlineScanVisible(false);
    streamScanActive = false;
    loadSkipRecentDaysSetting();
    loadMessageTemplate();
    bindEvents();

    if (typeof DuLicenseUI !== "undefined") {
      DuLicenseUI.init({
        onUnlocked: () => {
          loadPersistedResultsOrGuide(() => {
            syncPageStatePolling();
            refreshPageState();
          });
        },
      });
    }

    const cancelBtn = el("duCancelScanBtn");
    if (cancelBtn) cancelBtn.hidden = true;

    const afterInit = () => {
      syncPageStatePolling();
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_SCAN_SESSION" }, (session) => {
        if (chrome.runtime.lastError) {
          session = null;
        }
        if (session?.status === "scanning" && !isStaleScanSession(session)) {
          resumeScanSession(session);
          afterInit();
          return;
        }

        loadPersistedResultsOrGuide(afterInit, {
          onExpired: () => showToast("扫描结果已超过 8 小时，请重新扫描"),
        });
      });
    } else {
      loadPersistedResultsOrGuide(afterInit, {
        onExpired: () => showToast("扫描结果已超过 8 小时，请重新扫描"),
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      handleSidePanelVisible();
      if (!el("page-deliveryUrge")?.classList.contains("active")) return;
      if (isScanning) {
        chrome.runtime?.sendMessage?.({ type: "GET_SCAN_SESSION" }, (session) => {
          if (session?.status === "scanning" && !isStaleScanSession(session)) {
            updateScanProgress(session);
            return;
          }
          isScanning = false;
          setScanButtonsLoading(false);
          setInlineScanVisible(false);
          streamScanActive = false;
          loadPersistedResultsOrGuide(() => {});
        });
        return;
      }
      refreshPageState();
    });

    window.addEventListener("pageshow", () => {
      handleSidePanelVisible();
    });

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[STORAGE.deliveryUrgeShopIds]) return;
        const next = changes[STORAGE.deliveryUrgeShopIds].newValue || {};
        try {
          localStorage.setItem(STORAGE.deliveryUrgeShopIds, JSON.stringify(next));
        } catch (_e) { /* ignore */ }
        if (el("page-deliveryUrge")?.classList.contains("active") && !isScanning) {
          refreshPageState();
        }
      });
    }
  }

  window.deliveryUrgeOnPageEnter = function () {
    if (typeof DuLicenseUI !== "undefined") {
      void DuLicenseUI.ensureBannerReady();
    }

    const continueEnter = () => {
      if (isScanning) {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
        chrome.runtime.sendMessage({ type: "GET_SCAN_SESSION" }, (session) => {
          if (session?.status === "scanning" && !isStaleScanSession(session)) return;
          isScanning = false;
          setScanButtonsLoading(false);
          setInlineScanVisible(false);
          streamScanActive = false;
          if (hasScanResults) {
            setViewState("results");
            refreshPageState();
            return;
          }
          loadPersistedResultsOrGuide(() => refreshPageState());
        });
        return;
      }
      if (hasScanResults) {
        setInlineScanVisible(false);
        setViewState("results");
        refreshPageState();
        return;
      }
      refreshPageState();
    };

    runScanResultsIdlePolicy((expired) => {
      if (expired) {
        applyExpiredScanResults(true);
        return;
      }
      continueEnter();
      syncPageStatePolling();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeliveryUrgeUI);
  } else {
    initDeliveryUrgeUI();
  }
})();
