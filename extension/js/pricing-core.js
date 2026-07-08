/* Shopee 定价核心逻辑 — 与 shopee-pricing.html 保持一致，请勿修改计算公式与默认值 */

if (globalThis.__SHOPEE_PRICING_CORE__ && typeof globalThis.STORAGE !== "undefined") {
  /* content script 重复注入时跳过，避免 const STORAGE 冲突 */
} else {
globalThis.__SHOPEE_PRICING_CORE__ = true;

var STORAGE = {
  sites: "shopee_sites_v4",
  rates: "shopee_fx_rates_v4",
  tab: "shopee_active_tab",
  moreSubpage: "shopee_more_subpage",
  remoteDefaults: "shopee_remote_defaults_v1",
  advancedScene: "shopee_advanced_scene_v1",
  multiSitePricing: "shopee_multi_site_pricing_v1",
  deliveryUrgeMessage: "shopee_delivery_urge_message_v1",
  deliveryUrgeShopIds: "shopee_delivery_urge_shop_ids_v1",
  deliveryUrgeScanResults: "shopee_delivery_urge_scan_results_v1",
  deliveryUrgeScanSession: "shopee_delivery_urge_scan_session_v1",
  deliveryUrgeSkipRecentDays: "shopee_delivery_urge_skip_recent_days_v1",
  deliveryUrgeLastAccessAt: "shopee_delivery_urge_last_access_at_v1",
  deliveryUrgeDeviceId: "shopee_delivery_urge_device_id_v1",
  deliveryUrgeUsage: "shopee_delivery_urge_usage_v1",
  deliveryUrgeActivation: "shopee_delivery_urge_activation_v1",
};

/** 远程推送的默认站点费率（由 remote-config.js 写入） */
let REMOTE_DEFAULT_SITES = null;

function setRemoteDefaultSites(siteFees) {
  if (!siteFees || typeof siteFees !== "object") return;
  REMOTE_DEFAULT_SITES = JSON.parse(JSON.stringify(siteFees));
  try {
    localStorage.setItem(STORAGE.remoteDefaults, JSON.stringify(REMOTE_DEFAULT_SITES));
  } catch (_e) { /* ignore */ }
}

function loadRemoteDefaultSites() {
  if (REMOTE_DEFAULT_SITES) return REMOTE_DEFAULT_SITES;
  try {
    const raw = localStorage.getItem(STORAGE.remoteDefaults);
    if (raw) {
      REMOTE_DEFAULT_SITES = JSON.parse(raw);
      return REMOTE_DEFAULT_SITES;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

function getBundledDefaultSites() {
  const remote = loadRemoteDefaultSites();
  if (remote) {
    const config = { domesticShipping: remote.domesticShipping ?? DEFAULT_SITES.domesticShipping };
    CONFIG_SITES.forEach((s) => {
      config[s.id] = { ...DEFAULT_SITE_FEES[s.id], ...(remote[s.id] || {}) };
    });
    return config;
  }
  return JSON.parse(JSON.stringify(DEFAULT_SITES));
}

const FX_API = "https://open.er-api.com/v6/latest/CNY";

const SITES = [
  { id: "MY", name: "马来西亚", css: "my", currency: "MYR", symbol: "RM", rateKey: "MYR" },
  { id: "TH", name: "泰国", css: "th", currency: "THB", symbol: "฿", rateKey: "THB" },
  { id: "PH", name: "菲律宾", css: "ph", currency: "PHP", symbol: "₱", rateKey: "PHP" },
  { id: "SG", name: "新加坡", css: "sg", currency: "SGD", symbol: "S$", rateKey: "SGD" },
];

/** 站点配置页 — 全部支持的站点（分组展示） */
var CONFIG_SITES = [
  { id: "SG", name: "新加坡", css: "sg", currency: "SGD", symbol: "S$", rateKey: "SGD", region: "sea" },
  { id: "MY", name: "马来西亚", css: "my", currency: "MYR", symbol: "RM", rateKey: "MYR", region: "sea" },
  { id: "TH", name: "泰国", css: "th", currency: "THB", symbol: "฿", rateKey: "THB", region: "sea" },
  { id: "PH", name: "菲律宾", css: "ph", currency: "PHP", symbol: "₱", rateKey: "PHP", region: "sea" },
  { id: "VN", name: "越南", css: "vn", currency: "VND", symbol: "₫", rateKey: "VND", region: "sea" },
  { id: "TW", name: "台湾", css: "tw", currency: "TWD", symbol: "NT$", rateKey: "TWD", region: "sea" },
  { id: "BR", name: "巴西", css: "br", currency: "BRL", symbol: "R$", rateKey: "BRL", region: "latam" },
  { id: "MX", name: "墨西哥", css: "mx", currency: "MXN", symbol: "MX$", rateKey: "MXN", region: "latam" },
  { id: "AR", name: "阿根廷", css: "ar", currency: "ARS", symbol: "AR$", rateKey: "ARS", region: "latam" },
];

var CONFIG_REGIONS = [
  { id: "sea", label: "东南亚与台湾", sites: ["SG", "MY", "TH", "PH", "VN", "TW"] },
  { id: "latam", label: "拉美与其它", sites: ["BR", "MX", "AR"] },
];

const DEFAULT_SITE_FEES = {
  PH: { commission: 12, transaction: 2.24, activity: 9, withdrawal: 1, techSupport: 0 },
  MY: { commission: 18.36, transaction: 3.78, activity: 5, withdrawal: 1, techSupport: 6 },
  TH: { commission: 22.47, transaction: 3.21, activity: 7, withdrawal: 0, techSupport: 6 },
  SG: { commission: 16, transaction: 3, activity: 5, withdrawal: 1, techSupport: 5 },
  VN: { commission: 12, transaction: 3, activity: 4, withdrawal: 1, techSupport: 6 },
  TW: { commission: 12, transaction: 3, activity: 4, withdrawal: 1, techSupport: 0 },
  BR: { commission: 14, transaction: 3, activity: 4, withdrawal: 1, techSupport: 0 },
  MX: { commission: 12, transaction: 3, activity: 4, withdrawal: 1, techSupport: 0 },
  AR: { commission: 12, transaction: 3, activity: 4, withdrawal: 1, techSupport: 0 },
};

const DEFAULT_SITES = {
  domesticShipping: 1.2,
  ...DEFAULT_SITE_FEES,
};

const DEFAULT_FX = {
  PHP: 8.0, MYR: 0.65, THB: 5.0, SGD: 0.19,
  VND: 3500, TWD: 4.5, BRL: 0.78, MXN: 2.5, ARS: 200,
  updatedAt: null, fromApi: false,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (_e) { /* ignore */ }
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [key]: data });
  }
}

function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_e) { /* ignore */ }
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [key]: value });
  }
}

