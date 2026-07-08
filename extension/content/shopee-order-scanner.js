/* Shopee 卖家中心 — 运送中订单扫描 Content Script（CNSC seller.shopee.cn） */

(function () {
  "use strict";

  if (globalThis.__SHOPEE_DU_ORDER_SCANNER__) return;
  globalThis.__SHOPEE_DU_ORDER_SCANNER__ = true;

  const ORDER_LIST_TAB_SHIPPING = 400;
  const ENTITY_TYPE_ORDER = 1;
  const PAGE_SIZE = 40;
  const MAX_PAGES = 50;
  const CARD_BATCH_SIZE = 5;
  const SHOP_IDS_STORAGE_KEY = "shopee_delivery_urge_shop_ids_v1";

  const API_INDEX_PATH = "search_order_list_index";
  const API_CARD_PATH = "get_order_list_card_list";
  const API_TRACKING_PATH = "get_logistics_tracking_history";
  const DETAIL_DELAY_MIN_MS = 400;
  const DETAIL_DELAY_MAX_MS = 1200;

  let scanCancelRequested = false;

  function resetScanCancel() {
    scanCancelRequested = false;
  }

  function assertNotCancelled() {
    if (scanCancelRequested) {
      const err = new Error("SCAN_CANCELLED");
      err.code = "SCAN_CANCELLED";
      throw err;
    }
  }

  const REGION_DETECT = [
    { code: "PH", patterns: [/菲律宾/, /philippines/i, /\.ph\b/i] },
    { code: "TH", patterns: [/泰国/, /thailand/i, /\.th\b/i] },
    { code: "MY", patterns: [/马来西亚/, /malaysia/i, /\.my\b/i] },
    { code: "SG", patterns: [/新加坡/, /singapore/i, /\.sg\b/i] },
  ];

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function randomDetailDelay() {
    return DETAIL_DELAY_MIN_MS + Math.floor(Math.random() * (DETAIL_DELAY_MAX_MS - DETAIL_DELAY_MIN_MS + 1));
  }

  function loadSavedShopId(siteCode) {
    return new Promise((resolve) => {
      if (!siteCode || typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve("");
        return;
      }
      chrome.storage.local.get([SHOP_IDS_STORAGE_KEY], (result) => {
        resolve(result?.[SHOP_IDS_STORAGE_KEY]?.[siteCode] || "");
      });
    });
  }

  function detectCnscShopIdFromPage() {
    for (const el of document.querySelectorAll('a[href*="cnsc_shop_id="], link[href*="cnsc_shop_id="]')) {
      try {
        const id = new URL(el.href, location.origin).searchParams.get("cnsc_shop_id");
        if (id) return id;
      } catch (_e) { /* ignore */ }
    }

    if (typeof performance !== "undefined" && performance.getEntriesByType) {
      for (const entry of performance.getEntriesByType("resource")) {
        const match = String(entry.name || "").match(/[?&]cnsc_shop_id=(\d+)/);
        if (match) return match[1];
      }
    }

    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const val = localStorage.getItem(localStorage.key(i)) || "";
        const match = val.match(/cnsc_shop_id[=:"'\s]+(\d+)/);
        if (match) return match[1];
      }
    } catch (_e) { /* ignore */ }

    return "";
  }

  async function resolveCnscShopId() {
    const fromUrl = getCnscShopId();
    if (fromUrl) return fromUrl;
    if (location.hostname !== "seller.shopee.cn") return "";

    const fromPage = detectCnscShopIdFromPage();
    if (fromPage) return fromPage;

    const siteCode = getSiteCode();
    return loadSavedShopId(siteCode);
  }

  async function buildLogisticsApiUrl(endpoint, extraParams) {
    const currentOrigin = window.location.origin;
    const params = new URLSearchParams(location.search);
    if (location.hostname === "seller.shopee.cn") {
      if (!params.get("cnsc_shop_id")) {
        const shopId = await resolveCnscShopId();
        if (shopId) params.set("cnsc_shop_id", shopId);
      }
      if (!params.get("cbsc_shop_region")) {
        const siteCode = getSiteCode();
        if (siteCode) params.set("cbsc_shop_region", siteCode.toLowerCase());
      }
    }
    Object.entries(extraParams || {}).forEach(([key, value]) => {
      if (value != null && value !== "") params.set(key, String(value));
    });
    const query = params.toString() ? `?${params.toString()}` : "";
    return `${currentOrigin}/api/v3/logistics/${endpoint}${query}`;
  }

  async function buildApiUrl(endpoint) {
    const currentOrigin = window.location.origin;
    const params = new URLSearchParams(location.search);
    if (location.hostname === "seller.shopee.cn") {
      if (!params.get("cnsc_shop_id")) {
        const shopId = await resolveCnscShopId();
        if (shopId) params.set("cnsc_shop_id", shopId);
      }
      if (!params.get("cbsc_shop_region")) {
        const siteCode = getSiteCode();
        if (siteCode) params.set("cbsc_shop_region", siteCode.toLowerCase());
      }
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return `${currentOrigin}/api/v3/order/${endpoint}${query}`;
  }

  function friendlyApiError(raw) {
    const msg = String(raw || "").trim();
    if (/parameter\s*invalid/i.test(msg)) {
      return "订单接口参数格式不匹配，请刷新运送中订单页后重试";
    }
    return msg || "订单接口返回错误";
  }

  async function postOrderApi(endpoint, body) {
    const apiUrl = await buildApiUrl(endpoint);
    const resp = await fetch(apiUrl, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`订单接口 HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data?.error && data.error !== 0 && data.error !== "0") {
      throw new Error(friendlyApiError(data?.error_msg || data?.message));
    }
    if (data?.code != null && data.code !== 0 && data.code !== "0") {
      throw new Error(friendlyApiError(data?.msg || data?.message));
    }

    return data;
  }

  async function getLogisticsApi(endpoint, queryParams) {
    const apiUrl = await buildLogisticsApiUrl(endpoint, queryParams);
    const resp = await fetch(apiUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      throw new Error(`物流接口 HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data?.error && data.error !== 0 && data.error !== "0") {
      throw new Error(friendlyApiError(data?.error_msg || data?.message));
    }
    if (data?.code != null && data.code !== 0 && data.code !== "0") {
      throw new Error(friendlyApiError(data?.msg || data?.message || data?.user_message));
    }

    return data;
  }

  function detectActiveShippingTab() {
    const selectors = [
      '[role="tab"][aria-selected="true"]',
      '[role="tab"].active',
      '[class*="Tab"][class*="active"]',
      '[class*="tab"][class*="active"]',
      '[class*="nav-tab"][class*="active"]',
    ];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = (node.textContent || "").trim();
        if (/运送中/.test(text) || /\bin transit\b/i.test(text)) return true;
      }
    }
    return false;
  }

  function isShippingOrderPage() {
    if (/\/portal\/sale\/shipping(\/|\?|$)/i.test(location.pathname)) return true;
    if (!/\/portal\/sale\/order/i.test(location.pathname)) return false;
    if (new URLSearchParams(location.search).get("type") === "shipping") return true;
    return detectActiveShippingTab();
  }

  function getCnscShopId() {
    return new URLSearchParams(location.search).get("cnsc_shop_id") || "";
  }

  function detectRegionFromPage() {
    const chunks = [
      document.querySelector("header")?.innerText,
      document.querySelector('[class*="shop"]')?.innerText,
      document.querySelector('[class*="Shop"]')?.innerText,
      document.title,
      document.body?.innerText?.slice(0, 2500),
    ]
      .filter(Boolean)
      .join(" ");

    for (const { code, patterns } of REGION_DETECT) {
      if (patterns.some((p) => p.test(chunks))) return code;
    }
    return "";
  }

  function getSiteCode() {
    if (location.hostname === "seller.shopee.cn") {
      return detectRegionFromPage();
    }
    const m = location.hostname.match(/^seller\.(ph|th|my|sg)\.shopee\.cn$/i);
    return m ? m[1].toUpperCase() : "";
  }

  async function reportShopContext() {
    if (!isShippingOrderPage()) return;
    const shopId = await resolveCnscShopId();
    const region = getSiteCode();
    if (!shopId || !region) return;
    chrome.runtime.sendMessage({
      type: "SAVE_CNSC_SHOP_ID",
      region,
      shopId,
    });
  }

  function buildIndexPayload(pageNumber, fromPageNumber) {
    return {
      order_list_tab: ORDER_LIST_TAB_SHIPPING,
      entity_type: ENTITY_TYPE_ORDER,
      filter: {
        fulfillment_type: 0,
        is_drop_off: 0,
      },
      pagination: {
        from_page_number: fromPageNumber,
        page_number: pageNumber,
        page_size: PAGE_SIZE,
      },
    };
  }

  async function fetchOrderIndexPage(pageNumber, fromPageNumber) {
    return postOrderApi(API_INDEX_PATH, buildIndexPayload(pageNumber, fromPageNumber));
  }

  function extractIndexList(payload) {
    const root = payload?.data || payload?.response || payload;
    const list = root?.indexList || root?.index_list || [];
    return Array.isArray(list) ? list : [];
  }

  function chunkList(list, size) {
    const chunks = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  }

  function buildOrderParamList(indexList) {
    return indexList
      .map((item) => ({
        order_id: item.order_id ?? item.orderId,
        shop_id: item.shop_id ?? item.shopId,
        region_id: item.region_id ?? item.regionId,
      }))
      .filter((item) => item.order_id != null);
  }

  function reportScanProgress(payload) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ type: "SCAN_PROGRESS", ...payload });
    } catch (_e) { /* ignore */ }
  }

  function reportStreamOrder(payload) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ type: "SCAN_STREAM_ORDER", ...payload });
    } catch (_e) { /* ignore */ }
  }

  async function fetchOrderCardsBatch(indexList) {
    const orderParamList = buildOrderParamList(indexList);
    if (!orderParamList.length) return [];

    const payload = await postOrderApi(API_CARD_PATH, {
      order_list_tab: ORDER_LIST_TAB_SHIPPING,
      need_count_down_desc: true,
      order_param_list: orderParamList,
    });

    const root = payload?.data || payload?.response || payload;
    const batch =
      root?.cardList || root?.card_list || root?.order_list || root?.orders || [];
    return Array.isArray(batch) ? batch : [];
  }

  async function fetchOrderCards(indexList) {
    const batches = chunkList(indexList, CARD_BATCH_SIZE);
    if (!batches.length) return [];

    const batchResults = await Promise.all(
      batches.map((batch) => {
        assertNotCancelled();
        return fetchOrderCardsBatch(batch);
      })
    );

    return batchResults.flat();
  }

  function pickFirstNonEmpty(...values) {
    for (const value of values) {
      if (value == null || value === "") continue;
      return value;
    }
    return "";
  }

  function extractPackageNumber(card) {
    const item = card?._du_card_item || {};
    const packageCard = card?.packageCard || item?.packageCard || item?.package_card || {};
    const cardHeader =
      packageCard?.cardHeader ||
      packageCard?.card_header ||
      card?.cardHeader ||
      card?.card_header ||
      {};
    const fulfilmentInfo =
      card?.fulfilmentInfo ||
      card?.fulfilment_info ||
      packageCard?.fulfilmentInfo ||
      packageCard?.fulfilment_info ||
      {};
    const packageExtInfo = packageCard?.packageExtInfo || packageCard?.package_ext_info || {};
    const orderExtInfo =
      card?.orderExtInfo ||
      card?.order_ext_info ||
      packageCard?.orderExtInfo ||
      packageCard?.order_ext_info ||
      {};
    const packageExtInfoList = card?.package_ext_info_list || card?.packageExtInfoList || [];
    const firstPackageExt = packageExtInfoList[0] || {};

    return pickFirstNonEmpty(
      card?.package_number,
      card?.packageNumber,
      packageCard?.package_number,
      packageCard?.packageNumber,
      cardHeader?.package_number,
      cardHeader?.packageNumber,
      fulfilmentInfo?.package_number,
      fulfilmentInfo?.packageNumber,
      packageExtInfo?.package_number,
      packageExtInfo?.packageNumber,
      firstPackageExt?.package_number,
      firstPackageExt?.packageNumber,
      orderExtInfo?.package_number,
      orderExtInfo?.packageNumber,
      item?.package_number,
      item?.packageNumber
    );
  }

  function normalizeOrderCard(item) {
    const card = item?.orderCard || item?.order_card || item?.card || item || {};
    const packageCard = item?.packageCard || item?.package_card;
    const cardHeader =
      packageCard?.cardHeader ||
      packageCard?.card_header ||
      card?.cardHeader ||
      card?.card_header ||
      {};
    const fulfilmentInfo =
      packageCard?.fulfilmentInfo ||
      packageCard?.fulfilment_info ||
      card?.fulfilmentInfo ||
      card?.fulfilment_info ||
      {};
    const orderExtInfo =
      card?.orderExtInfo ||
      card?.order_ext_info ||
      packageCard?.orderExtInfo ||
      packageCard?.order_ext_info ||
      {};
    const buyerInfo = cardHeader?.buyer_info || cardHeader?.buyerInfo || {};
    const username = pickFirstNonEmpty(
      buyerInfo?.username,
      card?.buyer_user?.username,
      card?.buyer_user?.user_name,
      card?.buyer_username,
      card?.buyer?.username
    );

    return {
      ...card,
      _du_card_item: item,
      order_sn: pickFirstNonEmpty(
        card.order_sn,
        card.ordersn,
        card.orderSn,
        cardHeader.orderSn,
        cardHeader.order_sn
      ),
      order_id: card.order_id ?? card.orderId ?? orderExtInfo.orderId ?? orderExtInfo.order_id,
      buyer_user_id:
        card.buyer_user_id ??
        card.buyerUserId ??
        orderExtInfo.buyer_user_id ??
        orderExtInfo.buyerUserId,
      shop_id: card.shop_id ?? card.shopId ?? orderExtInfo.shopId ?? orderExtInfo.shop_id,
      region_id: card.region_id ?? card.regionId ?? orderExtInfo.regionId ?? orderExtInfo.region_id,
      buyer_username: username || undefined,
      buyer_user: username ? { ...(card.buyer_user || {}), username } : card.buyer_user,
      package_number: extractPackageNumber({
        ...card,
        packageCard,
        fulfilmentInfo,
        cardHeader,
        _du_card_item: item,
      }),
      packageCard,
      fulfilmentInfo,
      cardHeader,
    };
  }

  function flattenTrackingPayload(payload) {
    const entries = [];
    const seen = new Set();

    const push = (text, time) => {
      const desc = String(text || "").trim();
      if (!desc) return;
      const key = `${desc}|${time ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ description: desc, ctime: time ?? null });
    };

    const absorbList = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        push(
          item.description ||
            item.tracking_description ||
            item.logistics_status_description ||
            item.logistics_status ||
            item.status ||
            item.title,
          item.ctime || item.create_time || item.time || item.timestamp
        );
      });
    };

    const absorbPackage = (pkg) => {
      if (!pkg || typeof pkg !== "object") return;
      absorbList(pkg.tracking_info || pkg.trackingInfo);
      absorbList(pkg.tracking_info_list || pkg.trackingInfoList);
      absorbList(pkg.tracking_list || pkg.trackingList);
      absorbList(pkg.logistics_status_list || pkg.logisticsStatusList);
    };

    const root = payload?.data || payload?.response || payload || {};
    const packageLists = [root.list, root.tracking_list, root.package_list, root.packages].filter(
      Array.isArray
    );

    packageLists.forEach((list) => list.forEach(absorbPackage));

    absorbList(root.tracking_info || root.trackingInfo);
    absorbList(root.tracking_info_list || root.trackingInfoList);
    absorbList(root.tracking_list || root.trackingList);
    absorbList(root.logistics_status_list || root.logisticsStatusList);

    entries.sort((a, b) => {
      const ta = Number(a.ctime) || 0;
      const tb = Number(b.ctime) || 0;
      return tb - ta;
    });

    return entries;
  }

  function buildTrackingQueryParams(card) {
    const item = card?._du_card_item || {};
    const packageCard = card?.packageCard || item?.packageCard || item?.package_card || {};
    const orderExtInfo =
      card?.orderExtInfo ||
      card?.order_ext_info ||
      packageCard?.orderExtInfo ||
      packageCard?.order_ext_info ||
      {};
    const cardHeader = packageCard?.cardHeader || packageCard?.card_header || card?.cardHeader || {};

    const orderId = pickFirstNonEmpty(
      card?.order_id,
      card?.orderId,
      orderExtInfo?.orderId,
      orderExtInfo?.order_id
    );
    const packageNumber = extractPackageNumber(card);

    const params = {};
    if (orderId !== "") {
      params.order_id = Number.isFinite(Number(orderId)) ? Number(orderId) : orderId;
    }
    if (packageNumber) params.package_number = packageNumber;
    return params;
  }

  async function fetchLogisticsTracking(card) {
    const primaryParams = buildTrackingQueryParams(card);
    if (primaryParams.order_id == null) {
      return { entries: [] };
    }

    const attempts = [primaryParams];
    if (primaryParams.package_number) {
      const { package_number: _omit, ...withoutPackage } = primaryParams;
      attempts.push(withoutPackage);
    }

    let bestEntries = [];

    for (const queryParams of attempts) {
      try {
        const payload = await getLogisticsApi(API_TRACKING_PATH, queryParams);
        const entries = flattenTrackingPayload(payload);
        if (entries.length > bestEntries.length) {
          bestEntries = entries;
        }
        if (entries.length > 1) break;
      } catch (_err) {
        /* try next query shape */
      }
    }

    return { entries: bestEntries };
  }

  async function enrichOrdersWithTracking(cards, siteCode, shopId, skipRecentDays) {
    const minAgeDays = typeof duNormalizeSkipRecentDays === "function"
      ? duNormalizeSkipRecentDays(skipRecentDays)
      : Number(skipRecentDays) || 3;
    const sortFn = typeof duSortOrdersOldestFirst === "function" ? duSortOrdersOldestFirst : (list) => list;
    const buildQueueFn =
      typeof duBuildDetailFetchQueue === "function"
        ? duBuildDetailFetchQueue
        : () => ({ queue: cards, skippedDelivered: 0, skippedRecent: 0, skipRecentDays: minAgeDays });
    const classifyFn =
      typeof duClassifyOrderCategory === "function" ? duClassifyOrderCategory : () => "in_transit";

    const sorted = sortFn(cards);
    const { queue, skippedDelivered, skippedRecent } = buildQueueFn(sorted, minAgeDays);
    const totalListed = sorted.length;
    const detailTotal = queue.length;
    const enrichedBySn = new Map();

    sorted.forEach((card) => {
      const sn = card?.order_sn || card?.ordersn;
      if (!sn) return;
      if (typeof duShouldSkipDetailFetch === "function" && duShouldSkipDetailFetch(card, minAgeDays)) {
        if (isOuterDelivered(card)) {
          enrichedBySn.set(sn, { ...card, _du_skip_reason: "delivered" });
        } else {
          enrichedBySn.set(sn, { ...card, _du_tracking_skipped: "recent" });
        }
      }
    });

    let fullTracking = 0;
    let streamFirstDelivering = 0;
    let streamAbnormalWarning = 0;

    reportScanProgress({
      phase: "tracking",
      fetched: totalListed,
      total_step: detailTotal,
      current_step: 0,
      total_orders: totalListed,
      detail_queue_total: detailTotal,
      skipped_delivered: skippedDelivered,
      skipped_recent: skippedRecent,
      skip_recent_days: minAgeDays,
      stream_first_delivering: 0,
      stream_abnormal_warning: 0,
      message: detailTotal
        ? `共 ${totalListed} 单，跳过已送达 ${skippedDelivered} 单、${minAgeDays} 天内新单 ${skippedRecent} 单，开始分析 ${detailTotal} 单…`
        : totalListed
        ? `共 ${totalListed} 单，均已送达或为 ${minAgeDays} 天内新单，无需分析`
        : "未找到运送中订单",
    });

    for (let i = 0; i < queue.length; i += 1) {
      assertNotCancelled();
      const card = queue[i];
      const sn = card?.order_sn || card?.ordersn;

      const tracking = await fetchLogisticsTracking(card);
      const trackingEntries = tracking.entries;
      fullTracking += 1;

      const enriched = {
        ...card,
        _du_tracking_entries: trackingEntries.length ? trackingEntries : undefined,
      };
      if (sn) enrichedBySn.set(sn, enriched);

      const category = classifyFn(enriched);
      if (category === "first_delivering" || category === "abnormal_warning") {
        if (category === "first_delivering") streamFirstDelivering += 1;
        else streamAbnormalWarning += 1;

        reportStreamOrder({
          order: enriched,
          category,
          siteCode: siteCode || "",
          shopId: shopId || "",
          stream_first_delivering: streamFirstDelivering,
          stream_abnormal_warning: streamAbnormalWarning,
        });
      }

      reportScanProgress({
        phase: "tracking",
        fetched: totalListed,
        total_step: detailTotal,
        current_step: i + 1,
        total_orders: totalListed,
        detail_queue_total: detailTotal,
        skipped_delivered: skippedDelivered,
        skipped_recent: skippedRecent,
        skip_recent_days: minAgeDays,
        full_tracking: fullTracking,
        stream_first_delivering: streamFirstDelivering,
        stream_abnormal_warning: streamAbnormalWarning,
        message: `分析中 ${i + 1}/${detailTotal}…`,
      });

      if (i < queue.length - 1) {
        await sleep(randomDetailDelay());
      }
    }

    const enriched = sorted.map((card) => {
      const sn = card?.order_sn || card?.ordersn;
      return (sn && enrichedBySn.get(sn)) || card;
    });

    enriched._duScanMeta = {
      totalOrders: totalListed,
      detailQueueTotal: detailTotal,
      skippedDelivered,
      skippedRecent,
      skipRecentDays: minAgeDays,
      fullTracking,
      streamFirstDelivering,
      streamAbnormalWarning,
      fastScan: skippedRecent > 0,
    };
    return enriched;
  }

  function isOuterDelivered(card) {
    const logisticsStatus =
      card?.fulfilmentInfo?.logisticsStatus ??
      card?.fulfilmentInfo?.logistics_status ??
      card?.packageCard?.fulfilmentInfo?.logisticsStatus ??
      card?.packageCard?.fulfilmentInfo?.logistics_status;
    if (Number(logisticsStatus) === 5) return true;

    const objects = [
      card,
      card?.fulfilmentInfo,
      card?.packageCard,
      card?.packageCard?.fulfilmentInfo,
      card?.cardHeader,
      card?._du_card_item,
    ];
    const deliveredHints = [
      /delivered/i,
      /已送达/,
      /已签收/,
      /received by buyer/i,
      /订单已送达/,
      /arrived at destination/i,
    ];

    const collectStrings = (value, depth, out) => {
      if (value == null || depth > 6) return;
      if (typeof value === "string" || typeof value === "number") {
        out.push(String(value));
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => collectStrings(item, depth + 1, out));
        return;
      }
      if (typeof value !== "object") return;
      Object.entries(value).forEach(([key, val]) => {
        if (/status|remark|desc|tip|label|title|content|countdown/i.test(key)) {
          collectStrings(val, depth + 1, out);
        }
      });
    };

    const texts = [];
    objects.forEach((obj) => collectStrings(obj, 0, texts));
    return texts.some((raw) => deliveredHints.some((re) => re.test(raw)));
  }

  function extractPaginationInfo(payload) {
    const root = payload?.data || payload?.response || payload;
    const pag = root?.pagination || root?.page_info || {};
    const total = pag.total ?? pag.total_count ?? pag.totalCount ?? null;
    const totalPageRaw = pag.total_page ?? pag.totalPage ?? null;
    const totalPage =
      totalPageRaw != null
        ? Number(totalPageRaw)
        : total != null
        ? Math.ceil(Number(total) / PAGE_SIZE)
        : null;
    return {
      total: total != null ? Number(total) : null,
      totalPage: Number.isFinite(totalPage) && totalPage > 0 ? totalPage : null,
    };
  }

  async function fetchAllIndexPages() {
    reportScanProgress({
      phase: "listing",
      fetched: 0,
      page: 0,
      message: "正在连接 Shopee 运送中订单列表…",
    });

    assertNotCancelled();
    const firstPayload = await fetchOrderIndexPage(1, 1);
    const pagInfo = extractPaginationInfo(firstPayload);
    const totalPages = Math.min(Math.max(pagInfo.totalPage || 1, 1), MAX_PAGES);
    const totalOrdersHint = pagInfo.total;

    reportScanProgress({
      phase: "listing",
      fetched: extractIndexList(firstPayload).length,
      page: 1,
      total_pages: totalPages,
      total_orders: totalOrdersHint,
      message:
        totalPages > 1
          ? `正在拉取订单，共 ${totalPages} 页…`
          : "正在拉取运送中订单…",
    });

    const pagePayloads = new Map([[1, firstPayload]]);

    if (totalPages > 1) {
      const pageRequests = [];
      for (let page = 2; page <= totalPages; page += 1) {
        pageRequests.push(
          fetchOrderIndexPage(page, page - 1).then((payload) => {
            assertNotCancelled();
            return { page, payload };
          })
        );
      }
      const results = await Promise.all(pageRequests);
      results.forEach(({ page, payload }) => pagePayloads.set(page, payload));
    }

    const allIndex = [];
    const seenIds = new Set();

    for (let page = 1; page <= totalPages; page += 1) {
      const indexList = extractIndexList(pagePayloads.get(page));
      indexList.forEach((item) => {
        const id = item.order_id ?? item.orderId;
        if (id != null) {
          if (seenIds.has(id)) return;
          seenIds.add(id);
        }
        allIndex.push(item);
      });
    }

    reportScanProgress({
      phase: "listing",
      fetched: allIndex.length,
      page: totalPages,
      total_pages: totalPages,
      total_orders: totalOrdersHint || allIndex.length,
      message: `已找到 ${allIndex.length} 单，正在获取订单详情…`,
    });

    return { allIndex, totalPages, totalOrdersHint };
  }

  async function scanAllShippingOrders() {
    const { allIndex, totalPages, totalOrdersHint } = await fetchAllIndexPages();
    if (!allIndex.length) return [];

    assertNotCancelled();
    const rawCards = await fetchOrderCards(allIndex);

    reportScanProgress({
      phase: "listing",
      fetched: 0,
      page: totalPages,
      total_pages: totalPages,
      total_orders: totalOrdersHint || allIndex.length,
      message: "订单详情获取完成，正在整理…",
    });

    const all = [];
    const seen = new Set();
    rawCards.forEach((item) => {
      const card = normalizeOrderCard(item);
      const sn = card?.order_sn || card?.ordersn;
      if (sn && seen.has(sn)) return;
      if (sn) seen.add(sn);
      all.push(card);
    });

    reportScanProgress({
      phase: "listing",
      fetched: all.length,
      page: totalPages,
      total_pages: totalPages,
      total_orders: totalOrdersHint || all.length,
      message: `共 ${all.length} 单，准备开始分析…`,
    });

    return all;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CANCEL_SCAN") {
      scanCancelRequested = true;
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "GET_PAGE_CONTEXT") {
      (async () => {
        const shopId = await resolveCnscShopId();
        sendResponse({
          ok: true,
          isShippingPage: isShippingOrderPage(),
          shopId,
          siteCode: getSiteCode(),
          url: location.href,
        });
      })();
      return true;
    }

    if (message?.type !== "SCAN_SHIPPING_ORDERS") return false;

    (async () => {
      try {
        resetScanCancel();
        if (!isShippingOrderPage()) {
          sendResponse({
            ok: false,
            error: "当前页面不是运送中订单页，请先打开对应站点后台",
          });
          return;
        }

        if (location.hostname === "seller.shopee.cn") {
          const shopId = await resolveCnscShopId();
          if (!shopId) {
            sendResponse({
              ok: false,
              error:
                "未识别到店铺 ID：请先在卖家中心左上角切换到目标站点店铺，再打开「我的销售 → 运送中」订单页后重试",
            });
            return;
          }
        }

        reportShopContext();
        reportScanProgress({ phase: "start", fetched: 0, message: "开始扫描运送中订单…" });
        const siteCode = getSiteCode();
        const shopId = await resolveCnscShopId();
        const skipRecentDays =
          typeof duNormalizeSkipRecentDays === "function"
            ? duNormalizeSkipRecentDays(message?.skipRecentDays)
            : Number(message?.skipRecentDays) || 3;
        const rawOrders = await scanAllShippingOrders();
        const enrichedOrders = await enrichOrdersWithTracking(rawOrders, siteCode, shopId, skipRecentDays);
        const scanMeta = enrichedOrders._duScanMeta || {
          totalOrders: rawOrders.length,
          detailQueueTotal: rawOrders.length,
          skippedDelivered: 0,
          skippedRecent: 0,
          fullTracking: rawOrders.length,
          streamFirstDelivering: 0,
          streamAbnormalWarning: 0,
          fastScan: false,
        };
        const orders = enrichedOrders.map((order) => {
          const { _duScanMeta: _omit, ...rest } = order;
          return rest;
        });
        reportScanProgress({
          phase: "done",
          fetched: orders.length,
          total_orders: orders.length,
          detail_queue_total: scanMeta.detailQueueTotal,
          skipped_delivered: scanMeta.skippedDelivered,
          skipped_recent: scanMeta.skippedRecent,
          stream_first_delivering: scanMeta.streamFirstDelivering,
          stream_abnormal_warning: scanMeta.streamAbnormalWarning,
          message: `扫描完成（详情分析 ${scanMeta.fullTracking} 单，跳过已送达 ${scanMeta.skippedDelivered}、新单 ${scanMeta.skippedRecent}）`,
        });
        sendResponse({
          ok: true,
          siteCode,
          shopId,
          orders,
          count: orders.length,
          scanMeta,
        });
      } catch (err) {
        if (err?.code === "SCAN_CANCELLED" || err?.message === "SCAN_CANCELLED") {
          sendResponse({ ok: false, cancelled: true, error: "扫描已取消" });
          return;
        }
        sendResponse({
          ok: false,
          error: err?.message || String(err),
        });
      }
    })();

    return true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reportShopContext);
  } else {
    reportShopContext();
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      reportShopContext();
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "DELIVERY_URGE_TAB_CHANGED" }).catch(() => {});
      }
    }
  }, 1500);
})();
