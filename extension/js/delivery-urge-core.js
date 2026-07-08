/* 派件异常催取 — 站点配置、物流分流判定、订单归一化 */

if (globalThis.__SHOPEE_DU_CORE__ && typeof globalThis.DU_SKIP_RECENT_DAYS_DEFAULT !== "undefined") {
  /* content script 重复注入时跳过，避免 const 冲突 */
} else {
globalThis.__SHOPEE_DU_CORE__ = true;

var DU_DEFAULT_MESSAGE =
  "Hi {name}! Your order is out for delivery. Please keep your phone handy so you can receive it promptly. We can't wait for you to get your items! ❤️";

const DU_CNSC_ORDER_BASE = "https://seller.shopee.cn/portal/sale/order";
var DU_GENERIC_SHIPPING_URL = `${DU_CNSC_ORDER_BASE}?type=shipping`;

/** CNSC 各站点快捷入口（shop_id 由用户访问后自动记住，见 duBuildShippingUrl） */
const DU_SITE_SHORTCUTS = [
  { code: "PH", flag: "🇵🇭", label: "菲律宾站" },
  { code: "TH", flag: "🇹🇭", label: "泰国站" },
  { code: "MY", flag: "🇲🇾", label: "马来站" },
  { code: "SG", flag: "🇸🇬", label: "新加坡站" },
];

/** 运送中订单超过此数量时启用「按订单时间加速」（历史兼容，详情队列现始终应用 DU_DETAIL_FETCH_MIN_AGE_DAYS） */
const DU_FAST_SCAN_ORDER_THRESHOLD = 80;
/** 加速模式下：订单距今不足此天数则跳过完整轨迹拉取（仍用列表状态判定） */
const DU_FAST_SCAN_MIN_AGE_DAYS = 3;
/** 详情请求队列：创建/发货距今不足此天数的订单不拉物流详情（默认，可被用户配置覆盖） */
var DU_DETAIL_FETCH_MIN_AGE_DAYS = 3;
var DU_SKIP_RECENT_DAYS_DEFAULT = DU_DETAIL_FETCH_MIN_AGE_DAYS;
const DU_SKIP_RECENT_DAYS_MIN = 1;
const DU_SKIP_RECENT_DAYS_MAX = 20;

/** 插件/浏览器关闭后超过此时间未再打开，则清空上次扫描结果 */
const DU_SCAN_RESULTS_IDLE_MS = 8 * 60 * 60 * 1000;

function duNormalizeSkipRecentDays(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DU_SKIP_RECENT_DAYS_DEFAULT;
  return Math.min(DU_SKIP_RECENT_DAYS_MAX, Math.max(DU_SKIP_RECENT_DAYS_MIN, n));
}

function duIsScanResultsIdleExpired(lastAccessMs, nowMs) {
  const last = Number(lastAccessMs) || 0;
  if (last <= 0) return false;
  const now = nowMs != null ? nowMs : Date.now();
  return now - last > DU_SCAN_RESULTS_IDLE_MS;
}

const DU_REGION_DETECT = [
  { code: "PH", patterns: [/菲律宾/, /philippines/i, /\.ph\b/i] },
  { code: "TH", patterns: [/泰国/, /thailand/i, /\.th\b/i] },
  { code: "MY", patterns: [/马来西亚/, /malaysia/i, /\.my\b/i] },
  { code: "SG", patterns: [/新加坡/, /singapore/i, /\.sg\b/i] },
];

const DU_SHIPPING_PAGE_LEGACY_RE =
  /^https:\/\/seller\.(ph|th|my|sg)\.shopee\.cn\/portal\/sale\/shipping(\/|\?|$)/i;

/** 已送达 — 卖家中心状态文案 + 物流轨迹 */
const DU_DELIVERED_KEYWORDS = [
  "delivered to buyer",
  "order has been delivered",
  "包裹已签收",
  "已送达",
  "订单已送达",
  "received by buyer",
  "successfully delivered",
];

/** 订单列表外侧 — 已送达 */
const DU_LIST_DELIVERED_KEYWORDS = [
  "delivered to buyer",
  "order has been delivered",
  "arrived at destination",
  "包裹已签收",
  "已送达",
  "订单已送达",
  "received by buyer",
  "successfully delivered",
];

/** 派送中 — 多国语言关键词（includes + 正则双保险；不含 driver assigned，仅为分配司机非派送给买家） */
const DU_DELIVERING_KEYWORDS = [
  "out for delivery to buyer",
  "out for delivery",
  "out of delivery",
  "คนขับกำลังนำส่งพัสดุให้ผู้ซื้อ",
  "กำลังนำส่ง",
  "包裹正在派送中",
  "配送员派送中",
  "正在派送",
  "派送中",
  "派件中",
];

const DU_DELIVERING_PATTERNS = [
  /out\s+(of|for)\s+delivery(\s+to\s+buyer)?/i,
  /คนขับกำลังนำส่งพัสดุให้ผู้ซื้อ/,
  /กำลังนำส่ง/,
  /包裹正在派送中/,
  /配送员派送中/,
  /正在派送/,
  /派送中/,
  /派件中/,
];

const DU_DELIVERED_PATTERNS = [
  /delivered\s+to\s+buyer/i,
  /包裹已签收/,
  /已送达/,
  /订单已送达/,
  /received\s+by\s+buyer/i,
  /successfully\s+delivered/i,
];

/** 派送失败 / 异常 — 含 COD 无法收取、拒收等 */
const DU_DELIVERY_FAILURE_KEYWORDS = [
  "delivery attempt to buyer was unsuccessful",
  "delivery attempt was unsuccessful",
  "unable to collect cod",
  "delivery unsuccessful",
  "failed to deliver",
  "delivery failed",
  "派送失败",
  "派送不成功",
  "未能成功派送",
  "无法收取",
  "无法收款",
  "拒收",
  "无人签收",
];

const DU_DELIVERY_FAILURE_PATTERNS = [
  /delivery\s+attempt.*unsuccessful/i,
  /unable\s+to\s+collect\s+cod/i,
  /failed\s+to\s+deliver/i,
  /delivery\s+failed/i,
  /派送失败/,
  /未能成功派送/,
  /无法收取/,
];

/** Shopee logisticsStatus 枚举：5 = LOGISTICS_DELIVERY_DONE（包裹已送达） */
const DU_LOGISTICS_DELIVERY_DONE = 5;

/**
 * 解包 get_order_list_card_list 返回项（状态多在 packageCard.fulfilmentInfo）
 */
function duUnwrapOrderCard(order) {
  const root = order || {};
  const cardItem = root._du_card_item || root;
  const orderCard = cardItem.orderCard || cardItem.order_card || {};
  const packageCard = cardItem.packageCard || cardItem.package_card || root.packageCard || root.package_card || {};
  const pkgOrderCard = cardItem.packageLevelOrderCard || cardItem.package_level_order_card || {};
  const cardHeader =
    packageCard.cardHeader ||
    packageCard.card_header ||
    orderCard.cardHeader ||
    orderCard.card_header ||
    root.cardHeader ||
    root.card_header ||
    {};
  const fulfilmentInfo =
    packageCard.fulfilmentInfo ||
    packageCard.fulfilment_info ||
    orderCard.fulfilmentInfo ||
    orderCard.fulfilment_info ||
    root.fulfilmentInfo ||
    root.fulfilment_info ||
    {};
  const orderExtInfo =
    orderCard.orderExtInfo ||
    orderCard.order_ext_info ||
    packageCard.orderExtInfo ||
    packageCard.order_ext_info ||
    root.orderExtInfo ||
    root.order_ext_info ||
    {};
  const packageExtInfoList =
    orderCard.package_ext_info_list ||
    orderCard.packageExtInfoList ||
    root.package_ext_info_list ||
    root.packageExtInfoList ||
    [];
  const packageExtInfo =
    packageCard.packageExtInfo ||
    packageCard.package_ext_info ||
    packageExtInfoList[0] ||
    {};

  return {
    root,
    cardItem,
    orderCard,
    packageCard,
    pkgOrderCard,
    cardHeader,
    fulfilmentInfo,
    orderExtInfo,
    packageExtInfo,
  };
}

function duIsLogisticsDeliveredCode(value) {
  const n = Number(value);
  return Number.isFinite(n) && n === DU_LOGISTICS_DELIVERY_DONE;
}

function duPushStatusCandidate(value, out, seen, depth) {
  if (value == null || depth > 8) return;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => duPushStatusCandidate(item, out, seen, depth + 1));
    return;
  }

  if (typeof value !== "object") return;

  const priorityKeys = [
    "status",
    "statusText",
    "status_text",
    "displayStatus",
    "display_status",
    "orderStatusText",
    "order_status_text",
    "logisticsStatus",
    "logistics_status",
    "logisticsStatusDescription",
    "logistics_status_description",
    "remark",
    "remarkText",
    "remark_text",
    "description",
    "content",
    "label",
    "title",
    "text",
    "countDownDesc",
    "count_down_desc",
    "tips",
    "tip",
  ];

  priorityKeys.forEach((key) => {
    if (key in value) duPushStatusCandidate(value[key], out, seen, depth + 1);
  });

  if (depth < 5) {
    Object.entries(value).forEach(([key, val]) => {
      if (/status|remark|desc|tip|label|title|content|countdown/i.test(key)) {
        duPushStatusCandidate(val, out, seen, depth + 1);
      }
    });
  }
}

