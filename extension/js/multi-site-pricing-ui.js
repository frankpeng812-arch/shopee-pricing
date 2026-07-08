/**
 * 多站点定价（反推毛利）— 独立 UI 模块
 * 基于 advanced-scene.js 计算引擎，UI 风格与模拟定价保持一致
 */
(function () {
  "use strict";

  const ICON_MORE =
    '<svg class="adv-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="12" y1="16" x2="12" y2="12"/>' +
    '<line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  const COPY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  const SITE_FLAGS = {
    SG: "🇸🇬", MY: "🇲🇾", TH: "🇹🇭", PH: "🇵🇭",
    VN: "🇻🇳", BR: "🇧🇷", MX: "🇲🇽", AR: "🇦🇷",
  };

  const SITE_LOCATION_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path d="M12 21s-8-4.5-8-11a8 8 0 1 1 16 0c0 6.5-8 11-8 11z"/>' +
    '<circle cx="12" cy="10" r="3"/></svg>';

  const REGIONS = [
    { id: "sea", label: "东南亚与台湾", sites: ["SG", "MY", "TH", "PH", "VN", "TW"] },
    { id: "latam", label: "拉美与其它", sites: ["BR", "MX", "AR"] },
  ];

  const DEFAULT_SOURCE_SITE = "PH";
  const DEFAULT_TARGET_SITES = ["MY", "TH", "SG"];

  /** @type {object|null} */
  let sourceSelection = null;

  /** @type {Array<object>} */
  const targetSelections = [];

  /** 各目标站点独立的毛利 / 折扣覆盖 */
  const siteProfitOverrides = {};
  const siteDiscountOverrides = {};
  /** 用户手动修改过毛利的目标站点 */
  const manualProfitOverrides = new Set();
  /** 用户手动修改过折扣的目标站点 */
  const manualDiscountOverrides = new Set();

  /** 反推得到的基准毛利（用于首次填充目标站点） */
  let lastReversedProfit = null;

  let drawerMode = "source";
  let drawerDraft = { siteId: null, cargoType: null, channelId: null, zone: null };
  const pendingSelections = [];
  let recalcTimer = null;
  let saveStateTimer = null;

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function showMsg(text, type) {
    const node = el("mspMessage");
    if (!node) return;
    node.textContent = text || "";
    node.className = "adv-message" + (type ? " " + type : "");
  }

  function scheduleRecalculate(preserveFocus) {
    scheduleSaveFormState();
    clearTimeout(recalcTimer);
    recalcTimer = setTimeout(function () {
      runCalculate({ preserveFocus: !!preserveFocus });
    }, 180);
  }

  function collectFormState() {
    const domesticInput = el("mspDomesticShipping");
    return {
      sourceSelection: sourceSelection
        ? {
          siteId: sourceSelection.siteId,
          cargoType: sourceSelection.cargoType,
          channelId: sourceSelection.channelId,
          zone: sourceSelection.zone,
        }
        : null,
      targetSelections: targetSelections.map(function (s) {
        return {
          siteId: s.siteId,
          cargoType: s.cargoType,
          channelId: s.channelId,
          zone: s.zone,
        };
      }),
      siteProfitOverrides: Object.assign({}, siteProfitOverrides),
      siteDiscountOverrides: Object.assign({}, siteDiscountOverrides),
      manualProfitOverrides: Array.from(manualProfitOverrides),
      manualDiscountOverrides: Array.from(manualDiscountOverrides),
      lastReversedProfit: lastReversedProfit,
      inputs: {
        sourcePrice: el("mspSourcePrice") ? el("mspSourcePrice").value : "",
        discount: el("mspDiscount") ? el("mspDiscount").value : "",
        weight: el("mspWeight") ? el("mspWeight").value : "",
        domesticShipping: domesticInput ? domesticInput.value : "",
        domesticShippingUserEdited: domesticInput && domesticInput.dataset.userEdited === "1",
      },
    };
  }

  function scheduleSaveFormState() {
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(function () {
      saveJSON(STORAGE.multiSitePricing, collectFormState());
    }, 200);
  }

  function restoreSelectionFromRaw(raw) {
    if (!raw || !raw.siteId || !raw.cargoType || !raw.channelId) return null;
    const zone = raw.zone != null
      ? raw.zone
      : defaultZoneForChannel(raw.siteId, raw.cargoType, raw.channelId);
    return buildSelectionRecord(raw.siteId, raw.cargoType, raw.channelId, zone);
  }

  function applyLoadedFormState(state) {
    if (!state) return false;

    if (state.inputs) {
      const fieldMap = {
        sourcePrice: "mspSourcePrice",
        discount: "mspDiscount",
        weight: "mspWeight",
        domesticShipping: "mspDomesticShipping",
      };
      Object.keys(fieldMap).forEach(function (key) {
        const node = el(fieldMap[key]);
        if (node && state.inputs[key] != null) node.value = state.inputs[key];
      });
      const domesticInput = el("mspDomesticShipping");
      if (domesticInput) {
        if (state.inputs.domesticShippingUserEdited) {
          domesticInput.dataset.userEdited = "1";
        } else {
          delete domesticInput.dataset.userEdited;
        }
      }
    }

    Object.keys(siteProfitOverrides).forEach(function (k) { delete siteProfitOverrides[k]; });
    Object.keys(siteDiscountOverrides).forEach(function (k) { delete siteDiscountOverrides[k]; });
    manualProfitOverrides.clear();
    manualDiscountOverrides.clear();
    if (state.siteProfitOverrides) Object.assign(siteProfitOverrides, state.siteProfitOverrides);
    if (state.siteDiscountOverrides) Object.assign(siteDiscountOverrides, state.siteDiscountOverrides);
    if (state.manualProfitOverrides) {
      state.manualProfitOverrides.forEach(function (id) { manualProfitOverrides.add(id); });
    }
    if (state.manualDiscountOverrides) {
      state.manualDiscountOverrides.forEach(function (id) { manualDiscountOverrides.add(id); });
    }
    lastReversedProfit = state.lastReversedProfit != null ? state.lastReversedProfit : null;

    targetSelections.length = 0;
    if (state.targetSelections && state.targetSelections.length) {
      state.targetSelections.forEach(function (raw) {
        const record = restoreSelectionFromRaw(raw);
        if (record) targetSelections.push(record);
      });
    }

    sourceSelection = null;
    if (state.sourceSelection) {
      sourceSelection = restoreSelectionFromRaw(state.sourceSelection);
    }

    return !!(sourceSelection || targetSelections.length);
  }

  function reconcileSelections() {
    if (sourceSelection) {
      sourceSelection = restoreSelectionFromRaw(sourceSelection);
    }
    for (let i = targetSelections.length - 1; i >= 0; i--) {
      const record = restoreSelectionFromRaw(targetSelections[i]);
      if (record) targetSelections[i] = record;
      else targetSelections.splice(i, 1);
    }
    if (!sourceSelection && !targetSelections.length) initDefaultSelections();
    scheduleSaveFormState();
  }

  function siteIconHtml(siteId) {
    if (siteId === "TW") {
      return SITE_LOCATION_ICON.replace("<svg ", '<svg class="adv-cascade-location-icon" ');
    }
    return '<span class="adv-cascade-flag">' + (SITE_FLAGS[siteId] || "🏳️") + "</span>";
  }

  function siteIconTagHtml(siteId) {
    if (siteId === "TW") {
      return SITE_LOCATION_ICON.replace("<svg ", '<svg class="adv-tag-location-icon" ');
    }
    return '<span class="adv-tag-flag">' + (SITE_FLAGS[siteId] || "") + "</span>";
  }

  function formatChannelTagPart(siteId, cargoType, channelId) {
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) return "渠道";
    const display = formatChannelDisplay(ch);
    if (display.primary && display.secondary) {
      return display.primary + " · " + display.secondary;
    }
    return display.primary || display.secondary || "渠道";
  }

  function formatTagPlainText(sel) {
    const site = advancedSiteConfigs[sel.siteId];
    const siteName = site ? site.name : sel.siteId;
    const channelPart = formatChannelTagPart(sel.siteId, sel.cargoType, sel.channelId);
    return (SITE_FLAGS[sel.siteId] || "") + " " + siteName + " · " + sel.cargoType + " · " + channelPart;
  }

  function formatTagInnerHtml(sel) {
    const site = advancedSiteConfigs[sel.siteId];
    const siteName = site ? site.name : sel.siteId;
    const channelPart = formatChannelTagPart(sel.siteId, sel.cargoType, sel.channelId);
    return (
      siteIconTagHtml(sel.siteId) +
      '<span class="adv-site-tag-text">' +
      esc(siteName) + " · " + esc(sel.cargoType) + " · " + esc(channelPart) +
      "</span>"
    );
  }

  function buildSelectionRecord(siteId, cargoType, channelId, zone) {
    const channelName = resolveChannelName(siteId, cargoType, channelId, zone);
    if (!channelName) return null;
    return {
      key: getChannelSelectionKey(siteId, cargoType, channelName),
      siteId: siteId,
      cargoType: cargoType,
      channelId: channelId,
      zone: zone,
      channelName: channelName,
    };
  }

  function defaultZoneForChannel(siteId, cargoType, channelId) {
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) return null;
    const preferred = ch.zones.find(function (z) {
      return z.zone && /^Zone A/i.test(z.zone);
    });
    if (preferred) return preferred.zone;
    const noZone = ch.zones.find(function (z) { return !z.zone; });
    return noZone ? noZone.zone : (ch.zones[0] && ch.zones[0].zone) || null;
  }

  function channelHasMultipleZones(siteId, cargoType, channelId) {
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) return false;
    return ch.zones.filter(function (z) { return z.zone; }).length > 1;
  }

  /* ── Tag streams ── */

  function renderSourceTagStream() {
    const stream = el("mspSourceTagStream");
    if (!stream) return;
    if (!sourceSelection) {
      stream.innerHTML = "";
      return;
    }
    const plain = formatTagPlainText(sourceSelection);
    stream.innerHTML =
      '<span class="adv-site-tag" role="listitem" data-key="' + esc(sourceSelection.key) + '">' +
      formatTagInnerHtml(sourceSelection) +
      '<button type="button" class="adv-site-tag-remove" data-role="source" aria-label="移除 ' + esc(plain) + '">×</button></span>';
    stream.querySelector(".adv-site-tag-remove").onclick = function (e) {
      e.stopPropagation();
      const removedSiteId = sourceSelection.siteId;
      sourceSelection = null;
      lastReversedProfit = null;
      renderSourceTagStream();
      removeTargetBySiteId(removedSiteId);
      updateSourcePriceLabel();
      updateStep3State();
      scheduleRecalculate();
    };
  }

  function renderTargetTagStream() {
    const stream = el("mspTargetTagStream");
    if (!stream) return;
    if (!targetSelections.length) {
      stream.innerHTML = "";
      return;
    }
    stream.innerHTML = targetSelections.map(function (sel) {
      const plain = formatTagPlainText(sel);
      return (
        '<span class="adv-site-tag" role="listitem" data-key="' + esc(sel.key) + '">' +
        formatTagInnerHtml(sel) +
        '<button type="button" class="adv-site-tag-remove" data-key="' + esc(sel.key) +
        '" aria-label="移除 ' + esc(plain) + '">×</button></span>'
      );
    }).join("");

    stream.querySelectorAll(".adv-site-tag-remove").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        removeTargetByKey(btn.dataset.key);
      };
    });
  }

  function removeTargetByKey(key) {
    const idx = targetSelections.findIndex(function (s) { return s.key === key; });
    if (idx < 0) return;
    const removed = targetSelections[idx];
    targetSelections.splice(idx, 1);
    delete siteProfitOverrides[removed.siteId];
    delete siteDiscountOverrides[removed.siteId];
    manualProfitOverrides.delete(removed.siteId);
    manualDiscountOverrides.delete(removed.siteId);
    renderTargetTagStream();
    updateStep3State();
    scheduleRecalculate();
  }

  function removeTargetBySiteId(siteId) {
    if (!siteId) return;
    const keys = targetSelections.filter(function (s) { return s.siteId === siteId; }).map(function (s) { return s.key; });
    keys.forEach(removeTargetByKey);
  }

  function setSourceSelection(record) {
    if (!record) return;
    if (sourceSelection && sourceSelection.siteId !== record.siteId) {
      lastReversedProfit = null;
      manualProfitOverrides.clear();
      manualDiscountOverrides.clear();
      Object.keys(siteProfitOverrides).forEach(function (k) { delete siteProfitOverrides[k]; });
      Object.keys(siteDiscountOverrides).forEach(function (k) { delete siteDiscountOverrides[k]; });
    }
    sourceSelection = record;
    removeTargetBySiteId(record.siteId);
    renderSourceTagStream();
    renderTargetTagStream();
    updateSourcePriceLabel();
    updateStep3State();
    syncDomesticShippingDefault();
    scheduleRecalculate();
  }

  function addTargetSelection(record) {
    if (!record) return false;
    if (sourceSelection && sourceSelection.siteId === record.siteId) return false;
    const sameSiteIdx = targetSelections.findIndex(function (s) { return s.siteId === record.siteId; });
    if (sameSiteIdx >= 0) targetSelections.splice(sameSiteIdx, 1);
    if (targetSelections.some(function (s) { return s.key === record.key; })) return false;
    targetSelections.push(record);
    renderTargetTagStream();
    updateStep3State();
    scheduleRecalculate();
    return true;
  }

  function updateSourcePriceLabel() {
    const label = el("mspSourcePriceLabel");
    const prefix = el("mspSourcePricePrefix");
    const unit = el("mspSourcePriceUnit");
    const hint = el("mspSourcePriceHint");
    if (!label) return;

    if (!sourceSelection) {
      label.textContent = "折前售价";
      if (prefix) prefix.textContent = "—";
      if (unit) unit.textContent = "—";
      if (hint) hint.textContent = "≈ 0 CNY";
      return;
    }

    const site = advancedSiteConfigs[sourceSelection.siteId];
    if (!site) return;
    label.textContent = "折前售价";
    if (prefix) prefix.textContent = site.currency;
    if (unit) unit.textContent = site.currencyCode;

    const priceStr = el("mspSourcePrice").value.trim();
    const discountStr = el("mspDiscount").value.trim();
    const price = parseFloat(priceStr);
    const discount = discountStr === "" ? 0 : parseFloat(discountStr);
    const rate = getSiteExchangeRate(sourceSelection.siteId);
    const siteTag = site.name + " · ";

    if (!isNaN(price) && price > 0) {
      const factor = 1 - Math.max(0, Math.min(99, discount || 0)) / 100;
      const afterDiscount = price * factor;
      hint.textContent = siteTag + "折后 ≈ " + site.currency + advFmtMoney(afterDiscount) +
        " | ≈ " + advFmtMoney(afterDiscount / rate) + " CNY";
    } else {
      hint.textContent = siteTag + "≈ 0 CNY | " + site.currencyCode;
    }
  }

  function updateStep3State() {
    const warn = el("mspStep3Warn");
    const hasSource = !!sourceSelection;
    const hasTarget = targetSelections.length > 0;
    const ready = hasSource && hasTarget;

    ["mspSourcePrice", "mspDiscount", "mspWeight"].forEach(function (id) {
      const input = el(id);
      if (input) input.disabled = !ready;
    });

    if (!hasTarget) {
      const results = el("mspResults");
      if (results) results.innerHTML = "";
      showMsg("", "");
    } else {
      scheduleRecalculate();
    }

    if (ready) {
      if (warn) { warn.hidden = true; warn.textContent = ""; }
      return;
    }

    if (warn) {
      if (!hasSource) warn.textContent = "请先选择参考站点渠道";
      else if (!hasTarget) warn.textContent = "请至少选择一个目标站点渠道";
      warn.hidden = false;
    }
  }

  /* ── Drawer cascade ── */

  function resetDrawerDraft() {
    const firstSite = getAdvancedSiteIds().find(function (id) { return advancedSiteConfigs[id]; }) || null;
    let cargoType = null;
    if (firstSite) {
      const types = getOrderedCargoTypes(firstSite);
      cargoType = types.length ? types[0] : null;
    }
    drawerDraft = { siteId: firstSite, cargoType: cargoType, channelId: null, zone: null };
  }

  function openDrawer(mode) {
    drawerMode = mode;
    resetDrawerDraft();
    pendingSelections.length = 0;

    const title = el("mspDrawerTitle");
    if (title) {
      title.textContent = mode === "source" ? "选择参考站点渠道" : "选择目标站点渠道";
    }

    renderCascade();
    updateDrawerConfirmState();
    const drawer = el("mspDrawer");
    if (drawer) drawer.hidden = false;
    document.body.classList.add("adv-drawer-open");
  }

  function closeDrawer() {
    const drawer = el("mspDrawer");
    if (drawer) drawer.hidden = true;
    document.body.classList.remove("adv-drawer-open");
    pendingSelections.length = 0;
  }

  function hasPendingForSite(siteId) {
    return pendingSelections.some(function (s) { return s.siteId === siteId; });
  }

  function siteSelectedMarkHtml(siteId) {
    if (!hasPendingForSite(siteId)) return "";
    return '<span class="adv-cascade-site-selected" aria-label="已选"></span>';
  }

  function findPendingForSite(siteId) {
    return pendingSelections.find(function (s) { return s.siteId === siteId; }) || null;
  }

  function isChannelChecked(siteId, cargoType, channelId) {
    if (
      drawerDraft.siteId === siteId &&
      drawerDraft.cargoType === cargoType &&
      drawerDraft.channelId === channelId
    ) {
      return true;
    }
    const pending = findPendingForSite(siteId);
    return !!(pending && pending.cargoType === cargoType && pending.channelId === channelId);
  }

  function restoreDrawerDraftForSite(siteId) {
    const pending = findPendingForSite(siteId);
    if (pending) {
      drawerDraft.cargoType = pending.cargoType;
      drawerDraft.channelId = pending.channelId;
      drawerDraft.zone = pending.zone;
      return;
    }
    const types = getOrderedCargoTypes(siteId);
    drawerDraft.cargoType = types.length ? types[0] : null;
    drawerDraft.channelId = null;
    drawerDraft.zone = null;
  }

  function upsertPending(record) {
    if (!record) return;
    if (drawerMode === "source") {
      pendingSelections.length = 0;
      pendingSelections.push(record);
    } else {
      const idx = pendingSelections.findIndex(function (s) { return s.siteId === record.siteId; });
      if (idx >= 0) pendingSelections[idx] = record;
      else pendingSelections.push(record);
    }
    renderPendingQueue();
  }

  function renderPendingQueue() {
    renderCascadeSiteCol();
    updateDrawerConfirmState();
  }

  function tryCommitCurrentSiteToPending() {
    const siteId = drawerDraft.siteId;
    const cargoType = drawerDraft.cargoType;
    const channelId = drawerDraft.channelId;
    if (!siteId || !cargoType || !channelId) return;
    if (drawerMode === "target" && sourceSelection && sourceSelection.siteId === siteId) return;
    if (channelHasMultipleZones(siteId, cargoType, channelId) && !drawerDraft.zone) return;

    const zone = drawerDraft.zone || defaultZoneForChannel(siteId, cargoType, channelId);
    const record = buildSelectionRecord(siteId, cargoType, channelId, zone);
    if (record) upsertPending(record);
  }

  function renderCascadeSiteCol() {
    const body = el("mspCascadeSiteBody");
    if (!body) return;

    let html = "";
    REGIONS.forEach(function (region) {
      const sites = region.sites.filter(function (id) { return advancedSiteConfigs[id]; });
      if (!sites.length) return;
      html += '<div class="adv-cascade-region-label">' + esc(region.label) + "</div>";
      sites.forEach(function (siteId) {
        const site = advancedSiteConfigs[siteId];
        const isSource = sourceSelection && sourceSelection.siteId === siteId;
        const disabled = drawerMode === "target" && isSource;
        const active = drawerDraft.siteId === siteId ? " active" : "";
        html +=
          '<button type="button" class="adv-cascade-item' + active +
          (disabled ? " disabled" : "") + '" data-site="' + siteId + '"' +
          (disabled ? ' disabled title="参考站点不可作为目标"' : "") + ">" +
          siteIconHtml(siteId) +
          '<span class="adv-cascade-item-label">' + esc(site.name) +
          (isSource && drawerMode === "target" ? " (参考)" : "") + "</span>" +
          siteSelectedMarkHtml(siteId) +
          "</button>";
      });
    });
    body.innerHTML = html || '<div class="adv-cascade-empty">暂无站点</div>';
  }

  function renderCascadeCargoCol() {
    const body = el("mspCascadeCargoBody");
    if (!body) return;
    const siteId = drawerDraft.siteId;
    if (!siteId) {
      body.innerHTML = '<div class="adv-cascade-empty">—</div>';
      return;
    }
    const cargoTypes = getOrderedCargoTypes(siteId);
    if (!cargoTypes.length) {
      body.innerHTML = '<div class="adv-cascade-empty">—</div>';
      return;
    }
    body.innerHTML = cargoTypes.map(function (ct) {
      const active = drawerDraft.cargoType === ct ? " active" : "";
      return '<button type="button" class="adv-cascade-item' + active + '" data-cargo="' + esc(ct) + '">' + esc(ct) + "</button>";
    }).join("");
  }

  function renderCascadeChannelCol() {
    const body = el("mspCascadeChannelBody");
    if (!body) return;
    const siteId = drawerDraft.siteId;
    const cargoType = drawerDraft.cargoType;
    if (!siteId || !cargoType) {
      body.innerHTML = '<div class="adv-cascade-empty">请先选站点</div>';
      return;
    }
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    if (!channels.length) {
      body.innerHTML = '<div class="adv-cascade-empty">暂无渠道</div>';
      return;
    }
    body.innerHTML = channels.map(function (ch) {
      const checked = isChannelChecked(siteId, cargoType, ch.channelId);
      const display = formatChannelDisplay(ch);
      return (
        '<label class="adv-cascade-radio-item' + (checked ? " checked" : "") + '" data-channel="' + esc(ch.channelId) + '">' +
        '<input type="radio" name="mspCascadeChannel" class="adv-cascade-radio" data-channel="' + esc(ch.channelId) + '"' +
        (checked ? " checked" : "") + ">" +
        '<span class="adv-cascade-check-label">' +
        (display.primary ? '<span class="adv-cascade-check-primary">' + esc(display.primary) + "</span>" : "") +
        (display.secondary ? '<span class="adv-cascade-check-secondary">' + esc(display.secondary) + "</span>" : "") +
        "</span></label>"
      );
    }).join("");
  }

  function renderCascadeZoneCol() {
    const col = el("mspCascadeZoneCol");
    const body = el("mspCascadeZoneBody");
    if (!col || !body) return;
    const siteId = drawerDraft.siteId;
    const cargoType = drawerDraft.cargoType;
    const channelId = drawerDraft.channelId;

    if (!siteId || !cargoType || !channelId || !channelHasMultipleZones(siteId, cargoType, channelId)) {
      col.hidden = true;
      body.innerHTML = "";
      return;
    }

    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) {
      col.hidden = true;
      body.innerHTML = "";
      return;
    }

    col.hidden = false;
    const currentZone = drawerDraft.zone || defaultZoneForChannel(siteId, cargoType, channelId);
    body.innerHTML = ch.zones.filter(function (z) { return z.zone; }).map(function (z) {
      const active = currentZone === z.zone ? " active" : "";
      return '<button type="button" class="adv-cascade-item' + active + '" data-zone="' + esc(z.zone) + '">' + esc(z.zone) + "</button>";
    }).join("");
  }

  function renderCascade() {
    renderCascadeSiteCol();
    renderCascadeCargoCol();
    renderCascadeChannelCol();
    renderCascadeZoneCol();
    updateDrawerConfirmState();
  }

  function updateDrawerConfirmState() {
    const btn = el("mspDrawerConfirm");
    if (!btn) return;
    const count = pendingSelections.length;
    btn.disabled = count === 0;
    if (drawerMode === "source") {
      btn.textContent = count > 0 ? "确认选择" : "确认选择";
    } else {
      btn.textContent = count > 0 ? "一键添加 (" + count + ")" : "一键添加";
    }
  }

  function selectChannel(channelId) {
    drawerDraft.channelId = channelId;
    drawerDraft.zone = defaultZoneForChannel(drawerDraft.siteId, drawerDraft.cargoType, channelId);
    renderCascadeChannelCol();
    renderCascadeZoneCol();
    if (!channelHasMultipleZones(drawerDraft.siteId, drawerDraft.cargoType, channelId)) {
      tryCommitCurrentSiteToPending();
    }
  }

  function confirmDrawer() {
    if (!pendingSelections.length) return;

    if (drawerMode === "source") {
      setSourceSelection(pendingSelections[0]);
    } else {
      let added = 0;
      pendingSelections.forEach(function (record) {
        if (addTargetSelection(record)) added++;
      });
      if (added === 0) {
        showMsg("所选渠道已存在或与参考站点冲突", "error");
        return;
      }
    }
    closeDrawer();
    showMsg("", "");
  }

  function bindCascadeEvents() {
    const siteBody = el("mspCascadeSiteBody");
    if (siteBody) {
      siteBody.onclick = function (e) {
        const btn = e.target.closest("[data-site]");
        if (!btn || btn.disabled) return;
        drawerDraft.siteId = btn.dataset.site;
        restoreDrawerDraftForSite(drawerDraft.siteId);
        renderCascade();
      };
    }

    const cargoBody = el("mspCascadeCargoBody");
    if (cargoBody) {
      cargoBody.onclick = function (e) {
        const btn = e.target.closest("[data-cargo]");
        if (!btn) return;
        drawerDraft.cargoType = btn.dataset.cargo;
        const pending = findPendingForSite(drawerDraft.siteId);
        if (pending && pending.cargoType === drawerDraft.cargoType) {
          drawerDraft.channelId = pending.channelId;
          drawerDraft.zone = pending.zone;
        } else {
          drawerDraft.channelId = null;
          drawerDraft.zone = null;
        }
        renderCascade();
      };
    }

    const channelBody = el("mspCascadeChannelBody");
    if (channelBody) {
      channelBody.onchange = function (e) {
        const radio = e.target.closest(".adv-cascade-radio");
        if (!radio) return;
        selectChannel(radio.dataset.channel);
      };
    }

    const zoneBody = el("mspCascadeZoneBody");
    if (zoneBody) {
      zoneBody.onclick = function (e) {
        const btn = e.target.closest("[data-zone]");
        if (!btn || !drawerDraft.channelId) return;
        drawerDraft.zone = btn.dataset.zone;
        renderCascadeZoneCol();
        tryCommitCurrentSiteToPending();
      };
    }
  }

  function syncDomesticShippingDefault() {
    const input = el("mspDomesticShipping");
    if (!input || input.dataset.userEdited === "1") return;
    const siteId = sourceSelection ? sourceSelection.siteId : DEFAULT_SOURCE_SITE;
    const fees = getAdvancedSiteFees(siteId);
    if (fees) input.value = fees.domesticShipping;
  }

  /* ── Calculation ── */

  function readInputs() {
    if (!sourceSelection) return { error: "请先选择参考站点渠道" };
    if (!targetSelections.length) return { error: "请至少选择一个目标站点渠道" };

    const priceStr = el("mspSourcePrice").value.trim();
    const discountStr = el("mspDiscount").value.trim();
    const weightStr = el("mspWeight").value.trim();
    const domesticStr = el("mspDomesticShipping").value.trim();

    if (!priceStr) return { error: "请填写折前售价" };
    const originalPrice = parseFloat(priceStr);
    if (isNaN(originalPrice) || originalPrice <= 0) return { error: "折前售价无效" };

    const discount = discountStr === "" ? 0 : parseFloat(discountStr);
    if (discountStr !== "" && (isNaN(discount) || discount < 0 || discount >= 100)) {
      return { error: "折扣须在 0–99 之间" };
    }

    const weight = weightStr === "" ? 0 : parseFloat(weightStr);
    if (weightStr !== "" && (isNaN(weight) || weight < 0)) return { error: "包裹重量无效" };

    const domesticShipping = domesticStr === "" ? undefined : parseFloat(domesticStr);
    if (domesticStr !== "" && (isNaN(domesticShipping) || domesticShipping < 0)) {
      return { error: "境内段运费无效" };
    }

    return { originalPrice, discount, weight, domesticShipping, sourceSelection, targetSelections };
  }

  function reverseProfitFromSource(sel, originalPrice, discount, weight, domesticShipping) {
    const discountFactor = 1 - Math.max(0, Math.min(99, discount || 0)) / 100;
    const targetPrice = advRound2(originalPrice * discountFactor);
    return calculateAdvancedScene({
      siteId: sel.siteId,
      cargoType: sel.cargoType,
      channelName: sel.channelName,
      weight: weight,
      cost: 0,
      mode: "sellingPrice",
      modeValue: targetPrice,
      discount: 0,
      domesticShipping: domesticShipping,
    });
  }

  function forwardPriceForTarget(sel, profit, discount, weight, domesticShipping) {
    return calculateAdvancedScene({
      siteId: sel.siteId,
      cargoType: sel.cargoType,
      channelName: sel.channelName,
      weight: weight,
      cost: 0,
      mode: "profit",
      modeValue: profit,
      discount: discount,
      domesticShipping: domesticShipping,
    });
  }

  function getEffectiveProfit(siteId, fallbackProfit) {
    if (siteProfitOverrides[siteId] != null && !isNaN(siteProfitOverrides[siteId])) {
      return siteProfitOverrides[siteId];
    }
    return fallbackProfit;
  }

  function getEffectiveDiscount(siteId, globalDiscount) {
    if (siteDiscountOverrides[siteId] != null && !isNaN(siteDiscountOverrides[siteId])) {
      return siteDiscountOverrides[siteId];
    }
    return globalDiscount;
  }

  /* ── Result cards ── */

  function copyBtn(text, label) {
    return (
      '<button type="button" class="adv-btn-copy" data-copy="' + text +
      '" title="复制' + label + '" aria-label="复制' + label + '">' + COPY_ICON + "</button>"
    );
  }

  function readPartialInputs() {
    const discountStr = el("mspDiscount").value.trim();
    const weightStr = el("mspWeight").value.trim();
    const domesticStr = el("mspDomesticShipping").value.trim();

    const discount = discountStr === "" ? 0 : parseFloat(discountStr);
    const weight = weightStr === "" ? 0 : parseFloat(weightStr);
    const domesticShipping = domesticStr === "" ? undefined : parseFloat(domesticStr);

    return { discount, weight, domesticShipping };
  }

  function fmtLocalCny(local, cny, cur) {
    return advFmtMoney(local) + cur + " ≈ " + advFmtMoney(cny) + " CNY";
  }

  function buildDetailedBreakdownMetrics(mode, result) {
    const cur = result.currency;
    const b = result.breakdown;
    if (!b) return buildTargetAuxiliaryMetrics(result);

    const items = [
      {
        label: "折前售价",
        value: cur + advFmtMoney(result.originalPrice) + " ≈ " + advFmtMoney(result.originalPriceCNY) + " CNY",
      },
      { label: "折后售价", value: fmtLocalCny(result.targetPrice, b.priceCNY, cur) },
      { label: "净利润", value: advFmtMoney(result.profit) + " CNY ≈ " + advFmtMoney(b.netProfitLocal) + cur },
      { label: "净利润率", value: advFmtMoney(result.profitRate) + "%" },
      { label: "订单收入", value: fmtLocalCny(b.orderIncome, b.orderIncomeCNY, cur) },
      { label: "站点调价比", value: advFmtMoney(b.priceAdjustRatio) + "%" },
      { label: "Shopee平台费用", value: fmtLocalCny(b.platformFee, b.platformFeeCNY, cur) },
      { label: "佣金", value: cur + advFmtMoney(b.commissionFee), sub: true },
      { label: "交易手续费", value: cur + advFmtMoney(b.transactionFee), sub: true },
      { label: "活动服务费", value: cur + advFmtMoney(b.activityFee), sub: true },
      { label: "技术支持", value: cur + advFmtMoney(b.techSupportFee), sub: true },
      {
        label: "卖家支付运费",
        value: fmtLocalCny(b.sellerPaidShipping, b.sellerPaidShippingCNY, cur),
      },
      {
        label: "跨境物流成本(藏价)",
        value: fmtLocalCny(result.hiddenFreightLocal, result.hiddenFreightCNY, cur),
        sub: true,
      },
      {
        label: "买家支付运费",
        value: fmtLocalCny(result.shippingBuyer, b.shippingBuyerCNY, cur),
        sub: true,
      },
      { label: "其他费用", value: fmtLocalCny(b.otherFee, b.otherFeeCNY, cur) },
      { label: "提现手续费", value: cur + advFmtMoney(b.withdrawalFee), sub: true },
      { label: "商品成本", value: advFmtMoney(result.cost) + " CNY" },
      { label: "境内段运费", value: advFmtMoney(result.domesticShipping) + " CNY" },
    ];

    return items;
  }

  function buildTargetAuxiliaryMetrics(result) {
    const cur = result.currency;
    return [
      { label: "折后售价", value: cur + advFmtMoney(result.targetPrice) },
      { label: "净利润", value: advFmtMoney(result.profit) + " CNY" },
      {
        label: "藏价运费",
        value: advFmtMoney(result.hiddenFreightLocal) + cur +
          " ≈ " + advFmtMoney(result.hiddenFreightCNY) + " CNY",
      },
    ];
  }

  function buildMoreInfoTip(mode, result) {
    const items = buildDetailedBreakdownMetrics(mode, result);
    const bubbleHtml = items.map(function (item) {
      const rowClass = item.sub ? " adv-info-bubble-row--sub" : "";
      return (
        '<div class="adv-info-bubble-row' + rowClass + '">' +
        '<span class="adv-info-bubble-title">' + esc(item.label) + "</span>" +
        '<span class="adv-info-bubble-value">' + item.value + "</span></div>"
      );
    }).join("");

    return (
      '<span class="adv-info-tip adv-more-tip" tabindex="0" role="button" aria-label="更多信息">' +
      ICON_MORE +
      '<span class="adv-info-bubble adv-info-bubble-multi">' + bubbleHtml + "</span></span>"
    );
  }

  function buildTargetResultCard(sel, result, profit, discount) {
    const site = advancedSiteConfigs[sel.siteId];
    const headLabel = site
      ? siteIconTagHtml(sel.siteId) + esc(site.name) + " " + esc(site.currency)
      : esc(sel.siteId);

    const profitRow =
      '<div class="adv-result-mode-field">' +
      '<label>预估毛利 (CNY)</label>' +
      '<input type="text" class="adv-result-mode-value msp-profit-override" data-site="' + esc(sel.siteId) + '" ' +
      'value="' + esc(String(profit != null && !isNaN(profit) ? profit : "")) + '" inputmode="decimal" autocomplete="off"></div>';

    const discountRow =
      '<div class="adv-result-mode-field">' +
      '<label>折扣</label>' +
      '<div class="adv-input-with-unit adv-input-compact">' +
      '<input type="text" class="msp-discount-override" data-site="' + esc(sel.siteId) + '" ' +
      'value="' + esc(String(discount != null && !isNaN(discount) ? discount : "0")) + '" inputmode="decimal" autocomplete="off">' +
      '<span class="adv-input-suffix">%OFF</span></div></div>';

    if (result.error) {
      return (
        '<div class="adv-result-card ' + (site ? site.css : "") + ' error-card" data-site="' + esc(sel.siteId) + '">' +
        '<div class="adv-result-head">' + headLabel + "</div>" +
        profitRow + discountRow +
        '<div class="adv-result-error">' + result.error + "</div></div>"
      );
    }

    return (
      '<div class="adv-result-card ' + result.css + ' mode-profit msp-target-card" data-site="' + esc(sel.siteId) + '">' +
      '<div class="adv-result-head">' + headLabel + "</div>" +
      profitRow + discountRow +
      '<div class="adv-result-main">' +
      '<div class="adv-result-price-block adv-result-price-block--left">' +
      '<div class="adv-result-price-label-line">' +
      '<span class="adv-result-price-tag">折前售价</span>' +
      buildMoreInfoTip("profit", result) +
      "</div>" +
      '<div class="adv-result-price-value-line">' +
      '<span class="adv-result-main-value">' + result.currency + advFmtMoney(result.originalPrice) + "</span>" +
      copyBtn(advFmtMoney(result.originalPrice), "折前售价") +
      "</div></div></div></div>"
    );
  }

  function bindResultInputs() {
    document.querySelectorAll("#mspResults .msp-profit-override").forEach(function (input) {
      input.addEventListener("input", function () {
        const siteId = input.dataset.site;
        const raw = input.value.trim();
        if (!raw) return;
        const val = parseFloat(raw);
        if (isNaN(val) || val < 0) return;
        siteProfitOverrides[siteId] = val;
        manualProfitOverrides.add(siteId);
        scheduleRecalculate(true);
      });
    });

    document.querySelectorAll("#mspResults .msp-discount-override").forEach(function (input) {
      input.addEventListener("input", function () {
        const siteId = input.dataset.site;
        const raw = input.value.trim();
        if (raw === "") return;
        const val = parseFloat(raw);
        if (isNaN(val) || val < 0 || val >= 100) return;
        siteDiscountOverrides[siteId] = val;
        manualDiscountOverrides.add(siteId);
        scheduleRecalculate(true);
      });
    });
  }

  function bindCopyButtons() {
    document.querySelectorAll("#mspResults .adv-btn-copy").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy).then(function () {
          btn.classList.add("copied");
          setTimeout(function () { btn.classList.remove("copied"); }, 1200);
        });
      };
    });
  }

  function runCalculate(options) {
    options = options || {};
    const container = el("mspResults");
    if (!container) return;

    if (!targetSelections.length) {
      container.innerHTML = "";
      showMsg("", "");
      return;
    }

    let focusSite = null;
    let selStart = 0;
    let selEnd = 0;
    if (options.preserveFocus) {
      const active = document.activeElement;
      if (active && (active.classList.contains("msp-profit-override") || active.classList.contains("msp-discount-override"))) {
        focusSite = active.dataset.site;
        selStart = active.selectionStart;
        selEnd = active.selectionEnd;
      }
    }

    const partial = readPartialInputs();
    const silentErrors = [
      "请先选择参考站点渠道",
      "请至少选择一个目标站点渠道",
      "请填写折前售价",
    ];

    function renderTargetCards(getResultForTarget) {
      const cards = targetSelections.map(function (sel) {
        const profit = getEffectiveProfit(sel.siteId, lastReversedProfit);
        const discount = getEffectiveDiscount(sel.siteId, partial.discount);
        const result = getResultForTarget(sel, profit, discount);
        return buildTargetResultCard(sel, result, profit, discount);
      });
      container.innerHTML = cards.join("");
      bindCopyButtons();
      bindResultInputs();
      restoreFocus();
    }

    function restoreFocus() {
      if (!focusSite) return;
      const input = container.querySelector('.msp-profit-override[data-site="' + focusSite + '"]') ||
        container.querySelector('.msp-discount-override[data-site="' + focusSite + '"]');
      if (input) {
        input.focus();
        try { input.setSelectionRange(selStart, selEnd); } catch (_e) { /* ignore */ }
      }
    }

    if (!sourceSelection) {
      renderTargetCards(function () {
        return { error: "请先选择参考站点渠道" };
      });
      showMsg("", "");
      return;
    }

    const inputs = readInputs();
    if (inputs.error) {
      renderTargetCards(function () {
        return { error: inputs.error };
      });
      if (silentErrors.indexOf(inputs.error) === -1) {
        showMsg(inputs.error, "error");
      } else {
        showMsg("", "");
      }
      return;
    }

    const sourceResult = reverseProfitFromSource(
      inputs.sourceSelection,
      inputs.originalPrice,
      inputs.discount,
      inputs.weight,
      inputs.domesticShipping
    );

    if (sourceResult.error) {
      renderTargetCards(function () {
        return { error: sourceResult.error };
      });
      showMsg(sourceResult.error, "error");
      return;
    }

    if (lastReversedProfit == null || lastReversedProfit !== sourceResult.profit) {
      lastReversedProfit = sourceResult.profit;
      inputs.targetSelections.forEach(function (sel) {
        if (!manualProfitOverrides.has(sel.siteId)) {
          siteProfitOverrides[sel.siteId] = sourceResult.profit;
        }
      });
    }

    renderTargetCards(function (sel, profit, discount) {
      return forwardPriceForTarget(sel, profit, discount, inputs.weight, inputs.domesticShipping);
    });
    showMsg("", "");
  }

  function advRound2(n) {
    return Math.round(n * 100) / 100;
  }

  function initDefaultSelections() {
    const sourceDef = getDefaultChannelForSite(DEFAULT_SOURCE_SITE);
    if (sourceDef) {
      const record = buildSelectionRecord(DEFAULT_SOURCE_SITE, sourceDef.cargoType, sourceDef.channelId, sourceDef.zone);
      if (record) sourceSelection = record;
    }

    DEFAULT_TARGET_SITES.forEach(function (siteId) {
      const def = getDefaultChannelForSite(siteId);
      if (def) {
        const record = buildSelectionRecord(siteId, def.cargoType, def.channelId, def.zone);
        if (record) targetSelections.push(record);
      }
    });
  }

  function bindEvents() {
    const sourceAddBtn = el("mspSourceAddBtn");
    const targetAddBtn = el("mspTargetAddBtn");
    if (sourceAddBtn) sourceAddBtn.addEventListener("click", function () { openDrawer("source"); });
    if (targetAddBtn) targetAddBtn.addEventListener("click", function () { openDrawer("target"); });

    const closeBtn = el("mspDrawerClose");
    const backdrop = el("mspDrawerBackdrop");
    const confirmBtn = el("mspDrawerConfirm");
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    if (confirmBtn) confirmBtn.addEventListener("click", confirmDrawer);

    bindCascadeEvents();

    ["mspSourcePrice", "mspDiscount", "mspWeight"].forEach(function (id) {
      const node = el(id);
      if (node) node.addEventListener("input", function () {
        updateSourcePriceLabel();
        scheduleRecalculate();
      });
    });

    const domesticInput = el("mspDomesticShipping");
    if (domesticInput) {
      domesticInput.addEventListener("input", function () {
        domesticInput.dataset.userEdited = "1";
        scheduleRecalculate();
      });
    }

    const configLink = el("mspGoConfigLink");
    if (configLink) {
      configLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (typeof window.openSiteSettingsDrawer === "function") {
          window.openSiteSettingsDrawer();
        }
      });
    }
  }

  function boot() {
    loadPersistedState(STORAGE.multiSitePricing, function (saved) {
      const hasSelections = applyLoadedFormState(saved);
      if (!hasSelections) initDefaultSelections();
      renderSourceTagStream();
      renderTargetTagStream();
      updateSourcePriceLabel();
      updateStep3State();
      syncDomesticShippingDefault();
      bindEvents();
      scheduleRecalculate();
    });
  }

  function initMultiSitePricing() {
    if (!el("page-calculator")) return;

    document.addEventListener("shopee-remote-config-updated", function () {
      reconcileSelections();
      renderSourceTagStream();
      renderTargetTagStream();
      scheduleRecalculate();
    });

    document.addEventListener("shopee-shipping-data-updated", function () {
      reconcileSelections();
      renderSourceTagStream();
      renderTargetTagStream();
      scheduleRecalculate();
    });

    if (typeof window.__remoteConfigReady !== "undefined") {
      window.__remoteConfigReady.finally(boot);
    } else if (typeof window.__shippingDataReady !== "undefined") {
      window.__shippingDataReady.finally(boot);
    } else {
      boot();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMultiSitePricing);
  } else {
    initMultiSitePricing();
  }
})();
