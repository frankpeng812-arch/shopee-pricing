const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

/** 卖家共创群微信二维码 */
const COMMUNITY_QR_URL = "images/community-wechat-qr.png";

const MSG_TYPES = new Set(["error", "success", "warn"]);

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  const extras = [...el.classList].filter((c) => c !== "message" && !MSG_TYPES.has(c));
  el.className = ["message", ...extras, type].filter(Boolean).join(" ");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

function flashCopyBtn(btn) {
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 800);
}

function initCopyButtons(root) {
  const scope = root || document;
  scope.querySelectorAll(".btn-copy").forEach((btn) => {
    if (!btn.innerHTML.trim()) btn.innerHTML = COPY_ICON;
    if (btn.dataset.copyBound) return;
    btn.dataset.copyBound = "1";
    btn.addEventListener("click", async () => {
      if (btn.disabled || !btn.dataset.copyText) return;
      const ok = await copyText(btn.dataset.copyText);
      if (ok) flashCopyBtn(btn);
    });
  });
}

/* ========== 导航 ========== */
const SUB_PAGES = {
  advanced: { parent: "more", title: "定价模拟器" },
  calculator: { parent: "more", title: "老品跨站定价" },
  deliveryUrge: { parent: "more", title: "派件异常催取" },
};

function updateNavChrome(tab) {
  const sub = SUB_PAGES[tab];
  const stickyBar = document.querySelector(".app-sticky-bar");
  const titleEl = document.getElementById("subpageHeaderTitle");
  const advHeaderActions = document.getElementById("advSubpageHeaderActions");
  const mspHeaderActions = document.getElementById("mspSubpageHeaderActions");
  const duHeaderActions = document.getElementById("duSubpageHeaderActions");
  const advIntro = document.getElementById("advSubpageIntro");
  const mspIntro = document.getElementById("mspSubpageIntro");
  const duIntro = document.getElementById("duSubpageIntro");

  stickyBar.classList.toggle("is-subpage", !!sub);
  if (sub && titleEl) titleEl.textContent = sub.title;
  if (advHeaderActions) advHeaderActions.hidden = tab !== "advanced";
  if (mspHeaderActions) mspHeaderActions.hidden = tab !== "calculator";
  if (duHeaderActions) duHeaderActions.hidden = tab !== "deliveryUrge";
  if (advIntro) advIntro.hidden = tab !== "advanced";
  if (mspIntro) mspIntro.hidden = tab !== "calculator";
  if (duIntro) duIntro.hidden = tab !== "deliveryUrge";
}

function switchTab(tab) {
  closeMoreModal();
  updateNavChrome(tab);
  document.querySelectorAll(".page").forEach((p) =>
    p.classList.toggle("active", p.id === "page-" + tab)
  );

  if (SUB_PAGES[tab]) {
    savePref(STORAGE.moreSubpage, tab);
  } else if (tab === "more") {
    localStorage.removeItem(STORAGE.moreSubpage);
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(STORAGE.moreSubpage);
    }
  }

  savePref(STORAGE.tab, tab);

  if (tab === "deliveryUrge" && typeof window.deliveryUrgeOnPageEnter === "function") {
    window.deliveryUrgeOnPageEnter();
  }
}

function resolveNavTab(requestedTab) {
  if (requestedTab === "more") {
    const sub = localStorage.getItem(STORAGE.moreSubpage);
    if (sub && SUB_PAGES[sub]) return sub;
  }
  if (requestedTab === "config") return "more";
  return requestedTab;
}

document.getElementById("subpageBackBtn").addEventListener("click", () => {
  const activePage = document.querySelector(".page.active");
  if (!activePage) return;
  const tab = activePage.id.replace("page-", "");
  const sub = SUB_PAGES[tab];
  if (sub) {
    localStorage.removeItem(STORAGE.moreSubpage);
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(STORAGE.moreSubpage);
    }
    switchTab(sub.parent);
  }
});

