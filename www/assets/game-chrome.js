// game-chrome.js — shared chrome (theme toggle + back button) for brettspiele.fun games.
// Wires the canonical #themeToggle / .game-theme-toggle button so every game
// behaves identically. Idempotent: if a page already wired the theme toggle
// (e.g. an inline copy), it stays out of the way.

// ===== Mobile/tablet collapse toggle for the top-right action cluster =====
// .game-top-actions can grow to 4-5 pill controls (language, theme, sound,
// account, donate). On narrow screens that row overlapped each game's own UI
// in the same corner (e.g. Warbound Atlas' burger menu / zoom buttons). This
// prepends one toggle button; game-chrome.css hides every OTHER child of
// .game-top-actions below 880px until the cluster gets an "open" class, so
// it works regardless of which script added which button or in what order.
(function () {
  'use strict';
  if (window.__brettActionsToggleWired) return;
  window.__brettActionsToggleWired = true;

  function init() {
    var bar = document.querySelector('.game-top-actions');
    if (!bar) return;
    if (bar.querySelector('.game-actions-toggle')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-actions-toggle';
    btn.textContent = '☰';
    btn.setAttribute('aria-label', 'Menü');
    btn.setAttribute('aria-expanded', 'false');
    // Appended, not prepended: sound.js mimics the class of the bar's FIRST
    // <button> to blend in. Prepending this toggle made it that "first
    // button", so the sound toggle copied .game-actions-toggle and got
    // excluded from the collapse rule below — it never hid on mobile. CSS
    // `order: -1` (see game-chrome.css) still visually places it first.
    bar.appendChild(btn);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = bar.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (bar.classList.contains('open') && !bar.contains(e.target)) {
        bar.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bar.classList.contains('open')) {
        bar.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    // Close after picking a language, so the cluster doesn't stay open
    // covering the screen once the user has made their choice.
    bar.addEventListener('change', function (e) {
      if (e.target.matches('select')) {
        bar.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Other scripts (auth.js, sound.js) append their own buttons into
  // .game-top-actions on DOMContentLoaded too; running this synchronously
  // afterwards (not deferred further) keeps the toggle first in the DOM
  // regardless of their relative <script> order.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

(function () {
  'use strict';
  if (window.__brettThemeWired) return;

  function init() {
    var button = document.getElementById('themeToggle') || document.querySelector('.game-theme-toggle');
    if (!button) return;
    if (window.__brettThemeWired) return;        // re-check after defer
    window.__brettThemeWired = true;

    var key = 'brettspiele.themeMode';
    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function getMode() {
      try {
        var mode = localStorage.getItem(key) || 'auto';
        return ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
      } catch (e) { return 'auto'; }
    }
    function resolve(mode) {
      return mode === 'auto' ? (media && media.matches ? 'dark' : 'light') : mode;
    }
    function apply(mode, save) {
      mode = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
      var theme = resolve(mode);
      root.dataset.themeMode = mode;
      root.dataset.theme = theme;
      if (save) { try { localStorage.setItem(key, mode); } catch (e) {} }
      try { localStorage.setItem('brettspiele.theme', theme); } catch (e) {}
      var label = (window.BFI18N && window.BFI18N.describeThemeMode) ? window.BFI18N.describeThemeMode(mode, theme) : (theme === 'light' ? 'Light' : 'Dark');
      // keep a label span if present, otherwise set the button text
      var span = button.querySelector('#themeLabel');
      if (span) span.textContent = label; else button.textContent = label;
      button.setAttribute('aria-label', window.BFI18N ? window.BFI18N.t('theme.aria', { mode: label }) : ('Theme: ' + label));
      button.setAttribute('title', 'Theme: ' + label);
      try { window.dispatchEvent(new CustomEvent('brettspiele-theme-change', { detail: { mode: mode, theme: theme } })); } catch (e) {}
    }
    function nextMode() {
      var currentTheme = root.dataset.theme || resolve(getMode());
      return currentTheme === 'light' ? 'dark' : 'light';
    }
    button.addEventListener('click', function () { apply(nextMode(), true); });
    if (media) {
      var onSystemChange = function () { apply(getMode(), false); };
      if (media.addEventListener) media.addEventListener('change', onSystemChange);
      else if (media.addListener) media.addListener(onSystemChange);
    }
    apply(getMode(), false);
    window.addEventListener('brettspiele-language-change', function () { apply(getMode(), false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ===== Back-to-home / in-game-menu button =====
(function () {
  'use strict';
  if (window.__brettBackWired) return;
  window.__brettBackWired = true;

  if (document.documentElement.dataset.page === 'home') return;

  function homeUrl() {
    var segs = window.location.pathname.split('/').filter(function (s) {
      return s && s.indexOf('.') === -1;
    });
    return segs.length ? Array(segs.length).fill('..').join('/') + '/' : './';
  }

  // Preferred interface: each game exposes its own screen hierarchy so the
  // back button can walk it one level at a time.
  //   window.__brettBack.atTop() -> true when the game is on its own top menu
  //                                 (the next "back" should leave to the site)
  //   window.__brettBack.up()    -> move one level up *inside* the game
  // When present this fully replaces the legacy isInActiveGame()/hook guessing,
  // so e.g. a lobby goes back to the game's main menu instead of the site.
  function navHook() {
    var h = window.__brettBack;
    return (h && typeof h.atTop === 'function' && typeof h.up === 'function') ? h : null;
  }

  // Returns true when an active game is running (not in lobby/menu)
  function isInActiveGame() {
    if (typeof window.__brettNeedsConfirm === 'function') return window.__brettNeedsConfirm();
    var gs = document.getElementById('gameScreen');
    if (gs && !gs.classList.contains('hidden')) return true;
    var rs = document.getElementById('reviewScreen');
    if (rs && !rs.classList.contains('hidden')) return true;
    var wbGame = document.getElementById('game');
    if (wbGame && wbGame.classList.contains('active')) return true;
    var phaseOut = document.getElementById('phaseOut');
    if (phaseOut) {
      var safe = ['', 'Menü', 'Lobby', 'Menu', 'Lobby'];
      if (safe.indexOf(phaseOut.textContent.trim()) === -1) return true;
    }
    return false;
  }

  // Navigate to the game's own menu without leaving the page
  function goToGameMenu() {
    if (typeof window.__brettGoToGameMenu === 'function') { window.__brettGoToGameMenu(); return; }
    // Warbound Atlas — in-game ☰ dropdown → "Hauptmenü" item
    var wbBtn = document.getElementById('gmMainMenuBtn');
    if (wbBtn) { wbBtn.click(); return; }
    // Buchstabensturm — "Spiel beenden" button (with native confirm)
    var egb = document.getElementById('endGameBtn');
    if (egb) { egb.click(); return; }
    // Fallback: show our confirm overlay to navigate to brettspiele.fun
    var ol = document.getElementById('brettBackOverlay');
    if (ol) ol.classList.add('open');
  }

  // Keep button label and href in sync with game state
  function updateBtn() {
    var btn = document.getElementById('brettBackBtn');
    if (!btn) return;
    var h = navHook();
    if (h) {
      // Three-level navigation: in a match / in the lobby the back button
      // walks one level up *inside* the game (to its main menu); only from
      // the game's own top menu does it leave to the site catalogue.
      var top = h.atTop();
      btn.textContent = top ? '← Alle Spiele' : '← Hauptmenü';
      btn.href = top ? homeUrl() : '#';
      return;
    }
    var inGame = isInActiveGame();
    // Games that opt out of the leave-confirm for their lobby/menu state
    // (via __brettSkipLeaveConfirm) are showing a button that just leaves
    // straight away, so label it as a plain "back to home" action instead
    // of the more dramatic "end game" wording used while a match is live.
    var skipsConfirm = !inGame && typeof window.__brettSkipLeaveConfirm === 'function' && window.__brettSkipLeaveConfirm();
    btn.textContent = inGame ? '← Menü' : (skipsConfirm ? 'Zurück zum Hauptmenü' : 'Spiel beenden');
    btn.href = inGame ? '#' : homeUrl();
  }

  function init() {
    var url = homeUrl();

    // Fallback confirm modal (used when no in-page exit button exists)
    var modal = document.createElement('div');
    modal.className = 'brett-back-overlay';
    modal.id = 'brettBackOverlay';
    modal.innerHTML =
      '<div class="brett-back-card">' +
        '<h2>Spiel wirklich beenden?</h2>' +
        '<p>Kehre zur Spieleübersicht zurück. Das aktuelle Spiel geht verloren.</p>' +
        '<div class="brett-back-actions">' +
          '<button class="brett-back-cancel" id="brettBackCancel">Abbrechen</button>' +
          '<button class="brett-back-ok"     id="brettBackOk">Ja, beenden</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('brettBackCancel').addEventListener('click', function () { modal.classList.remove('open'); });
    document.getElementById('brettBackOk').addEventListener('click', function () { window.location.href = url; });

    // Back button
    var wrap = document.createElement('div');
    wrap.className = 'game-top-left';
    var btn = document.createElement('a');
    btn.id = 'brettBackBtn';
    btn.className = 'game-back-btn';
    btn.href = url;
    btn.setAttribute('aria-label', 'Zurück zur Spieleübersicht');
    btn.textContent = 'Spiel beenden';
    wrap.appendChild(btn);
    document.body.insertBefore(wrap, document.body.firstChild);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var h = navHook();
      if (h) {
        if (h.atTop()) window.location.href = url;  // at game's top menu → leave to catalogue
        else h.up();                                 // otherwise walk one level up in-page
        return;
      }
      if (isInActiveGame()) {
        goToGameMenu();
      } else if (typeof window.__brettSkipLeaveConfirm === 'function' && window.__brettSkipLeaveConfirm()) {
        // Game opts out of the leave-confirm for its lobby/menu state.
        window.location.href = url;
      } else {
        // Not in an active game (e.g. still in the lobby) — confirm before
        // leaving, since a host could otherwise lose a just-created room.
        modal.classList.add('open');
      }
    });

    setInterval(updateBtn, 800);
    updateBtn();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
