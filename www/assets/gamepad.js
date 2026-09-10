// gamepad.js — site-wide controller support for brettspiele.fun.
//
// One shared layer that makes every page (shelf, lobbies, games, studio,
// account) fully playable with a gamepad, without each game having to know
// about controllers:
//
//   · NAV mode (default)  — D-pad / left stick moves a focus ring across the
//     real focusable DOM elements (spatial navigation), A activates them.
//     Selects, ranges and number inputs are adjusted with left/right, text
//     inputs open the on-screen keyboard.
//   · CURSOR mode (Y)     — a virtual mouse pointer that emits real
//     pointer/mouse events, so canvas games (drawing, 3D boards, maps) work
//     with a stick + A to click/drag, without any game-side code.
//
// Everything the layer shows is plain DOM (keyboard, help overlay), so the
// same spatial navigation drives it and games can style it if they want.
//
// Public API: window.BFPad — see the bottom of this file.
(() => {
  'use strict';

  if (window.BFPad) return;                       // already wired
  if (!('getGamepads' in navigator)) return;      // no Gamepad API at all

  /* ===================== configuration ===================== */

  const AXIS_DEAD = 0.42;        // stick deflection that counts as a direction
  const CURSOR_DEAD = 0.16;      // smaller: cursor should react to soft pushes
  const TRIGGER_ON = 0.5;        // analog trigger press threshold
  const REPEAT_FIRST = 400;      // ms before a held direction starts repeating
  const REPEAT_NEXT = 110;       // ms between repeats
  const CURSOR_SPEED = 1150;     // px/s at full stick deflection
  const SCROLL_SPEED = 1400;     // px/s at full stick deflection
  const HINT_MS = 4200;          // how long the toast/hint bar stays up

  const SWAP_KEY = 'brettspiele.padSwapAB';
  const SEEN_KEY = 'brettspiele.padHelpSeen';

  // Standard mapping (https://w3c.github.io/gamepad/#remapping)
  const B_A = 0, B_B = 1, B_X = 2, B_Y = 3, B_LB = 4, B_RB = 5,
        B_LT = 6, B_RT = 7, B_BACK = 8, B_START = 9, B_L3 = 10, B_R3 = 11,
        B_UP = 12, B_DOWN = 13, B_LEFT = 14, B_RIGHT = 15;

  const FOCUSABLE = [
    'a[href]', 'button', 'summary', 'select', 'textarea',
    'input:not([type="hidden"])',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="option"]',
    '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]',
    '[data-pad-focus]'
  ].join(',');

  // Containers that, when visible, capture navigation (a modal traps focus).
  const MODAL_SEL = [
    'dialog[open]', '[role="dialog"]:not([hidden])', '.bfpad-layer',
    '.modal', '.overlay', '.gc-modal', '.gc-overlay', '.lobby-overlay',
    '.ranking-overlay', '.confirm-overlay', '.cpo-overlay', '.vs-overlay',
    '.deploy-dialog', '.modal-backdrop', '[data-pad-modal]'
  ].join(',');

  // Buttons that close the container they live in (for the B button).
  const CLOSE_SEL = [
    '[data-pad-close]', '.modal-cancel', '.cards-modal-close', '.gc-close',
    '.close', '.btn-close', '[aria-label*="chließ" i]', '[aria-label*="close" i]'
  ].join(',');

  /* ===================== small helpers ===================== */

  const i18n = () => window.BFI18N;
  const t = (key, fallback, vars) => {
    const api = i18n();
    const out = api && api.t ? api.t(key, vars || {}, fallback) : null;
    // BFI18N.t returns the key itself when a pack is missing — prefer our fallback.
    return !out || out === key ? fallback : out;
  };
  const read = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v == null ? dflt : v; } catch (e) { return dflt; }
  };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (e) {} };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* ===================== runtime state ===================== */

  const state = {
    padCount: 0,
    engaged: false,        // a button was pressed at least once → show pad UI
    mode: 'nav',           // 'nav' | 'cursor'
    focus: null,           // currently focused element (nav mode)
    cursor: { x: 0, y: 0, down: false, target: null },
    swapAB: read(SWAP_KEY, '0') === '1',
    raf: 0,
    last: 0,
    held: Object.create(null),   // button/direction → {since, next}
    prev: Object.create(null),   // previous pressed state for edge detection
    osk: null,             // on-screen keyboard element while open
    oskTarget: null,       // the input/textarea being edited
    help: null,            // help overlay element while open
    listeners: Object.create(null),
    binds: Object.create(null)   // game-registered button handlers
  };

  const emit = (name, detail) => {
    (state.listeners[name] || []).forEach((fn) => { try { fn(detail); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('brettspiele-pad-' + name, { detail })); } catch (e) {}
  };

  /* ===================== visibility / candidates ===================== */

  function visible(el) {
    if (!el || el.disabled || el.closest('[hidden]') || el.closest('[inert]')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.closest('.bfpad-ignore, [data-pad-skip]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    // Fully outside the document flow (e.g. an off-screen slide-in panel).
    if (r.bottom < -200 || r.top > window.innerHeight + 200) return false;
    if (r.right < -200 || r.left > window.innerWidth + 200) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
    if (cs.pointerEvents === 'none') return false;
    return true;
  }

  // The scope navigation is confined to: the topmost visible modal, or the
  // whole document. Keeps the focus ring out of the page behind a dialog.
  function scope() {
    if (state.osk) return state.osk;
    if (state.help) return state.help;
    const open = Array.from(document.querySelectorAll(MODAL_SEL))
      .filter((el) => visible(el) && el.querySelector(FOCUSABLE));
    if (!open.length) return document;
    // Deepest/last one wins — matches how these overlays stack.
    let best = open[0];
    for (const el of open) {
      if (best.contains(el) || !el.contains(best)) best = el;
    }
    return best;
  }

  // Playfields are not focusable HTML: a three.js board or the drawing canvas
  // is just a <canvas> the game mounts at runtime. Anything big enough to BE
  // the board is adopted as one navigation target that A steps into with the
  // pointer — so no game needs to mark up its canvas by hand.
  function playfields(root) {
    const out = [];
    root.querySelectorAll('canvas, [data-pad-cursor]').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      const big = r.width >= 240 && r.height >= 180 &&
                  r.width * r.height >= innerWidth * innerHeight * 0.15;
      if (!el.hasAttribute('data-pad-cursor') && !big) return;
      if (!el.hasAttribute('data-pad-cursor')) el.setAttribute('data-pad-cursor', '');
      if (!el.hasAttribute('tabindex')) el.tabIndex = -1;   // focusable, but not by Tab
      out.push(el);
    });
    return out;
  }

  function candidates() {
    const root = scope();
    const list = [];
    root.querySelectorAll(FOCUSABLE).forEach((el) => { if (visible(el)) list.push(el); });
    for (const el of playfields(root === document ? document : root)) {
      if (!list.includes(el)) list.push(el);
    }
    return list;
  }

  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  };

  /* ===================== spatial navigation ===================== */

  // Pick the nearest element in a direction: primary cost is the distance
  // along the travel axis, with a heavy penalty for drifting sideways, so a
  // grid of game cards steps row by row instead of jumping diagonally.
  function pick(dir) {
    const list = candidates();
    if (!list.length) return null;
    const cur = state.focus && list.includes(state.focus) ? state.focus : null;
    if (!cur) {
      // Nothing focused yet: start at the element closest to the top-left of
      // the viewport that is actually on screen.
      let best = null, bestScore = Infinity;
      for (const el of list) {
        const c = centerOf(el);
        if (c.r.bottom < 0 || c.r.top > window.innerHeight) continue;
        const s = c.y * 2 + c.x;
        if (s < bestScore) { bestScore = s; best = el; }
      }
      return best || list[0];
    }

    const a = centerOf(cur);
    const horiz = dir === 'left' || dir === 'right';
    const sign = (dir === 'right' || dir === 'down') ? 1 : -1;
    let best = null, bestScore = Infinity;

    for (const el of list) {
      if (el === cur) continue;
      const b = centerOf(el);
      const along = horiz ? (b.x - a.x) * sign : (b.y - a.y) * sign;
      const side = horiz ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
      // Must actually lie in the requested direction. The small threshold
      // avoids re-picking elements that merely overlap the current one.
      if (along < 8) continue;
      // Overlap along the perpendicular axis makes a candidate much better:
      // the next control in the same row/column should win over a nearer one
      // that sits diagonally.
      const overlap = horiz
        ? Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
        : Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const score = along + side * (overlap > 0 ? 0.35 : 3.2);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  function setFocus(el, opts) {
    if (!el) return;
    if (state.focus && state.focus !== el) state.focus.classList.remove('bfpad-focused');
    state.focus = el;
    el.classList.add('bfpad-focused');
    try {
      // Focus without the browser's own scroll, then scroll ourselves so the
      // element is centred rather than barely in view.
      el.focus({ preventScroll: true });
    } catch (e) { try { el.focus(); } catch (e2) {} }
    if (!opts || opts.scroll !== false) {
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    updateRing();
    if (el.matches('[data-pad-cursor]')) showHint(t('pad.hint.enterBoard', 'Ⓐ: Zeiger auf dem Spielfeld'));
    emit('focus', { element: el });
  }

  function navigate(dir) {
    const next = pick(dir);
    if (next) { setFocus(next); rumble(12, 0.12); }
  }

  /* ===================== focus ring + cursor visuals ===================== */

  let ring = null, cursorEl = null, hintBar = null, hintTimer = 0;

  function ensureChrome() {
    if (ring) return;
    ring = document.createElement('div');
    ring.className = 'bfpad-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);

    cursorEl = document.createElement('div');
    cursorEl.className = 'bfpad-cursor';
    cursorEl.setAttribute('aria-hidden', 'true');
    cursorEl.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l7.5 18 2.4-7.1 7.1-2.4z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursorEl);

    hintBar = document.createElement('div');
    hintBar.className = 'bfpad-hints';
    hintBar.setAttribute('role', 'status');
    hintBar.setAttribute('aria-live', 'polite');
    document.body.appendChild(hintBar);
  }

  function updateRing() {
    if (!ring) return;
    const el = state.focus;
    if (!state.engaged || state.mode !== 'nav' || !el || !visible(el)) {
      ring.classList.remove('on');
      return;
    }
    const r = el.getBoundingClientRect();
    ring.style.transform = `translate(${Math.round(r.left - 5)}px, ${Math.round(r.top - 5)}px)`;
    ring.style.width = Math.round(r.width + 10) + 'px';
    ring.style.height = Math.round(r.height + 10) + 'px';
    ring.style.borderRadius = getComputedStyle(el).borderRadius || '10px';
    ring.classList.add('on');
  }

  function showHint(text, ms) {
    ensureChrome();
    hintBar.textContent = text;
    hintBar.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintBar.classList.remove('on'), ms || HINT_MS);
  }

  const btnA = () => (state.swapAB ? 'Ⓑ' : 'Ⓐ');
  const btnB = () => (state.swapAB ? 'Ⓐ' : 'Ⓑ');

  function contextHint() {
    if (state.osk) {
      return `${btnA()} ${t('pad.osk.type', 'Taste')} · ${btnB()} ${t('pad.osk.done', 'Fertig')} · ☰ ${t('pad.help.title', 'Tastenbelegung')}`;
    }
    if (state.mode === 'cursor') {
      return `${t('pad.hint.cursor', 'Zeiger')} · ${btnA()} ${t('pad.hint.click', 'Klicken/Ziehen')} · Ⓨ ${t('pad.hint.navMode', 'Menümodus')} · ☰ ${t('pad.help.title', 'Tastenbelegung')}`;
    }
    return `${btnA()} ${t('pad.hint.select', 'Auswählen')} · ${btnB()} ${t('pad.hint.back', 'Zurück')} · Ⓨ ${t('pad.hint.cursorMode', 'Zeiger')} · ☰ ${t('pad.help.title', 'Tastenbelegung')}`;
  }

  /* ===================== synthetic pointer input (cursor mode) ===================== */

  function fire(type, x, y, extra) {
    const el = document.elementFromPoint(clamp(x, 0, innerWidth - 1), clamp(y, 0, innerHeight - 1));
    if (!el) return null;
    const init = Object.assign({
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      button: 0, buttons: state.cursor.down ? 1 : 0,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: state.cursor.down ? 0.5 : 0
    }, extra || {});
    try { el.dispatchEvent(new PointerEvent('pointer' + type, init)); } catch (e) {}
    const mouseType = type === 'move' ? 'mousemove' : type === 'down' ? 'mousedown' : 'mouseup';
    try { el.dispatchEvent(new MouseEvent(mouseType, init)); } catch (e) {}
    return el;
  }

  function cursorPress() {
    const c = state.cursor;
    c.down = true;
    c.target = fire('down', c.x, c.y);
    cursorEl.classList.add('down');
  }

  function cursorRelease() {
    const c = state.cursor;
    if (!c.down) return;
    c.down = false;
    cursorEl.classList.remove('down');
    fire('up', c.x, c.y);
    // A click only counts when press and release land on the same element,
    // exactly like a real mouse — dragging on a canvas must not also click.
    const el = document.elementFromPoint(clamp(c.x, 0, innerWidth - 1), clamp(c.y, 0, innerHeight - 1));
    if (el && c.target && (el === c.target || el.contains(c.target) || c.target.contains(el))) {
      try {
        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: c.x, clientY: c.y, button: 0
        }));
      } catch (e) {}
    }
    c.target = null;
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    if (state.mode === 'cursor') cursorRelease();
    state.mode = mode;
    document.documentElement.dataset.padMode = mode;
    if (mode === 'cursor') {
      ensureChrome();
      const c = state.cursor;
      if (!c.x && !c.y) {
        // Start the pointer where the user was looking: on the focused
        // element if there is one, otherwise the middle of the screen.
        const src = state.focus && visible(state.focus) ? centerOf(state.focus) : null;
        c.x = src ? src.x : innerWidth / 2;
        c.y = src ? src.y : innerHeight / 2;
      }
      cursorEl.classList.add('on');
      showHint(contextHint());
    } else {
      if (cursorEl) cursorEl.classList.remove('on');
      if (!state.focus || !visible(state.focus)) setFocus(pick('down'));
      showHint(contextHint());
    }
    updateRing();
    emit('mode', { mode });
  }

  /* ===================== activation of the focused element ===================== */

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return el.isContentEditable;
    return ['text', 'search', 'email', 'url', 'tel', 'password', ''].includes((el.type || 'text').toLowerCase());
  }

  function activate() {
    const el = state.focus;
    if (!el || !visible(el)) { setFocus(pick('down')); return; }
    if (isTextInput(el)) { openKeyboard(el); return; }
    if (el.tagName === 'SELECT') { el.focus(); showHint(t('pad.hint.selectAdjust', 'Mit ◀ ▶ Auswahl ändern')); return; }
    // Playfields (3D boards, the drawing canvas, maps) are marked up as one
    // focusable block: A steps "into" them with the virtual pointer instead of
    // firing a click nobody positioned.
    if (el.matches('[data-pad-cursor]')) {
      const c = centerOf(el);
      state.cursor.x = c.x;
      state.cursor.y = c.y;
      if (cursorEl) cursorEl.style.transform = `translate(${c.x}px, ${c.y}px)`;
      setMode('cursor');
      return;
    }
    rumble(35, 0.35);
    el.click();
    // Menus and lobbies rebuild themselves on click; re-anchor the ring on the
    // next frame so it does not sit over a removed element.
    requestAnimationFrame(() => {
      if (state.focus && !visible(state.focus)) setFocus(pick('down'));
      else updateRing();
    });
  }

  // Left/right on a control that has a value adjusts it instead of moving the
  // focus — the natural console behaviour for sliders and dropdowns.
  function adjust(delta) {
    const el = state.focus;
    if (!el) return false;
    if (el.tagName === 'SELECT') {
      const n = el.options.length;
      if (!n) return true;
      let i = el.selectedIndex;
      for (let step = 0; step < n; step++) {
        i = (i + delta + n) % n;
        if (!el.options[i].disabled) break;
      }
      el.selectedIndex = i;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      rumble(15, 0.2);
      return true;
    }
    if (el.tagName === 'INPUT' && ['range', 'number'].includes((el.type || '').toLowerCase())) {
      const step = Number(el.step) || 1;
      const min = el.min === '' ? -Infinity : Number(el.min);
      const max = el.max === '' ? Infinity : Number(el.max);
      const next = clamp((Number(el.value) || 0) + step * delta, min, max);
      el.value = String(next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      rumble(15, 0.2);
      return true;
    }
    return false;
  }

  /* ===================== back / menu ===================== */

  function escapeKey(target) {
    const ev = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    (target || document).dispatchEvent(new KeyboardEvent('keydown', ev));
    (target || document).dispatchEvent(new KeyboardEvent('keyup', ev));
  }

  function goBack() {
    if (state.osk) { closeKeyboard(); return; }
    if (state.help) { closeHelp(); return; }

    // Something is open on top of the page: close that, and only that.
    const root = scope();
    if (root !== document) {
      const close = root.querySelector(CLOSE_SEL);
      if (close && visible(close)) close.click();
      else escapeKey();
      afterOverlayChange();
      return;
    }

    // Nothing open. game-chrome.js' back button already knows each game's
    // screen hierarchy (match → lobby → game menu → shelf) and puts up the
    // "really quit?" confirm where it matters, so B walks exactly that path.
    const back = document.querySelector('[data-pad-back], #brettBackBtn');
    if (back && visible(back)) { back.click(); afterOverlayChange(); return; }

    // Embedded game (iframe): ask the hosting page to go up one level.
    if (window.parent !== window) {
      try { window.parent.postMessage({ bfpad: 'back' }, location.origin); } catch (e) {}
      return;
    }
    escapeKey();
    afterOverlayChange();
  }

  function afterOverlayChange() {
    requestAnimationFrame(() => {
      if (!state.focus || !visible(state.focus)) setFocus(pick('down'));
      else updateRing();
    });
  }

  function openMenu() {
    const menu = document.querySelector('[data-pad-menu], .game-actions-toggle, [data-nav-toggle], .hud-menu-btn, #menuBtn');
    if (menu && visible(menu)) { menu.click(); afterOverlayChange(); showHint(t('pad.hint.menu', 'Menü')); return; }
    showHint(t('pad.hint.noMenu', 'Kein Menü auf dieser Seite'));
  }

  /* ===================== on-screen keyboard ===================== */

  const KB_LATIN = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l','-'],
    ['z','x','c','v','b','n','m','ä','ö','ü']
  ];
  const KB_CYR = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['й','ц','у','к','е','н','г','ш','щ','з'],
    ['ф','ы','в','а','п','р','о','л','д','ж'],
    ['я','ч','с','м','и','т','ь','б','ю','э']
  ];
  const KB_SYM = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['.',',','?','!','@','#','&','/','+','='],
    ['(',')','[',']','{','}','<','>','"','\''],
    ['€','$','%','*','_','~','^','|','\\',':']
  ];

  let kbShift = false, kbLayout = 'letters';

  function keyboardRows() {
    if (kbLayout === 'symbols') return KB_SYM;
    const lang = i18n() && i18n().getLanguage ? i18n().getLanguage() : 'de';
    return lang === 'ru' ? KB_CYR : KB_LATIN;
  }

  function insert(text) {
    const el = state.oskTarget;
    if (!el) return;
    if (el.isContentEditable) {
      el.textContent = (el.textContent || '') + text;
    } else {
      const max = el.maxLength;
      let value = (el.value || '') + text;
      if (max > 0 && value.length > max) value = value.slice(0, max);
      el.value = value;
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    updateOskPreview();
  }

  function backspace() {
    const el = state.oskTarget;
    if (!el) return;
    if (el.isContentEditable) el.textContent = (el.textContent || '').slice(0, -1);
    else el.value = (el.value || '').slice(0, -1);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    updateOskPreview();
  }

  function updateOskPreview() {
    if (!state.osk) return;
    const el = state.oskTarget;
    const pre = state.osk.querySelector('.bfpad-osk-value');
    if (pre) pre.textContent = (el && (el.isContentEditable ? el.textContent : el.value)) || '';
  }

  function keyButton(label, action, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bfpad-key' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', (e) => { e.preventDefault(); action(); });
    // Never let the keyboard steal the DOM focus from the input it edits —
    // some games react to blur on their name/room fields.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  }

  function buildKeyboard() {
    const wrap = state.osk;
    const grid = wrap.querySelector('.bfpad-osk-keys');
    grid.textContent = '';
    for (const row of keyboardRows()) {
      const line = document.createElement('div');
      line.className = 'bfpad-key-row';
      for (const ch of row) {
        const label = kbShift ? ch.toUpperCase() : ch;
        line.appendChild(keyButton(label, () => insert(label)));
      }
      grid.appendChild(line);
    }
    const last = document.createElement('div');
    last.className = 'bfpad-key-row';
    last.appendChild(keyButton('⇧', () => { kbShift = !kbShift; buildKeyboard(); }, 'wide' + (kbShift ? ' active' : '')));
    last.appendChild(keyButton(kbLayout === 'symbols' ? 'ABC' : '?123', () => {
      kbLayout = kbLayout === 'symbols' ? 'letters' : 'symbols';
      buildKeyboard();
    }, 'wide'));
    last.appendChild(keyButton(t('pad.osk.space', 'Leerzeichen'), () => insert(' '), 'space'));
    last.appendChild(keyButton('⌫', backspace, 'wide'));
    last.appendChild(keyButton(t('pad.osk.done', 'Fertig'), commitKeyboard, 'wide primary'));
    grid.appendChild(last);

    const first = grid.querySelector('.bfpad-key');
    if (first && (!state.focus || !wrap.contains(state.focus))) setFocus(first, { scroll: false });
    else updateRing();
  }

  function openKeyboard(target) {
    if (state.osk) closeKeyboard();
    ensureChrome();
    state.oskTarget = target;
    kbShift = false;
    kbLayout = 'letters';

    const wrap = document.createElement('div');
    wrap.className = 'bfpad-layer bfpad-osk';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t('pad.osk.title', 'Bildschirmtastatur'));
    wrap.innerHTML =
      '<div class="bfpad-osk-head">' +
        '<span class="bfpad-osk-label"></span>' +
        '<span class="bfpad-osk-value"></span>' +
      '</div><div class="bfpad-osk-keys"></div>';
    document.body.appendChild(wrap);
    state.osk = wrap;

    const label = wrap.querySelector('.bfpad-osk-label');
    const described = target.getAttribute('aria-label') || target.getAttribute('placeholder') ||
      (target.labels && target.labels[0] && target.labels[0].textContent) || t('pad.osk.title', 'Bildschirmtastatur');
    label.textContent = String(described).trim();

    try { target.focus({ preventScroll: true }); } catch (e) {}
    buildKeyboard();
    updateOskPreview();
    showHint(contextHint());
  }

  function commitKeyboard() {
    const el = state.oskTarget;
    closeKeyboard();
    if (!el) return;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // Enter is what most of the lobbies listen for (join room, send chat).
    const ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', ev));
    el.dispatchEvent(new KeyboardEvent('keyup', ev));
  }

  function closeKeyboard() {
    if (!state.osk) return;
    const target = state.oskTarget;
    state.osk.remove();
    state.osk = null;
    state.oskTarget = null;
    if (target && visible(target)) setFocus(target);
    else afterOverlayChange();
    showHint(contextHint());
  }

  /* ===================== help overlay ===================== */

  const HELP_ROWS = () => [
    ['✛ / ⌾', t('pad.help.move', 'Auswahl bewegen')],
    [btnA(), t('pad.help.select', 'Auswählen · Text eingeben · gedrückt halten zum Ziehen')],
    [btnB(), t('pad.help.back', 'Zurück · Dialog schließen')],
    ['Ⓧ', t('pad.help.keyboard', 'Bildschirmtastatur öffnen')],
    ['Ⓨ', t('pad.help.cursor', 'Zwischen Menü- und Zeigermodus wechseln')],
    ['LB / RB', t('pad.help.section', 'Zum vorigen/nächsten Abschnitt springen')],
    ['LT / RT', t('pad.help.scroll', 'Seitenweise blättern')],
    ['⌾ ' + t('pad.help.rightStick', 'rechter Stick'), t('pad.help.scrollStick', 'Scrollen (im Zeigermodus: Zoom-Rad)')],
    ['☰ / Select', t('pad.help.help', 'Diese Übersicht')],
    ['≡ / Start', t('pad.help.menu', 'Menü des Spiels öffnen')]
  ];

  function openHelp() {
    if (state.help) { closeHelp(); return; }
    ensureChrome();
    const wrap = document.createElement('div');
    wrap.className = 'bfpad-layer bfpad-help';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t('pad.help.title', 'Tastenbelegung'));

    const rows = HELP_ROWS().map(([k, d]) =>
      `<div class="bfpad-help-row"><kbd>${k}</kbd><span>${d}</span></div>`).join('');
    wrap.innerHTML =
      `<h2>${t('pad.help.title', 'Tastenbelegung')}</h2>` +
      `<div class="bfpad-help-rows">${rows}</div>` +
      '<div class="bfpad-help-actions"></div>';

    const actions = wrap.querySelector('.bfpad-help-actions');
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'bfpad-key wide' + (state.swapAB ? ' active' : '');
    swap.textContent = t('pad.help.swap', 'A/B tauschen (Nintendo-Layout)');
    swap.addEventListener('click', () => {
      state.swapAB = !state.swapAB;
      write(SWAP_KEY, state.swapAB ? '1' : '0');
      swap.classList.toggle('active', state.swapAB);
      closeHelp();
      openHelp();
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bfpad-key wide primary';
    close.setAttribute('data-pad-close', '');
    close.textContent = t('pad.help.close', 'Schließen');
    close.addEventListener('click', closeHelp);
    actions.appendChild(swap);
    actions.appendChild(close);

    document.body.appendChild(wrap);
    state.help = wrap;
    write(SEEN_KEY, '1');
    setFocus(close, { scroll: false });
  }

  function closeHelp() {
    if (!state.help) return;
    state.help.remove();
    state.help = null;
    afterOverlayChange();
    showHint(contextHint());
  }

  /* ===================== section jumping (LB / RB) ===================== */

  // Landmark-ish blocks a player expects to hop between: the shelf sections,
  // a game's HUD panels, the lobby columns.
  const SECTION_SEL = 'section, main, header, footer, nav, aside, [data-pad-section], .panel, .card, .game-grid, .hud';

  function jumpSection(delta) {
    const blocks = Array.from(document.querySelectorAll(SECTION_SEL))
      .filter((el) => visible(el) && el.querySelector(FOCUSABLE))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (!blocks.length) return;
    let idx = blocks.findIndex((el) => state.focus && el.contains(state.focus));
    idx = idx < 0 ? (delta > 0 ? -1 : blocks.length) : idx;
    for (let i = idx + delta; i >= 0 && i < blocks.length; i += delta) {
      const target = Array.from(blocks[i].querySelectorAll(FOCUSABLE)).find(visible);
      if (target && !blocks[i].contains(state.focus)) { setFocus(target); rumble(20, 0.2); return; }
    }
  }

  /* ===================== scrolling ===================== */

  function scrollableFrom(el) {
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 4) return node;
      node = node.parentElement;
    }
    return null;
  }

  function scrollBy(dy) {
    const box = scrollableFrom(state.mode === 'cursor'
      ? document.elementFromPoint(clamp(state.cursor.x, 0, innerWidth - 1), clamp(state.cursor.y, 0, innerHeight - 1))
      : state.focus);
    if (box) box.scrollTop += dy;
    else window.scrollBy(0, dy);
    updateRing();
  }

  /* ===================== rumble ===================== */

  function rumble(ms, strength) {
    if (read('brettspiele.padRumble', '1') !== '1') return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (external && !Array.from(pads).filter(Boolean).length) {
      // Embedded game: only the hosting page holds the real pad object.
      try { window.parent.postMessage({ bfpad: 'rumble', ms, strength }, location.origin); } catch (e) {}
      return;
    }
    for (const pad of pads) {
      const act = pad && pad.vibrationActuator;
      if (!act || !act.playEffect) continue;
      try {
        act.playEffect('dual-rumble', {
          duration: ms, startDelay: 0,
          weakMagnitude: strength, strongMagnitude: strength * 0.6
        });
      } catch (e) {}
    }
  }

  /* ===================== embedded games (iframe bridge) =====================
     Kronenlande and Gruftgesindel run their actual game inside a same-origin
     <iframe>. A browser only hands gamepad state to a frame that has been
     interacted with, and two layers polling at once would double every press,
     so the hosting page stays the single reader and forwards its state to the
     frame while that frame is on screen. The frame's own layer then drives the
     game and sends "back" up when the player leaves it. */

  let external = null, externalAt = 0, lastSent = '';

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || e.origin !== location.origin) return;
    if (d.bfpad === 'state') {
      external = [{
        buttons: d.buttons.map((v) => ({ pressed: v > 0.5, value: v })),
        axes: d.axes
      }];
      externalAt = performance.now();
      engage();
      start();
    } else if (d.bfpad === 'back') {
      // Bubbled up from an embedded game that had nothing left to close.
      goBack();
    } else if (d.bfpad === 'rumble') {
      rumble(d.ms, d.strength);
    }
  });

  function delegateFrame() {
    for (const frame of document.querySelectorAll('iframe[data-pad-delegate]')) {
      if (visible(frame)) return frame;
    }
    return null;
  }

  function forward(frame, pads) {
    const buttons = [];
    for (let i = 0; i < 17; i++) {
      let v = 0;
      for (const pad of pads) {
        const b = pad.buttons && pad.buttons[i];
        if (!b) continue;
        const value = typeof b === 'object' ? (b.pressed ? Math.max(b.value, 1) : b.value) : b;
        if (value > v) v = value;
      }
      buttons.push(Math.round(v * 100) / 100);
    }
    const axes = [0, 1, 2, 3].map((i) => Math.round(axis(pads, i) * 100) / 100);
    const key = buttons.join(',') + '|' + axes.join(',');
    const idle = buttons.every((v) => v < 0.1) && axes.every((v) => Math.abs(v) < 0.1);
    // Chatter only while the player is actually pressing something; the first
    // idle frame is still sent so held buttons get released on the other side.
    if (idle && key === lastSent) return;
    lastSent = key;
    try { frame.contentWindow.postMessage({ bfpad: 'state', buttons, axes }, location.origin); } catch (e) {}
  }

  /* ===================== the poll loop ===================== */

  function readPads() {
    const local = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
    if (local.length) return local;
    // Forwarded state goes stale if the host page stops sending (tab switch,
    // navigation): drop it rather than leaving a button stuck down.
    if (external && performance.now() - externalAt < 2000) return external;
    external = null;
    return [];
  }

  function pressed(pads, index) {
    for (const pad of pads) {
      if (!pad || !pad.buttons) continue;
      const b = pad.buttons[index];
      if (!b) continue;
      if (typeof b === 'object' ? (b.pressed || b.value > TRIGGER_ON) : b > TRIGGER_ON) return true;
    }
    return false;
  }

  function axis(pads, index) {
    let out = 0;
    for (const pad of pads) {
      if (!pad || !pad.axes) continue;
      const v = pad.axes[index] || 0;
      if (Math.abs(v) > Math.abs(out)) out = v;
    }
    return out;
  }

  // Edge detection ("was just pressed this frame").
  function edge(pads, index, name) {
    const now = pressed(pads, index);
    const was = state.prev[name] || false;
    state.prev[name] = now;
    return now && !was;
  }

  // Direction with auto-repeat while held.
  function repeat(name, active, now) {
    const h = state.held[name];
    if (!active) { state.held[name] = null; return false; }
    if (!h) { state.held[name] = { next: now + REPEAT_FIRST }; return true; }
    if (now >= h.next) { h.next = now + REPEAT_NEXT; return true; }
    return false;
  }

  function engage() {
    if (state.engaged) return;
    state.engaged = true;
    ensureChrome();
    document.documentElement.dataset.pad = 'on';
    document.documentElement.dataset.padMode = state.mode;
    if (!state.focus || !visible(state.focus)) setFocus(pick('down'), { scroll: false });
    showHint(read(SEEN_KEY, '0') === '1'
      ? contextHint()
      : t('pad.connected', 'Controller erkannt — ☰ zeigt die Tastenbelegung'), 6000);
    emit('engage', {});
  }

  function loop(now) {
    state.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
    state.last = now;
    if (document.hidden) return;

    const pads = readPads();
    if (!pads.length) return;

    // An embedded game is on screen: hand the input over to it and stand down.
    const frame = delegateFrame();
    if (frame) {
      forward(frame, pads);
      if (ring) ring.classList.remove('on');
      if (cursorEl) cursorEl.classList.remove('on');
      return;
    }

    const a = state.swapAB ? B_B : B_A;
    const b = state.swapAB ? B_A : B_B;

    const anyPressed = pads.some((p) => p.buttons && p.buttons.some((x) => (typeof x === 'object' ? x.pressed : x > 0.5)));
    const stickHot = Math.abs(axis(pads, 0)) > AXIS_DEAD || Math.abs(axis(pads, 1)) > AXIS_DEAD;
    if (anyPressed || stickHot) engage();
    if (!state.engaged) return;

    /* ---- game-registered bindings get first refusal ---- */
    for (const key of Object.keys(state.binds)) {
      const idx = Number(key);
      if (edge(pads, idx, 'bind' + idx)) {
        let handled = false;
        try { handled = state.binds[key]({ button: idx, pads }) === true; } catch (e) {}
        if (handled) return;
      }
    }

    /* ---- cursor mode: stick drives a virtual mouse ---- */
    if (state.mode === 'cursor') {
      // A dialog that just opened wants menu navigation, not a free pointer.
      if (scope() !== document) { setMode('nav'); return; }

      const c = state.cursor;
      // D-pad nudges the pointer pixel by pixel — the precision the stick
      // cannot give when picking a small territory or a thin drawing line.
      const nudge = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      for (const dir of Object.keys(nudge)) {
        const held = pressed(pads, { up: B_UP, down: B_DOWN, left: B_LEFT, right: B_RIGHT }[dir]);
        if (!repeat('nudge-' + dir, held, now)) continue;
        c.x = clamp(c.x + nudge[dir][0] * 12, 0, innerWidth - 1);
        c.y = clamp(c.y + nudge[dir][1] * 12, 0, innerHeight - 1);
        cursorEl.style.transform = `translate(${c.x}px, ${c.y}px)`;
        fire('move', c.x, c.y);
      }

      const lx = axis(pads, 0), ly = axis(pads, 1);
      const mag = Math.hypot(lx, ly);
      if (mag > CURSOR_DEAD) {
        // Squared response: precise when nudged, fast when pushed.
        const speed = CURSOR_SPEED * mag * mag * dt;
        c.x = clamp(c.x + (lx / mag) * speed, 0, innerWidth - 1);
        c.y = clamp(c.y + (ly / mag) * speed, 0, innerHeight - 1);
        cursorEl.style.transform = `translate(${c.x}px, ${c.y}px)`;
        fire('move', c.x, c.y);
      }
      if (edge(pads, a, 'a')) cursorPress();
      else if (!pressed(pads, a) && c.down) cursorRelease();

      // Right stick = wheel, so 3D boards and maps can be zoomed.
      const ry = axis(pads, 3);
      if (Math.abs(ry) > AXIS_DEAD) {
        const el = document.elementFromPoint(clamp(c.x, 0, innerWidth - 1), clamp(c.y, 0, innerHeight - 1));
        if (el) {
          try {
            el.dispatchEvent(new WheelEvent('wheel', {
              bubbles: true, cancelable: true, deltaY: ry * 40, clientX: c.x, clientY: c.y
            }));
          } catch (e) {}
        }
      }
    }

    /* ---- nav mode: directional focus movement ---- */
    if (state.mode === 'nav') {
      const lx = axis(pads, 0), ly = axis(pads, 1);
      const dirs = {
        up: pressed(pads, B_UP) || ly < -AXIS_DEAD,
        down: pressed(pads, B_DOWN) || ly > AXIS_DEAD,
        left: pressed(pads, B_LEFT) || lx < -AXIS_DEAD,
        right: pressed(pads, B_RIGHT) || lx > AXIS_DEAD
      };
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (!repeat(dir, dirs[dir], now)) continue;
        if ((dir === 'left' || dir === 'right') && adjust(dir === 'right' ? 1 : -1)) continue;
        navigate(dir);
      }
      if (edge(pads, a, 'a')) activate();

      // Right stick scrolls the page/panel under the focus.
      const ry = axis(pads, 3);
      if (Math.abs(ry) > AXIS_DEAD) scrollBy(ry * SCROLL_SPEED * dt);
    }

    /* ---- shared buttons ---- */
    if (edge(pads, b, 'b')) goBack();
    if (edge(pads, B_X, 'x')) {
      if (isTextInput(state.focus)) openKeyboard(state.focus);
      else if (state.osk) { kbShift = !kbShift; buildKeyboard(); }
      else showHint(t('pad.hint.noInput', 'Kein Textfeld ausgewählt'));
    }
    // Both edges must be read every frame — a short-circuited || would skip
    // one button's bookkeeping and make it fire again on the next press.
    const toggledY = edge(pads, B_Y, 'y');
    const toggledL3 = edge(pads, B_L3, 'l3');
    if (toggledY || toggledL3) setMode(state.mode === 'cursor' ? 'nav' : 'cursor');
    if (edge(pads, B_BACK, 'back')) openHelp();
    if (edge(pads, B_START, 'start')) openMenu();
    if (edge(pads, B_LB, 'lb')) jumpSection(-1);
    if (edge(pads, B_RB, 'rb')) jumpSection(1);
    if (edge(pads, B_R3, 'r3')) {
      state.cursor.x = innerWidth / 2;
      state.cursor.y = innerHeight / 2;
      if (cursorEl) cursorEl.style.transform = `translate(${state.cursor.x}px, ${state.cursor.y}px)`;
    }
    if (pressed(pads, B_LT)) scrollBy(-SCROLL_SPEED * dt * 0.9);
    if (pressed(pads, B_RT)) scrollBy(SCROLL_SPEED * dt * 0.9);

    if (state.mode === 'nav' && state.focus) updateRing();
  }

  function start() {
    if (state.raf) return;
    state.last = 0;
    state.raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  /* ===================== wiring ===================== */

  function countPads() {
    return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean).length;
  }

  window.addEventListener('gamepadconnected', () => {
    state.padCount = countPads();
    start();
    ensureChrome();
    showHint(t('pad.connected', 'Controller erkannt — ☰ zeigt die Tastenbelegung'), 6000);
    emit('connected', {});
  });

  window.addEventListener('gamepaddisconnected', () => {
    state.padCount = countPads();
    if (state.padCount) return;
    stop();
    cursorRelease();
    state.engaged = false;
    delete document.documentElement.dataset.pad;
    if (state.focus) state.focus.classList.remove('bfpad-focused');
    if (ring) ring.classList.remove('on');
    if (cursorEl) cursorEl.classList.remove('on');
    showHint(t('pad.disconnected', 'Controller getrennt'));
    emit('disconnected', {});
  });

  // A pad that was already connected before this page loaded shows up right
  // away in some browsers; others only expose it after the first input event.
  if (countPads()) start();
  ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, function once() {
      if (countPads()) start();
      window.removeEventListener(type, once);
    }, { once: false, passive: true });
  });

  // Mouse or keyboard use hides the pad focus ring until the pad is used again.
  window.addEventListener('pointerdown', (e) => {
    if (!state.engaged || state.mode === 'cursor') return;
    if (e.isTrusted === false) return;
    if (ring) ring.classList.remove('on');
  });

  window.addEventListener('resize', updateRing);
  window.addEventListener('scroll', updateRing, { passive: true });
  window.addEventListener('brettspiele-language-change', () => {
    if (state.osk) buildKeyboard();
    if (state.help) { closeHelp(); openHelp(); }
    if (state.engaged) showHint(contextHint());
  });

  /* ===================== public API ===================== */

  window.BFPad = {
    /** True once the player has actually touched a controller. */
    get active() { return state.engaged; },
    get mode() { return state.mode; },
    get focused() { return state.focus; },
    setMode,
    focus: (el) => setFocus(el),
    /** Re-pick a focus target, e.g. after a screen was rebuilt. */
    refresh: () => afterOverlayChange(),
    openKeyboard,
    closeKeyboard,
    openHelp,
    hint: showHint,
    rumble,
    /** Register a handler for one raw button index; return true to consume it. */
    bind: (button, fn) => { state.binds[String(button)] = fn; },
    unbind: (button) => { delete state.binds[String(button)]; },
    on: (name, fn) => { (state.listeners[name] = state.listeners[name] || []).push(fn); },
    off: (name, fn) => {
      state.listeners[name] = (state.listeners[name] || []).filter((f) => f !== fn);
    },
    buttons: { A: B_A, B: B_B, X: B_X, Y: B_Y, LB: B_LB, RB: B_RB, LT: B_LT, RT: B_RT,
               BACK: B_BACK, START: B_START, L3: B_L3, R3: B_R3,
               UP: B_UP, DOWN: B_DOWN, LEFT: B_LEFT, RIGHT: B_RIGHT }
  };
})();
