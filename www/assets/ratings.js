(function () {
  const i18n = window.BFI18N;
  const lang = () => (i18n && i18n.getLanguage && i18n.getLanguage()) || "de";
  const t = (de, en) => (lang() !== "de") ? en : de;
  const consent = () => window.BrettConsent;
  function stars(n) { return "★".repeat(Math.round(n || 0)) + "☆".repeat(5 - Math.round(n || 0)); }
  function fmt(num) { return new Intl.NumberFormat(lang() || "de-DE").format(num || 0); }
  function escapeHtml(v) { return String(v || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  async function apiFetch(url, opts) {
    const r = await fetch(url, { credentials: "include", ...(opts || {}) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function loadRatings(game) { return apiFetch(`/api/ratings?game=${encodeURIComponent(game)}`); }
  async function loadMe() { try { return await apiFetch("/api/me"); } catch (_) { return { authenticated: false, user: null }; } }
  async function submitRating(game, payload) {
    return apiFetch("/api/rating", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, ...payload }) });
  }
  async function deleteRating(game) {
    return apiFetch(`/api/rating?game=${encodeURIComponent(game)}`, { method: "DELETE" });
  }

  // ── Star picker ────────────────────────────────────────────────────────────

  function starPickerHtml(selected) {
    const btns = [1, 2, 3, 4, 5].map((i) =>
      `<button type="button" class="star-btn${i <= selected ? " active" : ""}" data-star="${i}" aria-label="${i}">★</button>`
    ).join("");
    return `<div class="star-picker">${btns}<input type="hidden" name="rating" value="${selected || 0}"></div>`;
  }

  function wireStarPicker(container) {
    const picker = container.querySelector(".star-picker");
    if (!picker) return;
    const hidden = picker.querySelector("input[name=rating]");
    const btns = Array.from(picker.querySelectorAll(".star-btn"));
    let current = parseInt(hidden.value) || 0;

    function highlight(n) { btns.forEach((b, i) => b.classList.toggle("active", i < n)); }

    btns.forEach((btn) => {
      const n = parseInt(btn.dataset.star);
      btn.addEventListener("mouseenter", () => highlight(n));
      btn.addEventListener("mouseleave", () => highlight(current));
      btn.addEventListener("click", () => { current = n; hidden.value = n; highlight(n); });
    });
  }

  // ── Modal shell ────────────────────────────────────────────────────────────

  function ensureModal() {
    let m = document.getElementById("rating-modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "rating-modal";
    m.className = "rating-modal";
    m.setAttribute("hidden", "");
    m.setAttribute("aria-modal", "true");
    m.setAttribute("role", "dialog");
    m.innerHTML = `
      <div class="rating-modal-backdrop"></div>
      <div class="rating-modal-box">
        <button class="rating-modal-close" aria-label="${t("Schließen","Close")}">×</button>
        <div id="rating-modal-content"></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector(".rating-modal-backdrop").addEventListener("click", closeModal);
    m.querySelector(".rating-modal-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    return m;
  }

  function closeModal() {
    const m = document.getElementById("rating-modal");
    if (m) m.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  // ── Modal content ──────────────────────────────────────────────────────────

  function buildFormHtml(isAuth, displayName, myRating, hasConsent) {
    if (isAuth) {
      const sel = myRating ? myRating.rating : 0;
      const com = myRating ? escapeHtml(myRating.comment || "") : "";
      return `
        <form class="rating-form rating-form--user" id="modal-rating-form">
          <div class="rating-by">${t("Bewertet als","Rating as")} <strong>${escapeHtml(displayName)}</strong></div>
          <label>${t("Deine Bewertung","Your rating")}${starPickerHtml(sel)}</label>
          <label>${t("Kommentar optional","Comment optional")}<textarea name="comment" maxlength="600">${com}</textarea></label>
          <div style="display:flex;gap:10px;justify-content:end">
            ${myRating ? `<button type="button" class="rating-btn-ghost rating-delete-btn">${t("Bewertung löschen","Delete rating")}</button>` : ""}
            <button type="submit">${myRating ? t("Bewertung aktualisieren","Update rating") : t("Bewertung speichern","Save rating")}</button>
          </div>
          <p class="rating-msg"></p>
        </form>`;
    }
    if (hasConsent) {
      return `
        <form class="rating-form" id="modal-rating-form">
          <label>${t("Deine Bewertung","Your rating")}${starPickerHtml(0)}</label>
          <label>${t("Name optional","Name optional")}<input name="name" maxlength="40" autocomplete="nickname"></label>
          <label style="grid-column:1/-1">${t("Kommentar optional","Comment optional")}<textarea name="comment" maxlength="600"></textarea></label>
          <button type="submit" style="grid-column:1/-1;justify-self:end">${t("Bewertung speichern","Save rating")}</button>
          <p class="rating-msg" style="grid-column:1/-1"></p>
        </form>`;
    }
    return `
      <div class="rating-login-hint">
        <p>${t("Melde dich an oder stimme den Datenschutzeinstellungen zu, um dieses Spiel zu bewerten.","Sign in or accept privacy settings to rate this game.")}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="rating-open-auth">${t("Anmelden","Sign in")}</button>
          <button type="button" class="rating-btn-ghost rating-open-consent">${t("Ohne Konto bewerten","Rate without account")}</button>
        </div>
      </div>`;
  }

  async function renderModalContent(gameId, gameTitle, data, me) {
    const content = document.getElementById("rating-modal-content");
    if (!content) return;

    const summary = (data && data.summary) || { average: 0, count: 0 };
    const items = (data && data.items) || [];
    const myRating = data && data.myRating;
    const isAuth = !!(me && me.authenticated && me.user);
    const displayName = isAuth ? (me.user.displayName || me.user.username) : "";
    const hasConsent = consent()?.has?.("ratings");

    const avgText = summary.count ? String(summary.average || "–") : "–";
    const listHtml = items.length
      ? items.map((r) => `
          <article>
            <strong>${stars(r.rating)}</strong>
            <b>${escapeHtml(r.name || t("Anonym","Anonymous"))}</b>
            ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ""}
          </article>`).join("")
      : `<p style="color:var(--muted,#9ca3af)">${t("Noch keine Bewertungen.","No ratings yet.")}</p>`;

    content.innerHTML = `
      <div class="community-head" style="margin-bottom:20px">
        <h2 style="margin:0">${escapeHtml(gameTitle)}</h2>
        <div class="rating-big">
          <strong>${escapeHtml(avgText)}</strong>
          <span>${stars(summary.average)}</span>
          <small>${fmt(summary.count)} ${t("Bewertungen","ratings")}</small>
        </div>
      </div>
      ${buildFormHtml(isAuth, displayName, myRating, hasConsent)}
      <div class="rating-list" style="margin-top:20px">${listHtml}</div>`;

    wireStarPicker(content);

    content.querySelector(".rating-open-auth")?.addEventListener("click", () => {
      closeModal();
      document.querySelector("[data-auth-open]")?.click();
    });
    content.querySelector(".rating-open-consent")?.addEventListener("click", () => consent()?.showSettings?.());

    const form = content.querySelector("#modal-rating-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAuth && !consent()?.has?.("ratings")) return consent()?.showSettings?.();
      const fd = new FormData(e.currentTarget);
      const rating = parseInt(fd.get("rating") || "0");
      const msg = form.querySelector(".rating-msg");
      if (!rating || rating < 1 || rating > 5) {
        if (msg) msg.textContent = t("Bitte wähle zuerst eine Bewertung aus.","Please select a rating first.");
        return;
      }
      if (msg) msg.textContent = "";
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        const newData = await submitRating(gameId, {
          rating,
          name: fd.get("name") || (isAuth ? displayName : ""),
          comment: fd.get("comment"),
        });
        await renderModalContent(gameId, gameTitle, newData, me);
        try { window.dispatchEvent(new CustomEvent("brettspiele-rating-submitted", { detail: { game: gameId } })); } catch (_) {}
      } catch (_) {
        if (msg) msg.textContent = t("Fehler beim Speichern.","Could not save.");
        btn.disabled = false;
      }
    });

    content.querySelector(".rating-delete-btn")?.addEventListener("click", async () => {
      const msg = form.querySelector(".rating-msg");
      if (!confirm(t("Deine Bewertung wirklich löschen?","Really delete your rating?"))) return;
      const delBtn = content.querySelector(".rating-delete-btn");
      delBtn.disabled = true;
      try {
        const newData = await deleteRating(gameId);
        await renderModalContent(gameId, gameTitle, newData, me);
        try { window.dispatchEvent(new CustomEvent("brettspiele-rating-submitted", { detail: { game: gameId } })); } catch (_) {}
      } catch (_) {
        if (msg) msg.textContent = t("Fehler beim Löschen.","Could not delete.");
        delBtn.disabled = false;
      }
    });
  }

  async function openModal(gameId, gameTitle) {
    const modal = ensureModal();
    modal.dataset.gameId = gameId;
    modal.dataset.gameTitle = gameTitle || gameId;
    const content = document.getElementById("rating-modal-content");
    if (content) content.innerHTML = `<p style="padding:24px 0;text-align:center">${t("Lädt…","Loading…")}</p>`;
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    const [data, me] = await Promise.all([loadRatings(gameId), loadMe()]);
    await renderModalContent(gameId, gameTitle, data, me);
  }

  window.closeRatingModal = closeModal;
  window.BrettRatings = { openModal };

  window.addEventListener("brettspiele-language-change", () => {
    const m = document.getElementById("rating-modal");
    if (m && !m.hasAttribute("hidden")) openModal(m.dataset.gameId || "", m.dataset.gameTitle || "");
  });
})();