/* ========== 更多能力页 ========== */
function closeMoreModal() {
  const modal = document.getElementById("moreModal");
  if (modal) modal.hidden = true;
}

function showCommunityQrModal(title) {
  const body = document.getElementById("moreModalBody");
  const modal = document.getElementById("moreModal");
  if (!body || !modal) return;

  body.innerHTML = `
    <p class="more-modal-label">${title || "联系我们"}</p>
    <img class="more-modal-qr" src="${COMMUNITY_QR_URL}" alt="微信扫码联系" width="220" height="220">`;

  modal.hidden = false;
}

window.showCommunityQrModal = showCommunityQrModal;

function initMorePage() {
  document.getElementById("moreAdvancedBtn").addEventListener("click", () => switchTab("advanced"));
  document.getElementById("moreMultiSiteBtn").addEventListener("click", () => switchTab("calculator"));
  document.getElementById("moreDeliveryUrgeBtn").addEventListener("click", () => switchTab("deliveryUrge"));
  document.getElementById("moreSiteSettingsLink")?.addEventListener("click", () => openSiteSettingsDrawer("fees"));
  document.getElementById("moreCommunityBtn").addEventListener("click", () => showCommunityQrModal("联系我们"));
  document.getElementById("moreModalClose").addEventListener("click", closeMoreModal);
  document.getElementById("moreModalBackdrop").addEventListener("click", closeMoreModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMoreModal();
  });
}

function initAdvPageDisclaimer() {
  document.querySelectorAll(".adv-page-disclaimer").forEach((banner) => {
    const toggle = banner.querySelector(".adv-page-disclaimer-toggle");
    if (!toggle) return;

    const setExpanded = (expanded) => {
      banner.classList.toggle("is-expanded", expanded);
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    };

    toggle.addEventListener("click", () => {
      setExpanded(!banner.classList.contains("is-expanded"));
    });

    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpanded(!banner.classList.contains("is-expanded"));
      }
    });

    banner.querySelectorAll(".adv-page-disclaimer-link:not(.adv-page-disclaimer-settings-btn)").forEach((link) => {
      link.addEventListener("click", (e) => e.stopPropagation());
    });

    banner.querySelectorAll(".adv-page-disclaimer-settings-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSiteSettingsDrawer("fees");
      });
    });
  });
}

let activeSubpageIntroTip = null;

function positionSubpageIntroBubble(btn) {
  const bubble = btn.querySelector(".subpage-intro-bubble");
  if (!bubble) return;

  activeSubpageIntroTip = btn;
  bubble.classList.add("is-placed");
  bubble.style.top = "0px";
  bubble.style.left = "0px";
  bubble.style.visibility = "hidden";
  bubble.style.opacity = "0";

  const btnRect = btn.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const gap = 8;
  const vpPad = 10;
  const spaceBelow = window.innerHeight - btnRect.bottom - gap - vpPad;
  const spaceAbove = btnRect.top - gap - vpPad;
  const placeBottom = spaceBelow >= bubbleRect.height || spaceBelow >= spaceAbove;

  let top;
  bubble.classList.toggle("is-bottom", placeBottom);
  bubble.classList.toggle("is-top", !placeBottom);

  if (placeBottom) {
    top = btnRect.bottom + gap;
  } else {
    top = btnRect.top - bubbleRect.height - gap;
  }

  top = Math.max(vpPad, Math.min(top, window.innerHeight - bubbleRect.height - vpPad));

  let left = btnRect.left + btnRect.width / 2 - bubbleRect.width / 2;
  left = Math.max(vpPad, Math.min(left, window.innerWidth - bubbleRect.width - vpPad));

  const arrowLeft = btnRect.left + btnRect.width / 2 - left;
  bubble.style.setProperty("--bubble-arrow-left", `${arrowLeft}px`);
  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
  bubble.style.visibility = "";
  bubble.style.opacity = "";
}

