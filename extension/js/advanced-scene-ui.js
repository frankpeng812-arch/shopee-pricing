/**
 * 成本定价 — 独立 UI 模块（与 app.js 现有页面完全隔离）
 */
(function () {
  "use strict";

  const MODE_OPTIONS = [
    { value: "profit", label: "通过输入预期净利润，计算售价和净利润率" },
    { value: "profitRate", label: "通过输入预期净利润率，计算售价和净利润" },
    { value: "sellingPrice", label: "通过输入预期售价，计算净利润和净利润率" },
  ];

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
    { id: "sea", label: "东南亚与台湾", sites: ["SG", "MY", "TH", "PH", "VN", "TW"], open: true },
    { id: "latam", label: "拉美与其它", sites: ["BR", "MX", "AR"], open: false },
  ];

  /**
   * @type {Array<{
   *   key: string,
   *   siteId: string,
   *   cargoType: string,
   *   channelId: string,
   *   zone: string|null,
   *   channelName: string
   * }>}
   */
  const channelSelections = [];

  /** 抽屉级联导航草稿（当前正在配置的站点） */
  let drawerDraft = {
    siteId: null,
    cargoType: null,
    channelId: null,
    zone: null,
  };

  /** 各站点独立的预期净利润 / 净利润率（覆盖全局输入） */
  const siteModeOverrides = {};

  /** 抽屉内待一键添加的站点渠道（每站点仅一条） */
  const pendingSelections = [];

  let recalcTimer = null;
  let saveStateTimer = null;

  const STEP2_INPUT_IDS = [
    "advSceneCost", "advSceneModeValue", "advSceneSellingPrice",
    "advSceneDiscount", "advSceneWeight",
  ];

  const SITE_SELECTION_ERRORS = [
    "请至少勾选一个站点",
    "请先选择站点",
    "预期售价模式下只能选择一个站点",
  ];

  function el(id) { return document.getElementById(id); }

  function getCurrentMode() {
    const select = el("advSceneMode");
    return select ? select.value : "profit";
  }

  function isSingleSiteMode() {
    return getCurrentMode() === "sellingPrice";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function showMsg(text, type) {
    const node = el("advSceneMessage");
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
    const domesticInput = el("advSceneDomesticShipping");
    return {
      mode: getCurrentMode(),
      channelSelections: channelSelections.map(function (s) {
        return {
          siteId: s.siteId,
          cargoType: s.cargoType,
          channelId: s.channelId,
          zone: s.zone,
        };
      }),
      siteModeOverrides: Object.assign({}, siteModeOverrides),
      inputs: {
        cost: el("advSceneCost") ? el("advSceneCost").value : "",
        modeValue: el("advSceneModeValue") ? el("advSceneModeValue").value : "",
        sellingPrice: el("advSceneSellingPrice") ? el("advSceneSellingPrice").value : "",
        discount: el("advSceneDiscount") ? el("advSceneDiscount").value : "",
        weight: el("advSceneWeight") ? el("advSceneWeight").value : "",
        domesticShipping: domesticInput ? domesticInput.value : "",
        domesticShippingUserEdited: domesticInput && domesticInput.dataset.userEdited === "1",
      },
    };
  }

  function scheduleSaveFormState() {
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(function () {
      saveJSON(STORAGE.advancedScene, collectFormState());
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

    const modeSelect = el("advSceneMode");
    if (modeSelect && state.mode && MODE_OPTIONS.some(function (o) { return o.value === state.mode; })) {
      modeSelect.value = state.mode;
    }

    if (state.inputs) {
      const fieldMap = {
        cost: "advSceneCost",
        modeValue: "advSceneModeValue",
        sellingPrice: "advSceneSellingPrice",
        discount: "advSceneDiscount",
        weight: "advSceneWeight",
        domesticShipping: "advSceneDomesticShipping",
      };
      Object.keys(fieldMap).forEach(function (key) {
        const node = el(fieldMap[key]);
        if (node && state.inputs[key] != null) node.value = state.inputs[key];
      });
      const domesticInput = el("advSceneDomesticShipping");
      if (domesticInput) {
        if (state.inputs.domesticShippingUserEdited) {
          domesticInput.dataset.userEdited = "1";
        } else {
          delete domesticInput.dataset.userEdited;
        }
      }
    }

    clearSiteModeOverrides();
    if (state.siteModeOverrides) {
      Object.assign(siteModeOverrides, state.siteModeOverrides);
    }

    if (state.channelSelections && state.channelSelections.length) {
      channelSelections.length = 0;
      state.channelSelections.forEach(function (raw) {
        const record = restoreSelectionFromRaw(raw);
        if (record) channelSelections.push(record);
      });
      return channelSelections.length > 0;
    }
    return false;
  }

  function reconcileChannelSelections() {
    for (let i = channelSelections.length - 1; i >= 0; i--) {
      const record = restoreSelectionFromRaw(channelSelections[i]);
      if (record) channelSelections[i] = record;
      else channelSelections.splice(i, 1);
    }
    if (!channelSelections.length) initChannelSelections();
    scheduleSaveFormState();
  }

  function getEffectiveModeValue(siteId, mode) {
    if (mode === "sellingPrice") {
      const spStr = el("advSceneSellingPrice").value.trim();
      if (!spStr) return NaN;
      return parseFloat(spStr);
    }
    if (siteModeOverrides[siteId] != null && !isNaN(siteModeOverrides[siteId])) {
      return siteModeOverrides[siteId];
    }
    const mvStr = el("advSceneModeValue").value.trim();
    if (!mvStr) return NaN;
    return parseFloat(mvStr);
  }

  function applyModeValueToAllSites() {
    const mode = getCurrentMode();
    if (mode !== "profit" && mode !== "profitRate") return;

    const mvStr = el("advSceneModeValue").value.trim();
    if (!mvStr) return;
    const val = parseFloat(mvStr);
    if (isNaN(val) || val < 0) return;
    if (mode === "profitRate" && val >= 100) return;

    getActiveSelections().forEach(function (sel) {
      delete siteModeOverrides[sel.siteId];
    });
    scheduleRecalculate();
  }

  function clearSiteModeOverrides() {
    Object.keys(siteModeOverrides).forEach(function (key) {
      delete siteModeOverrides[key];
    });
  }

  function clearSiteModeOverride(siteId) {
    delete siteModeOverrides[siteId];
  }

  function pathLabelFor(sel) {
    if (!sel || !sel.channelId) return "选择物流方案";
    return formatOfficialPath(sel.cargoType, sel.channelId, sel.zone, sel.siteId);
  }

  function twLocationIconHtml(className) {
    return SITE_LOCATION_ICON.replace("<svg ", '<svg class="' + className + '" ');
  }

  function siteIconHtml(siteId) {
    if (siteId === "TW") {
      return twLocationIconHtml("adv-cascade-location-icon");
    }
    return '<span class="adv-cascade-flag">' + (SITE_FLAGS[siteId] || "🏳️") + "</span>";
  }

  function siteIconTagHtml(siteId) {
    if (siteId === "TW") {
      return twLocationIconHtml("adv-tag-location-icon");
    }
    return '<span class="adv-tag-flag">' + (SITE_FLAGS[siteId] || "") + "</span>";
  }

  function siteFlagPrefix(siteId) {
    if (siteId === "TW") return "";
    return (SITE_FLAGS[siteId] || "") + " ";
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
    return siteFlagPrefix(sel.siteId) + siteName + " · " + sel.cargoType + " · " + channelPart;
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

  function getActiveSelections() {
    return channelSelections.map(function (sel) {
      return {
        siteId: sel.siteId,
        cargoType: sel.cargoType,
        channelName: sel.channelName,
        channelId: sel.channelId,
        zone: sel.zone,
        pathLabel: pathLabelFor(sel),
        key: sel.key,
      };
    });
  }

  function selectionIndexByKey(key) {
    return channelSelections.findIndex(function (s) { return s.key === key; });
  }

  function hasSelectionKey(key) {
    return selectionIndexByKey(key) >= 0;
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

  function firstActiveSiteId() {
    const active = getActiveSelections();
    return active.length ? active[0].siteId : null;
  }

  /* ── Tag stream ── */

  function renderTagStream() {
    const stream = el("advSiteTagStream");
    if (!stream) return;

    if (!channelSelections.length) {
      stream.innerHTML = "";
      return;
    }

    stream.innerHTML = channelSelections.map(function (sel) {
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
        removeSelection(btn.dataset.key);
      };
    });
  }

  function addSelection(record) {
    if (!record) return false;

    if (isSingleSiteMode()) {
      channelSelections.length = 0;
    } else {
      const sameSiteIdx = channelSelections.findIndex(function (s) {
        return s.siteId === record.siteId;
      });
      if (sameSiteIdx >= 0) channelSelections.splice(sameSiteIdx, 1);
    }

    if (hasSelectionKey(record.key)) return false;

    channelSelections.push(record);
    renderTagStream();
    updateSellingPriceHint();
    updateStep2SiteState();
    syncDomesticShippingDefault();
    scheduleRecalculate();
    return true;
  }

  function removeSelection(key) {
    const idx = selectionIndexByKey(key);
    if (idx < 0) return;
    const removed = channelSelections[idx];
    channelSelections.splice(idx, 1);
    if (removed) clearSiteModeOverride(removed.siteId);
    renderTagStream();
    updateSellingPriceHint();
    updateStep2SiteState();
    syncDomesticShippingDefault();
    scheduleRecalculate();
  }

  function enforceSingleSiteSelection() {
    if (!isSingleSiteMode()) return;
    if (channelSelections.length <= 1) return;
    channelSelections.splice(1);
    renderTagStream();
    updateSellingPriceHint();
    updateStep2SiteState();
    syncDomesticShippingDefault();
    scheduleRecalculate();
  }

  /* ── Bottom drawer cascade ── */

  function resetDrawerDraft() {
    const firstSite = getAdvancedSiteIds().find(function (id) { return advancedSiteConfigs[id]; }) || null;
    let cargoType = null;
    if (firstSite) {
      const types = getOrderedCargoTypes(firstSite);
      cargoType = types.length ? types[0] : null;
    }
    drawerDraft = {
      siteId: firstSite,
      cargoType: cargoType,
      channelId: null,
      zone: null,
    };
  }

  function openSiteDrawer() {
    resetDrawerDraft();
    pendingSelections.length = 0;
    renderCascade();
    renderPendingQueue();
    const drawer = el("advSiteDrawer");
    if (drawer) drawer.hidden = false;
    document.body.classList.add("adv-drawer-open");
  }

  function closeSiteDrawer() {
    const drawer = el("advSiteDrawer");
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
    if (isSingleSiteMode()) {
      pendingSelections.length = 0;
      pendingSelections.push(record);
    } else {
      const idx = pendingSelections.findIndex(function (s) { return s.siteId === record.siteId; });
      if (idx >= 0) pendingSelections[idx] = record;
      else pendingSelections.push(record);
    }
    renderPendingQueue();
  }

  function removePending(siteId) {
    for (let i = pendingSelections.length - 1; i >= 0; i--) {
      if (pendingSelections[i].siteId === siteId) pendingSelections.splice(i, 1);
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

    if (channelHasMultipleZones(siteId, cargoType, channelId) && !drawerDraft.zone) return;

    const zone = drawerDraft.zone || defaultZoneForChannel(siteId, cargoType, channelId);
    const record = buildSelectionRecord(siteId, cargoType, channelId, zone);
    if (record) upsertPending(record);
  }

  function renderCascadeSiteCol() {
    const body = el("advCascadeSiteBody");
    if (!body) return;

    let html = "";
    REGIONS.forEach(function (region) {
      const sites = region.sites.filter(function (id) { return advancedSiteConfigs[id]; });
      if (!sites.length) return;
      html += '<div class="adv-cascade-region-label">' + esc(region.label) + "</div>";
      sites.forEach(function (siteId) {
        const site = advancedSiteConfigs[siteId];
        const active = drawerDraft.siteId === siteId ? " active" : "";
        html +=
          '<button type="button" class="adv-cascade-item' + active + '" data-site="' + siteId + '">' +
          siteIconHtml(siteId) +
          '<span class="adv-cascade-item-label">' + esc(site.name) + "</span>" +
          siteSelectedMarkHtml(siteId) +
          "</button>";
      });
    });
    body.innerHTML = html || '<div class="adv-cascade-empty">暂无站点</div>';
  }

  function renderCascadeCargoCol() {
    const body = el("advCascadeCargoBody");
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
      return (
        '<button type="button" class="adv-cascade-item' + active + '" data-cargo="' + esc(ct) + '">' +
        esc(ct) + "</button>"
      );
    }).join("");
  }

  function renderCascadeChannelCol() {
    const body = el("advCascadeChannelBody");
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
        '<label class="adv-cascade-radio-item' + (checked ? " checked" : "") + '" data-channel="' +
        esc(ch.channelId) + '">' +
        '<input type="radio" name="advCascadeChannel" class="adv-cascade-radio" data-channel="' +
        esc(ch.channelId) + '"' + (checked ? " checked" : "") + ">" +
        '<span class="adv-cascade-check-label">' +
        (display.primary
          ? '<span class="adv-cascade-check-primary">' + esc(display.primary) + "</span>"
          : "") +
        (display.secondary
          ? '<span class="adv-cascade-check-secondary">' + esc(display.secondary) + "</span>"
          : "") +
        "</span></label>"
      );
    }).join("");
  }

  function channelHasMultipleZones(siteId, cargoType, channelId) {
    const tree = buildSiteChannelTree(siteId);
    const channels = tree[cargoType] || [];
    const ch = channels.find(function (c) { return c.channelId === channelId; });
    if (!ch) return false;
    const zonesWithValue = ch.zones.filter(function (z) { return z.zone; });
    return zonesWithValue.length > 1;
  }

  function renderCascadeZoneCol() {
    const col = el("advCascadeZoneCol");
    const body = el("advCascadeZoneBody");
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
      return (
        '<button type="button" class="adv-cascade-item' + active + '" data-zone="' + esc(z.zone) + '">' +
        esc(z.zone) + "</button>"
      );
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
    const btn = el("advSiteDrawerConfirm");
    if (!btn) return;
    const count = pendingSelections.length;
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? "一键添加 (" + count + ")" : "一键添加";
  }

  function selectChannel(channelId) {
    drawerDraft.channelId = channelId;
    drawerDraft.zone = defaultZoneForChannel(
      drawerDraft.siteId,
      drawerDraft.cargoType,
      channelId
    );
    renderCascadeChannelCol();
    renderCascadeZoneCol();
    if (!channelHasMultipleZones(drawerDraft.siteId, drawerDraft.cargoType, channelId)) {
      tryCommitCurrentSiteToPending();
    }
  }

  function bindCascadeEvents() {
    const siteBody = el("advCascadeSiteBody");
    if (siteBody) {
      siteBody.onclick = function (e) {
        const btn = e.target.closest("[data-site]");
        if (!btn) return;
        drawerDraft.siteId = btn.dataset.site;
        restoreDrawerDraftForSite(drawerDraft.siteId);
        renderCascade();
      };
    }

    const cargoBody = el("advCascadeCargoBody");
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

    const channelBody = el("advCascadeChannelBody");
    if (channelBody) {
      channelBody.onchange = function (e) {
        const radio = e.target.closest(".adv-cascade-radio");
        if (!radio) return;
        selectChannel(radio.dataset.channel);
      };
    }

    const zoneBody = el("advCascadeZoneBody");
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

  function confirmSiteDrawer() {
    if (!pendingSelections.length) return;

    if (isSingleSiteMode() && pendingSelections.length > 1) {
      showMsg("预期售价模式下只能选择一个站点", "error");
      return;
    }

    let added = 0;
    pendingSelections.forEach(function (record) {
      if (addSelection(record)) added++;
    });

    if (added > 0) {
      closeSiteDrawer();
      showMsg("", "");
      scheduleRecalculate();
    } else {
      showMsg("所选渠道已存在", "error");
    }
  }

  function bindSiteChannelEvents() {
    const addBtn = el("advSiteAddBtn");
    if (addBtn) addBtn.addEventListener("click", openSiteDrawer);

    const closeBtn = el("advSiteDrawerClose");
    const backdrop = el("advSiteDrawerBackdrop");
    const confirmBtn = el("advSiteDrawerConfirm");
    if (closeBtn) closeBtn.addEventListener("click", closeSiteDrawer);
    if (backdrop) backdrop.addEventListener("click", closeSiteDrawer);
    if (confirmBtn) confirmBtn.addEventListener("click", confirmSiteDrawer);

    bindCascadeEvents();
  }

  /* ── Mode-specific fields ── */

  function updateApplyAllBtnState() {
    const applyBtn = el("advApplyModeAllBtn");
    const mode = getCurrentMode();
    if (!applyBtn) return;
    applyBtn.hidden = mode !== "profit" && mode !== "profitRate";
    applyBtn.disabled = getActiveSelections().length === 0;
  }

  function updateModeFields() {
    const mode = getCurrentMode();
    const modeField = el("advModeField");
    const sellingField = el("advSellingPriceField");
    if (!modeField || !sellingField) return;

    if (mode === "sellingPrice") {
      modeField.hidden = true;
      sellingField.hidden = false;
      enforceSingleSiteSelection();
      updateSellingPriceHint();
    } else {
      modeField.hidden = false;
      sellingField.hidden = true;
      const label = el("advSceneModeValueLabel");
      if (label) label.textContent = mode === "profit" ? "预期净利润" : "预期净利润率";
      const unit = el("advModeUnit");
      if (unit) unit.textContent = mode === "profit" ? "CNY" : "%";
      const prefix = el("advModePrefix");
      if (prefix) prefix.hidden = mode !== "profit";
    }

    const applyBtn = el("advApplyModeAllBtn");
    if (applyBtn) applyBtn.hidden = mode !== "profit" && mode !== "profitRate";

    updateApplyAllBtnState();
    updateSiteSelectionHint();
    updateStep2SiteState();
  }

  function updateStep2SiteState() {
    const warn = el("advStep2SiteWarn");
    if (!warn) return;

    const hasSite = getActiveSelections().length > 0;
    STEP2_INPUT_IDS.forEach(function (id) {
      const input = el(id);
      if (input) input.disabled = !hasSite;
    });

    if (hasSite) {
      warn.hidden = true;
      warn.textContent = "";
      updateApplyAllBtnState();
      return;
    }

    const results = el("advSceneResults");
    if (results) results.innerHTML = "";
    showMsg("", "");

    warn.textContent = isSingleSiteMode() ? "请先选择站点" : "请至少勾选一个站点";
    warn.hidden = false;
  }

  function updateSiteSelectionHint() {
    const tag = el("advSiteSelectTag");
    const bubble = el("advSiteSelectHelpBubble");
    if (!tag || !bubble) return;

    if (isSingleSiteMode()) {
      tag.textContent = "（仅单选）";
      bubble.textContent =
        "此模式下需按所选站点的本地货币填写预期售价，每次只能选择一个站点，系统将据此计算净利润与净利润率。";
      return;
    }

    tag.textContent = "（可多选）";
    const mode = getCurrentMode();
    if (mode === "profit") {
      bubble.textContent =
        "可同时勾选多个站点渠道，使用相同的成本、预期净利润等参数，一键批量计算各站点的售价与净利润率。";
    } else {
      bubble.textContent =
        "可同时勾选多个站点渠道，使用相同的成本、预期净利润率等参数，一键批量计算各站点的售价与净利润。";
    }
  }

  function updateSellingPriceHint() {
    const hint = el("advSellingPriceHint");
    const unit = el("advSellingUnit");
    const prefix = el("advSellingPrefix");
    if (!hint) return;
    const siteId = firstActiveSiteId();
    if (!siteId) {
      if (unit) unit.textContent = "—";
      if (prefix) prefix.textContent = "—";
      hint.textContent = "≈ 0 CNY";
      return;
    }
    const site = advancedSiteConfigs[siteId];
    const rate = getSiteExchangeRate(siteId);
    if (unit && site) unit.textContent = site.currencyCode;
    if (prefix && site) prefix.textContent = site.currency;
    const input = el("advSceneSellingPrice");
    const val = input ? parseFloat(input.value) : NaN;
    const code = site ? site.currencyCode : "";
    if (!isNaN(val) && val > 0) {
      hint.textContent = "≈ " + advFmtMoney(val / rate) + " CNY | " + code;
    } else {
      hint.textContent = "≈ 0 CNY | " + code;
    }
  }

  function updateSellingPriceCNY() { updateSellingPriceHint(); }

  /* ── Input reading ── */

  function readInputs() {
    const mode = el("advSceneMode").value;
    const costStr = el("advSceneCost").value.trim();
    const weightStr = el("advSceneWeight").value.trim();
    const discountStr = el("advSceneDiscount").value.trim();
    const selections = getActiveSelections();

    if (!selections.length) {
      return { error: mode === "sellingPrice" ? "请先选择站点" : "请至少勾选一个站点" };
    }
    if (mode === "sellingPrice" && selections.length > 1) {
      return { error: "预期售价模式下只能选择一个站点" };
    }

    if (!costStr) return { error: "请填写商品成本价" };
    const cost = parseFloat(costStr);
    if (isNaN(cost) || cost < 0) return { error: "商品成本价无效" };

    const weight = weightStr === "" ? 0 : parseFloat(weightStr);
    if (weightStr !== "" && (isNaN(weight) || weight < 0)) return { error: "包裹重量无效" };

    let modeValue;
    if (mode === "sellingPrice") {
      const spStr = el("advSceneSellingPrice").value.trim();
      if (!spStr) return { error: "请填写预期折后售价" };
      modeValue = parseFloat(spStr);
      if (isNaN(modeValue) || modeValue < 0) return { error: "预期折后售价无效" };
    }

    const discount = discountStr === "" ? 0 : parseFloat(discountStr);
    if (discountStr !== "" && (isNaN(discount) || discount < 0 || discount >= 100)) {
      return { error: "折扣须在 0–99 之间" };
    }

    const domesticStr = el("advSceneDomesticShipping").value.trim();
    const domesticShipping = domesticStr === "" ? undefined : parseFloat(domesticStr);
    if (domesticStr !== "" && (isNaN(domesticShipping) || domesticShipping < 0)) {
      return { error: "境内段运费无效" };
    }

    return { mode, cost, weight, modeValue, discount, domesticShipping, selections };
  }

  /* ── Results ── */

  function copyBtn(text, label) {
    return (
      '<button type="button" class="adv-btn-copy" data-copy="' + text +
      '" title="复制' + label + '" aria-label="复制' + label + '">' + COPY_ICON + "</button>"
    );
  }

  function buildSiteModeInputRow(sel, mode, effectiveValue) {
    if (mode !== "profit" && mode !== "profitRate") return "";
    const label = mode === "profit" ? "预期净利润 (CNY)" : "预期净利润率 (%)";
    const displayVal = effectiveValue != null && !isNaN(effectiveValue) ? effectiveValue : "";
    return (
      '<div class="adv-result-mode-field">' +
      '<label>' + label + "</label>" +
      '<input type="text" class="adv-result-mode-value" data-site="' + esc(sel.siteId) + '" ' +
      'value="' + esc(String(displayVal)) + '" inputmode="decimal" autocomplete="off"></div>'
    );
  }

  function getSecondaryMetric(mode, result) {
    if (mode === "profit") {
      return { label: "净利润率", value: advFmtMoney(result.profitRate) + "%" };
    }
    if (mode === "profitRate") {
      return { label: "净利润", value: advFmtMoney(result.profit) + " CNY" };
    }
    if (mode === "sellingPrice") {
      return { label: "净利润率", value: advFmtMoney(result.profitRate) + "%" };
    }
    return null;
  }

  function fmtLocalCny(local, cny, cur) {
    return advFmtMoney(local) + cur + " ≈ " + advFmtMoney(cny) + " CNY";
  }

  function buildDetailedBreakdownMetrics(mode, result) {
    const cur = result.currency;
    const b = result.breakdown;
    if (!b) return buildAuxiliaryMetrics(mode, result);

    const items = [
      {
        label: "折前",
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

  function buildAuxiliaryMetrics(mode, result) {
    const cur = result.currency;
    const freight = {
      label: "藏价运费",
      value: advFmtMoney(result.hiddenFreightLocal) + cur +
        " ≈ " + advFmtMoney(result.hiddenFreightCNY) + " CNY",
    };

    if (mode === "sellingPrice") {
      return [
        { label: "折前", value: cur + advFmtMoney(result.originalPrice) },
        { label: "折后售价", value: cur + advFmtMoney(result.targetPrice) },
        freight,
      ];
    }

    const items = [
      { label: "折后售价", value: cur + advFmtMoney(result.targetPrice) },
      freight,
    ];

    if (mode === "profit") {
      items.push({ label: "净利润", value: advFmtMoney(result.profit) + " CNY" });
    } else if (mode === "profitRate") {
      items.push({ label: "净利润率", value: advFmtMoney(result.profitRate) + "%" });
    }

    return items;
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

  function buildResultMainSection(mode, result, main) {
    const secondary = getSecondaryMetric(mode, result);
    const secondaryRow = secondary
      ? '<div class="adv-result-sub-metric adv-result-sub-metric--left">' +
        '<span class="adv-result-sub-metric-text">' +
        esc(secondary.label) + " " + secondary.value +
        "</span>" +
        buildMoreInfoTip(mode, result) +
        "</div>"
      : "";

    if (mode === "profit" || mode === "profitRate") {
      return (
        '<div class="adv-result-main">' +
        '<div class="adv-result-price-block adv-result-price-block--left">' +
        '<div class="adv-result-price-line">' +
        '<span class="adv-result-price-tag adv-result-price-tag--inline">折前</span>' +
        '<span class="adv-result-main-value">' + main.display + "</span>" +
        copyBtn(main.copy, main.label) +
        "</div>" +
        secondaryRow +
        "</div></div>"
      );
    }

    return (
      '<div class="adv-result-main">' +
      '<div class="adv-result-price-block adv-result-price-block--left">' +
      '<div class="adv-result-price-line">' +
      '<span class="adv-result-main-value">' + main.display + "</span>" +
      copyBtn(main.copy, main.label) +
      "</div>" +
      secondaryRow +
      "</div></div>"
    );
  }

  function getMainMetric(mode, result) {
    if (mode === "sellingPrice") {
      return {
        label: "净利润",
        display: advFmtMoney(result.profit) + " CNY",
        copy: advFmtMoney(result.profit),
      };
    }
    return {
      label: "折前",
      display: result.currency + advFmtMoney(result.originalPrice),
      copy: advFmtMoney(result.originalPrice),
    };
  }

  function buildResultCard(sel, result, mode, effectiveModeValue) {
    const site = advancedSiteConfigs[sel.siteId];
    const headLabel = site
      ? siteIconTagHtml(sel.siteId) + esc(site.name) + " " + esc(site.currency)
      : esc(sel.siteId);

    if (result.error) {
      return (
        '<div class="adv-result-card ' + (site ? site.css : "") + ' error-card" data-site="' + esc(sel.siteId) + '">' +
        '<div class="adv-result-head">' + headLabel + "</div>" +
        buildSiteModeInputRow(sel, mode, effectiveModeValue) +
        '<div class="adv-result-error">' + result.error + "</div></div>"
      );
    }

    const main = getMainMetric(mode, result);

    return (
      '<div class="adv-result-card ' + result.css + ' mode-' + mode + '" data-site="' + esc(sel.siteId) + '">' +
      '<div class="adv-result-head">' + headLabel + "</div>" +
      buildSiteModeInputRow(sel, mode, effectiveModeValue) +
      buildResultMainSection(mode, result, main) +
      "</div>"
    );
  }

  function bindResultModeInputs() {
    document.querySelectorAll("#advSceneResults .adv-result-mode-value").forEach(function (input) {
      input.addEventListener("input", function () {
        const siteId = input.dataset.site;
        const mode = getCurrentMode();
        const raw = input.value.trim();
        if (!raw) return;
        const val = parseFloat(raw);
        if (isNaN(val) || val < 0) return;
        if (mode === "profitRate" && val >= 100) return;
        siteModeOverrides[siteId] = val;
        scheduleRecalculate(true);
      });
    });
  }

  function bindCopyButtons() {
    document.querySelectorAll("#advSceneResults .adv-btn-copy").forEach(function (btn) {
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
    const inputs = readInputs();
    if (inputs.error) {
      const container = el("advSceneResults");
      if (container) container.innerHTML = "";
      if (SITE_SELECTION_ERRORS.indexOf(inputs.error) === -1) {
        showMsg(inputs.error, "error");
      } else {
        showMsg("", "");
      }
      return;
    }

    const container = el("advSceneResults");
    if (!container) return;

    let focusSite = null;
    let selStart = 0;
    let selEnd = 0;
    if (options.preserveFocus) {
      const active = document.activeElement;
      if (active && active.classList.contains("adv-result-mode-value")) {
        focusSite = active.dataset.site;
        selStart = active.selectionStart;
        selEnd = active.selectionEnd;
      }
    }

    const mode = inputs.mode;
    const cards = inputs.selections.map(function (sel) {
      const modeValue = getEffectiveModeValue(sel.siteId, mode);
      if (isNaN(modeValue) || modeValue < 0) {
        const err = mode === "profit"
          ? "请填写预期净利润"
          : mode === "profitRate"
            ? "请填写预期净利润率"
            : "请填写预期折后售价";
        return buildResultCard(sel, { error: err }, mode, modeValue);
      }
      if (mode === "profitRate" && modeValue >= 100) {
        return buildResultCard(sel, { error: "净利润率须小于 100%" }, mode, modeValue);
      }

      const result = calculateAdvancedScene({
        siteId: sel.siteId,
        cargoType: sel.cargoType,
        channelName: sel.channelName,
        weight: inputs.weight,
        cost: inputs.cost,
        mode: mode,
        modeValue: modeValue,
        discount: inputs.discount,
        domesticShipping: inputs.domesticShipping,
      });
      return buildResultCard(sel, result, mode, modeValue);
    });

    container.innerHTML = cards.join("");
    bindCopyButtons();
    bindResultModeInputs();
    showMsg("", "");

    if (focusSite) {
      const input = container.querySelector('.adv-result-mode-value[data-site="' + focusSite + '"]');
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(selStart, selEnd);
        } catch (_e) { /* ignore */ }
      }
    }
  }

  /* ── Init ── */

  function initChannelSelections() {
    channelSelections.length = 0;
    const def = getDefaultChannelForSite("SG");
    if (def) {
      const record = buildSelectionRecord("SG", def.cargoType, def.channelId, def.zone);
      if (record) channelSelections.push(record);
    }
  }

  function syncDomesticShippingDefault() {
    const input = el("advSceneDomesticShipping");
    if (!input || input.dataset.userEdited === "1") return;
    const fees = getAdvancedSiteFees(firstActiveSiteId() || "SG");
    if (fees) input.value = fees.domesticShipping;
  }

  function bindStep3Events() {
    const domesticInput = el("advSceneDomesticShipping");
    if (domesticInput) {
      domesticInput.addEventListener("input", function () {
        domesticInput.dataset.userEdited = "1";
        scheduleRecalculate();
      });
    }
    const configLink = el("advGoConfigLink");
    if (configLink) {
      configLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (typeof window.openSiteSettingsDrawer === "function") {
          window.openSiteSettingsDrawer();
        }
      });
    }
  }

  function bindRealtimeInputEvents() {
    [
      "advSceneCost", "advSceneModeValue", "advSceneDiscount", "advSceneWeight",
    ].forEach(function (id) {
      const node = el(id);
      if (node) node.addEventListener("input", scheduleRecalculate);
    });

    const applyBtn = el("advApplyModeAllBtn");
    if (applyBtn) applyBtn.addEventListener("click", applyModeValueToAllSites);
  }

  function bootAdvancedScene() {
    loadPersistedState(STORAGE.advancedScene, function (saved) {
      const hasChannels = applyLoadedFormState(saved);
      if (!hasChannels) initChannelSelections();
      if (isSingleSiteMode()) enforceSingleSiteSelection();
      renderTagStream();
      bindSiteChannelEvents();
      bindStep3Events();
      bindRealtimeInputEvents();
      updateModeFields();
      updateStep2SiteState();
      syncDomesticShippingDefault();

      const sellingInput = el("advSceneSellingPrice");
      if (sellingInput) {
        sellingInput.addEventListener("input", function () {
          updateSellingPriceCNY();
          scheduleRecalculate();
        });
      }

      scheduleRecalculate();
    });
  }

  function initAdvancedScene() {
    if (!el("page-advanced")) return;

    const modeSelect = el("advSceneMode");
    if (modeSelect) {
      modeSelect.innerHTML = MODE_OPTIONS.map(function (o) {
        return '<option value="' + o.value + '">' + o.label + "</option>";
      }).join("");
      modeSelect.addEventListener("change", function () {
        clearSiteModeOverrides();
        updateModeFields();
        scheduleRecalculate();
      });
    }

    document.addEventListener("shopee-remote-config-updated", function () {
      reconcileChannelSelections();
      renderTagStream();
      scheduleRecalculate();
    });

    document.addEventListener("shopee-shipping-data-updated", function () {
      reconcileChannelSelections();
      renderTagStream();
      scheduleRecalculate();
    });

    if (typeof window.__remoteConfigReady !== "undefined") {
      window.__remoteConfigReady.finally(bootAdvancedScene);
    } else if (typeof window.__shippingDataReady !== "undefined") {
      window.__shippingDataReady.finally(bootAdvancedScene);
    } else {
      bootAdvancedScene();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdvancedScene);
  } else {
    initAdvancedScene();
  }
})();
