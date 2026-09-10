// sound.js — tiny shared sound helper for brettspiele.fun games.
// Browser-safe: sounds are only played after user interaction or explicit game events.
// Adds a persistent, cross-game mute toggle and auto-injects a small speaker
// button into each game's top action bar (next to the language/theme controls).
(() => {
  'use strict';

  const script = document.currentScript;
  const base = new URL('.', script?.src || location.href).href;
  const files = {
    draw: new URL('card-draw.mp3', base).href,
    victory: new URL('victory.mp3', base).href,
  };
  const volumes = { draw: 0.55, victory: 0.7 };
  const MUSIC_FILE = new URL('background.mp3', base).href;
  const cache = new Map();

  const STORE_KEY = 'brettspiele.muted';
  const VOL_KEY   = 'brettspiele.volumes';

  function loadMuted() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (_) { return false; }
  }
  function loadVols() {
    try { return { ...{music:18, sfx:100}, ...JSON.parse(localStorage.getItem(VOL_KEY) || '{}') }; }
    catch (_) { return {music:18, sfx:100}; }
  }
  let muted = loadMuted();
  let vols  = loadVols();

  function saveVols() {
    try { localStorage.setItem(VOL_KEY, JSON.stringify(vols)); } catch (_) {}
  }

  function get(name) {
    if (!files[name]) return null;
    if (!cache.has(name)) {
      const audio = new Audio(files[name]);
      audio.preload = 'auto';
      audio.volume = volumes[name] ?? 0.6;
      cache.set(name, audio);
    }
    return cache.get(name);
  }

  function play(name, opts = {}) {
    if (muted) return;
    const src = get(name);
    if (!src) return;
    try {
      const audio = src.cloneNode(true);
      const base_vol = opts.volume ?? src.volume;
      audio.volume = Math.max(0, Math.min(1, base_vol * (vols.sfx / 100)));
      audio.currentTime = opts.startAt ?? 0;
      if (opts.rate != null) audio.playbackRate = opts.rate;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  /* ===== Background music (looping, mute-aware) ===================== */
  let music = null;
  let musicWanted = false;
  function ensureMusic() {
    if (music) return music;
    try {
      music = new Audio(MUSIC_FILE);
      music.loop = true;
      music.preload = 'auto';
      music.volume = vols.music / 100;
    } catch (_) { music = null; }
    return music;
  }
  function applyMusicState() {
    const m = ensureMusic();
    if (!m) return;
    if (musicWanted && !muted) {
      const p = m.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      try { m.pause(); } catch (_) {}
    }
  }
  function startMusic() { musicWanted = true; applyMusicState(); }
  function stopMusic()  {
    musicWanted = false;
    if (music) { try { music.pause(); music.currentTime = 0; } catch (_) {} }
  }

  function setMusicVolume(pct) {
    vols.music = Math.max(0, Math.min(100, Math.round(pct)));
    saveVols();
    if (music) { try { music.volume = vols.music / 100; } catch (_) {} }
  }
  function getMusicVolume() { return vols.music; }
  function setSfxVolume(pct) {
    vols.sfx = Math.max(0, Math.min(100, Math.round(pct)));
    saveVols();
  }
  function getSfxVolume() { return vols.sfx; }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem(STORE_KEY, muted ? '1' : '0'); } catch (_) {}
    applyMusicState();
    syncButtons();
    try { window.dispatchEvent(new CustomEvent('brettspiele-sound-change', { detail: { muted } })); } catch (_) {}
  }
  function isMuted() { return muted; }
  function toggleMuted() { setMuted(!muted); return muted; }
  function preload() { Object.keys(files).forEach(get); }

  /* ===== Mute button (auto-injected) ================================= */
  const LABELS = {
    on:  { de:'Ton ausschalten', en:'Mute sound', fr:'Couper le son', es:'Silenciar sonido', it:'Disattiva audio', ru:'Выключить звук', zh:'关闭声音', ja:'音を消す' },
    off: { de:'Ton einschalten', en:'Unmute sound', fr:'Activer le son', es:'Activar sonido', it:'Attiva audio', ru:'Включить звук', zh:'开启声音', ja:'音を出す' },
  };
  function lang() {
    try { return (window.BFI18N && window.BFI18N.getLanguage && window.BFI18N.getLanguage()) || 'de'; } catch (_) { return 'de'; }
  }
  function label() {
    const l = lang();
    const set = muted ? LABELS.off : LABELS.on;
    return set[l] || set.de;
  }

  function injectStyle() {
    if (document.getElementById('brett-sound-style')) return;
    const st = document.createElement('style');
    st.id = 'brett-sound-style';
    st.textContent =
      '.brett-sound-toggle{cursor:pointer}' +
      '.brett-sound-toggle .bs-ico{font-size:1.05em;line-height:1;pointer-events:none}' +
      '.brett-sound-toggle.bs-default{display:inline-flex;align-items:center;justify-content:center;' +
        'width:2.2em;height:2.2em;padding:0;border-radius:8px;border:1px solid rgba(128,128,128,.4);' +
        'background:rgba(128,128,128,.14);color:inherit;font:inherit}' +
      '.brett-sound-toggle.bs-default:hover{background:rgba(128,128,128,.26)}' +
      '.brett-sound-toggle.bs-muted{opacity:.7}' +
      '.brett-sound-toggle--floating{position:fixed;right:14px;bottom:14px;z-index:99999}';
    (document.head || document.documentElement).appendChild(st);
  }

  function syncOne(btn) {
    btn.classList.toggle('bs-muted', muted);
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.title = label();
    btn.setAttribute('aria-label', label());
    const ico = btn.querySelector('.bs-ico');
    if (ico) ico.textContent = muted ? '🔇' : '🔊';
  }
  function syncButtons() {
    document.querySelectorAll('.brett-sound-toggle').forEach(syncOne);
  }

  function makeButton(mimicClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brett-sound-toggle' + (mimicClass ? ' ' + mimicClass : ' bs-default');
    btn.innerHTML = '<span class="bs-ico" aria-hidden="true"></span>';
    btn.addEventListener('click', (e) => { e.preventDefault(); toggleMuted(); });
    syncOne(btn);
    return btn;
  }

  function mount() {
    if (document.querySelector('.brett-sound-toggle')) return;
    injectStyle();
    const sel = document.querySelector('[data-language-select]');
    if (sel && sel.parentElement) {
      const bar = sel.parentElement;
      const sib = bar.querySelector('button');
      const mimic = (sib && sib.className) ? sib.className : '';
      const btn = makeButton(mimic);
      const anchor = sib || sel;
      anchor.insertAdjacentElement('afterend', btn);
    } else {
      const btn = makeButton('');
      btn.classList.add('brett-sound-toggle--floating');
      (document.body || document.documentElement).appendChild(btn);
    }
  }

  function playLoop(name, durationMs) {
    if (muted) return;
    const src = get(name);
    if (!src) return;
    try {
      const audio = src.cloneNode(true);
      audio.loop = true;
      audio.volume = Math.max(0, Math.min(1, src.volume * (vols.sfx / 100)));
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      setTimeout(() => { try { audio.pause(); audio.currentTime = 0; } catch (_) {} }, durationMs);
    } catch (_) {}
  }

  /* ===== Synthetic dice-roll sound (Web Audio API) ==================== */
  let _ac = null;
  let _acGain = null;

  function _getAc() {
    if (muted) return null;
    try {
      if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
      if (_ac.state === 'suspended') _ac.resume();
      return _ac;
    } catch(_) { return null; }
  }
  function _dest(c) {
    if (!_acGain || _acGain.context !== c) {
      _acGain = c.createGain();
      _acGain.gain.value = vols.sfx / 100;
      _acGain.connect(c.destination);
    }
    return _acGain;
  }

  function diceRoll(durationMs) {
    const c = _getAc(); if (!c) return;
    const dur = ((durationMs != null ? durationMs : 1300)) / 1000;
    function schedule() {
      const t = c.currentTime;
      const dest = _dest(c);
      // Rumble layer
      const rumLen = Math.ceil(c.sampleRate * dur);
      const rumBuf = c.createBuffer(1, rumLen, c.sampleRate);
      const rd = rumBuf.getChannelData(0);
      for (let ri = 0; ri < rumLen; ri++) rd[ri] = Math.random() * 2 - 1;
      const rum = c.createBufferSource(); rum.buffer = rumBuf;
      const rlp = c.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 260;
      const rg = c.createGain();
      rg.gain.setValueAtTime(0.30, t);
      rg.gain.linearRampToValueAtTime(0.001, t + dur);
      rum.connect(rlp); rlp.connect(rg); rg.connect(dest);
      rum.start(t); rum.stop(t + dur + 0.01);
      // Rattling taps
      const N = 26;
      for (let k = 0; k < N; k++) {
        const progress = k / (N - 1);
        let dt = Math.pow(progress, 1.85) * dur * 0.90 + (Math.random() - 0.5) * 0.030;
        dt = Math.max(0.003, Math.min(dt, dur - 0.05));
        const earlyness = 1 - progress;
        const tapLen = 0.012 + Math.random() * 0.024;
        const tapSamples = Math.ceil(c.sampleRate * tapLen);
        const tapBuf = c.createBuffer(1, tapSamples, c.sampleRate);
        const td = tapBuf.getChannelData(0);
        for (let j = 0; j < tapSamples; j++) td[j] = Math.random() * 2 - 1;
        const tap = c.createBufferSource(); tap.buffer = tapBuf;
        const bpf = c.createBiquadFilter(); bpf.type = 'bandpass';
        bpf.frequency.value = 600 + earlyness * 400 + Math.random() * 700;
        bpf.Q.value = 1.6 + Math.random() * 2.2;
        const amp = earlyness * 0.56 + 0.09 + Math.random() * 0.15;
        const tg = c.createGain();
        tg.gain.setValueAtTime(amp, t + dt);
        tg.gain.exponentialRampToValueAtTime(0.001, t + dt + tapLen);
        tap.connect(bpf); bpf.connect(tg); tg.connect(dest);
        tap.start(t + dt); tap.stop(t + dt + tapLen + 0.004);
      }
      // Settling clicks at end
      [dur - 0.130, dur - 0.065, dur - 0.018].forEach(dt => {
        if (dt < 0.005) return;
        const sLen = Math.ceil(c.sampleRate * 0.016);
        const sBuf = c.createBuffer(1, sLen, c.sampleRate);
        const sd = sBuf.getChannelData(0);
        for (let si = 0; si < sLen; si++) sd[si] = Math.random() * 2 - 1;
        const settl = c.createBufferSource(); settl.buffer = sBuf;
        const sbp = c.createBiquadFilter(); sbp.type = 'bandpass';
        sbp.frequency.value = 1100 + Math.random() * 600;
        sbp.Q.value = 3.5;
        const sg = c.createGain();
        sg.gain.setValueAtTime(0.28, t + dt);
        sg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.016);
        settl.connect(sbp); sbp.connect(sg); sg.connect(dest);
        settl.start(t + dt); settl.stop(t + dt + 0.020);
      });
    }
    if (c.state !== 'running') { c.resume().then(schedule); } else { schedule(); }
  }

  window.BrettSounds = {
    play, playLoop, preload,
    diceRoll,
    setMuted, isMuted, toggleMuted,
    startMusic, stopMusic,
    setMusicVolume, getMusicVolume,
    setSfxVolume, getSfxVolume,
    mountButton: (el) => {
      if (typeof el === 'string') el = document.querySelector(el);
      if (el && !el.classList.contains('brett-sound-toggle')) {
        el.classList.add('brett-sound-toggle');
        if (!el.querySelector('.bs-ico')) el.innerHTML = '<span class="bs-ico" aria-hidden="true"></span>' + el.innerHTML;
        el.addEventListener('click', (e) => { e.preventDefault(); toggleMuted(); });
        syncOne(el);
      }
    }
  };

  function preloadAndResume() { preload(); applyMusicState(); }
  window.addEventListener('pointerdown', preloadAndResume, { once: true, passive: true });
  window.addEventListener('keydown', preloadAndResume, { once: true });
  window.addEventListener('brettspiele-language-change', syncButtons);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
