(function () {
  const root = document.documentElement;
  const themeKey = "brettspiele.themeMode";
  const legacyThemeKey = "brettspiele.theme";
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const i18n = window.BFI18N;
  const t = (key, vars, fallback) => i18n?.t(key, vars, fallback) ?? (fallback || key);
  const lv = (value) => i18n?.localizeValue(value) ?? value;

  function getThemeMode() {
    try {
      const mode = localStorage.getItem(themeKey) || "auto";
      return ["auto", "light", "dark"].includes(mode) ? mode : "auto";
    } catch (e) {
      return "auto";
    }
  }

  function resolveTheme(mode) {
    return mode === "auto" ? (media && media.matches ? "dark" : "light") : mode;
  }

  const btn = document.querySelector("[data-theme-toggle]");
  const label = document.querySelector("[data-theme-label]");

  function applyTheme(mode, save = false) {
    mode = ["auto", "light", "dark"].includes(mode) ? mode : "auto";
    const theme = resolveTheme(mode);
    root.dataset.themeMode = mode;
    root.dataset.theme = theme;
    if (save) {
      try { localStorage.setItem(themeKey, mode); } catch (e) {}
    }
    try { localStorage.setItem(legacyThemeKey, theme); } catch (e) {}
    const text = i18n?.describeThemeMode ? i18n.describeThemeMode(mode, theme) : (theme === "dark" ? t("theme.dark") : t("theme.light"));
    if (label) label.textContent = text;
    if (btn) {
      btn.setAttribute("aria-label", t("theme.aria", { mode: text }, `Theme: ${text}`));
      btn.setAttribute("title", `Theme: ${text}`);
    }
    window.dispatchEvent(new CustomEvent("brettspiele-theme-change", { detail: { mode, theme } }));
  }

  function nextThemeMode(mode) {
    return resolveTheme(mode) === "dark" ? "light" : "dark";
  }

  btn?.addEventListener("click", () => {
    applyTheme(nextThemeMode(getThemeMode()), true);
  });

  if (media) {
    const onSystemThemeChange = () => applyTheme(getThemeMode(), false);
    if (media.addEventListener) media.addEventListener("change", onSystemThemeChange);
    else if (media.addListener) media.addListener(onSystemThemeChange);
  }

  applyTheme(getThemeMode(), false);

  // Mobile nav: collapse the action bar (language / theme / play) into a dropdown.
  (function () {
    const nav = document.querySelector(".nav");
    const toggle = document.querySelector("[data-nav-toggle]");
    const actions = document.querySelector("[data-nav-actions]");
    if (!nav || !toggle || !actions) return;
    const setOpen = (open) => {
      nav.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!nav.classList.contains("nav-open"));
    });
    // Close after picking something or tapping outside.
    actions.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    actions.addEventListener("change", () => setOpen(false));
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("nav-open") && !nav.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  })();

  const BUILD_VERSION = "20260722-studio-pub";

  const els = {
    grid: document.querySelector("[data-game-grid]"),
    heroStage: document.querySelector("[data-hero-stage]"),
    heroActions: document.querySelector("[data-hero-actions]"),
    heroKicker: document.querySelector("[data-hero-kicker]"),
    heroLede: document.querySelector("[data-hero-lede]"),
    catalogCount: document.querySelector("[data-catalog-count]"),
    catalogCopy: document.querySelector("[data-catalog-copy]"),
    communitySection: document.querySelector("[data-community-section]"),
    communityGrid: document.querySelector("[data-community-grid]"),
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function addFreshNavigation(scope = document) {
    // Intentionally leave game links as normal, stable URLs.
    // Nginx sends no-cache headers for HTML/JS/CSS, so manual reloads stay on
    // the current page instead of being rewritten to a timestamped URL.
    scope.querySelectorAll("[data-game-link]").forEach((link) => {
      if (link.dataset.freshBound === "1") return;
      link.dataset.freshBound = "1";
      link.addEventListener("click", () => {
        try { sessionStorage.setItem("brettspiele.lastGameHref", link.getAttribute("href") || ""); } catch (e) {}
      });
    });
  }

  function imageUrl(src) {
    // Resolve catalog-relative paths (e.g. "games/x/button.svg") against the
    // site root, not the current page. On localized pages under /en/, /fr/, …
    // a page-relative resolve would request /en/games/x/button.svg (404); the
    // image assets only exist once, at the canonical root location.
    const url = new URL(src || "assets/favicon.svg", window.location.origin + "/");
    url.searchParams.set("v", BUILD_VERSION);
    return url.toString();
  }

  const ratingCache = new Map();

  function starString(value) {
    const n = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    return "★".repeat(n) + "☆".repeat(5 - n);
  }

  function fmtRatingCount(count) {
    const n = Number(count || 0);
    return t("site.rating.count", { count: n }, `${n} ratings`);
  }

  function ratingHtml(game) {
    const r = ratingCache.get(game.id) || game.rating || { average: 0, count: 0, loading: true };
    if (r.loading) return `<div class="catalog-rating" data-game-rating="${escapeHtml(game.id)}"><span class="stars">☆☆☆☆☆</span><span class="muted">${escapeHtml(t("site.rating.loading", {}, "Loading ratings…"))}</span></div>`;
    if (!r.count) return `<div class="catalog-rating" data-game-rating="${escapeHtml(game.id)}"><span class="stars">☆☆☆☆☆</span><span class="muted">${escapeHtml(t("site.rating.none", {}, "No ratings yet"))}</span></div>`;
    const avg = Number(r.average || 0);
    const avgText = avg.toFixed(1).replace(".0", "");
    return `<div class="catalog-rating" data-game-rating="${escapeHtml(game.id)}"><span class="stars">${starString(avg)}</span><span>${escapeHtml(avgText)}</span><span class="muted">${escapeHtml(fmtRatingCount(r.count))}</span></div>`;
  }

  function applyRatingChips() {
    document.querySelectorAll(".catalog-rating[data-game-rating]").forEach((el) => {
      const r = ratingCache.get(el.dataset.gameRating);
      if (!r || r.loading) return;
      const avg = Number(r.average || 0);
      const avgText = avg.toFixed(1).replace(".0", "");
      el.innerHTML = r.count
        ? `<span class="stars">${starString(avg)}</span><span>${escapeHtml(avgText)}</span><span class="muted">${escapeHtml(fmtRatingCount(r.count))}</span>`
        : `<span class="stars">☆☆☆☆☆</span><span class="muted">${escapeHtml(t("site.rating.none", {}, "No ratings yet"))}</span>`;
    });
  }

  async function loadRatingSummaries(games) {
    await Promise.all(games.map(async (g) => {
      if (ratingCache.has(g.id) && !ratingCache.get(g.id).loading) return;
      try {
        const response = await fetch(`/api/ratings?game=${encodeURIComponent(g.id)}&v=${BUILD_VERSION}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const summary = data.summary || data.ratings || data || {};
        ratingCache.set(g.id, { average: Number(summary.average || 0), count: Number(summary.count || 0), loading: false });
      } catch (e) {
        ratingCache.set(g.id, { average: 0, count: 0, loading: false });
      }
    }));
    applyRatingChips();
  }

  function normalizeGame(game, index) {
    const title = lv(game.title) || game.id || `Game ${index + 1}`;
    const accent = game.accent || ["#f59e0b", "#65a8ff", "#57d68d", "#ff8a4c", "#b85cff"][index % 5];
    return {
      id: game.id || `game-${index + 1}`,
      title,
      subtitle: lv(game.subtitle) || "Browser game",
      description: lv(game.description) || "Direkt im Browser spielbar.",
      players: lv(game.players) || "Browser",
      minutes: lv(game.minutes) || "Variabel",
      category: lv(game.category) || "Game",
      tags: Array.isArray(game.tags) ? game.tags.map(lv) : [],
      accent,
      theme: game.theme || "custom",
      image: game.image || "assets/favicon.svg",
      href: game.href || `games/${game.id || ""}/`,
      comingSoon: !!game.comingSoon,
      community: !!game.community,
      author: String(game.author || ""),
      rating: { average: 0, count: 0, loading: true },
    };
  }

  function renderCatalog(games, opts = {}) {
    if (!games.length) {
      if (els.communitySection) els.communitySection.hidden = true;
      if (els.communityGrid) els.communityGrid.hidden = true;
      if (els.catalogCount) els.catalogCount.textContent = t("site.catalog.count", { count: 0, word: t("site.catalog.many") });
      if (els.grid) {
        els.grid.innerHTML = `
          <div class="catalog-empty">
            <h3>${escapeHtml(t("site.catalog.emptyTitle"))}</h3>
            <p>${t("site.catalog.emptyText")}</p>
          </div>
        `;
      }
      return;
    }

    if (els.catalogCount) els.catalogCount.textContent = t("site.catalog.count", { count: games.length, word: games.length === 1 ? t("site.catalog.one") : t("site.catalog.many") });
    if (els.heroLede) els.heroLede.textContent = t("site.hero.detected", { count: games.length, plural: games.length === 1 ? "" : "e" });
    if (els.catalogCopy) els.catalogCopy.innerHTML = t("site.catalog.copyLoaded");

    // Community-Spiele bekommen eine eigene Sektion unter dem Hauptregal.
    const communityGames = games.filter((g) => g.community);
    const siteGames = games.filter((g) => !g.community);

    if (els.heroStage) {
      const cards = siteGames.filter((g) => !g.comingSoon).slice(0, 4).map((g, index) => `
        <a class="stage-card stage-dynamic stage-${index}" href="${escapeHtml(g.href)}" data-game-link style="--game-accent:${escapeHtml(g.accent)}">
          <img src="${escapeHtml(imageUrl(g.image))}" alt="" />
          <span>${escapeHtml(g.title)}</span>
        </a>
      `).join("");
      els.heroStage.innerHTML = cards + `
        <div class="stage-orbit orbit-a"></div>
        <div class="stage-orbit orbit-b"></div>
        <div class="stage-line"></div>
      `;
    }

    function cardHtml(g) {
        const tags = [g.players, g.minutes, ...(g.tags || []).slice(0, 3)].filter(Boolean);
        if (g.community && g.author) tags.push(t("site.card.by", { name: g.author }, `von ${g.author}`));
        const soonLabel = t("site.card.comingSoon", {}, "Bald verfügbar");
        if (g.comingSoon) {
          // Not launched yet: greyed-out, non-clickable tile with a "coming soon" badge.
          return `
            <article class="game-card game-card-${escapeHtml(g.theme)} coming-soon" style="--game-accent:${escapeHtml(g.accent)}" aria-disabled="true">
              <span class="card-soon-badge">${escapeHtml(soonLabel)}</span>
              <div class="game-art dynamic-art" aria-hidden="true">
                <img class="game-art-wallpaper" src="${escapeHtml(imageUrl(g.href + "wallpaper.png"))}" alt="" loading="lazy" onerror="this.style.display='none'" />
                <div class="game-art-backdrop"></div>
                <img class="game-button-image" src="${escapeHtml(imageUrl(g.image))}" alt="" />
                <div class="game-art-ring ring-a"></div>
                <div class="game-art-ring ring-b"></div>
              </div>
              <div class="game-body">
                <span class="tag">${escapeHtml(g.category)}${g.subtitle ? " · " + escapeHtml(g.subtitle) : ""}</span>
                <h3>${escapeHtml(g.title)}</h3>
                <p>${escapeHtml(g.description)}</p>
                <div class="facts">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
                <span class="card-cta card-cta-soon">${escapeHtml(soonLabel)}</span>
              </div>
            </article>
          `;
        }
        return `
          <article class="game-card game-card-${escapeHtml(g.theme)}" style="--game-accent:${escapeHtml(g.accent)}">
            <a class="game-card-link" href="${escapeHtml(g.href)}" data-game-link aria-label="${escapeHtml(t("site.hero.start", { title: g.title }))}"></a>
            <div class="game-art dynamic-art" aria-hidden="true">
              ${g.studio ? "" : `<img class="game-art-wallpaper" src="${escapeHtml(imageUrl(g.href + "wallpaper.png"))}" alt="" loading="lazy" onerror="this.style.display='none'" />`}
              <div class="game-art-backdrop"></div>
              <img class="game-button-image" src="${escapeHtml(imageUrl(g.image))}" alt="" />
              <div class="game-art-ring ring-a"></div>
              <div class="game-art-ring ring-b"></div>
            </div>
            <div class="game-body">
              <span class="tag">${escapeHtml(g.category)}${g.subtitle ? " · " + escapeHtml(g.subtitle) : ""}</span>
              <h3>${escapeHtml(g.title)}</h3>
              <p>${escapeHtml(g.description)}</p>
              ${ratingHtml(g)}
              <div class="facts">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
              <span class="card-cta">${escapeHtml(t("site.hero.start", { title: g.title }))} →</span>
            </div>
          </article>
        `;
    }

    if (els.grid) {
      els.grid.innerHTML = siteGames.map(cardHtml).join("");
    }
    if (els.communityGrid && els.communitySection) {
      const show = communityGames.length > 0;
      els.communitySection.hidden = !show;
      els.communityGrid.hidden = !show;
      els.communityGrid.innerHTML = show ? communityGames.map(cardHtml).join("") : "";
    }

    // Make rating chips open the rating modal
    document.querySelectorAll("[data-game-grid] .catalog-rating, [data-community-grid] .catalog-rating").forEach((el) => {
        const gameId = el.dataset.gameRating;
        const game = games.find((g) => g.id === gameId);
        if (!gameId || el.dataset.ratingBound) return;
        el.dataset.ratingBound = "1";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.title = t("site.rating.open", {}, "Bewerten / Bewertungen anzeigen");
        el.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.BrettRatings?.openModal(gameId, game?.title || gameId);
        });
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.BrettRatings?.openModal(gameId, game?.title || gameId);
          }
        });
      });
    addFreshNavigation(document);
    i18n?.applyDomTranslations(document);
    if (!opts.skipRatingFetch) loadRatingSummaries(games);
  }

  // Veröffentlichte Studio-Spiele (Sandbox-Definitionen unter kurzer ID)
  // erscheinen zur Laufzeit in der Community-Galerie — Karte verlinkt in den
  // Studio-Play-Modus. Kein Deploy nötig: Freigabe durch den Admin genügt.
  function normalizeStudioGame(g, index) {
    return {
      id: `studio-${g.id}`,
      title: g.title || t("site.card.studioCat", {}, "Studio-Spiel"),
      subtitle: "",
      description: t("site.card.studioDesc", {}, "Im Spiele-Studio erstellt — direkt am virtuellen Spieltisch spielen."),
      players: "",
      minutes: "",
      category: t("site.card.studioCat", {}, "Studio-Spiel"),
      tags: [],
      accent: ["#f59e0b", "#65a8ff", "#57d68d", "#ff8a4c", "#b85cff"][index % 5],
      theme: "custom",
      image: "assets/favicon.svg",
      href: `studio/#id=${encodeURIComponent(g.id)}`,
      comingSoon: false,
      community: true,
      author: String(g.author || ""),
      studio: true,
      rating: { average: 0, count: 0, loading: true },
    };
  }

  async function loadStudioGames() {
    try {
      const response = await fetch(`/api/studio/published?v=${BUILD_VERSION}`, { cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      return (Array.isArray(data.games) ? data.games : []).map(normalizeStudioGame);
    } catch (e) {
      return [];
    }
  }

  async function loadCatalog() {
    try {
      const [response, studioGames] = await Promise.all([
        fetch(`/games/catalog.json?v=${BUILD_VERSION}`, { cache: "no-store" }),
        loadStudioGames(),
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      const games = (Array.isArray(catalog.games) ? catalog.games : []).map(normalizeGame).concat(studioGames);
      renderCatalog(games);
    } catch (error) {
      console.warn("Could not load generated game catalog", error);
      if (els.catalogCount) els.catalogCount.textContent = t("site.catalog.errorCount");
      if (els.grid) {
        els.grid.innerHTML = `
          <div class="catalog-empty">
            <h3>${escapeHtml(t("site.catalog.errorTitle"))}</h3>
            <p>Prüfe, ob Ansible <code>games/catalog.json</code> erzeugt hat. Auf dem Server: <code>python3 /var/www/brettspiele.fun/tools/generate_catalog.py --web-root /var/www/brettspiele.fun</code></p>
          </div>
        `;
      }
    }
  }

  addFreshNavigation(document);
  window.addEventListener("brettspiele-language-change", () => { applyTheme(getThemeMode(), false); loadCatalog(); });
  window.addEventListener("brettspiele-rating-submitted", async (e) => {
    const gameId = e.detail?.game;
    if (!gameId || !els.grid) return;
    try {
      const res = await fetch(`/api/ratings?game=${encodeURIComponent(gameId)}&v=${BUILD_VERSION}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const summary = data.summary || {};
      ratingCache.set(gameId, { average: Number(summary.average || 0), count: Number(summary.count || 0), loading: false });
    } catch (_) {}
    applyRatingChips();
  });
  loadCatalog();
})();