function duCollectOuterStatusCandidates(order) {
  const parts = duUnwrapOrderCard(order);
  const candidates = [];
  const seen = new Set();

  [
    parts.fulfilmentInfo,
    parts.packageCard,
    parts.orderCard,
    parts.cardHeader,
    parts.pkgOrderCard,
    parts.cardItem,
    parts.root,
  ].forEach((obj) => duPushStatusCandidate(obj, candidates, seen, 0));

  return candidates;
}

function duHasDeliveredLogisticsCode(order) {
  const parts = duUnwrapOrderCard(order);
  const codes = [
    parts.fulfilmentInfo?.logisticsStatus,
    parts.fulfilmentInfo?.logistics_status,
    parts.packageCard?.logisticsStatus,
    parts.packageCard?.logistics_status,
    order?.logisticsStatus,
    order?.logistics_status,
    order?.fulfillment_info?.logistics_status,
    order?.fulfillment_info?.logisticsStatus,
  ];
  return codes.some(duIsLogisticsDeliveredCode);
}

function duLoadShopIds() {
  return loadJSON(STORAGE.deliveryUrgeShopIds, {}) || {};
}

function duSaveShopId(siteCode, shopId) {
  if (!siteCode || shopId == null || shopId === "") return;
  const saved = duLoadShopIds();
  const next = String(shopId);
  if (saved[siteCode] === next) return;
  saved[siteCode] = next;
  saveJSON(STORAGE.deliveryUrgeShopIds, saved);
}

