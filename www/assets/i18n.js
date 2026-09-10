(function () {
  const SUPPORTED = ["de", "en", "fr", "es", "it", "ru", "zh", "ja"];
  const STORAGE_KEY = "brettspiele.languageMode";

  const NAMES = {
    de: "Deutsch", en: "English", fr: "Français", es: "Español",
    it: "Italiano", ru: "Русский", zh: "中文", ja: "日本語"
  };

  const AUTO_SUFFIX = {
    de: "automatisch", en: "system", fr: "système", es: "sistema",
    it: "sistema", ru: "система", zh: "系统", ja: "システム"
  };

  /* Translation data now lives in per-language packs under assets/i18n/<lang>.js,
     which run before this runtime and populate window.BFI18N_DATA. This file is
     the runtime only: it assembles the dictionaries and renders translations. */
  const DATA = (typeof window !== "undefined" && window.BFI18N_DATA) || {};
  const DICT = {};
  const WORDS = {};
  for (const lang of SUPPORTED) {
    const pack = DATA[lang] || {};
    DICT[lang] = pack.dict || {};
    WORDS[lang] = pack.words || null;
  }
  DICT.en = DICT.en || {};
  DICT.de = DICT.de || {};
  if (!Object.keys(DICT.en).length) {
    console.warn("[i18n] No language packs found in window.BFI18N_DATA — did the assets/i18n/<lang>.js files load before assets/i18n.js?");
  }

  function interpolate(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (_, key) => vars && vars[key] != null ? vars[key] : "");
  }

  function systemLanguage() {
    const raw = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    const short = raw.toLowerCase().split("-")[0];
    if (short === "zh" || raw.toLowerCase().startsWith("zh")) return "zh";
    return SUPPORTED.includes(short) ? short : "en";
  }

  function getMode() {
    try {
      const value = localStorage.getItem(STORAGE_KEY) || "auto";
      return value === "auto" || SUPPORTED.includes(value) ? value : "auto";
    } catch (e) { return "auto"; }
  }

  function resolveLanguage(mode = getMode()) {
    return mode === "auto" ? systemLanguage() : mode;
  }

  /* Locale declared by the URL itself. Localized pages are prerendered under
     /en/, /fr/, … and carry <html data-locale="xx">. When present this locale
     is authoritative for the page (the visitor followed a language-specific
     URL), overriding system detection and any previously stored "auto". */
  function pageLocale() {
    try {
      const l = document.documentElement.dataset.locale;
      return SUPPORTED.includes(l) ? l : null;
    } catch (e) { return null; }
  }

  /* Map the current path to the equivalent path in another language. German is
     served at the root (no prefix); every other language lives under /<lang>/. */
  function localeUrl(targetLang) {
    let path = location.pathname;
    const m = path.match(/^\/([a-z]{2})(?=\/|$)/);
    if (m && SUPPORTED.includes(m[1]) && m[1] !== "de") {
      path = path.slice(3) || "/";
    }
    if (!path.startsWith("/")) path = "/" + path;
    const prefix = targetLang && targetLang !== "de" ? "/" + targetLang : "";
    return prefix + path + location.search + location.hash;
  }

  function applyInitialLanguage() {
    const pl = pageLocale();
    if (pl) setLanguageMode(pl, true);
    else setLanguageMode(getMode(), false);
  }

  function autoSuffix(lang = resolveLanguage()) {
    return AUTO_SUFFIX[lang] || AUTO_SUFFIX.en;
  }

  function describeLanguageMode(mode = getMode()) {
    const resolved = resolveLanguage(mode);
    return NAMES[resolved] || resolved;
  }

  function describeThemeMode(mode, theme) {
    return theme === "dark" ? t("theme.dark") : t("theme.light");
  }

  function localizeValue(value, lang = resolveLanguage()) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[lang] || value.en || value.de || Object.values(value)[0] || "";
    }
    return value;
  }

  function t(key, vars = {}, fallback = "") {
    const lang = resolveLanguage();
    const base = DICT[lang] || DICT.en;
    const text = base[key] ?? DICT.en[key] ?? DICT.de[key] ?? fallback ?? key;
    return interpolate(text, vars);
  }

  function setLanguageMode(mode, save = true) {
    mode = mode === "auto" || SUPPORTED.includes(mode) ? mode : "auto";
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
    }
    const lang = resolveLanguage(mode);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    document.documentElement.dataset.languageMode = mode;
    document.documentElement.dataset.language = lang;
    applyDomTranslations(document);
    window.dispatchEvent(new CustomEvent("brettspiele-language-change", { detail: { mode, lang } }));
  }

  function applyDomTranslations(scope = document) {
    scope.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder)); });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => { el.setAttribute("title", t(el.dataset.i18nTitle)); });
    scope.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    scope.querySelectorAll("[data-language-select]").forEach((select) => {
      if (!select.dataset.i18nReady) {
        select.innerHTML = SUPPORTED.map((code) => `<option value="${code}">${NAMES[code]}</option>`).join("");
        select.addEventListener("change", () => {
          const target = select.value;
          // Persist the explicit choice so the destination page (and the German
          // root) honour it, then navigate to that language's URL so the visible
          // URL, canonical and hreflang stay consistent with the content.
          try { localStorage.setItem(STORAGE_KEY, target); } catch (e) {}
          const dest = localeUrl(target);
          if (dest !== location.pathname + location.search + location.hash) {
            location.assign(dest);
          } else {
            setLanguageMode(target, true);
          }
        });
        select.dataset.i18nReady = "1";
      }
      const mode = getMode();
      const resolved = resolveLanguage(mode);
      select.value = resolved;
      const langLabel = describeLanguageMode(mode);
      select.setAttribute("aria-label", `${t("game.language")}: ${langLabel}`);
      select.setAttribute("title", `${t("game.language")}: ${langLabel}`);
    });
    if (document.title && document.querySelector("[data-page='home']")) document.title = t("site.title");
  }

  window.BFI18N = {
    supported: SUPPORTED,
    names: NAMES,
    t,
    localizeValue,
    getMode,
    getLanguage: () => resolveLanguage(),
    describeLanguageMode,
    describeThemeMode,
    autoSuffix,
    setLanguageMode,
    applyDomTranslations,
    wordsForCurrentLanguage: () => WORDS[resolveLanguage()] || null,
  };

  if (window.matchMedia) {
    // Some browsers update navigator.language only after reload, but this keeps
    // the "Auto" selector coherent when scripts are re-applied.
    window.addEventListener("pageshow", applyInitialLanguage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyInitialLanguage);
  } else {
    applyInitialLanguage();
  }
})();

