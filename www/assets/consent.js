(function () {
  const KEY = "brettspiele.consent.v1";
  const root = document.documentElement;
  const i18n = window.BFI18N;
  const lang = () => (i18n && i18n.getLanguage ? i18n.getLanguage() : (navigator.language || "de").slice(0,2));
  const L = {
    de: {
      title: "Cookies, Speicher & Spielstatistik",
      text: "Wir nutzen notwendige lokale Speicher für Sprache, Theme, Login-Session und Spielräume. Besucherzähler und Bewertungen aktivieren wir nur mit deiner Zustimmung. Keine Werbe-Cookies, keine Drittanbieter-Tracker, keine Datenkrake mit Meeple-Hut.",
      necessary: "Notwendig",
      analytics: "Besucherzähler",
      ratings: "Bewertungen",
      acceptAll: "Alle akzeptieren",
      necessaryOnly: "Nur notwendig",
      save: "Auswahl speichern",
      settings: "Cookie-Einstellungen",
      change: "Privatsphäre"
    },
    en: { title:"Cookies, storage & game stats", text:"Necessary local storage keeps language, theme, login session and game rooms working. Visitor counters and ratings only run with your consent. No ad cookies, no third-party trackers, no meeple-shaped data monster.", necessary:"Necessary", analytics:"Visitor counter", ratings:"Ratings", acceptAll:"Accept all", necessaryOnly:"Necessary only", save:"Save selection", settings:"Cookie settings", change:"Privacy" },
    fr: { title:"Cookies, stockage et statistiques", text:"Le stockage nécessaire garde la langue, le thème et les salles de jeu. Le compteur de visites et les avis ne fonctionnent qu’avec ton accord.", necessary:"Nécessaire", analytics:"Compteur", ratings:"Avis", acceptAll:"Tout accepter", necessaryOnly:"Nécessaire seulement", save:"Enregistrer", settings:"Paramètres cookies", change:"Confidentialité" },
    es: { title:"Cookies, almacenamiento y estadísticas", text:"El almacenamiento necesario mantiene idioma, tema y salas. El contador y las valoraciones solo se activan con tu consentimiento.", necessary:"Necesario", analytics:"Contador", ratings:"Valoraciones", acceptAll:"Aceptar todo", necessaryOnly:"Solo necesario", save:"Guardar", settings:"Ajustes de cookies", change:"Privacidad" },
    it: { title:"Cookie, memoria e statistiche", text:"La memoria necessaria mantiene lingua, tema e stanze. Contatore e valutazioni funzionano solo con consenso.", necessary:"Necessario", analytics:"Contatore", ratings:"Valutazioni", acceptAll:"Accetta tutto", necessaryOnly:"Solo necessari", save:"Salva", settings:"Impostazioni cookie", change:"Privacy" },
    ru: { title:"Cookie, хранилище и статистика", text:"Необходимое хранилище нужно для языка, темы и комнат. Счётчик и оценки работают только с согласием.", necessary:"Необходимо", analytics:"Счётчик", ratings:"Оценки", acceptAll:"Принять всё", necessaryOnly:"Только необходимое", save:"Сохранить", settings:"Настройки cookie", change:"Приватность" },
    zh: { title:"Cookie、本地存储与统计", text:"必要存储用于语言、主题和房间。访问计数和评分仅在同意后启用。", necessary:"必要", analytics:"访问计数", ratings:"评分", acceptAll:"全部接受", necessaryOnly:"仅必要", save:"保存选择", settings:"Cookie 设置", change:"隐私" },
    ja: { title:"Cookie・保存・統計", text:"必要な保存は言語、テーマ、ルームに使います。訪問数と評価は同意後のみ有効です。", necessary:"必須", analytics:"訪問数", ratings:"評価", acceptAll:"すべて許可", necessaryOnly:"必須のみ", save:"保存", settings:"Cookie設定", change:"プライバシー" }
  };
  function t(key) { const d = L[lang()] || L.en; return d[key] || L.en[key] || key; }
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function normalize(c) {
    return {
      necessary: true,
      analytics: !!(c && c.analytics),
      ratings: !!(c && c.ratings),
      decided: !!(c && c.decided),
      updatedAt: c && c.updatedAt || null
    };
  }
  function write(consent) {
    const next = normalize({ ...consent, decided: true, updatedAt: new Date().toISOString() });
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    root.dataset.consentAnalytics = next.analytics ? "1" : "0";
    root.dataset.consentRatings = next.ratings ? "1" : "0";
    window.dispatchEvent(new CustomEvent("brettspiele-consent-change", { detail: next }));
    return next;
  }
  function current() { return normalize(read()); }
  function has(kind) { const c = current(); return kind === "necessary" || !!c[kind]; }
  function gameId() {
    const html = document.documentElement;
    if (html.dataset.game) return html.dataset.game;
    const m = location.pathname.match(/\/games\/([^/]+)/);
    return m ? m[1] : "site";
  }
  async function recordVisit() {
    if (!has("analytics")) return;
    try {
      await fetch("/api/visit", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ game: gameId(), path: location.pathname }) });
      window.dispatchEvent(new CustomEvent("brettspiele-visit-recorded"));
    } catch (e) {}
  }
  function banner() {
    const existing = document.querySelector(".consent-banner");
    if (existing) existing.remove();
    const c = current();
    const el = document.createElement("section");
    el.className = "consent-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", t("settings"));
    el.innerHTML = `
      <div class="consent-copy"><strong>${t("title")}</strong><p>${t("text")}</p></div>
      <div class="consent-options">
        <label><input type="checkbox" checked disabled> ${t("necessary")}</label>
        <label><input type="checkbox" data-consent-analytics ${c.analytics ? "checked" : ""}> ${t("analytics")}</label>
        <label><input type="checkbox" data-consent-ratings ${c.ratings ? "checked" : ""}> ${t("ratings")}</label>
      </div>
      <div class="consent-actions">
        <button type="button" data-consent-necessary>${t("necessaryOnly")}</button>
        <button type="button" data-consent-save>${t("save")}</button>
        <button type="button" class="primary" data-consent-all>${t("acceptAll")}</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("[data-consent-necessary]").addEventListener("click", () => { write({ analytics:false, ratings:false }); el.remove(); recordVisit(); });
    el.querySelector("[data-consent-all]").addEventListener("click", () => { write({ analytics:true, ratings:true }); el.remove(); recordVisit(); });
    el.querySelector("[data-consent-save]").addEventListener("click", () => {
      write({ analytics: el.querySelector("[data-consent-analytics]").checked, ratings: el.querySelector("[data-consent-ratings]").checked });
      el.remove(); recordVisit();
    });
  }
  function privacyButton() {
    if (document.querySelector(".privacy-floating-button")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "privacy-floating-button";
    btn.textContent = t("change");
    btn.addEventListener("click", banner);
    document.body.appendChild(btn);
  }
  function init() {
    const c = current();
    root.dataset.consentAnalytics = c.analytics ? "1" : "0";
    root.dataset.consentRatings = c.ratings ? "1" : "0";
    privacyButton();
    if (!c.decided) banner(); else recordVisit();
  }
  window.BrettConsent = { current, has, write, showSettings: banner, recordVisit, gameId };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.addEventListener("brettspiele-language-change", () => {
    document.querySelector(".privacy-floating-button")?.remove();
    privacyButton();
    if (document.querySelector(".consent-banner")) banner();
  });
})();