function hideSubpageIntroBubble(btn) {
  const bubble = btn.querySelector(".subpage-intro-bubble");
  if (!bubble) return;
  if (activeSubpageIntroTip === btn) activeSubpageIntroTip = null;
  bubble.classList.remove("is-placed", "is-top", "is-bottom");
  bubble.style.top = "";
  bubble.style.left = "";
  bubble.style.removeProperty("--bubble-arrow-left");
}

function initSubpageIntroTooltips() {
  document.querySelectorAll(".subpage-intro-tip").forEach((btn) => {
    btn.addEventListener("mouseenter", () => positionSubpageIntroBubble(btn));
    btn.addEventListener("focus", () => positionSubpageIntroBubble(btn));
    btn.addEventListener("mouseleave", () => hideSubpageIntroBubble(btn));
    btn.addEventListener("blur", () => hideSubpageIntroBubble(btn));
  });

  window.addEventListener("resize", () => {
    if (activeSubpageIntroTip) positionSubpageIntroBubble(activeSubpageIntroTip);
  });

  window.addEventListener("scroll", () => {
    if (activeSubpageIntroTip) positionSubpageIntroBubble(activeSubpageIntroTip);
  }, true);
}

function switchSiteSettingsTab(tab) {
  const feesPanel = document.getElementById("siteSettingsTabFees");
  const fxPanel = document.getElementById("siteSettingsTabFx");
  const feesBtn = document.getElementById("siteSettingsTabFeesBtn");
  const fxBtn = document.getElementById("siteSettingsTabFxBtn");
  if (!feesPanel || !fxPanel || !feesBtn || !fxBtn) return;

  const isFees = tab !== "fx";
  feesPanel.classList.toggle("active", isFees);
  fxPanel.classList.toggle("active", !isFees);
  feesPanel.hidden = !isFees;
  fxPanel.hidden = isFees;
  feesBtn.classList.toggle("active", isFees);
  fxBtn.classList.toggle("active", !isFees);
  feesBtn.setAttribute("aria-selected", isFees ? "true" : "false");
  fxBtn.setAttribute("aria-selected", !isFees ? "true" : "false");
}

function openSiteSettingsDrawer(tab) {
  const drawer = document.getElementById("siteSettingsDrawer");
  if (!drawer) return;
  renderSiteCards();
  renderFxDisplay(getFxRates());
  switchSiteSettingsTab(tab || "fees");
  drawer.hidden = false;
}

function closeSiteSettingsDrawer() {
  const drawer = document.getElementById("siteSettingsDrawer");
  if (drawer) drawer.hidden = true;
}

window.openSiteSettingsDrawer = openSiteSettingsDrawer;
window.closeSiteSettingsDrawer = closeSiteSettingsDrawer;

function initSiteSettingsDrawer() {
  document.querySelectorAll("#advSiteSettingsBtn, #mspSiteSettingsBtn").forEach((btn) => {
    btn.addEventListener("click", () => openSiteSettingsDrawer("fees"));
  });

  const drawer = document.getElementById("siteSettingsDrawer");
  if (!drawer) return;

  document.querySelectorAll(".site-settings-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchSiteSettingsTab(btn.dataset.tab));
  });

  document.getElementById("siteSettingsDrawerClose")?.addEventListener("click", closeSiteSettingsDrawer);
  document.getElementById("siteSettingsDrawerBackdrop")?.addEventListener("click", closeSiteSettingsDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer && !drawer.hidden) closeSiteSettingsDrawer();
  });
}

const FX_STALE_MS = 24 * 60 * 60 * 1000;

function isFxStale(fx) {
  const at = fx?.fetchedAt || fx?.updatedAt || 0;
  return !at || Date.now() - at > FX_STALE_MS;
}