function duBuildShippingUrl(siteCode, shopIds) {
  const ids = shopIds || duLoadShopIds();
  const shopId = ids[siteCode];
  if (shopId) {
    return `${DU_CNSC_ORDER_BASE}?type=shipping&cnsc_shop_id=${encodeURIComponent(shopId)}`;
  }
  return `${DU_CNSC_ORDER_BASE}?type=shipping`;
}

function duParseShippingPage(url) {
  const raw = String(url || "");
  if (!raw) return null;

  try {
    const u = new URL(raw);
    if (u.hostname === "seller.shopee.cn") {
      if (/\/portal\/sale\/shipping(\/|\?|$)/i.test(u.pathname)) {
        return {
          host: "cnsc",
          shopId: u.searchParams.get("cnsc_shop_id") || "",
        };
      }
      if (/\/portal\/sale\/order/i.test(u.pathname) && u.searchParams.get("type") === "shipping") {
        return {
          host: "cnsc",
          shopId: u.searchParams.get("cnsc_shop_id") || "",
        };
      }
    }
  } catch (_e) { /* ignore */ }

  const legacy = raw.match(/^https:\/\/seller\.(ph|th|my|sg)\.shopee\.cn/i);
  if (legacy && DU_SHIPPING_PAGE_LEGACY_RE.test(raw)) {
    return { host: "legacy", siteCode: legacy[1].toUpperCase(), shopId: "" };
  }
  return null;
}

function duSiteCodeFromShopId(shopId, shopIds) {
  if (!shopId) return "";
  const ids = shopIds || duLoadShopIds();
  for (const [code, id] of Object.entries(ids)) {
    if (String(id) === String(shopId)) return code;
  }
  return "";
}

function duSiteLabelFromCode(code) {
  const found = DU_SITE_SHORTCUTS.find((s) => s.code === code);
  return found ? found.label : code ? `${code}站` : "未知站点";
}

function duPickTimestampMs(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      return n > 1e12 ? n : n * 1000;
    }
  }
  return null;
}

