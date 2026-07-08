/**
 * 成本定价 — 独立计算引擎（与 pricing-core.js 完全隔离）
 */
(function (global) {
  "use strict";

  const FX_STORAGE_KEY = "shopee_fx_rates_v4";

  const DEFAULT_FX = {
    SGD: 0.19, MYR: 0.64, THB: 5.0, PHP: 8.0,
    VND: 3500, TWD: 4.5, BRL: 0.78, MXN: 2.5, ARS: 200, CLP: 130, COP: 580,
  };

  function buildSiteConfigs(fromData) {
    const configs = {};
    const source = fromData || (typeof COST_PRICING_SITE_DATA !== "undefined" ? COST_PRICING_SITE_DATA : {});
    if (!source || typeof source !== "object") return configs;

    Object.entries(source).forEach(function ([siteId, site]) {
      configs[siteId] = {
        name: site.name,
        currency: site.currency,
        currencyCode: site.currencyCode,
        css: site.css,
        exchangeRate: site.exchangeRate,
        commission: site.commission,
        transaction: site.transaction,
        fssRate: site.fssRate || 0.04,
        ccbRate: site.ccbRate || 0.03,
        cargoTypes: site.cargoTypes,
      };
    });
    return configs;
  }

  let advancedSiteConfigs = buildSiteConfigs();

  function rebuildAdvancedSiteConfigs(sitesData) {
    advancedSiteConfigs = buildSiteConfigs(sitesData);
  }

  function advRound2(n) {
    return Math.round(n * 100) / 100;
  }

  function advFmtMoney(n) {
    return advRound2(n).toFixed(2);
  }

  function advWeightForShipping(weightG) {
    if (weightG === "" || weightG == null || isNaN(weightG) || weightG <= 0) return 1;
    return weightG;
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  /** 获取站点汇率（来自站点配置页的实时汇率） */
  function getSiteExchangeRate(siteId) {
    const site = advancedSiteConfigs[siteId];
    if (!site) return 1;
    const fx = typeof getFxRates === "function"
      ? getFxRates()
      : loadJSON(FX_STORAGE_KEY, DEFAULT_FX);
    if (fx[site.currencyCode] > 0) return fx[site.currencyCode];
    return site.exchangeRate || DEFAULT_FX[site.currencyCode] || 1;
  }

  /** 解析渠道 key → 分区 / 英文名 / 中文名 / 分组 id */
  function parseChannelKey(fullKey) {
    const zoneMatch = fullKey.match(/\[(.+?)\]\s*$/);
    const zone = zoneMatch ? zoneMatch[1].trim() : null;
    const base = zone ? fullKey.replace(/\s*\[.+?\]\s*$/, "") : fullKey;
    const parts = base.split("\n");
    const en = (parts[0] || "").trim();
    const cnRaw = (parts[1] || "").trim();
    const cnMatch = cnRaw.match(/[（(]([^)）]+)[)）]/);
    const cn = cnMatch ? cnMatch[1].trim() : cnRaw.replace(/[()（）]/g, "").trim();
    const channelId = en + "::" + cn;
    return { fullKey, zone, en, cn, channelId };
  }

  /** 渠道展示用：英文主标题 + 中文副标题（台湾等纯中文渠道仅一行） */
  function formatChannelDisplay(ch) {
    if (!ch) return { primary: "", secondary: "" };
    if (ch.en && ch.cn) return { primary: ch.en, secondary: ch.cn };
    return { primary: ch.en || ch.cn || "", secondary: ch.cn && ch.en ? ch.cn : "" };
  }

  const CARGO_TYPE_ORDER = ["普货", "重货", "大件", "特货"];

  /** 构建站点四级树：货品类型 → 渠道 → 分区 */
  function buildSiteChannelTree(siteId) {
    const tree = {};
    getAdvancedCargoTypes(siteId).forEach(function (cargoType) {
      const groups = {};
      getAdvancedChannels(siteId, cargoType).forEach(function (fullKey) {
        const p = parseChannelKey(fullKey);
        if (!groups[p.channelId]) {
          groups[p.channelId] = {
            channelId: p.channelId,
            en: p.en,
            cn: p.cn,
            zones: [],
          };
        }
        groups[p.channelId].zones.push({ zone: p.zone, channelName: fullKey });
      });
      tree[cargoType] = Object.values(groups).map(function (g) {
        return {
          channelId: g.channelId,
          en: g.en,
          cn: g.cn,
          hasZones: false,
          zones: g.zones,
        };
      });
    });
    return tree;
  }

  function getOrderedCargoTypes(siteId) {
    const tree = buildSiteChannelTree(siteId);
    return CARGO_TYPE_ORDER.filter(function (t) { return tree[t] && tree[t].length; })
      .concat(Object.keys(tree).filter(function (t) { return CARGO_TYPE_ORDER.indexOf(t) === -1; }));
  }

  function resolveChannelName(siteId, cargoType, channelId, zone) {
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) return null;
    if (zone) {
      const z = ch.zones.find(function (z) { return z.zone === zone; });
      if (z) return z.channelName;
    }
    const preferred = ch.zones.find(function (z) {
      return z.zone && /^Zone A/i.test(z.zone);
    });
    if (preferred) return preferred.channelName;
    const noZone = ch.zones.find(function (z) { return !z.zone; });
    return noZone ? noZone.channelName : (ch.zones[0] && ch.zones[0].channelName);
  }

  function formatOfficialPath(cargoType, channelId, zone, siteId) {
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) return cargoType;
    const display = formatChannelDisplay(ch);
    const parts = [cargoType];
    if (display.primary) parts.push(display.primary);
    if (display.secondary) parts.push(display.secondary);
    return parts.join(" / ");
  }

  /** 读取站点费率 — 与批量定价相同，统一来自站点配置页（getSitesConfig） */
  function getAdvancedSiteFees(siteId) {
    const site = advancedSiteConfigs[siteId];
    if (!site || typeof getSitesConfig !== "function") return null;

    const sitesData = getSitesConfig();
    const siteFees = sitesData[siteId];
    if (!siteFees) return null;

    function pct(val) {
      const n = Number(val);
      return isNaN(n) ? 0 : n / 100;
    }

    return {
      commission: pct(siteFees.commission),
      transaction: pct(siteFees.transaction),
      activity: pct(siteFees.activity),
      withdrawal: pct(siteFees.withdrawal),
      techSupport: pct(siteFees.techSupport ?? 0),
      domesticShipping: Number(sitesData.domesticShipping),
    };
  }

  /** 买家支付运费（当地货币），读渠道配置 buyer* 字段 */
  function getBuyerShippingLocal(siteId, weightG, channelConfig) {
    if (channelConfig) return calculateBuyerFreight(weightG, channelConfig);
    if (typeof calculateBuyerShipping === "function") {
      return calculateBuyerShipping(weightG, siteId);
    }
    return 0;
  }

  /**
   * 正向售价方程 — 与 pricing-core.js calculateRow 一致
   * 售价 = [基础成本 + 买家运费×交易费率] ÷ [1−(交易+佣金+活动+提现+技术支持)费率]
   */
  function computeForwardPriceLocal(params) {
    const {
      cost, profit, domesticShipping, rate,
      shippingSeller, shippingBuyer,
      commission, transaction, activity, withdrawal, techSupport,
    } = params;

    const otherRate = commission + activity + withdrawal + (techSupport || 0);
    const denominatorRate = transaction + otherRate;
    if (denominatorRate >= 1) return { error: "费率过高" };

    const baseCost = advRound2(
      (cost + profit + domesticShipping) * rate + shippingSeller
    );
    const numerator = advRound2(baseCost + shippingBuyer * transaction);
    const priceLocal = advRound2(numerator / (1 - denominatorRate));

    return { priceLocal, baseCost, numerator, denominatorRate, otherRate, transactionRate: transaction };
  }

  /** 由折后售价计算费用明细与净利润 */
  function computePriceBreakdown(priceLocal, params) {
    const {
      cost, domesticShipping, rate, shippingSeller, shippingBuyer,
      commission, transaction, activity, withdrawal, techSupport,
    } = params;

    const techSupportRate = techSupport || 0;
    const commissionFee = advRound2(priceLocal * commission);
    const transactionFee = advRound2((priceLocal + shippingBuyer) * transaction);
    const activityFee = advRound2(priceLocal * activity);
    const techSupportFee = advRound2(priceLocal * techSupportRate);
    const withdrawalFee = advRound2(priceLocal * withdrawal);
    const platformFee = advRound2(commissionFee + transactionFee + activityFee + techSupportFee);
    const otherFee = withdrawalFee;
    const totalFee = advRound2(platformFee + otherFee);
    const orderIncome = advRound2(priceLocal - totalFee - shippingSeller);
    const sellerPaidShipping = advRound2(shippingSeller + shippingBuyer);

    const priceCNY = advRound2(priceLocal / rate);
    const orderIncomeCNY = advRound2(orderIncome / rate);
    const platformFeeCNY = advRound2(platformFee / rate);
    const otherFeeCNY = advRound2(otherFee / rate);
    const sellerPaidShippingCNY = advRound2(sellerPaidShipping / rate);
    const shippingSellerCNY = advRound2(shippingSeller / rate);
    const shippingBuyerCNY = advRound2(shippingBuyer / rate);
    const netProfitCNY = advRound2(orderIncomeCNY - cost - domesticShipping);
    const netProfitLocal = advRound2(netProfitCNY * rate);
    const profitRate = priceCNY > 0 ? advRound2((netProfitCNY / priceCNY) * 100) : 0;
    const costBaseCNY = cost + domesticShipping + shippingSellerCNY;
    const priceAdjustRatio = costBaseCNY > 0
      ? advRound2((priceCNY / costBaseCNY) * 100)
      : 0;

    return {
      commissionFee,
      transactionFee,
      activityFee,
      techSupportFee,
      withdrawalFee,
      platformFee,
      otherFee,
      totalFee,
      orderIncome,
      orderIncomeCNY,
      sellerPaidShipping,
      sellerPaidShippingCNY,
      shippingSellerCNY,
      shippingBuyerCNY,
      platformFeeCNY,
      otherFeeCNY,
      priceCNY,
      netProfitCNY,
      netProfitLocal,
      profitRate,
      priceAdjustRatio,
    };
  }

  /** 由折后售价反推净利润（CNY） */
  function computeNetProfitCNY(priceLocal, params) {
    return computePriceBreakdown(priceLocal, params).netProfitCNY;
  }

  /** 默认选中标准渠道 */
  function getDefaultChannelForSite(siteId) {
    const cargoTypes = getOrderedCargoTypes(siteId);
    if (!cargoTypes.length) return null;
    const tree = buildSiteChannelTree(siteId);
    for (let i = 0; i < cargoTypes.length; i++) {
      const cargoType = cargoTypes[i];
      const channels = tree[cargoType] || [];
      const standard = channels.find(function (c) {
        return /标准|standard/i.test(c.cn) || /standard/i.test(c.en);
      });
      const pick = standard || channels[0];
      if (!pick) continue;
      const zoneEntry = pick.zones.find(function (z) {
        return z.zone && /^Zone A/i.test(z.zone);
      }) || pick.zones.find(function (z) { return !z.zone; }) || pick.zones[0];
      if (!zoneEntry) continue;
      return {
        cargoType,
        channelId: pick.channelId,
        zone: zoneEntry.zone,
        channelName: zoneEntry.channelName,
      };
    }
    return null;
  }

  /** @deprecated 扁平列表，供兼容 */
  function getAllChannelOptions(siteId) {
    const options = [];
    getOrderedCargoTypes(siteId).forEach(function (cargoType) {
      getAdvancedChannels(siteId, cargoType).forEach(function (channelName) {
        const p = parseChannelKey(channelName);
        options.push({
          cargoType,
          channelName,
          channelId: p.channelId,
          zone: p.zone,
          label: formatOfficialPath(cargoType, p.channelId, p.zone, siteId),
        });
      });
    });
    return options;
  }

  /** 根据渠道配置计算藏价（当地货币） */
  function calculateHiddenFreight(weightG, channelConfig) {
    if (typeof calculateTieredFreight === "function") {
      return calculateTieredFreight(weightG, channelConfig);
    }
    const w = advWeightForShipping(weightG);
    const { baseWeight, basePrice, stepWeight, stepPrice } = channelConfig;
    if (!stepWeight || !stepPrice) return advRound2(basePrice);
    if (w <= baseWeight) return advRound2(basePrice);
    return advRound2(basePrice + Math.ceil((w - baseWeight) / stepWeight) * stepPrice);
  }

  /** 根据渠道配置计算买家支付运费（当地货币） */
  function calculateBuyerFreight(weightG, channelConfig) {
    if (!channelConfig) return 0;
    const tiers = {
      baseWeight: channelConfig.buyerBaseWeight,
      basePrice: channelConfig.buyerBasePrice,
      stepWeight: channelConfig.buyerStepWeight,
      stepPrice: channelConfig.buyerStepPrice,
    };
    if (typeof calculateTieredFreight === "function") {
      return calculateTieredFreight(weightG, tiers);
    }
    const w = advWeightForShipping(weightG);
    const baseWeight = Number(tiers.baseWeight) || 0;
    const basePrice = Number(tiers.basePrice) || 0;
    const stepWeight = Number(tiers.stepWeight) || 0;
    const stepPrice = Number(tiers.stepPrice) || 0;
    if (!stepWeight || !stepPrice) return advRound2(basePrice);
    if (w <= baseWeight) return advRound2(basePrice);
    return advRound2(basePrice + Math.ceil((w - baseWeight) / stepWeight) * stepPrice);
  }

  /**
   * 成本定价计算
   * @param {Object} params
   * @param {string} params.siteId
   * @param {string} params.cargoType
   * @param {string} params.channelName
   * @param {number} params.weight
   * @param {number} params.cost
   * @param {'profit'|'profitRate'|'sellingPrice'} params.mode
   * @param {number} params.modeValue
   * @param {number} params.discount - %OFF
   * @param {number} [params.exchangeRate] - 可选覆盖汇率
   * @param {number} [params.domesticShipping] - 境内段运费 CNY
   */
  function calculateAdvancedScene(params) {
    const {
      siteId, cargoType, channelName, weight, cost,
      mode, modeValue, discount, exchangeRate: rateOverride,
      domesticShipping: domesticOverride,
    } = params;

    const site = advancedSiteConfigs[siteId];
    if (!site) return { error: "未知站点" };

    const fees = getAdvancedSiteFees(siteId);
    if (!fees) return { error: "未知站点" };

    const cargoMap = site.cargoTypes[cargoType];
    if (!cargoMap || Object.keys(cargoMap).length === 0) {
      return { error: "该货品类型暂无可用渠道" };
    }

    const channelKeys = Object.keys(cargoMap);
    const resolvedChannel = channelName && cargoMap[channelName] ? channelName : channelKeys[0];
    const channel = cargoMap[resolvedChannel];
    if (!channel) return { error: "未知物流渠道" };

    const rate = rateOverride > 0 ? rateOverride : getSiteExchangeRate(siteId);
    if (!rate || rate <= 0) return { error: "汇率无效" };

    const hiddenFreightLocal = calculateHiddenFreight(weight, channel);
    const hiddenFreightCNY = advRound2(hiddenFreightLocal / rate);
    const shippingBuyer = calculateBuyerFreight(weight, channel);

    const domesticShipping = domesticOverride != null && !isNaN(domesticOverride)
      ? domesticOverride
      : fees.domesticShipping;

    const { commission, transaction, activity, withdrawal, techSupport } = fees;
    const totalFeeRate = commission + transaction + activity + withdrawal + techSupport;
    if (totalFeeRate >= 1) return { error: "费率合计异常" };

    const discountDec = Math.max(0, Math.min(99, discount || 0)) / 100;
    const discountFactor = 1 - discountDec;
    if (discountFactor <= 0) return { error: "折扣无效" };

    const priceParams = {
      cost,
      domesticShipping,
      rate,
      shippingSeller: hiddenFreightLocal,
      shippingBuyer,
      commission,
      transaction,
      activity,
      withdrawal,
      techSupport,
    };

    let targetPrice;
    let originalPrice;
    let profit;
    let profitRate;

    switch (mode) {
      case "profit": {
        const forward = computeForwardPriceLocal({ ...priceParams, profit: modeValue });
        if (forward.error) return { error: forward.error };
        targetPrice = forward.priceLocal;
        originalPrice = advRound2(targetPrice / discountFactor);
        break;
      }
      case "profitRate": {
        const inputRate = modeValue / 100;
        if (totalFeeRate + inputRate >= 1) return { error: "利润率过高，请降低预期" };
        const numerator = advRound2(
          (cost + domesticShipping) * rate + hiddenFreightLocal + shippingBuyer * transaction
        );
        targetPrice = advRound2(numerator / (1 - totalFeeRate - inputRate));
        originalPrice = advRound2(targetPrice / discountFactor);
        break;
      }
      case "sellingPrice": {
        targetPrice = advRound2(modeValue);
        originalPrice = discountDec > 0
          ? advRound2(targetPrice / discountFactor) : targetPrice;
        break;
      }
      default:
        return { error: "未知计算模式" };
    }

    const breakdown = computePriceBreakdown(targetPrice, priceParams);
    profit = breakdown.netProfitCNY;
    profitRate = breakdown.profitRate;
    const originalPriceCNY = advRound2(originalPrice / rate);

    return {
      siteId,
      siteName: site.name,
      currency: site.currency,
      currencyCode: site.currencyCode,
      css: site.css,
      cargoType,
      channelName: resolvedChannel,
      channelLabel: channel.label || resolvedChannel,
      channelType: channel.type,
      targetPrice,
      originalPrice,
      originalPriceCNY,
      profit,
      profitRate,
      hiddenFreightLocal,
      hiddenFreightCNY: advRound2(hiddenFreightCNY),
      shippingBuyer,
      domesticShipping: advRound2(domesticShipping),
      cost: advRound2(cost),
      exchangeRate: rate,
      totalFeeRate,
      commissionPct: advRound2(commission * 100),
      transactionPct: advRound2(transaction * 100),
      activityPct: advRound2(activity * 100),
      withdrawalPct: advRound2(withdrawal * 100),
      techSupportPct: advRound2(techSupport * 100),
      breakdown,
    };
  }

  function getAdvancedSiteIds() {
    return Object.keys(advancedSiteConfigs);
  }

  function getAdvancedCargoTypes(siteId) {
    const site = advancedSiteConfigs[siteId];
    if (!site) return [];
    return Object.keys(site.cargoTypes).filter(
      (t) => Object.keys(site.cargoTypes[t] || {}).length > 0
    );
  }

  function getAdvancedChannels(siteId, cargoType) {
    const site = advancedSiteConfigs[siteId];
    if (!site || !site.cargoTypes[cargoType]) return [];
    return Object.keys(site.cargoTypes[cargoType]);
  }

  function getChannelSelectionKey(siteId, cargoType, channelName) {
    return siteId + "|" + cargoType + "|" + channelName;
  }

  function parseChannelSelectionKey(key) {
    const parts = key.split("|");
    return { siteId: parts[0], cargoType: parts[1], channelName: parts.slice(2).join("|") };
  }

  global.rebuildAdvancedSiteConfigs = function (sitesData) {
    rebuildAdvancedSiteConfigs(sitesData);
    global.advancedSiteConfigs = advancedSiteConfigs;
  };
  global.advancedSiteConfigs = advancedSiteConfigs;
  global.calculateAdvancedScene = calculateAdvancedScene;
  global.calculateHiddenFreight = calculateHiddenFreight;
  global.calculateBuyerFreight = calculateBuyerFreight;
  global.getAdvancedSiteIds = getAdvancedSiteIds;
  global.getAdvancedCargoTypes = getAdvancedCargoTypes;
  global.getAdvancedChannels = getAdvancedChannels;
  global.buildSiteChannelTree = buildSiteChannelTree;
  global.getOrderedCargoTypes = getOrderedCargoTypes;
  global.parseChannelKey = parseChannelKey;
  global.resolveChannelName = resolveChannelName;
  global.formatOfficialPath = formatOfficialPath;
  global.formatChannelDisplay = formatChannelDisplay;
  global.getAdvancedSiteFees = getAdvancedSiteFees;
  global.getAllChannelOptions = getAllChannelOptions;
  global.getDefaultChannelForSite = getDefaultChannelForSite;
  global.getSiteExchangeRate = getSiteExchangeRate;
  global.getChannelSelectionKey = getChannelSelectionKey;
  global.parseChannelSelectionKey = parseChannelSelectionKey;
  global.advFmtMoney = advFmtMoney;
})(typeof window !== "undefined" ? window : globalThis);