async function refreshFx() {
  const btn = document.getElementById("refreshFxBtn");
  const ratesEl = document.getElementById("fxRatesDisplay");
  if (!btn || !ratesEl) return;

  btn.disabled = true;
  btn.classList.add("is-loading");
  ratesEl.classList.add("is-loading");
  showMsg("fxMessage", "正在获取汇率…", "");

  try {
    const { fx, error } = await fetchExchangeRates();
    renderFxDisplay(fx);
    if (error) {
      showMsg("fxMessage", error, "warn");
    } else {
      showMsg("fxMessage", "", "");
    }
  } catch (_err) {
    renderFxDisplay(getFxRates());
    showMsg("fxMessage", "获取失败，使用上次保存值", "warn");
  } finally {
    ratesEl.classList.remove("is-loading");
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
}

const SITE_FLAGS = {
  SG: "🇸🇬", MY: "🇲🇾", TH: "🇹🇭", PH: "🇵🇭",
  VN: "🇻🇳", BR: "🇧🇷", MX: "🇲🇽", AR: "🇦🇷",
};

const SITE_LOCATION_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<path d="M12 21s-8-4.5-8-11a8 8 0 1 1 16 0c0 6.5-8 11-8 11z"/>' +
  '<circle cx="12" cy="10" r="3"/></svg>';

const SITE_SHORT_NAMES = {
  SG: "新加坡", MY: "马来", TH: "泰国", PH: "菲律宾",
  VN: "越南", TW: "台湾", BR: "巴西", MX: "墨西哥", AR: "阿根廷",
};

let editingSiteId = null;

function renderSiteIcon(siteId, context) {
  if (siteId === "TW") {
    const cls = context === "fx" ? "fx-location-icon" : "site-row-location-icon";
    return `<span class="${cls}">${SITE_LOCATION_ICON}</span>`;
  }
  const flag = SITE_FLAGS[siteId] || "";
  const cls = context === "fx" ? "fx-flag" : "site-row-flag";
  return `<span class="${cls}">${flag}</span>`;
}

function siteDrawerTitlePrefix(siteId) {
  if (siteId === "TW") return "📍 ";
  const flag = SITE_FLAGS[siteId] || "";
  return flag ? flag + " " : "";
}

function formatSiteFeeSummary(c) {
  const item = (label, val) =>
    `<span class="site-row-fee"><span class="site-row-fee-label">${label}:</span><span class="site-row-fee-val">${val}%</span></span>`;
  return [
    item("佣金", c.commission),
    item("交易", c.transaction),
    item("活动", c.activity),
    item("提现", c.withdrawal),
    item("技术支持", c.techSupport ?? 0),
  ].join('<span class="site-row-fee-sep">|</span>');
}

function renderSiteDrawerFields(siteId, fees) {
  const fields = [
    { key: "commission", label: "佣金费率 (%)" },
    { key: "transaction", label: "交易手续费 (%)" },
    { key: "activity", label: "活动服务费 (%)" },
    { key: "withdrawal", label: "提现手续费 (%)" },
    { key: "techSupport", label: "技术支持 (%)" },
  ];
  return fields.map(({ key, label }) => `
    <div class="field config-drawer-field">
      <label>${label}</label>
      <input type="number" data-field="${key}" value="${fees[key]}" min="0" step="0.01">
    </div>`).join("");
}

function openSiteDrawer(siteId) {
  const site = CONFIG_SITES.find((s) => s.id === siteId);
  if (!site) return;

  editingSiteId = siteId;
  const cfg = getSitesConfig();
  document.getElementById("siteConfigDrawerTitle").textContent =
    `配置 ${siteDrawerTitlePrefix(siteId)}${site.name} 费率`;
  document.getElementById("siteConfigDrawerBody").innerHTML =
    renderSiteDrawerFields(siteId, cfg[siteId]);

  document.getElementById("siteConfigDrawer").hidden = false;
}

function closeSiteDrawer() {
  document.getElementById("siteConfigDrawer").hidden = true;
  editingSiteId = null;
}

function saveSiteDrawer() {
  if (!editingSiteId) return;

  const saved = loadJSON(STORAGE.sites, null) || {};
  const cfg = getSitesConfig();
  document.querySelectorAll("#siteConfigDrawerBody [data-field]").forEach((inp) => {
    cfg[editingSiteId][inp.dataset.field] = parseFloat(inp.value);
  });
  saved[editingSiteId] = { ...cfg[editingSiteId] };
  if (cfg.domesticShipping != null) saved.domesticShipping = cfg.domesticShipping;
  saveJSON(STORAGE.sites, saved);
  renderSiteCards();
  showMsg("configMessage", "已保存并生效", "success");
  closeSiteDrawer();
}

let activeConfirmBubble = null;

function closeConfirmBubble() {
  if (!activeConfirmBubble) return;
  activeConfirmBubble.remove();
  activeConfirmBubble = null;
  document.removeEventListener("click", onConfirmBubbleOutside, true);
  document.removeEventListener("keydown", onConfirmBubbleEscape);
}

function onConfirmBubbleOutside(e) {
  if (activeConfirmBubble && !activeConfirmBubble.contains(e.target)) {
    closeConfirmBubble();
  }
}

function onConfirmBubbleEscape(e) {
  if (e.key === "Escape") closeConfirmBubble();
}

function positionConfirmBubble(bubble, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const gap = 8;
  const margin = 8;
  const bubbleRect = bubble.getBoundingClientRect();

  let top = rect.top - bubbleRect.height - gap;
  let left = rect.right - bubbleRect.width;
  let placement = "above";

  if (top < margin) {
    top = rect.bottom + gap;
    placement = "below";
  }
  if (left < margin) left = margin;
  if (left + bubbleRect.width > window.innerWidth - margin) {
    left = window.innerWidth - margin - bubbleRect.width;
  }

  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
  bubble.dataset.placement = placement;
}

function showConfirmBubble(anchorEl, message, onConfirm) {
  closeConfirmBubble();

  const bubble = document.createElement("div");
  bubble.className = "confirm-bubble";
  bubble.setAttribute("role", "dialog");
  bubble.innerHTML = `
    <p class="confirm-bubble-text">${message}</p>
    <div class="confirm-bubble-actions">
      <button type="button" class="confirm-bubble-cancel">取消</button>
      <button type="button" class="confirm-bubble-ok">确定</button>
    </div>`;
  document.body.appendChild(bubble);
  activeConfirmBubble = bubble;
  positionConfirmBubble(bubble, anchorEl);

  bubble.querySelector(".confirm-bubble-cancel").addEventListener("click", (e) => {
    e.stopPropagation();
    closeConfirmBubble();
  });
  bubble.querySelector(".confirm-bubble-ok").addEventListener("click", (e) => {
    e.stopPropagation();
    closeConfirmBubble();
    onConfirm();
  });

  requestAnimationFrame(() => {
    document.addEventListener("click", onConfirmBubbleOutside, true);
    document.addEventListener("keydown", onConfirmBubbleEscape);
  });
}

function applySiteDefaultReset(siteId) {
  const site = CONFIG_SITES.find((s) => s.id === siteId);
  if (!site) return;

  const saved = loadJSON(STORAGE.sites, null) || {};
  const defaults = getBundledDefaultSites();
  saved[siteId] = { ...defaults[siteId] };
  if (saved.domesticShipping == null) saved.domesticShipping = defaults.domesticShipping;
  saveJSON(STORAGE.sites, saved);
  renderSiteCards();
  showMsg("configMessage", `${site.name} 已恢复默认`, "success");
}

function resetSiteToDefault(siteId, anchorEl) {
  const site = CONFIG_SITES.find((s) => s.id === siteId);
  if (!site || !anchorEl) return;
  showConfirmBubble(
    anchorEl,
    `确定恢复 ${site.name} 的默认费率？`,
    () => applySiteDefaultReset(siteId)
  );
}

/* ========== 站点配置 ========== */
const CONFIG_REGION_CHEVRON =
  '<svg class="config-region-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M6 9l6 6 6-6"/></svg>';

function renderSiteCards() {
  const cfg = getSitesConfig();
  const siteMap = Object.fromEntries(CONFIG_SITES.map((s) => [s.id, s]));

  document.getElementById("siteCards").innerHTML = CONFIG_REGIONS.map((region) => {
    const rows = region.sites
      .filter((id) => siteMap[id])
      .map((id) => {
        const s = siteMap[id];
        const c = cfg[s.id];
        return `
          <div class="site-row ${s.css}">
            <div class="site-row-head">
              <div class="site-row-left">
                ${renderSiteIcon(s.id)}
                <span class="site-row-name">${s.name}</span>
              </div>
              <div class="site-row-actions">
                <button type="button" class="site-row-reset" data-site="${s.id}">恢复默认</button>
                <button type="button" class="site-row-edit" data-site="${s.id}">⚙️ 编辑</button>
              </div>
            </div>
            <div class="site-row-summary">${formatSiteFeeSummary(c)}</div>
          </div>`;
      })
      .join("");

    return `
      <details class="config-region-panel" open>
        <summary class="config-region-summary">
          <span class="config-region-label">${region.label}</span>
          ${CONFIG_REGION_CHEVRON}
        </summary>
        <div class="config-region-cards">${rows}</div>
      </details>`;
  }).join("");
}

function renderFxDisplay(fx) {
  document.getElementById("fxRatesDisplay").innerHTML = CONFIG_SITES.map((s) => {
    const val = fx[s.rateKey];
    const name = SITE_SHORT_NAMES[s.id] || s.name;
    return `<div class="fx-rate-cell">${renderSiteIcon(s.id, "fx")}<span class="fx-name">${name}</span><strong class="fx-val">${s.symbol}${Number(val).toFixed(4)}</strong></div>`;
  }).join("");

  const atMs = fx.fetchedAt || fx.updatedAt;
  const at = atMs ? new Date(atMs).toLocaleString("zh-CN") : "—";
  document.getElementById("fxUpdatedAt").textContent = atMs ? `更新时间：${at}` : "—";
}

document.getElementById("refreshFxBtn").addEventListener("click", () => refreshFx());

document.getElementById("siteCards").addEventListener("click", (e) => {
  const editBtn = e.target.closest(".site-row-edit");
  if (editBtn) {
    openSiteDrawer(editBtn.dataset.site);
    return;
  }
  const resetBtn = e.target.closest(".site-row-reset");
  if (resetBtn) resetSiteToDefault(resetBtn.dataset.site, resetBtn);
});

document.getElementById("siteConfigDrawerClose").addEventListener("click", closeSiteDrawer);
document.getElementById("siteConfigDrawerBackdrop").addEventListener("click", closeSiteDrawer);
document.getElementById("siteConfigDrawerSave").addEventListener("click", saveSiteDrawer);

function init() {
  if (!localStorage.getItem(STORAGE.sites)) {
    saveJSON(STORAGE.sites, getBundledDefaultSites());
  }

  initCopyButtons();
  renderSiteCards();
  initMorePage();
  initAdvPageDisclaimer();
  initSubpageIntroTooltips();
  initSiteSettingsDrawer();

  const savedTab = localStorage.getItem(STORAGE.tab);
  const validTabs = ["advanced", "calculator", "deliveryUrge", "more"];
  let tab = validTabs.includes(savedTab) ? savedTab : "more";
  if (savedTab === "pricing" || savedTab === "config") {
    tab = savedTab === "config" ? "more" : "advanced";
  } else if (tab === "more") {
    tab = resolveNavTab("more");
  }
  switchTab(tab);

  renderFxDisplay(getFxRates());
  if (isFxStale(getFxRates())) {
    refreshFx();
  }
}

(window.__remoteConfigReady || Promise.resolve()).then(function () {
  preloadChromeStorage(init);
});

document.addEventListener("shopee-remote-config-updated", () => {
  renderSiteCards();
});