function duExtractOrderSn(order) {
  const parts = duUnwrapOrderCard(order);
  const { cardHeader, orderExtInfo, orderCard, root } = parts;
  return String(
    root.order_sn ||
      root.ordersn ||
      root.orderSn ||
      cardHeader.order_sn ||
      cardHeader.orderSn ||
      orderExtInfo.order_sn ||
      orderExtInfo.orderSn ||
      orderCard.order_sn ||
      orderCard.orderSn ||
      ""
  ).trim();
}

/** Shopee 订单号前缀 YYMMDD，如 260703NBGA86W2 → 2026-07-03 */
function duParseOrderSnDateMs(orderSn) {
  const sn = String(orderSn || "")
    .trim()
    .toUpperCase();
  const m = sn.match(/^(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = 2000 + yy;
  const ms = new Date(year, mm - 1, dd).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** 订单创建/下单时间（用于 3 天内新单拦截） */
function duExtractOrderCreateTimeMs(order) {
  const parts = duUnwrapOrderCard(order);
  const { fulfilmentInfo, orderExtInfo, cardHeader, packageCard, orderCard, root } = parts;
  const fromFields = duPickTimestampMs(
    orderExtInfo?.order_create_time,
    orderExtInfo?.orderCreateTime,
    orderExtInfo?.create_time,
    orderExtInfo?.createTime,
    orderExtInfo?.place_order_time,
    orderExtInfo?.placeOrderTime,
    cardHeader?.order_create_time,
    cardHeader?.orderCreateTime,
    cardHeader?.create_time,
    cardHeader?.createTime,
    cardHeader?.place_order_time,
    cardHeader?.placeOrderTime,
    orderCard?.order_create_time,
    orderCard?.orderCreateTime,
    orderCard?.create_time,
    orderCard?.createTime,
    packageCard?.order_create_time,
    packageCard?.orderCreateTime,
    orderExtInfo?.pay_time,
    orderExtInfo?.payTime,
    cardHeader?.pay_time,
    cardHeader?.payTime,
    root?.order_create_time,
    root?.orderCreateTime,
    root?.create_time,
    root?.createTime,
    root?.pay_time,
    root?.payTime
  );
  if (fromFields) return fromFields;
  return duParseOrderSnDateMs(duExtractOrderSn(order));
}

/** 发货/揽收时间（用于在途时长排序，优先于创建时间） */
function duExtractOrderShipTimeMs(order) {
  const parts = duUnwrapOrderCard(order);
  const { fulfilmentInfo, orderExtInfo, cardHeader, packageCard, root } = parts;
  return duPickTimestampMs(
    fulfilmentInfo?.ship_time,
    fulfilmentInfo?.shipTime,
    fulfilmentInfo?.shipping_time,
    fulfilmentInfo?.shippingTime,
    fulfilmentInfo?.shipped_time,
    fulfilmentInfo?.shippedTime,
    fulfilmentInfo?.pickup_done_time,
    fulfilmentInfo?.pickupDoneTime,
    packageCard?.ship_time,
    packageCard?.shipTime,
    orderExtInfo?.ship_time,
    orderExtInfo?.shipTime,
    root?.ship_time,
    root?.shipTime
  );
}

/** 排序参考时间：发货优先，否则创建/订单号日期 */
function duExtractOrderReferenceTime(order) {
  return duExtractOrderShipTimeMs(order) || duExtractOrderCreateTimeMs(order);
}

function duGetOrderAgeDays(order) {
  const refMs = duExtractOrderCreateTimeMs(order);
  if (!refMs) return null;
  return (Date.now() - refMs) / (24 * 60 * 60 * 1000);
}

function duShouldUseFastScan(totalOrders) {
  return totalOrders > DU_FAST_SCAN_ORDER_THRESHOLD;
}

function duShouldSkipTrackingForOrder(order, totalOrders) {
  if (!duShouldUseFastScan(totalOrders)) return false;
  const ageDays = duGetOrderAgeDays(order);
  if (ageDays == null) return false;
  return ageDays < DU_FAST_SCAN_MIN_AGE_DAYS;
}

/** 列表侧是否应跳过详情请求（已送达 / 超新单） */
function duShouldSkipDetailFetch(order, minAgeDays) {
  const threshold = duNormalizeSkipRecentDays(minAgeDays ?? DU_SKIP_RECENT_DAYS_DEFAULT);
  if (duGetOuterListStatus(order) === "delivered") return true;
  const ageDays = duGetOrderAgeDays(order);
  if (ageDays != null && ageDays < threshold) return true;
  return false;
}

/** 按创建/发货时间升序（最老在前） */
function duSortOrdersOldestFirst(orders) {
  return [...orders].sort((a, b) => {
    const ta = duExtractOrderReferenceTime(a);
    const tb = duExtractOrderReferenceTime(b);
    const na = ta == null ? Infinity : ta;
    const nb = tb == null ? Infinity : tb;
    return na - nb;
  });
}

/**
 * 内存裁剪：排除已送达与 3 天内新单，其余全部进入详情队列
 * @returns {{ queue: object[], skippedDelivered: number, skippedRecent: number }}
 */
function duBuildDetailFetchQueue(orders, minAgeDays) {
  const threshold = duNormalizeSkipRecentDays(minAgeDays ?? DU_SKIP_RECENT_DAYS_DEFAULT);
  const queue = [];
  let skippedDelivered = 0;
  let skippedRecent = 0;

  orders.forEach((order) => {
    if (duGetOuterListStatus(order) === "delivered") {
      skippedDelivered += 1;
      return;
    }
    const ageDays = duGetOrderAgeDays(order);
    if (ageDays != null && ageDays < threshold) {
      skippedRecent += 1;
      return;
    }
    queue.push(order);
  });

  return { queue, skippedDelivered, skippedRecent, skipRecentDays: threshold };
}

/**
 * 文本是否匹配「派送中」关键词
 */
function duIsDeliveringText(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (DU_DELIVERING_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()) || raw.includes(kw))) {
    return true;
  }
  return DU_DELIVERING_PATTERNS.some((re) => re.test(raw));
}

/**
 * 文本是否匹配「派送失败」关键词
 */
function duIsDeliveryFailureText(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (DU_DELIVERY_FAILURE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()) || raw.includes(kw))) {
    return true;
  }
  return DU_DELIVERY_FAILURE_PATTERNS.some((re) => re.test(raw));
}

