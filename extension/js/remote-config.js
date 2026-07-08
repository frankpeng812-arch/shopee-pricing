/**
 * 远程统一配置 — 开发者推送 GitHub，所有用户插件自动拉取（用户无需配置）
 *
 * 发布前请将 REMOTE_CONFIG_URL 改为你仓库的 remote-config.json Raw 地址（仅改一次）。
 */
(function (global) {
  "use strict";

  /** 开发者维护：push 到 GitHub 后所有插件从此地址自动更新 */
  const REMOTE_CONFIG_URL =
    "https://raw.githubusercontent.com/REPLACE_GITHUB_USER/shopee-pricing/main/server/data/remote-config.json";

  const CACHE_KEY = "shopee_remote_config_v1";
  const DEFAULTS_KEY = "shopee_remote_defaults_v1";

  let remoteMeta = null;

  function cachePayload(payload) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [CACHE_KEY]: payload });
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (_e) { /* ignore */ }
  }

  function readCache(cb) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([CACHE_KEY], function (result) {
        cb(result[CACHE_KEY] || null);
      });
      return;
    }
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      cb(raw ? JSON.parse(raw) : null);
    } catch (_e) {
      cb(null);
    }
  }

  function applyShipping(sites, meta) {
    if (!sites || typeof sites !== "object") return;
    global.COST_PRICING_SITE_DATA = sites;
    if (typeof global.rebuildAdvancedSiteConfigs === "function") {
      global.rebuildAdvancedSiteConfigs(sites);
    }
    if (meta) {
      remoteMeta = Object.assign({}, remoteMeta, {
        shippingVersion: meta.version,
        shippingSource: meta.sourceFile,
        channelCount: meta.channelCount,
        shippingUpdatedAt: meta.updatedAt,
      });
    }
  }

  function applySiteFees(siteFees) {
    if (!siteFees || typeof siteFees !== "object") return;
    if (typeof global.setRemoteDefaultSites === "function") {
      global.setRemoteDefaultSites(siteFees);
    }
    try {
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify(siteFees));
    } catch (_e) { /* ignore */ }
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [DEFAULTS_KEY]: siteFees });
    }
  }

  function applyRemoteConfig(payload, source) {
    if (!payload) return null;

    const shipping = payload.shipping || {};
    if (shipping.sites) {
      applyShipping(shipping.sites, {
        version: payload.version,
        sourceFile: shipping.sourceFile,
        channelCount: shipping.channelCount,
        updatedAt: payload.updatedAt,
      });
    }
    if (payload.siteFees) {
      applySiteFees(payload.siteFees);
    }

    remoteMeta = {
      version: payload.version,
      updatedAt: payload.updatedAt,
      source: source,
      channelCount: shipping.channelCount,
      shippingSource: shipping.sourceFile,
    };

    cachePayload(payload);
    global.dispatchEvent(new CustomEvent("shopee-remote-config-updated", { detail: remoteMeta }));
    global.dispatchEvent(new CustomEvent("shopee-shipping-data-updated", { detail: remoteMeta }));
    return payload;
  }

  function shippingSitesHaveBuyerFields(sites) {
    if (!sites || typeof sites !== "object") return false;
    var siteId, cargoTypes, cargo, channels, ch;
    for (siteId in sites) {
      if (!Object.prototype.hasOwnProperty.call(sites, siteId)) continue;
      cargoTypes = sites[siteId].cargoTypes || {};
      for (cargo in cargoTypes) {
        if (!Object.prototype.hasOwnProperty.call(cargoTypes, cargo)) continue;
        channels = cargoTypes[cargo] || {};
        for (ch in channels) {
          if (!Object.prototype.hasOwnProperty.call(channels, ch)) continue;
          if (!("buyerBasePrice" in channels[ch])) return false;
        }
      }
    }
    return true;
  }

  function applyFromCache(cached) {
    if (!cached) return null;
    var sites = cached.shipping && cached.shipping.sites;
    if (sites && !shippingSitesHaveBuyerFields(sites)) {
      console.warn("[remote-config] 缓存缺少买家运费字段，已忽略旧缓存");
      return null;
    }
    return applyRemoteConfig(cached, "cache");
  }

  /** 无缓存 / 离线时使用 bundled fallback（cost-pricing-data.js + bundled-site-fees.js） */
  function applyBundledFallback() {
    var sites =
      typeof global.COST_PRICING_SITE_DATA !== "undefined"
        ? global.COST_PRICING_SITE_DATA
        : null;
    var fees =
      typeof global.BUNDLED_SITE_FEES !== "undefined" ? global.BUNDLED_SITE_FEES : null;
    if (!sites && !fees) return null;

    if (sites) {
      applyShipping(sites, {
        version: "bundled",
        sourceFile: "bundled",
        channelCount: null,
        updatedAt: null,
      });
    }
    if (fees) {
      applySiteFees(fees);
    }

    remoteMeta = {
      version: "bundled",
      source: "bundled",
      shippingSource: "bundled",
    };
    global.dispatchEvent(
      new CustomEvent("shopee-remote-config-updated", { detail: remoteMeta })
    );
    global.dispatchEvent(
      new CustomEvent("shopee-shipping-data-updated", { detail: remoteMeta })
    );
    return remoteMeta;
  }

  function isRemoteUrlConfigured() {
    return (
      REMOTE_CONFIG_URL &&
      REMOTE_CONFIG_URL.indexOf("REPLACE_GITHUB_USER") === -1
    );
  }

  function fetchRemoteConfig() {
    if (!isRemoteUrlConfigured()) {
      return Promise.resolve(null);
    }
    return fetch(REMOTE_CONFIG_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.version) throw new Error("无效配置");
        return applyRemoteConfig(payload, "remote");
      });
  }

  function refreshRemoteConfig(force) {
    return new Promise(function (resolve) {
      readCache(function (cached) {
        var appliedFromCache = applyFromCache(cached);

        if (!isRemoteUrlConfigured()) {
          if (!appliedFromCache && !remoteMeta) applyBundledFallback();
          resolve(remoteMeta);
          return;
        }

        if (!force && cached && cached.version && appliedFromCache) {
          fetch(REMOTE_CONFIG_URL, { cache: "no-store" })
            .then(function (res) {
              if (!res.ok) throw new Error("HTTP " + res.status);
              return res.json();
            })
            .then(function (payload) {
              if (payload && payload.version === cached.version) {
                resolve(cached);
                return;
              }
              resolve(applyRemoteConfig(payload, "remote"));
            })
            .catch(function (err) {
              console.warn("[remote-config] fetch failed:", err.message);
              resolve(remoteMeta);
            });
          return;
        }

        fetchRemoteConfig()
          .then(function (result) {
            if (!result && !appliedFromCache && !remoteMeta) applyBundledFallback();
            resolve(result || remoteMeta);
          })
          .catch(function (err) {
            console.warn("[remote-config] fetch failed:", err.message);
            if (!appliedFromCache && !remoteMeta) applyBundledFallback();
            resolve(remoteMeta);
          });
      });
    });
  }

  function getRemoteConfigMeta() {
    return remoteMeta;
  }

  global.__remoteConfigReady = new Promise(function (resolve) {
    readCache(function (cached) {
      var applied = cached ? applyFromCache(cached) : null;
      if (!applied) applyBundledFallback();
      refreshRemoteConfig(false).then(function () {
        if (!remoteMeta) applyBundledFallback();
        resolve(remoteMeta);
      });
    });
  });

  // 兼容旧引用
  global.__shippingDataReady = global.__remoteConfigReady;
  global.refreshRemoteConfig = refreshRemoteConfig;
  global.refreshShippingData = refreshRemoteConfig;
  global.getRemoteConfigMeta = getRemoteConfigMeta;
  global.getShippingDataMeta = getRemoteConfigMeta;
})(typeof window !== "undefined" ? window : globalThis);