function loadPersistedState(key, cb) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([key], function (result) {
      cb(result[key] != null ? result[key] : loadJSON(key, null));
    });
    return;
  }
  cb(loadJSON(key, null));
}

function preloadChromeStorage(cb) {
  const keys = Object.values(STORAGE);
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    cb();
    return;
  }
  chrome.storage.local.get(keys, function (result) {
    keys.forEach(function (key) {
      const val = result[key];
      if (val == null || localStorage.getItem(key) != null) return;
      if (typeof val === "object") saveJSON(key, val);
      else savePref(key, val);
    });
    cb();
  });
}

/** 金额保留两位小数 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

function fmtMoney(n) {
  return round2(n).toFixed(2);
}

/** 运费计费重量：空或0按1g */
function weightForShipping(weightG) {
  if (weightG === "" || weightG == null || isNaN(weightG) || weightG <= 0) return 1;
  return weightG;
}

/** 按首重/续重阶梯计算运费（当地货币）；无续重时为固定费用 */
function calculateTieredFreight(weightG, tiers) {
  if (!tiers || tiers.basePrice == null || isNaN(tiers.basePrice)) return 0;
  const w = weightForShipping(weightG);
  const baseWeight = Number(tiers.baseWeight) || 0;
  const basePrice = Number(tiers.basePrice) || 0;
  const stepWeight = Number(tiers.stepWeight) || 0;
  const stepPrice = Number(tiers.stepPrice) || 0;
  if (!stepWeight || !stepPrice) return round2(basePrice);
  if (w <= baseWeight) return round2(basePrice);
  return round2(basePrice + Math.ceil((w - baseWeight) / stepWeight) * stepPrice);
}

function resolveDefaultSiteChannel(siteId) {
  const data = typeof COST_PRICING_SITE_DATA !== "undefined" ? COST_PRICING_SITE_DATA : null;
  if (!data || !data[siteId]) return null;
  const cargoOrder = ["普货", "重货", "特货", "大件"];
  const cargoTypes = data[siteId].cargoTypes || {};
  for (let i = 0; i < cargoOrder.length; i++) {
    const channels = cargoTypes[cargoOrder[i]];
    if (!channels) continue;
    const keys = Object.keys(channels);
    if (!keys.length) continue;
    const standard = keys.find(function (k) { return /标准|standard/i.test(k); });
    return channels[standard || keys[0]];
  }
  return null;
}