/**
 * 文本是否匹配「已送达」关键词
 */
function duIsDeliveredText(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (DU_DELIVERED_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()) || raw.includes(kw))) {
    return true;
  }
  if (DU_LIST_DELIVERED_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()) || raw.includes(kw))) {
    return true;
  }
  return DU_DELIVERED_PATTERNS.some((re) => re.test(raw));
}

/**
 * 订单列表外侧状态（优先读 packageCard.fulfilmentInfo / 状态码）
 * @returns {'delivered'|'in_transit'}
 */
function duGetOuterListStatus(order) {
  if (duHasDeliveredLogisticsCode(order)) return "delivered";

  for (const text of duCollectOuterStatusCandidates(order)) {
    if (duIsDeliveredText(text)) return "delivered";
  }

  const history = duExtractTrackingHistory(order);
  if (history.length && duIsDeliveredText(history[0].description)) {
    return "delivered";
  }

  return "in_transit";
}

/**
 * 从订单详情 / 物流接口响应中提取完整轨迹列表（新 → 旧）
 * 合并 API 全量轨迹、订单卡片内嵌轨迹等所有来源，取最全的一份
 */
function duExtractTrackingHistory(order) {
  const candidates = [];

  const collectEntries = (entries) => {
    const list = Array.isArray(entries) ? entries : [];
    const normalized = list
      .map((item) => ({
        description: String(item?.description || "").trim(),
        ctime: item?.ctime ?? item?.time ?? null,
      }))
      .filter((item) => item.description);
    if (normalized.length) candidates.push(normalized);
  };

  collectEntries(order?._du_tracking_entries);

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
          item.logistics_status ||
          item.logistics_status_description ||
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

  const absorbTrackingRoot = (root) => {
    if (!root || typeof root !== "object") return;
    const data = root.data || root.response || root;
    [data.list, data.tracking_list, data.package_list, data.packages]
      .filter(Array.isArray)
      .forEach((list) => list.forEach(absorbPackage));
    absorbList(data.tracking_info || data.trackingInfo);
    absorbList(data.tracking_info_list || data.trackingInfoList);
    absorbList(data.tracking_list || data.trackingList);
    absorbList(data.logistics_status_list || data.logisticsStatusList);
  };

  absorbTrackingRoot(order?._du_tracking_history);
  absorbTrackingRoot(order?.logistics_tracking);
  absorbTrackingRoot(order?.logisticsTracking);

  const parts = duUnwrapOrderCard(order);
  absorbPackage(parts.packageCard);
  absorbPackage(parts.fulfilmentInfo);
  absorbPackage(parts.cardItem);

  absorbList(order?.tracking_info);
  absorbList(order?.trackingInfo);
  absorbList(order?.tracking_info_list);
  absorbList(order?.trackingInfoList);
  absorbList(order?.tracking_info?.tracking_list);
  absorbList(order?.tracking_info?.tracking_info_list);
  absorbList(order?.fulfillment_info?.tracking_info_list);
  absorbList(order?.fulfillment_info?.tracking_list);
  absorbList(order?.package_list?.[0]?.tracking_info_list);
  absorbList(order?.package_list?.[0]?.tracking_list);
  absorbList(order?.logistics_status_list);
  absorbList(order?.tracking_list);

  if (!entries.length) {
    const latest = duExtractLatestTracking(order);
    if (latest.text) push(latest.text, latest.time);
  }

  if (entries.length) {
    entries.sort((a, b) => {
      const ta = Number(a.ctime) || 0;
      const tb = Number(b.ctime) || 0;
      return tb - ta;
    });
    candidates.push(entries);
  }

  if (!candidates.length) return [];

  return candidates.reduce((best, current) => (current.length > best.length ? current : best));
}

