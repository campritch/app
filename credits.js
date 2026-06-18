/* SpotsNow — Clay-style credit system (drop-in)
   Usage:
     <link rel="stylesheet" href="/credits.css" />
     <script src="/credits.js"></script>
     <div data-credit-pill></div>
     <script>
       SpotsNowCredits.mount();           // mounts pill, paywall, toast
       SpotsNowCredits.consume("search"); // -1 credit; returns true if allowed
     </script>
*/
(function () {
  const STORAGE = "spotsnow.credits.v2";
  const SELECTED_TIER_KEY = "spotsnow.credits.tier.v1";
  const DEFAULT_FREE = 10;
  const LOW_THRESHOLD = 3;
  const WORKSPACE_NAME = "spotsnow.io";

  const TIERS = [
    { id: "starter", name: "Starter", credits: 25,  price: 19,  oldPrice: null, popular: false },
    { id: "pro",     name: "Pro",     credits: 100, price: 59,  oldPrice: 76,   popular: true,  save: "Save 22%" },
    { id: "scale",   name: "Scale",   credits: 500, price: 199, oldPrice: 380,  popular: false, save: "Save 47%" },
  ];

  /* ── State ─────────────────────────────────────────── */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return { used: 0, max: DEFAULT_FREE, rolloverISO: nextMonthFirstISO() };
      const parsed = JSON.parse(raw);
      if (typeof parsed.used !== "number" || typeof parsed.max !== "number") {
        return { used: 0, max: DEFAULT_FREE, rolloverISO: nextMonthFirstISO() };
      }
      if (!parsed.rolloverISO) parsed.rolloverISO = nextMonthFirstISO();
      return parsed;
    } catch {
      return { used: 0, max: DEFAULT_FREE, rolloverISO: nextMonthFirstISO() };
    }
  }
  function saveState() { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  function remaining() { return Math.max(0, state.max - state.used); }
  function nextMonthFirstISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0).toISOString();
  }
  function formatRollover(iso) {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    return `${date}, ${time}`;
  }

  let state = loadState();
  let selectedTierId = "pro";
  let lastSearchSig = "";

  /* ── DOM ───────────────────────────────────────────── */
  const ICON_COIN = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="12" cy="6" rx="9" ry="3"/>
      <path d="M3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6"/>
      <path d="M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
    </svg>`;
  const ICON_INFO = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  const ICON_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const ICON_BOLT = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const ICON_X = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  let pillEl, popEl, popBarFill, popAvailEl, popAvailTotalEl, popMetaTextEl;
  let modalEl, tierGridEl, footerTotalEl, footerDetailEl, modalEyebrowText, modalTitleEl, modalSubEl;
  let toastEl, toastText;

  function renderPill(mountEl) {
    mountEl.classList.add("sn-pop-wrap");
    mountEl.innerHTML = `
      <button class="sn-credit-pill" type="button" aria-haspopup="true" aria-expanded="false" data-sn-pill>
        <span class="sn-credit-pill__icon" style="color: var(--sn-green-text);">${ICON_COIN}</span>
        <span class="sn-credit-pill__label">Credits</span>
        <span class="sn-credit-pill__badge" data-sn-pill-badge>${remaining()}</span>
      </button>
      <div class="sn-pop" role="dialog" data-sn-pop>
        <div class="sn-pop__head">
          <span class="sn-pop__icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#ff6b6b"><circle cx="12" cy="12" r="6"/></svg>
          </span>
          <span class="sn-pop__workspace">${WORKSPACE_NAME}</span>
          <span class="sn-pop__avail">
            <b data-sn-avail>${remaining()}</b><span class="sn-pop__avail-sep"> available / </span><span class="sn-pop__avail-total" data-sn-total>${state.max}</span>
          </span>
        </div>
        <div class="sn-pop__bar">
          <div class="sn-pop__bar-fill" data-sn-bar style="width: ${(remaining() / state.max) * 100}%"></div>
        </div>
        <div class="sn-pop__meta">
          <span class="sn-pop__meta-icon">${ICON_INFO}</span>
          <span data-sn-meta>${state.max} credits will rollover on ${formatRollover(state.rolloverISO)}.</span>
        </div>
        <div class="sn-pop__actions">
          <button class="sn-pop__btn" data-sn-action="usage" type="button">View usage</button>
          <button class="sn-pop__btn sn-pop__btn--primary" data-sn-action="plans" type="button">View plan options</button>
        </div>
      </div>`;

    pillEl = mountEl.querySelector("[data-sn-pill]");
    popEl = mountEl.querySelector("[data-sn-pop]");
    popBarFill = mountEl.querySelector("[data-sn-bar]");
    popAvailEl = mountEl.querySelector("[data-sn-avail]");
    popAvailTotalEl = mountEl.querySelector("[data-sn-total]");
    popMetaTextEl = mountEl.querySelector("[data-sn-meta]");

    pillEl.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePop();
    });
    document.addEventListener("click", (e) => {
      if (!mountEl.contains(e.target)) closePop();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePop();
    });
    mountEl.querySelector('[data-sn-action="plans"]').addEventListener("click", () => {
      closePop();
      openPaywall(false);
    });
    mountEl.querySelector('[data-sn-action="usage"]').addEventListener("click", () => {
      showToast(`${state.used} of ${state.max} credits used this month`);
    });

    refreshPill();
  }

  function togglePop() { popEl.classList.contains("is-open") ? closePop() : openPop(); }
  function openPop() {
    popEl.classList.add("is-open");
    pillEl.setAttribute("aria-expanded", "true");
    refreshPop();
  }
  function closePop() {
    popEl.classList.remove("is-open");
    pillEl.setAttribute("aria-expanded", "false");
  }

  function refreshPill() {
    if (!pillEl) return;
    const left = remaining();
    pillEl.querySelector("[data-sn-pill-badge]").textContent = left;
    pillEl.classList.toggle("is-low", left > 0 && left <= LOW_THRESHOLD);
    pillEl.classList.toggle("is-empty", left === 0);
  }
  function refreshPop() {
    if (!popEl) return;
    const left = remaining();
    popAvailEl.textContent = left;
    popAvailTotalEl.textContent = state.max;
    popBarFill.style.width = `${(left / state.max) * 100}%`;
    popEl.classList.toggle("is-low", left > 0 && left <= LOW_THRESHOLD);
    popEl.classList.toggle("is-empty", left === 0);
    popMetaTextEl.textContent = `${state.max} credits will rollover on ${formatRollover(state.rolloverISO)}.`;
  }

  /* ── Paywall modal ─────────────────────────────────── */
  function ensureModal() {
    if (modalEl) return;
    const wrap = document.createElement("div");
    wrap.className = "sn-modal-back";
    wrap.setAttribute("data-sn-modal", "");
    wrap.innerHTML = `
      <div class="sn-modal" role="dialog" aria-labelledby="sn-modal-title">
        <button class="sn-modal__close" data-sn-close type="button" aria-label="Close">${ICON_X}</button>
        <div class="sn-modal__head">
          <span class="sn-modal__eyebrow"><span style="display:inline-flex;">${ICON_BOLT}</span><span data-sn-eyebrow>Top up your searches</span></span>
          <h2 class="sn-modal__title" id="sn-modal-title" data-sn-title>Pick a credit pack</h2>
          <p class="sn-modal__sub" data-sn-sub>Credits never expire. Use them across brand, show and industry searches.</p>
        </div>
        <div class="sn-modal__body">
          <div class="sn-tier-grid" data-sn-tier-grid></div>
          <div class="sn-modal__trust">
            <span>${ICON_CHECK} Credits never expire</span>
            <span>${ICON_CHECK} Refundable within 14 days</span>
            <span>${ICON_CHECK} 1 credit = 1 deep search across 85K shows</span>
            <span>${ICON_CHECK} Volume discount auto-applied</span>
          </div>
        </div>
        <div class="sn-modal__foot">
          <div>
            <div class="sn-modal__total" data-sn-total-price>$59</div>
            <div class="sn-modal__total-detail" data-sn-total-detail>100 credits · $0.59 / search</div>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="sn-btn-ghost" data-sn-close type="button">Maybe later</button>
            <button class="sn-btn-primary" data-sn-checkout type="button">
              Continue to payment
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    modalEl = wrap;
    tierGridEl = wrap.querySelector("[data-sn-tier-grid]");
    footerTotalEl = wrap.querySelector("[data-sn-total-price]");
    footerDetailEl = wrap.querySelector("[data-sn-total-detail]");
    modalEyebrowText = wrap.querySelector("[data-sn-eyebrow]");
    modalTitleEl = wrap.querySelector("[data-sn-title]");
    modalSubEl = wrap.querySelector("[data-sn-sub]");

    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closePaywall();
      const action = e.target.closest("[data-sn-close]");
      if (action) closePaywall();
      const checkout = e.target.closest("[data-sn-checkout]");
      if (checkout) {
        localStorage.setItem(SELECTED_TIER_KEY, selectedTierId);
        window.location.href = `/payment.html?tier=${selectedTierId}&return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
    });
  }

  function renderTiers() {
    tierGridEl.innerHTML = "";
    TIERS.forEach((t) => {
      const perCredit = (t.price / t.credits).toFixed(2);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sn-tier" + (t.popular ? " sn-tier--popular" : "") + (selectedTierId === t.id ? " is-selected" : "");
      btn.innerHTML = `
        ${t.popular ? '<span class="sn-tier__badge">Most popular</span>' : ''}
        <span class="sn-tier__radio"></span>
        <span class="sn-tier__name">${t.name}</span>
        <div>
          <div class="sn-tier__credits">${t.credits.toLocaleString()}</div>
          <div class="sn-tier__credits-label">credits</div>
        </div>
        ${t.save ? `<span class="sn-tier__save">${t.save}</span>` : ''}
        <div class="sn-tier__price-row">
          <span class="sn-tier__price">$${t.price}</span>
          ${t.oldPrice ? `<span class="sn-tier__price-old">$${t.oldPrice}</span>` : ''}
          <span class="sn-tier__per">$${perCredit} / search</span>
        </div>`;
      btn.addEventListener("click", () => {
        selectedTierId = t.id;
        renderTiers();
        renderFooter();
      });
      tierGridEl.appendChild(btn);
    });
  }
  function renderFooter() {
    const t = TIERS.find(x => x.id === selectedTierId) || TIERS[1];
    footerTotalEl.textContent = `$${t.price}`;
    footerDetailEl.textContent = `${t.credits} credits · $${(t.price / t.credits).toFixed(2)} / search`;
  }

  function openPaywall(outOfCredits) {
    ensureModal();
    if (outOfCredits) {
      modalEyebrowText.textContent = "You're out of searches";
      modalTitleEl.textContent = "Top up to keep exploring";
      modalSubEl.textContent = "You've used all your free searches. Pick a credit pack to keep going — credits never expire.";
    } else {
      modalEyebrowText.textContent = "Top up your searches";
      modalTitleEl.textContent = "Pick a credit pack";
      modalSubEl.textContent = "Credits never expire. Use them across brand, show and industry searches.";
    }
    renderTiers();
    renderFooter();
    modalEl.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closePaywall() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  /* ── Toast ─────────────────────────────────────────── */
  function ensureToast() {
    if (toastEl) return;
    toastEl = document.createElement("div");
    toastEl.className = "sn-toast";
    toastEl.innerHTML = `<span class="sn-toast__dot"></span><span data-sn-toast-text></span>`;
    document.body.appendChild(toastEl);
    toastText = toastEl.querySelector("[data-sn-toast-text]");
  }
  let toastTimer;
  function showToast(text) {
    ensureToast();
    toastText.textContent = text;
    toastEl.classList.add("is-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-open"), 1800);
  }

  /* ── Public API ────────────────────────────────────── */
  function consume(label) {
    if (remaining() <= 0) {
      openPaywall(true);
      return false;
    }
    state.used += 1;
    saveState();
    refreshPill();
    refreshPop();
    showToast(`-1 credit · ${remaining()} left`);
    if (remaining() === 0) setTimeout(() => openPaywall(true), 350);
    return true;
  }

  /* Charge once per unique signature — deduplicates rapid duplicate searches */
  function consumeIfNew(signature, label) {
    if (signature === lastSearchSig) return true;
    const ok = consume(label);
    if (ok) lastSearchSig = signature;
    return ok;
  }

  function grant(n) {
    state.max += n;
    saveState();
    refreshPill();
    refreshPop();
  }

  function handleReturnFromPayment() {
    const params = new URLSearchParams(window.location.search);
    const granted = params.get("topup");
    if (!granted) return;
    const t = TIERS.find(x => x.id === granted);
    if (t) {
      grant(t.credits);
      ensureToast();
      showToast(`+${t.credits} credits added`);
      const url = new URL(window.location.href);
      url.searchParams.delete("topup");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }

  function mountPill(el) {
    if (!el) return;
    renderPill(el);
  }

  function mount(opts) {
    opts = opts || {};
    const el = opts.el || document.querySelector("[data-credit-pill]");
    if (el) renderPill(el);
    ensureToast();
    handleReturnFromPayment();
  }

  window.SpotsNowCredits = {
    mount,
    mountPill,
    consume,
    consumeIfNew,
    grant,
    openPaywall,
    closePaywall,
    showToast,
    handleReturnFromPayment,
    remaining,
    state: () => ({ ...state }),
    TIERS: TIERS.slice(),
  };
})();