/** 跨境物流成本（藏价，卖家支出，当地货币）— 批量定价默认渠道 */
function calculateSellerShipping(weightG, siteId) {
  const channel = resolveDefaultSiteChannel(siteId);
  if (channel) {
    return calculateTieredFreight(weightG, channel);
  }
  return 0;
}

/** 买家支付运费（当地货币）— 优先读渠道配置 buyer* 字段 */
function calculateBuyerShipping(weightG, siteId, channelConfig) {
  const channel = channelConfig || resolveDefaultSiteChannel(siteId);
  if (!channel) return 0;
  return calculateTieredFreight(weightG, {
    baseWeight: channel.buyerBaseWeight,
    basePrice: channel.buyerBasePrice,
    stepWeight: channel.buyerStepWeight,
    stepPrice: channel.buyerStepPrice,
  });
}

function getSitesConfig() {
  const bundled = getBundledDefaultSites();
  const saved = loadJSON(STORAGE.sites, null);
  if (!saved) return bundled;
  const config = {
    domesticShipping: saved.domesticShipping ?? bundled.domesticShipping,
  };
  CONFIG_SITES.forEach((s) => {
    config[s.id] = { ...bundled[s.id], ...saved[s.id] };
  });
  return config;
}

function getFxRates() {
  return { ...DEFAULT_FX, ...loadJSON(STORAGE.rates, DEFAULT_FX) };
}

function isSiteConfigured(site) {
  return ["commission", "transaction", "activity", "withdrawal", "techSupport"].every((f) => {
    const v = site[f];
    return v !== "" && v != null && !isNaN(Number(v)) && Number(v) >= 0;
  });
}

function buildSiteConfig(siteId, sitesData, fxRates) {
  const site = sitesData[siteId];
  return {
    site: siteId,
    commission: Number(site.commission),
    transactionFee: Number(site.transaction),
    activityFee: Number(site.activity),
    withdrawalFee: Number(site.withdrawal),
    techSupportFee: Number(site.techSupport ?? 0),
    domesticShipping: Number(sitesData.domesticShipping),
    exchangeRate: fxRates[SITES.find((s) => s.id === siteId).rateKey],
  };
}

function calculateRow(cost, weight, profit, siteMeta, siteConfig) {
  if (!isSiteConfigured({
    commission: siteConfig.commission,
    transaction: siteConfig.transactionFee,
    activity: siteConfig.activityFee,
    withdrawal: siteConfig.withdrawalFee,
    techSupport: siteConfig.techSupportFee,
  })) {
    return { error: "请先配置费率" };
  }

  const otherRate =
    siteConfig.commission + siteConfig.activityFee + siteConfig.withdrawalFee +
    siteConfig.techSupportFee;
  const transactionRate = siteConfig.transactionFee;
  const denominatorRate = transactionRate + otherRate;

  if (denominatorRate >= 100) {
    return { error: "费率过高" };
  }

  if (!siteConfig.exchangeRate || siteConfig.exchangeRate <= 0) {
    return { error: "汇率无效" };
  }

  const shippingSeller = calculateSellerShipping(weight, siteConfig.site);
  const shippingBuyer = calculateBuyerShipping(weight, siteConfig.site);
  const shippingSellerCNY = round2(shippingSeller / siteConfig.exchangeRate);
  const shippingBuyerCNY = round2(shippingBuyer / siteConfig.exchangeRate);

  const baseCost = round2(
    (cost + profit + siteConfig.domesticShipping) * siteConfig.exchangeRate +
      shippingSeller
  );

  const numerator = round2(baseCost + shippingBuyer * (transactionRate / 100));
  const denominator = 1 - denominatorRate / 100;
  const priceLocal = round2(numerator / denominator);

  const commissionFee = round2(priceLocal * (siteConfig.commission / 100));
  const transactionFeeAmount = round2(
    (priceLocal + shippingBuyer) * (transactionRate / 100)
  );
  const activityFeeAmount = round2(priceLocal * (siteConfig.activityFee / 100));
  const withdrawalFeeAmount = round2(priceLocal * (siteConfig.withdrawalFee / 100));
  const techSupportFeeAmount = round2(priceLocal * (siteConfig.techSupportFee / 100));
  const totalFee = round2(
    commissionFee + transactionFeeAmount + activityFeeAmount + withdrawalFeeAmount +
    techSupportFeeAmount
  );

  const verify = round2(
    baseCost +
      priceLocal * (otherRate / 100) +
      (priceLocal + shippingBuyer) * (transactionRate / 100)
  );

  const orderIncome = round2(priceLocal - totalFee - shippingSeller);
  const priceCNY = round2(priceLocal / siteConfig.exchangeRate);
  const netProfitCNY = round2(
    orderIncome / siteConfig.exchangeRate - cost - siteConfig.domesticShipping
  );

  const anomaly = Math.abs(verify - priceLocal) > 0.02;

  return {
    priceLocal,
    priceCNY,
    shippingSeller,
    shippingBuyer,
    shippingSellerCNY,
    shippingBuyerCNY,
    baseCost,
    numerator,
    denominator,
    commissionFee,
    transactionFeeAmount,
    activityFeeAmount,
    withdrawalFeeAmount,
    techSupportFeeAmount,
    totalFee,
    orderIncome,
    verify,
    netProfitCNY,
    otherRate,
    transactionRate,
    denominatorRate,
    anomaly,
    inputProfit: profit,
    cost,
    domesticShipping: siteConfig.domesticShipping,
    billingWeight: weightForShipping(weight),
    symbol: siteMeta.symbol,
    commissionPct: siteConfig.commission,
    transactionPct: transactionRate,
    activityPct: siteConfig.activityFee,
    withdrawalPct: siteConfig.withdrawalFee,
    techSupportPct: siteConfig.techSupportFee,
  };
}