/**
 * 基于完整物流轨迹判定派送阶段（遍历全部轨迹，不仅看最新一条）
 * @returns {'in_transit'|'first_delivering'|'abnormal_warning'}
 */
function duClassifyByTrackingHistory(trackingHistory) {
  const history = Array.isArray(trackingHistory) ? trackingHistory : [];
  if (!history.length) return "in_transit";

  // 任意轨迹含派送失败（如 Unable to Collect COD）→ 异常预警
  if (history.some((item) => duIsDeliveryFailureText(item?.description))) {
    return "abnormal_warning";
  }

  const deliveringIndices = [];
  history.forEach((item, index) => {
    if (duIsDeliveringText(item?.description)) deliveringIndices.push(index);
  });

  if (!deliveringIndices.length) return "in_transit";

  const latestIsDelivering = deliveringIndices.includes(0);
  const hasOlderDelivering = deliveringIndices.some((i) => i > 0);

  // ② 最新轨迹为派送中，且轨迹中首次出现 → 首次派送中
  if (latestIsDelivering && !hasOlderDelivering) {
    return "first_delivering";
  }

  // ① 轨迹中曾出现派送中，但不是「仅最新一条」→ 异常预警（含二次派送 / 可能失败）
  return "abnormal_warning";
}

/**
 * 无完整轨迹时，基于列表/卡片状态做轻量判定（用于加速扫描中的新单）
 * @returns {'delivered'|'in_transit'|'first_delivering'|'abnormal_warning'}
 */
function duClassifyOrderCategoryLite(order) {
  const outer = duGetOuterListStatus(order);
  if (outer === "delivered") return "delivered";

  const { texts, tracking } = duCollectStatusTexts(order);
  if (texts.some((t) => duIsDeliveryFailureText(t))) return "abnormal_warning";
  if (duIsDeliveringText(tracking.text)) return "first_delivering";
  if (texts.some((t) => duIsDeliveringText(t))) return "first_delivering";

  return "in_transit";
}

/**
 * 综合判定订单归属
 * @returns {'delivered'|'in_transit'|'first_delivering'|'abnormal_warning'}
 */
function duClassifyOrderCategory(order) {
  const outer = duGetOuterListStatus(order);
  if (outer === "delivered") return "delivered";

  const history = duExtractTrackingHistory(order);
  return duClassifyByTrackingHistory(history);
}

function duCollectStatusTexts(order) {
  const texts = [];
  const seen = new Set();
  const push = (value) => {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    texts.push(text);
  };

  const tracking = duExtractLatestTracking(order);
  if (tracking.text) push(tracking.text);

  duExtractTrackingHistory(order).forEach((item) => push(item.description));

  push(order?.status_text || order?.statusText);
  push(order?.order_status_text || order?.orderStatusText);
  push(order?.display_status || order?.displayStatus);
  push(order?.fulfillment_info?.status_text || order?.fulfillment_info?.statusText);
  push(order?.fulfillment_info?.display_status || order?.fulfillment_info?.displayStatus);
  push(order?.fulfillment_info?.logistics_status || order?.fulfillment_info?.logisticsStatus);
  push(order?.logistics_info?.latest_status || order?.logistics_info?.status);
  push(order?.package_list?.[0]?.logistics_status);
  push(order?.package_list?.[0]?.logistics_status_description);
  push(order?.remark || order?.status_remark);

  return { tracking, texts };
}

