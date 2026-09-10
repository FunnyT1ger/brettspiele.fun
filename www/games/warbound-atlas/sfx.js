/* Lightweight Web-Audio cues for events that aren't dice/card sounds
   (conquering, losing, winning the game). Gentle synth tones; honours the
   shared BrettSounds mute state so a single mute silences everything. */
(function(){
  'use strict';

  var ctx = null;
  var masterGain = null;
  var VOL_KEY = 'brettspiele.volumes';

  function loadSfxVol(){
    try{ var v = JSON.parse(localStorage.getItem(VOL_KEY)||'{}'); return typeof v.sfx==='number' ? v.sfx : 100; }
    catch(_){ return 100; }
  }
  function loadClickVol(){
    try{ var v = JSON.parse(localStorage.getItem(VOL_KEY)||'{}'); return typeof v.click==='number' ? v.click : 75; }
    catch(_){ return 75; }
  }
  var sfxVolPct   = loadSfxVol();
  var clickVolPct = loadClickVol();
  var _lastClickT = 0;

  function ac(){
    if (window.BrettSounds && typeof window.BrettSounds.isMuted === 'function' && window.BrettSounds.isMuted()) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch(e){ return null; }
  }

  function getDestination(c){
    if (!masterGain || masterGain.context !== c){
      masterGain = c.createGain();
      masterGain.gain.value = sfxVolPct / 100;
      masterGain.connect(c.destination);
    }
    return masterGain;
  }

  function tone(freq, t0, dur, gain, type){
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime + t0);
    g.gain.setValueAtTime(0.0001, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime + t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    o.connect(g); g.connect(getDestination(c));
    o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.02);
  }
  function chord(freqs, t0, dur, gain, type){ freqs.forEach(function(f){ tone(f, t0, dur, gain, type); }); }

  function click(variant){
    var now = Date.now();
    if(now - _lastClickT < 30) return;   // debounce: prevent double-fire
    _lastClickT = now;
    var c = ac(); if(!c) return;
    var vol = clickVolPct / 100;
    if(vol <= 0) return;
    function schedule(){
      var t = c.currentTime;
      // Clicks bypass masterGain — fully independent volume
      var bodyLen = Math.ceil(c.sampleRate * 0.055);
      var bodyBuf = c.createBuffer(1, bodyLen, c.sampleRate);
      var bd = bodyBuf.getChannelData(0);
      for(var i=0; i<bodyLen; i++) bd[i] = Math.random()*2-1;
      var body = c.createBufferSource(); body.buffer = bodyBuf;
      var bp = c.createBiquadFilter(); bp.type='bandpass';
      bp.frequency.value = variant===1 ? 700 : 1050;
      bp.Q.value = 2.2;
      var bg = c.createGain();
      bg.gain.setValueAtTime(vol, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t+0.055);
      body.connect(bp); bp.connect(bg); bg.connect(c.destination);
      body.start(t); body.stop(t+0.06);
      var atkLen = Math.ceil(c.sampleRate * 0.005);
      var atkBuf = c.createBuffer(1, atkLen, c.sampleRate);
      var ad = atkBuf.getChannelData(0);
      for(var j=0; j<atkLen; j++) ad[j] = Math.random()*2-1;
      var atk = c.createBufferSource(); atk.buffer = atkBuf;
      var hp = c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=4000;
      var ag = c.createGain();
      ag.gain.setValueAtTime(vol * 0.85, t);
      ag.gain.exponentialRampToValueAtTime(0.001, t+0.005);
      atk.connect(hp); hp.connect(ag); ag.connect(c.destination);
      atk.start(t); atk.stop(t+0.006);
    }
    if(c.state !== 'running'){ c.resume().then(schedule); } else { schedule(); }
  }

  function attack(){
    var c = ac(); if(!c) return;
    function schedule(){
      var t = c.currentTime;
      var dest = getDestination(c);
      var crackLen = Math.ceil(c.sampleRate * 0.005);
      var crackBuf = c.createBuffer(1, crackLen, c.sampleRate);
      var cr = crackBuf.getChannelData(0);
      for(var i=0; i<crackLen; i++) cr[i] = Math.random()*2-1;
      var crack = c.createBufferSource(); crack.buffer = crackBuf;
      var cg = c.createGain();
      cg.gain.setValueAtTime(0.80, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t+0.005);
      crack.connect(cg); cg.connect(dest);
      crack.start(t); crack.stop(t+0.006);
      var bodyLen = Math.ceil(c.sampleRate * 0.45);
      var bodyBuf = c.createBuffer(1, bodyLen, c.sampleRate);
      var bl = bodyBuf.getChannelData(0);
      for(var j=0; j<bodyLen; j++) bl[j] = Math.random()*2-1;
      var body = c.createBufferSource(); body.buffer = bodyBuf;
      var bp = c.createBiquadFilter(); bp.type='bandpass';
      bp.frequency.value = 800 + Math.random()*120;
      bp.Q.value = 1.2;
      var bg = c.createGain();
      bg.gain.setValueAtTime(0.65, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t+0.4);
      body.connect(bp); bp.connect(bg); bg.connect(dest);
      body.start(t); body.stop(t+0.46);
      var thudLen = Math.ceil(c.sampleRate * 0.20);
      var thudBuf = c.createBuffer(1, thudLen, c.sampleRate);
      var th = thudBuf.getChannelData(0);
      for(var k=0; k<thudLen; k++) th[k] = Math.random()*2-1;
      var thud = c.createBufferSource(); thud.buffer = thudBuf;
      var lp = c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=250;
      var tg = c.createGain();
      tg.gain.setValueAtTime(1.0, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t+0.20);
      thud.connect(lp); lp.connect(tg); tg.connect(dest);
      thud.start(t); thud.stop(t+0.21);
    }
    if(c.state !== 'running'){ c.resume().then(schedule); } else { schedule(); }
  }

  function deploy(){
    var c = ac(); if(!c) return;
    function schedule(){
      var t = c.currentTime;
      var dest = getDestination(c);
      [0, 0.042, 0.080].forEach(function(dt, idx){
        var bLen = Math.ceil(c.sampleRate * 0.070);
        var bBuf = c.createBuffer(1, bLen, c.sampleRate);
        var bd = bBuf.getChannelData(0);
        for(var i=0;i<bLen;i++) bd[i] = Math.random()*2-1;
        var bSrc = c.createBufferSource(); bSrc.buffer = bBuf;
        var bbp = c.createBiquadFilter(); bbp.type='bandpass';
        bbp.frequency.value = 480 + idx*110 + Math.random()*80;
        bbp.Q.value = 1.7;
        var bg = c.createGain();
        bg.gain.setValueAtTime(0.82 - idx*0.12, t+dt);
        bg.gain.exponentialRampToValueAtTime(0.001, t+dt+0.070);
        bSrc.connect(bbp); bbp.connect(bg); bg.connect(dest);
        bSrc.start(t+dt); bSrc.stop(t+dt+0.075);
        var aLen = Math.ceil(c.sampleRate * 0.005);
        var aBuf = c.createBuffer(1, aLen, c.sampleRate);
        var ad = aBuf.getChannelData(0);
        for(var j=0;j<aLen;j++) ad[j] = Math.random()*2-1;
        var aSrc = c.createBufferSource(); aSrc.buffer = aBuf;
        var ahp = c.createBiquadFilter(); ahp.type='highpass'; ahp.frequency.value=3500;
        var ag = c.createGain();
        ag.gain.setValueAtTime(0.65 - idx*0.10, t+dt);
        ag.gain.exponentialRampToValueAtTime(0.001, t+dt+0.005);
        aSrc.connect(ahp); ahp.connect(ag); ag.connect(dest);
        aSrc.start(t+dt); aSrc.stop(t+dt+0.006);
      });
    }
    if(c.state !== 'running'){ c.resume().then(schedule); } else { schedule(); }
  }

  function diceRoll(durationMs){
    var c = ac(); if(!c) return;
    var dur = (durationMs || 1392) / 1000;
    function schedule(){
      var t = c.currentTime;
      var dest = getDestination(c);
      var rumLen = Math.ceil(c.sampleRate * dur);
      var rumBuf = c.createBuffer(1, rumLen, c.sampleRate);
      var rd = rumBuf.getChannelData(0);
      for(var ri=0; ri<rumLen; ri++) rd[ri] = Math.random()*2-1;
      var rum = c.createBufferSource(); rum.buffer = rumBuf;
      var rlp = c.createBiquadFilter(); rlp.type='lowpass'; rlp.frequency.value=260;
      var rg = c.createGain();
      rg.gain.setValueAtTime(0.30, t);
      rg.gain.linearRampToValueAtTime(0.001, t+dur);
      rum.connect(rlp); rlp.connect(rg); rg.connect(dest);
      rum.start(t); rum.stop(t+dur+0.01);
      var N = 26;
      for(var k=0; k<N; k++){
        var progress = k / (N - 1);
        var dt = Math.pow(progress, 1.85) * dur * 0.90 + (Math.random() - 0.5) * 0.030;
        dt = Math.max(0.003, Math.min(dt, dur - 0.05));
        var earlyness = 1 - progress;
        var tapLen = 0.012 + Math.random() * 0.024;
        var tapSamples = Math.ceil(c.sampleRate * tapLen);
        var tapBuf = c.createBuffer(1, tapSamples, c.sampleRate);
        var td2 = tapBuf.getChannelData(0);
        for(var j=0; j<tapSamples; j++) td2[j] = Math.random()*2-1;
        var tap = c.createBufferSource(); tap.buffer = tapBuf;
        var bpf = c.createBiquadFilter(); bpf.type='bandpass';
        bpf.frequency.value = 600 + earlyness*400 + Math.random()*700;
        bpf.Q.value = 1.6 + Math.random()*2.2;
        var amp = earlyness * 0.56 + 0.09 + Math.random() * 0.15;
        var tg2 = c.createGain();
        tg2.gain.setValueAtTime(amp, t+dt);
        tg2.gain.exponentialRampToValueAtTime(0.001, t+dt+tapLen);
        tap.connect(bpf); bpf.connect(tg2); tg2.connect(dest);
        tap.start(t+dt); tap.stop(t+dt+tapLen+0.004);
      }
      [dur-0.130, dur-0.065, dur-0.018].forEach(function(dt){
        if(dt < 0.005) return;
        var sLen = Math.ceil(c.sampleRate * 0.016);
        var sBuf = c.createBuffer(1, sLen, c.sampleRate);
        var sd = sBuf.getChannelData(0);
        for(var si=0;si<sLen;si++) sd[si] = Math.random()*2-1;
        var settl = c.createBufferSource(); settl.buffer = sBuf;
        var sbp = c.createBiquadFilter(); sbp.type='bandpass';
        sbp.frequency.value = 1100 + Math.random()*600;
        sbp.Q.value = 3.5;
        var sg = c.createGain();
        sg.gain.setValueAtTime(0.28, t+dt);
        sg.gain.exponentialRampToValueAtTime(0.001, t+dt+0.016);
        settl.connect(sbp); sbp.connect(sg); sg.connect(dest);
        settl.start(t+dt); settl.stop(t+dt+0.020);
      });
    }
    if(c.state !== 'running'){ c.resume().then(schedule); } else { schedule(); }
  }

  function diceReveal(){
    var c = ac(); if(!c) return;
    function schedule(){
      var t = c.currentTime;
      var dest = getDestination(c);
      [0, 0.055, 0.105].forEach(function(dt, idx){
        var len = Math.ceil(c.sampleRate * 0.028);
        var buf = c.createBuffer(1, len, c.sampleRate);
        var d = buf.getChannelData(0);
        for(var i=0;i<len;i++) d[i] = Math.random()*2-1;
        var src = c.createBufferSource(); src.buffer = buf;
        var bp = c.createBiquadFilter(); bp.type='bandpass';
        bp.frequency.value = 950 + idx * 350;
        bp.Q.value = 2.0;
        var g = c.createGain();
        g.gain.setValueAtTime(0.42 - idx*0.05, t+dt);
        g.gain.exponentialRampToValueAtTime(0.001, t+dt+0.028);
        src.connect(bp); bp.connect(g); g.connect(dest);
        src.start(t+dt); src.stop(t+dt+0.032);
      });
    }
    if(c.state !== 'running'){ c.resume().then(schedule); } else { schedule(); }
  }

  window.WBSfx = {
    conquer: function(){
      var c = ac(); if(!c) return;
      function schedule(){
        var t = c.currentTime;
        var dest = getDestination(c);
        var len = Math.ceil(c.sampleRate * 0.10);
        var buf = c.createBuffer(1, len, c.sampleRate);
        var d = buf.getChannelData(0);
        for(var i=0;i<len;i++) d[i] = Math.random()*2-1;
        var src = c.createBufferSource(); src.buffer = buf;
        var bp = c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=340; bp.Q.value=1.0;
        var g = c.createGain();
        g.gain.setValueAtTime(0.45, t);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.10);
        src.connect(bp); bp.connect(g); g.connect(dest);
        src.start(t); src.stop(t+0.11);
        [[523.25,0,0.18,0.20],[783.99,0.10,0.22,0.17]].forEach(function(p){
          var o = c.createOscillator(); o.type='sine'; o.frequency.value=p[0];
          var og = c.createGain();
          og.gain.setValueAtTime(0.0001, t+p[1]);
          og.gain.exponentialRampToValueAtTime(p[3], t+p[1]+0.015);
          og.gain.exponentialRampToValueAtTime(0.0001, t+p[1]+p[2]);
          o.connect(og); og.connect(dest);
          o.start(t+p[1]); o.stop(t+p[1]+p[2]+0.01);
        });
      }
      if(c.state !== 'running'){ c.resume().then(schedule); } else { schedule(); }
    },
    click: click,
    attack: attack,
    deploy: deploy,
    diceRoll: diceRoll,
    diceReveal: diceReveal,
    defeat: function(){ tone(220.00,0,0.20,0.18,'sine'); tone(174.61,0.12,0.26,0.16,'sine'); },
    victory: function(){
      if (window.BrettSounds && typeof window.BrettSounds.play === 'function') {
        window.BrettSounds.play('victory');
      } else {
        tone(523.25,0,0.18,0.22,'triangle'); tone(659.25,0.14,0.18,0.22,'triangle'); tone(783.99,0.28,0.20,0.22,'triangle'); chord([523.25,783.99,1046.5],0.46,0.55,0.20,'triangle');
      }
    },
    setVolume: function(pct){
      sfxVolPct = Math.max(0, Math.min(100, Math.round(pct)));
      if(masterGain) masterGain.gain.value = sfxVolPct / 100;
      try{
        var stored = JSON.parse(localStorage.getItem(VOL_KEY) || '{}');
        stored.sfx = sfxVolPct;
        localStorage.setItem(VOL_KEY, JSON.stringify(stored));
      }catch(_){}
    },
    getVolume: function(){ return sfxVolPct; },
    setClickVolume: function(pct){
      clickVolPct = Math.max(0, Math.min(100, Math.round(pct)));
      try{
        var stored = JSON.parse(localStorage.getItem(VOL_KEY) || '{}');
        stored.click = clickVolPct;
        localStorage.setItem(VOL_KEY, JSON.stringify(stored));
      }catch(_){}
    },
    getClickVolume: function(){ return clickVolPct; }
  };

  // Fire on every click — debounce inside click() prevents double-firing
  document.addEventListener('click', function(e){
    if (!window.WBSfx) return;
    var t = e.target;
    if(t && t.tagName === 'BUTTON' && t.disabled) return;
    window.WBSfx.click();
  }, { passive: true });
})();