/** 由已知站点售价反推预估利润（商品成本按 0，未含商品成本） */
function reverseCalculateProfit(priceLocal, weight, siteMeta, siteConfig) {
  if (!isSiteConfigured({
    commission: siteConfig.commission,
    transaction: siteConfig.transactionFee,
    activity: siteConfig.activityFee,
    withdrawal: siteConfig.withdrawalFee,
    techSupport: siteConfig.techSupportFee,
  })) {
    return { error: "请先配置费率" };
  }

  const otherRate =
    siteConfig.commission + siteConfig.activityFee + siteConfig.withdrawalFee +
    siteConfig.techSupportFee;
  const transactionRate = siteConfig.transactionFee;
  const denominatorRate = transactionRate + otherRate;

  if (denominatorRate >= 100) {
    return { error: "费率过高" };
  }

  if (!siteConfig.exchangeRate || siteConfig.exchangeRate <= 0) {
    return { error: "汇率无效" };
  }

  if (!priceLocal || priceLocal <= 0) {
    return { error: "售价无效" };
  }

  const shippingSeller = calculateSellerShipping(weight, siteConfig.site);
  const shippingBuyer = calculateBuyerShipping(weight, siteConfig.site);
  const shippingSellerCNY = round2(shippingSeller / siteConfig.exchangeRate);
  const shippingBuyerCNY = round2(shippingBuyer / siteConfig.exchangeRate);

  const baseCost = round2(
    priceLocal * (1 - denominatorRate / 100) -
      shippingBuyer * (transactionRate / 100)
  );

  const profit = round2(
    (baseCost - shippingSeller) / siteConfig.exchangeRate -
      siteConfig.domesticShipping
  );

  const verifyForward = calculateRow(0, weight, profit, siteMeta, siteConfig);
  const anomaly =
    !verifyForward.error &&
    Math.abs(verifyForward.priceLocal - priceLocal) > 0.02;

  return {
    profit,
    priceLocal,
    baseCost,
    shippingSeller,
    shippingBuyer,
    shippingSellerCNY,
    shippingBuyerCNY,
    domesticShipping: siteConfig.domesticShipping,
    billingWeight: weightForShipping(weight),
    otherRate,
    transactionRate,
    denominatorRate,
    verifyPrice: verifyForward.priceLocal,
    anomaly,
    symbol: siteMeta.symbol,
    commissionPct: siteConfig.commission,
    transactionPct: transactionRate,
    activityPct: siteConfig.activityFee,
    withdrawalPct: siteConfig.withdrawalFee,
    techSupportPct: siteConfig.techSupportFee,
  };
}