function duIsShippingPageUrl(url) {
  return !!duParseShippingPage(url);
}

function duDetectSiteFromUrl(url, shopIds) {
  const info = duParseShippingPage(url);
  if (!info) return "";

  if (info.host === "legacy") return info.siteCode || "";

  if (info.shopId) {
    const fromId = duSiteCodeFromShopId(info.shopId, shopIds);
    if (fromId) return fromId;
  }
  return "";
}

function duExtractOrderId(order) {
  const parts = duUnwrapOrderCard(order);
  const rawId =
    order?.order_id ??
    order?.orderId ??
    parts.orderExtInfo?.orderId ??
    parts.orderExtInfo?.order_id ??
    parts.orderCard?.order_id ??
    parts.orderCard?.orderId ??
    "";
  const id = String(rawId || "").trim();
  return id;
}

function duGetOrderDetailUrl(orderId, shopId) {
  const id = String(orderId || "").trim();
  if (!id) return DU_GENERIC_SHIPPING_URL;
  const shop = shopId || "";
  const base = `${DU_CNSC_ORDER_BASE}/${encodeURIComponent(id)}`;
  if (shop) {
    return `${base}?cnsc_shop_id=${encodeURIComponent(shop)}`;
  }
  return base;
}

const DU_LEGACY_DEFAULT_MESSAGES = [
  "亲亲 {name}，您的包裹已经由当地司机正在派送中啦，请这两天务必保持电话畅通哦，期待您早日收到宝贝！❤️",
  "Hi {name}, your package is out for delivery! Please keep your phone reachable in the next couple of days. We hope you receive it soon! ❤️",
];

function duIsBuiltinMessage(text) {
  const val = String(text || "").trim();
  if (!val) return true;
  if (val === DU_DEFAULT_MESSAGE.trim()) return true;
  return DU_LEGACY_DEFAULT_MESSAGES.some((item) => item.trim() === val);
}

const DU_CNSC_WEBCHAT_BASE = "https://seller.shopee.cn/webchat/conversations";

function duGetWebchatUrl(siteCode, username, shopId, buyerUserId) {
  const user = String(username || "").trim();
  const buyerId = String(buyerUserId || "").trim();
  const id = shopId || duLoadShopIds()[siteCode];
  const params = new URLSearchParams();
  if (id) params.set("cnsc_shop_id", String(id));
  if (user) params.set("du_buyer", user);
  if (buyerId) params.set("du_buyer_id", buyerId);
  params.set("du_ts", String(Date.now()));
  const query = params.toString();
  return query ? `${DU_CNSC_WEBCHAT_BASE}?${query}` : DU_CNSC_WEBCHAT_BASE;
}

function duFormatTrackingTime(ts) {
  if (ts == null || ts === "") return "—";
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return String(ts);
  const ms = n > 1e12 ? n : n * 1000;
  try {
    return new Date(ms).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(ts);
  }
}

function duExtractLatestTracking(order) {
  const candidates = [];

  const pushTrack = (text, time) => {
    if (!text) return;
    candidates.push({ text: String(text).trim(), time });
  };

  const lists = [
    order?.tracking_info_list,
    order?.trackingInfoList,
    order?.tracking_info?.tracking_list,
    order?.tracking_info?.tracking_info_list,
    order?.fulfillment_info?.tracking_info_list,
    order?.fulfillment_info?.tracking_list,
    order?.package_list?.[0]?.tracking_info_list,
    order?.package_list?.[0]?.tracking_list,
    order?.logistics_status_list,
    order?.tracking_list,
  ];

  lists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      pushTrack(
        item.description ||
          item.tracking_description ||
          item.logistics_status ||
          item.logistics_status_description ||
          item.status ||
          item.title,
        item.ctime || item.create_time || item.time || item.timestamp
      );
    });
  });

  if (order?.latest_tracking_description || order?.latestTrackingDescription || order?.tracking_description || order?.trackingDescription) {
    pushTrack(
      order.latest_tracking_description ||
        order.latestTrackingDescription ||
        order.tracking_description ||
        order.trackingDescription,
      order.latest_tracking_time || order.latestTrackingTime
    );
  }

  if (order?.fulfillment_info?.latest_tracking_description || order?.fulfillment_info?.tracking_description) {
    pushTrack(
      order.fulfillment_info.latest_tracking_description || order.fulfillment_info.tracking_description,
      order.fulfillment_info.latest_tracking_time
    );
  }

  if (order?.logistics_status || order?.logisticsStatus) {
    pushTrack(order.logistics_status || order.logisticsStatus, order.logistics_update_time || order.logisticsUpdateTime);
  }

  if (!candidates.length) {
    return { text: "", time: null };
  }

  candidates.sort((a, b) => {
    const ta = Number(a.time) || 0;
    const tb = Number(b.time) || 0;
    return tb - ta;
  });

  return candidates[0];
}

function duExtractUsername(order) {
  const parts = duUnwrapOrderCard(order);
  const buyerInfo = parts.cardHeader?.buyer_info || parts.cardHeader?.buyerInfo || {};
  return (
    order?.buyer_user?.username ||
    order?.buyer_user?.user_name ||
    order?.buyer_username ||
    buyerInfo?.username ||
    order?.buyer?.username ||
    order?.buyer_name ||
    order?.username ||
    ""
  );
}

function duExtractBuyerUserId(order) {
  const parts = duUnwrapOrderCard(order);
  const rawId =
    order?.buyer_user_id ??
    order?.buyerUserId ??
    parts.orderExtInfo?.buyer_user_id ??
    parts.orderExtInfo?.buyerUserId ??
    "";
  return String(rawId || "").trim();
}

function duNormalizeOrder(raw, siteCode, shopId) {
  const parts = duUnwrapOrderCard(raw);
  const orderSn =
    raw?.order_sn ||
    raw?.ordersn ||
    raw?.orderSn ||
    parts.cardHeader?.order_sn ||
    parts.cardHeader?.orderSn ||
    "";
  const history = duExtractTrackingHistory(raw);
  const latest = history[0] || duExtractLatestTracking(raw);
  const category =
    raw?._du_skip_reason === "delivered"
      ? "delivered"
      : raw?._du_tracking_skipped === "recent"
      ? duClassifyOrderCategoryLite(raw)
      : duClassifyOrderCategory(raw);
  const deliveringHits = history.filter((item) => duIsDeliveringText(item.description));
  const orderAgeDays = duGetOrderAgeDays(raw);

  const orderId = duExtractOrderId(raw);
  const buyerUserId = duExtractBuyerUserId(raw);

  return {
    orderSn,
    orderId,
    buyerUserId,
    orderSnLast4: orderSn ? orderSn.slice(-4) : "----",
    username: duExtractUsername(raw),
    trackingText: latest.description || latest.text || "",
    trackingTime: latest.ctime ?? latest.time ?? null,
    trackingTimeLabel: duFormatTrackingTime(latest.ctime ?? latest.time),
    trackingHistory: history,
    category,
    status: category,
    outerStatus: duGetOuterListStatus(raw),
    deliveringCount: deliveringHits.length,
    trackingEntryCount: history.length,
    isSecondDelivering: category === "abnormal_warning" && duIsDeliveringText(latest.description || latest.text),
    isDeliveryFailure: duIsDeliveryFailureText(latest.description || latest.text),
    orderAgeDays,
    trackingSkipped: raw?._du_tracking_skipped || null,
    siteCode: siteCode || "",
    shopId: shopId || "",
    raw,
  };
}

function duGroupOrders(orders) {
  const groups = {
    in_transit: [],
    delivered: [],
    first_delivering: [],
    abnormal_warning: [],
  };
  orders.forEach((o) => {
    const key = o.category in groups ? o.category : "in_transit";
    groups[key].push(o);
  });
  return groups;
}

function duApplyMessageTemplate(template, username) {
  return String(template || DU_DEFAULT_MESSAGE).replace(/\{name\}/g, String(username || "").trim());
}

function duDetectRegionFromText(text) {
  const sample = String(text || "").slice(0, 4000);
  for (const { code, patterns } of DU_REGION_DETECT) {
    if (patterns.some((p) => p.test(sample))) return code;
  }
  return "";
}

}