function buildReverseTooltip(r, siteMeta) {
  const sym = siteMeta.symbol;
  const lines = [
    `反推毛利: ¥${fmtMoney(r.profit)} (未含商品成本)`,
    `├─ ${siteMeta.name}售价: ${sym}${fmtMoney(r.priceLocal)}`,
    `├─ 境内段运费: ¥${fmtMoney(r.domesticShipping)}`,
    `├─ 跨境物流成本(藏价): ${sym}${fmtMoney(r.shippingSeller)} (¥${fmtMoney(r.shippingSellerCNY)})`,
    `├─ 买家支付运费: ${sym}${fmtMoney(r.shippingBuyer)} (¥${fmtMoney(r.shippingBuyerCNY)})`,
    `├─ 基础成本: ${sym}${fmtMoney(r.baseCost)}`,
    `├─ 反推: [${sym}${fmtMoney(r.priceLocal)}×${(100 - r.denominatorRate).toFixed(2)}% − ${sym}${fmtMoney(r.shippingBuyer)}×${r.transactionPct}%] ÷ 汇率 − 境内运费 = ¥${fmtMoney(r.profit)}`,
    `└─ 正向验证售价: ${sym}${fmtMoney(r.verifyPrice)}`,
  ];
  if (r.anomaly) lines.push("⚠ 反推异常：验证售价与输入偏差>0.02");
  return lines.join("\n");
}

function buildTooltip(r, siteMeta) {
  const sym = siteMeta.symbol;
  const lines = [
    `售价: ${sym}${fmtMoney(r.priceLocal)} (¥${fmtMoney(r.priceCNY)})`,
    `├─ 成本价: ¥${fmtMoney(r.cost)}`,
    `├─ 预估利润: ¥${fmtMoney(r.inputProfit)}`,
    `├─ 境内段运费: ¥${fmtMoney(r.domesticShipping)}`,
    `├─ 跨境物流成本(藏价): ${sym}${fmtMoney(r.shippingSeller)} (¥${fmtMoney(r.shippingSellerCNY)})`,
    `├─ 买家支付运费: ${sym}${fmtMoney(r.shippingBuyer)} (¥${fmtMoney(r.shippingBuyerCNY)})`,
    `├─ 基础成本: ${sym}${fmtMoney(r.baseCost)}`,
    `├─ 订单收入: ${sym}${fmtMoney(r.orderIncome)} (售价−平台费用−藏价)`,
    `├─ 解方程: (${sym}${fmtMoney(r.baseCost)} + ${sym}${fmtMoney(r.shippingBuyer)}×${r.transactionPct}%) ÷ ${(100 - r.denominatorRate).toFixed(2)}% = ${sym}${fmtMoney(r.priceLocal)}`,
    `├─ 平台费用: ${sym}${fmtMoney(r.totalFee)}`,
    `│   ├─ 佣金 (${r.commissionPct}%): ${sym}${fmtMoney(r.commissionFee)}`,
    `│   ├─ 交易手续费 (${r.transactionPct}%): ${sym}${fmtMoney(r.transactionFeeAmount)} (基于售价+买家运费)`,
    `│   ├─ 活动服务费 (${r.activityPct}%): ${sym}${fmtMoney(r.activityFeeAmount)}`,
    `│   ├─ 提现手续费 (${r.withdrawalPct}%): ${sym}${fmtMoney(r.withdrawalFeeAmount)}`,
    `│   └─ 技术支持 (${r.techSupportPct}%): ${sym}${fmtMoney(r.techSupportFeeAmount)}`,
    `├─ 验证(方程): ${sym}${fmtMoney(r.verify)}`,
    `└─ 净利润: ¥${fmtMoney(r.netProfitCNY)}`,
  ];
  if (r.anomaly) lines.push("⚠ 计算异常：验证值与售价偏差>0.02");
  return lines.join("\n");
}

async function fetchExchangeRates() {
  try {
    let data = null;

    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      data = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "FETCH_EXCHANGE_RATES" }, (response) => {
          if (chrome.runtime.lastError || !response?.ok || !response?.data) {
            resolve(null);
            return;
          }
          resolve(response.data);
        });
      });
    }

    if (!data) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(FX_API, { signal: controller.signal });
        if (!res.ok) throw new Error("HTTP " + res.status);
        data = await res.json();
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (data.result !== "success" || !data.rates) throw new Error("无效响应");

    const now = Date.now();
    const fx = {
      PHP: data.rates.PHP,
      MYR: data.rates.MYR,
      THB: data.rates.THB,
      SGD: data.rates.SGD,
      VND: data.rates.VND,
      TWD: data.rates.TWD,
      BRL: data.rates.BRL,
      MXN: data.rates.MXN,
      ARS: data.rates.ARS,
      fetchedAt: now,
      updatedAt: now,
      apiUpdatedAt: (data.time_last_update_unix || now / 1000) * 1000,
      fromApi: true,
    };
    saveJSON(STORAGE.rates, fx);
    return { fx, error: null };
  } catch {
    return { fx: getFxRates(), error: "获取失败，使用上次保存值" };
  }
}

globalThis.fetchExchangeRates = fetchExchangeRates;
globalThis.getFxRates = getFxRates;

}
