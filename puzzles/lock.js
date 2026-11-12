/* Lockpick: a vault-themed pin-tumbler puzzle. Original cutaway of a lock's
   springs, driver pins, and key pins. No third-party code or assets. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var STORE_KEY = 'vault-lockpick';
  var LIFT_CODES = { KeyW: 1, Space: 1, KeyD: 1, ArrowRight: 1, ArrowUp: 1 };
  var REDUCE = false;
  try {
    REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* ignore */ }

  /* pinCount = tumblers in the lock. picks = how many tools you get per lock.
     window = half-width of the set zone on a 0–1 lift scale.
     bind = only the current binding pin can set (Hard and Very Hard). */
  var DIFFS = [
    { key: 'easy',     label: 'Easy',      pinCount: 3, window: 0.110, liftSpeed: 0.70, fallSpeed: 2.4, pinDrain: 0.45, picks: 7, hint: 'window', bind: false },
    { key: 'medium',   label: 'Medium',    pinCount: 4, window: 0.062, liftSpeed: 0.88, fallSpeed: 2.6, pinDrain: 0.75, picks: 6, hint: 'tick',   bind: false },
    { key: 'hard',     label: 'Hard',      pinCount: 5, window: 0.045, liftSpeed: 1.05, fallSpeed: 2.8, pinDrain: 1.20, picks: 5, hint: 'tick',   bind: true  },
    { key: 'veryhard', label: 'Very Hard', pinCount: 6, window: 0.032, liftSpeed: 1.22, fallSpeed: 3.0, pinDrain: 1.80, picks: 4, hint: 'none',   bind: true  }
  ];

  var CSS = [
    '.lp-stage{width:100%;display:flex;flex-direction:column;align-items:center;gap:0.6rem}',
    '.lp-canvas-wrap{width:min(100%,840px);aspect-ratio:17/10;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.lp-canvas-wrap canvas{display:block;width:100%;height:100%;cursor:ew-resize;border:1px solid var(--gold-dim);',
    'background:#120e08;box-shadow:0 0 30px rgba(0,0,0,0.6),inset 0 0 24px rgba(0,0,0,0.45)}',
    '.lp-canvas-wrap.lp-won canvas{border-color:var(--success);box-shadow:0 0 40px rgba(90,170,112,0.35)}',
    '.lp-canvas-wrap.lp-failed canvas{border-color:var(--danger)}',
    '.lp-stats{display:flex;flex-wrap:wrap;justify-content:center;gap:0.35rem 1.5rem}',
    '.lp-health{width:min(100%,280px);height:8px;background:var(--stone);border:1px solid var(--gold-dim);overflow:hidden}',
    '.lp-health > span{display:block;height:100%;width:100%;background:linear-gradient(90deg,#8a3030,var(--gold));transform-origin:left center;transition:transform 0.08s linear}',
    '.lp-health.lp-low > span{background:var(--danger)}',
    '.lp-turn{min-width:12rem;min-height:3rem;font-size:0.85rem;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.lp-turn:active,.lp-turn.lp-held{background:var(--stone-light);border-color:var(--gold-bright);color:var(--gold-bright);',
    'box-shadow:0 0 16px rgba(201,148,58,0.35)}',
    '.lp-mute.off{opacity:0.55}',
    '.lp-health-label{font-family:Cinzel,serif;font-size:0.7rem;letter-spacing:0.12em;color:var(--gold-dim);text-transform:uppercase}'
  ].join('');

  /* ---------- storage (same key as the first Lockpick version) ---------- */

  function loadStore() {
    var out = { difficulty: 'easy', muted: false, locksOpened: 0, pinsBroken: 0 };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return out;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (diffByKey(o.difficulty)) out.difficulty = o.difficulty;
        out.muted = !!o.muted;
        if (isFinite(o.locksOpened) && o.locksOpened >= 0) out.locksOpened = Math.floor(o.locksOpened);
        if (isFinite(o.pinsBroken) && o.pinsBroken >= 0) out.pinsBroken = Math.floor(o.pinsBroken);
      }
    } catch (e) { /* private mode */ }
    return out;
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        difficulty: state.diffKey,
        muted: state.muted,
        locksOpened: state.locksOpened,
        pinsBroken: state.pinsBroken
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------- audio (original Web Audio tones; no samples) ---------- */

  var audio = { ctx: null, master: null, scrape: null };

  function ensureAudio() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return audio.ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.22;
    audio.master.connect(audio.ctx.destination);
    return audio.ctx;
  }

  function envGain(t, a, hold, rel, peak) {
    var g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(peak * 0.8, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    return g;
  }

  function playTone(type, freq, dur, peak, startFreq) {
    if (state.muted || !ensureAudio()) return;
    var ctx = audio.ctx, t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq || freq, t);
    if (startFreq && startFreq !== freq) osc.frequency.exponentialRampToValueAtTime(freq, t + dur);
    var g = envGain(t, 0.008, dur * 0.25, dur * 0.7, peak);
    osc.connect(g); g.connect(audio.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function playNoise(dur, peak, freq, q) {
    if (state.muted || !ensureAudio()) return;
    var ctx = audio.ctx, t = ctx.currentTime;
    var n = (dur + 0.05) * ctx.sampleRate | 0;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    var g = envGain(t, 0.005, dur * 0.2, dur * 0.75, peak);
    src.connect(filt); filt.connect(g); g.connect(audio.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function sfxClick() {
    playNoise(0.05, 0.4, 1800, 2.2);
    playTone('triangle', 1040, 0.07, 0.16, 820);
  }

  function sfxTick() {
    playTone('square', 560, 0.045, 0.08, 640);
    playNoise(0.035, 0.16, 900, 1.6);
  }

  function sfxSlide() {
    playTone('triangle', 480, 0.03, 0.06);
  }

  function sfxSnap() {
    playNoise(0.16, 0.7, 2400, 0.8);
    playTone('sawtooth', 180, 0.18, 0.28, 520);
  }

  function sfxClunk() {
    playTone('sine', 90, 0.28, 0.55, 140);
    playTone('triangle', 220, 0.16, 0.2, 280);
    playNoise(0.12, 0.25, 400, 1.1);
  }

  function startScrape() {
    if (state.muted || audio.scrape || !ensureAudio()) return;
    var ctx = audio.ctx;
    var n = ctx.sampleRate | 0;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1100;
    filt.Q.value = 1.6;
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.04);
    src.connect(filt); filt.connect(g); g.connect(audio.master);
    src.start();
    audio.scrape = { src: src, gain: g, filt: filt };
  }

  function stopScrape() {
    if (!audio.scrape) return;
    var ctx = audio.ctx, s = audio.scrape;
    audio.scrape = null;
    try {
      if (ctx) s.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      var src = s.src;
      setTimeout(function () { try { src.stop(); } catch (e) { /* already stopped */ } }, 80);
    } catch (e) { try { s.src.stop(); } catch (err) { /* ignore */ } }
  }

  /* ---------- helpers ---------- */

  function diffByKey(key) {
    for (var i = 0; i < DIFFS.length; i++) if (DIFFS[i].key === key) return DIFFS[i];
    return null;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rint(n) { return Math.floor(Math.random() * n); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = rint(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function genHeights(n, window) {
    var lo = 0.24 + window;
    var hi = 0.82 - window;
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = lo + (hi - lo) * (i / n);
      var b = lo + (hi - lo) * ((i + 1) / n);
      out.push(a + (b - a) * (0.15 + Math.random() * 0.7));
    }
    return shuffle(out);
  }

  function inWindow(pin, d) {
    return Math.abs(pin.lift - pin.setHeight) <= d.window;
  }

  function isOverset(pin, d) {
    return pin.lift > pin.setHeight + d.window;
  }

  /* ---------- state ---------- */

  var root = null;
  var canvas = null;
  var ctx = null;
  var dpr = 1;
  var saved = loadStore();
  var liftKeys = {};
  var liftButton = false;
  var lastTs = 0;
  var needRelease = false;
  var wasInWindow = false;
  var jamHeld = false;
  var unlockFlash = 0;
  var breakFlash = 0;
  var plugTurn = 0;
  var lastLayout = null;
  var raf = 0;
  var statusOverride = '';
  var statusClass = '';
  var statusUntil = 0;

  var state = {
    diffKey: saved.difficulty,
    pins: [],
    bindOrder: [],
    selected: 0,
    pinHealth: 1,
    pinsLeft: 7,
    locksOpened: saved.locksOpened,
    pinsBroken: saved.pinsBroken,
    status: 'picking',
    muted: saved.muted,
    wiggle: 0
  };

  function currentDiff() { return diffByKey(state.diffKey) || DIFFS[0]; }

  function rawLift() {
    if (liftButton) return true;
    for (var k in liftKeys) if (liftKeys[k]) return true;
    return false;
  }

  function liftOn() {
    if (state.status !== 'picking') return false;
    if (needRelease) {
      if (!rawLift()) needRelease = false;
      else return false;
    }
    return rawLift();
  }

  function bindingIndex() {
    var d = currentDiff();
    if (!d.bind) return -1;
    for (var i = 0; i < state.bindOrder.length; i++) {
      var idx = state.bindOrder[i];
      if (state.pins[idx] && !state.pins[idx].set) return idx;
    }
    return -1;
  }

  function canSet(pin) {
    var d = currentDiff();
    if (pin.set) return false;
    if (!d.bind) return true;
    return pin.index === bindingIndex();
  }

  function tumblersSet() {
    var n = 0;
    for (var i = 0; i < state.pins.length; i++) if (state.pins[i].set) n++;
    return n;
  }

  /* ---------- markup ---------- */

  function markup() {
    var diffs = DIFFS.map(function (d) {
      var on = d.key === state.diffKey;
      return '<button type="button" class="btn' + (on ? ' active' : '') + '" data-lp-diff="' + d.key +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' + d.label + '</button>';
    }).join('');
    return '' +
      '<div class="puzzle-frame">' +
        '<div class="corner corner-tl"></div><div class="corner corner-tr"></div>' +
        '<div class="corner corner-bl"></div><div class="corner corner-br"></div>' +
        '<p class="flavor-text">"A cutaway of the vault lock lays the tumblers bare. Slide your pick under ' +
        'each stack and lift the key pin until the gap meets the <span style="color:var(--gold)">shear line</span>. ' +
        'Set every tumbler and the plug will turn. Push too high, and the pin binds &mdash; hold too long, ' +
        'and the pick snaps, dropping every pin you had set."</p>' +
        '<div class="btn-row diff-row" role="group" aria-label="Difficulty">' + diffs + '</div>' +
        '<div class="lp-stage">' +
          '<div class="lp-canvas-wrap"><canvas id="lp-canvas" width="840" height="494" role="img" ' +
          'aria-label="Cutaway of a pin tumbler lock. Slide to choose a pin. Hold Lift to raise it."></canvas></div>' +
          '<div class="lp-health-label">Pick strength</div>' +
          '<div class="lp-health" aria-hidden="true"><span></span></div>' +
          '<div class="lp-stats">' +
            '<div class="move-counter lp-set">Tumblers set: 0/3</div>' +
            '<div class="move-counter lp-pins">Picks: 0</div>' +
            '<div class="move-counter lp-opened">Locks opened: 0</div>' +
          '</div>' +
        '</div>' +
        '<div class="status-msg lp-status" aria-live="polite"></div>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn btn-primary lp-turn" data-lp-act="lift">Hold to Lift</button>' +
          '<button type="button" class="btn" data-lp-act="new">New Lock</button>' +
          '<button type="button" class="btn lp-mute" data-lp-act="mute">Sound</button>' +
        '</div>' +
      '</div>' +
      '<div class="dm-panel">' +
        '<div class="dm-label">How to Play</div>' +
        '<p>This is a cutaway of a pin-tumbler lock. Each chamber holds a spring, a driver pin, and a key pin. ' +
        'The line between the housing and the plug is the shear line. Move the mouse, or drag a finger, left and ' +
        'right to slide the pick under a tumbler. Hold <code>W</code>, <code>Space</code>, or the ' +
        '<em>Hold to Lift</em> button to raise that pin. Every tumbler has a set height where the gap between ' +
        'the key pin and the driver lines up with the shear line. Release inside that window and the driver ' +
        'catches above the shear line &mdash; the tumbler is set, and the key pin drops back. Release too low ' +
        'and the stack falls. Push past the window and the key pin itself binds in the housing; holding a jammed ' +
        'or fully raised pin wears the pick out. When the pick snaps, you lose one and <em>every</em> set ' +
        'tumbler falls, so you start that lock over. Set every tumbler and the plug finally turns. Easy has 3 ' +
        'tumblers, Medium 4, Hard 5, and Very Hard 6. Higher difficulty narrows the set window, speeds the lift, ' +
        'and makes picks more brittle. On Hard and Very Hard the plug is under tension, so only one pin binds ' +
        'at a time: that chamber is marked, and only that pin will set. The others feel springy and fall back ' +
        'when released. After a pin sets, the next one binds. On a touch screen, drag to choose a pin and hold ' +
        'the Lift button to raise it.</p>' +
      '</div>';
  }

  function injectStyle() {
    if (document.getElementById('lp-style')) return;
    var s = document.createElement('style');
    s.id = 'lp-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- layout & drawing ---------- */

  function resizeCanvas() {
    if (!canvas) return;
    var wrap = canvas.parentNode;
    var cssW = wrap.clientWidth || 840;
    var cssH = wrap.clientHeight || Math.round(cssW * 10 / 17);
    dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    var pxW = Math.round(cssW * dpr);
    var pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
  }

  function makeLayout(w, h) {
    var n = Math.max(1, state.pins.length);
    var margin = { l: w * 0.04, r: w * 0.22, t: h * 0.08, b: h * 0.07 };
    var bodyX = margin.l;
    var bodyY = margin.t;
    var bodyW = w - margin.l - margin.r;
    var bodyH = h - margin.t - margin.b;
    var shearY = bodyY + bodyH * 0.46;
    var travel = bodyH * 0.28;
    var keywayH = bodyH * 0.13;
    var keywayY = bodyY + bodyH - keywayH - bodyH * 0.04;
    var boreW = Math.min(bodyW * 0.14, bodyH * 0.16);
    var gap = (bodyW - n * boreW) / (n + 1);
    if (gap < boreW * 0.25) {
      boreW = bodyW / (n + 0.5 * (n + 1));
      gap = (bodyW - n * boreW) / (n + 1);
    }
    var chambers = [];
    for (var i = 0; i < n; i++) {
      var cx = bodyX + gap + boreW * 0.5 + i * (boreW + gap);
      chambers.push({
        i: i,
        cx: cx,
        left: cx - boreW * 0.5,
        right: cx + boreW * 0.5,
        w: boreW,
        top: bodyY + bodyH * 0.07,
        bottom: keywayY
      });
    }
    var faceR = Math.min(margin.r * 0.38, h * 0.16);
    return {
      w: w, h: h,
      bodyX: bodyX, bodyY: bodyY, bodyW: bodyW, bodyH: bodyH,
      bodyRight: bodyX + bodyW, bodyBottom: bodyY + bodyH,
      shearY: shearY, travel: travel, boreW: boreW,
      keywayY: keywayY, keywayH: keywayH,
      chambers: chambers,
      face: { cx: w - margin.r * 0.5, cy: bodyY + faceR * 1.05, r: faceR }
    };
  }

  function cylinderShade(c, x, y, w, h, c0, c1, c2) {
    var g = c.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, c2);
    g.addColorStop(0.25, c0);
    g.addColorStop(0.55, c1);
    g.addColorStop(1, c2);
    return g;
  }

  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawSpring(c, cx, top, bottom, width, coils) {
    if (bottom <= top + 2) return;
    var amp = width * 0.38;
    c.beginPath();
    c.moveTo(cx, top);
    var steps = Math.max(8, coils * 8);
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var y = top + (bottom - top) * t;
      var x = cx + Math.sin(t * coils * TAU) * amp;
      c.lineTo(x, y);
    }
    c.stroke();
  }

  function drawFrontFace(c, L, time) {
    var f = L.face, R = f.r, cx = f.cx, cy = f.cy;
    c.save();
    c.translate(cx, cy);

    c.beginPath();
    c.ellipse(0, R * 0.12, R * 1.08, R * 1.02, 0, 0, TAU);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fill();

    var plate = c.createRadialGradient(-R * 0.28, -R * 0.32, R * 0.1, 0, 0, R * 1.05);
    plate.addColorStop(0, '#f0d07a');
    plate.addColorStop(0.45, '#b07a28');
    plate.addColorStop(1, '#3a250a');
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.fillStyle = plate;
    c.fill();
    c.strokeStyle = '#2a1a08';
    c.lineWidth = R * 0.06;
    c.stroke();

    c.strokeStyle = 'rgba(30, 90, 82, 0.55)';
    c.lineWidth = R * 0.03;
    c.beginPath();
    c.arc(0, 0, R * 0.8, 0, TAU);
    c.stroke();

    for (var i = 0; i < 8; i++) {
      var ra = -Math.PI / 2 + i * (TAU / 8) + Math.PI / 8;
      var rx = Math.cos(ra) * R * 0.88, ry = Math.sin(ra) * R * 0.88;
      var rr = R * 0.07;
      c.beginPath();
      c.arc(rx, ry, rr, 0, TAU);
      c.fillStyle = '#c9943a';
      c.fill();
      c.strokeStyle = '#5a3a10';
      c.lineWidth = Math.max(1, dpr * 0.6);
      c.stroke();
    }

    var well = R * 0.55;
    c.beginPath();
    c.arc(0, 0, well, 0, TAU);
    c.fillStyle = '#1a140c';
    c.fill();

    c.save();
    c.rotate(plugTurn);
    var cyl = c.createRadialGradient(-well * 0.2, -well * 0.25, well * 0.08, 0, 0, well * 0.95);
    cyl.addColorStop(0, '#d8b056');
    cyl.addColorStop(1, '#4a300c');
    c.beginPath();
    c.arc(0, 0, well * 0.92, 0, TAU);
    c.fillStyle = cyl;
    c.fill();

    // keyhole
    c.beginPath();
    c.arc(0, -well * 0.08, well * 0.16, Math.PI * 0.85, Math.PI * 0.15, false);
    c.lineTo(well * 0.075, well * 0.08);
    c.lineTo(well * 0.055, well * 0.38);
    c.quadraticCurveTo(0, well * 0.44, -well * 0.055, well * 0.38);
    c.lineTo(-well * 0.075, well * 0.08);
    c.closePath();
    c.fillStyle = '#070504';
    c.fill();

    // wrench turns with the plug only as it opens
    c.strokeStyle = '#c5c7cc';
    c.lineCap = 'round';
    c.lineWidth = well * 0.08;
    c.beginPath();
    c.moveTo(0, well * 0.16);
    c.lineTo(0, well * 0.42);
    c.lineTo(well * 0.7, well * 0.55);
    c.stroke();
    c.restore();

    c.fillStyle = '#c9943a';
    c.font = '600 ' + Math.max(9, R * 0.18) + 'px Cinzel, serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText('PLUG', 0, R + 6 * dpr);
    c.restore();
  }

  function pinGeometry(pin, ch, L) {
    var shearY = L.shearY;
    var travel = L.travel;
    var keyLen = ch.w * 1.05 + pin.setHeight * travel * 0.55;
    var driverLen = ch.w * 0.85;
    var gapY;
    if (pin.set) {
      gapY = shearY;
      return {
        gapY: gapY,
        keyTop: shearY + travel * pin.setHeight * 0.15 + travel * 0.02,
        keyBot: shearY + travel * pin.setHeight * 0.15 + travel * 0.02 + keyLen * 0.7,
        driverTop: shearY - driverLen,
        driverBot: shearY,
        set: true
      };
    }
    gapY = shearY + (pin.setHeight - pin.lift) * travel;
    return {
      gapY: gapY,
      keyTop: gapY,
      keyBot: gapY + keyLen,
      driverTop: gapY - driverLen,
      driverBot: gapY,
      set: false
    };
  }

  function drawLock() {
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    var L = makeLayout(w, h);
    lastLayout = L;
    var time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var d = currentDiff();
    var bindIdx = bindingIndex();
    var wig = state.wiggle * (REDUCE ? 0.2 : 1) * Math.sin(time * 48) * L.boreW * 0.04;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var bg = ctx.createRadialGradient(w * 0.4, h * 0.4, h * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#2a2218');
    bg.addColorStop(1, '#100c08');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // housing / plug body
    var bx = L.bodyX, by = L.bodyY, bw = L.bodyW, bh = L.bodyH;
    roundRect(ctx, bx, by, bw, bh, 10 * dpr);
    var bodyGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    bodyGrad.addColorStop(0, '#c9943a');
    bodyGrad.addColorStop(0.45, '#8a5a18');
    bodyGrad.addColorStop(0.46, '#6e4a14');
    bodyGrad.addColorStop(1, '#4a320e');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = '#2a1a08';
    ctx.lineWidth = Math.max(2, dpr * 1.5);
    ctx.stroke();

    // inner well of the housing above the shear, and the plug below
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, 10 * dpr);
    ctx.clip();
    ctx.fillStyle = '#8a5e20';
    ctx.fillRect(bx, by, bw, L.shearY - by);
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(bx, L.shearY, bw, L.bodyBottom - L.shearY);

    // faint grain
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = dpr;
    for (var gy = by + 8; gy < L.bodyBottom; gy += 7 * dpr) {
      ctx.beginPath();
      ctx.moveTo(bx, gy);
      ctx.lineTo(bx + bw, gy);
      ctx.stroke();
    }
    ctx.restore();

    // chamber bores (dark wells)
    var i, ch;
    for (i = 0; i < L.chambers.length; i++) {
      ch = L.chambers[i];
      var cr = ch.w * 0.5;
      ctx.fillStyle = '#1a140c';
      ctx.beginPath();
      roundRect(ctx, ch.left, ch.top, ch.w, ch.bottom - ch.top, cr * 0.4);
      ctx.fill();
      // bore highlight
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.stroke();
    }

    // keyway
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(bx + bw * 0.04, L.keywayY, bw * 0.92, L.keywayH);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeRect(bx + bw * 0.04, L.keywayY, bw * 0.92, L.keywayH);

    // pins and springs
    for (i = 0; i < state.pins.length; i++) {
      ch = L.chambers[i];
      var pin = state.pins[i];
      var geo = pinGeometry(pin, ch, L);
      var jx = (jamHeld && state.selected === i && !pin.set) ? wig : 0;
      var left = ch.left + ch.w * 0.12 + jx;
      var pw = ch.w * 0.76;

      // spring
      ctx.strokeStyle = '#c8ccd0';
      ctx.lineWidth = Math.max(1.2, dpr * 1.1);
      ctx.lineCap = 'round';
      drawSpring(ctx, ch.cx + jx, ch.top + 3 * dpr, geo.driverTop, ch.w, 6);

      // driver pin
      var dTop = geo.driverTop, dBot = geo.driverBot, dH = Math.max(2, dBot - dTop);
      var driverCol = pin.set
        ? cylinderShade(ctx, left, dTop, pw, dH, '#8ed0c4', '#3d8a7c', '#1a4a44')
        : cylinderShade(ctx, left, dTop, pw, dH, '#c8cdd4', '#7a8088', '#3a3e44');
      ctx.fillStyle = driverCol;
      roundRect(ctx, left, dTop, pw, dH, pw * 0.15);
      ctx.fill();
      ctx.strokeStyle = pin.set ? 'rgba(126,207,192,0.7)' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.stroke();

      // key pin (may be dropped when set)
      var kTop = geo.keyTop, kBot = Math.min(geo.keyBot, L.keywayY);
      var kH = Math.max(2, kBot - kTop);
      ctx.fillStyle = cylinderShade(ctx, left, kTop, pw, kH, '#e0b24a', '#a06a20', '#5a3a10');
      roundRect(ctx, left, kTop, pw, kH, pw * 0.15);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,8,0.55)';
      ctx.stroke();

      // selected / binding marks
      if (state.selected === i && state.status === 'picking') {
        ctx.strokeStyle = 'rgba(240,191,90,0.85)';
        ctx.lineWidth = Math.max(2, dpr * 1.4);
        ctx.setLineDash([]);
        ctx.strokeRect(ch.left - 3 * dpr, ch.top - 3 * dpr, ch.w + 6 * dpr, ch.bottom - ch.top + 6 * dpr);
      }
      if (d.bind && bindIdx === i && state.status === 'picking') {
        ctx.fillStyle = 'rgba(201,148,58,0.18)';
        ctx.fillRect(ch.left, ch.top, ch.w, ch.bottom - ch.top);
        // small bind tick
        ctx.fillStyle = '#f0bf5a';
        ctx.beginPath();
        ctx.moveTo(ch.right + 4 * dpr, L.shearY);
        ctx.lineTo(ch.right + 12 * dpr, L.shearY - 6 * dpr);
        ctx.lineTo(ch.right + 12 * dpr, L.shearY + 6 * dpr);
        ctx.closePath();
        ctx.fill();
      }

      // Easy hint: shimmer at the shear when this pin is in the window
      if (d.hint === 'window' && !pin.set && inWindow(pin, d) && liftOn() && state.selected === i) {
        ctx.fillStyle = 'rgba(126,207,192,' + (0.28 + 0.2 * Math.sin(time * 8)) + ')';
        ctx.fillRect(ch.left - 2 * dpr, L.shearY - 5 * dpr, ch.w + 4 * dpr, 10 * dpr);
      }

      if (pin.set) {
        // visible gap / catch at the shear line
        ctx.fillStyle = 'rgba(126,207,192,0.35)';
        ctx.fillRect(ch.left + 2, L.shearY - 2 * dpr, ch.w - 4, 4 * dpr);
      }
    }

    // shear line (drawn over the pins so it stays readable)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx + 4, L.shearY);
    ctx.lineTo(bx + bw - 4, L.shearY);
    ctx.strokeStyle = 'rgba(240,191,90,0.95)';
    ctx.lineWidth = Math.max(2, dpr * 1.6);
    ctx.setLineDash([8 * dpr, 5 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.fillStyle = '#f0bf5a';
    ctx.font = '600 ' + Math.max(10, 11 * dpr) + 'px Cinzel, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SHEAR LINE', bx + 8 * dpr, L.shearY - 5 * dpr);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(232,217,176,0.7)';
    ctx.font = '600 ' + Math.max(9, 10 * dpr) + 'px Cinzel, serif';
    ctx.fillText('HOUSING', bx + 8 * dpr, by + 6 * dpr);
    ctx.textBaseline = 'bottom';
    ctx.fillText('PLUG', bx + 8 * dpr, L.keywayY - 4 * dpr);

    // tension wrench at the keyway mouth
    var wx = bx + bw * 0.015;
    var wy = L.keywayY + L.keywayH * 0.55;
    ctx.strokeStyle = '#c5c7cc';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = L.keywayH * 0.28;
    ctx.beginPath();
    ctx.moveTo(wx + bw * 0.08, wy);
    ctx.lineTo(wx, wy);
    ctx.lineTo(wx - bh * 0.04, wy + bh * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx - bh * 0.04, wy + bh * 0.14, L.keywayH * 0.16, 0, TAU);
    ctx.fillStyle = '#6a4a18';
    ctx.fill();

    // pick in the keyway, tip under the selected pin
    var sel = L.chambers[state.selected] || L.chambers[0];
    var pickY = L.keywayY + L.keywayH * 0.55;
    var lifting = liftOn() && state.pins[state.selected] && !state.pins[state.selected].set;
    if (lifting) pickY = L.keywayY + L.keywayH * 0.35;
    var tipX = sel.cx;
    var startX = bx - bw * 0.02;
    ctx.strokeStyle = '#d0d4da';
    ctx.lineWidth = L.keywayH * 0.22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, L.keywayY + L.keywayH * 0.7);
    ctx.lineTo(bx + bw * 0.1, pickY);
    ctx.lineTo(tipX, pickY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,232,236,0.7)';
    ctx.lineWidth = L.keywayH * 0.07;
    ctx.beginPath();
    ctx.moveTo(startX, L.keywayY + L.keywayH * 0.66);
    ctx.lineTo(bx + bw * 0.1, pickY - 2 * dpr);
    ctx.lineTo(tipX, pickY - 2 * dpr);
    ctx.stroke();
    // hook tip
    ctx.strokeStyle = '#e8eaee';
    ctx.lineWidth = L.keywayH * 0.16;
    ctx.beginPath();
    ctx.moveTo(tipX, pickY);
    ctx.quadraticCurveTo(tipX + sel.w * 0.15, pickY, tipX + sel.w * 0.08, pickY - L.keywayH * 0.35);
    ctx.stroke();
    // handle
    ctx.beginPath();
    ctx.ellipse(startX - 4 * dpr, L.keywayY + L.keywayH * 0.7, L.keywayH * 0.28, L.keywayH * 0.4, 0, 0, TAU);
    ctx.strokeStyle = '#d0d4da';
    ctx.lineWidth = L.keywayH * 0.16;
    ctx.stroke();

    // body rim again on top of the keyway edges
    ctx.save();
    ctx.strokeStyle = '#2a1a08';
    ctx.lineWidth = Math.max(2, dpr * 1.5);
    roundRect(ctx, bx, by, bw, bh, 10 * dpr);
    ctx.stroke();
    ctx.restore();

    drawFrontFace(ctx, L, time);

    if (unlockFlash > 0) {
      ctx.strokeStyle = 'rgba(90,170,112,' + (0.7 * unlockFlash) + ')';
      ctx.lineWidth = 4 * dpr;
      roundRect(ctx, bx, by, bw, bh, 10 * dpr);
      ctx.stroke();
    }
    if (breakFlash > 0) {
      ctx.strokeStyle = 'rgba(192,64,64,' + (0.75 * breakFlash) + ')';
      ctx.lineWidth = 4 * dpr;
      roundRect(ctx, bx, by, bw, bh, 10 * dpr);
      ctx.stroke();
    }
  }

  /* ---------- ui ---------- */

  function flashStatus(text, cls, ms) {
    statusOverride = text;
    statusClass = cls || '';
    statusUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + (ms || 1400);
  }

  function setStatus(text, cls) {
    var el = root && root.querySelector('.lp-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status-msg lp-status' + (cls ? ' ' + cls : '');
  }

  function syncUi() {
    var d = currentDiff();
    var wrap = root.querySelector('.lp-canvas-wrap');
    wrap.classList.toggle('lp-won', state.status === 'unlocked' || state.status === 'opening');
    wrap.classList.toggle('lp-failed', state.status === 'failed');
    root.querySelector('.lp-set').textContent = 'Tumblers set: ' + tumblersSet() + '/' + d.pinCount;
    root.querySelector('.lp-pins').textContent = 'Picks: ' + state.pinsLeft + '/' + d.picks;
    root.querySelector('.lp-opened').textContent = 'Locks opened: ' + state.locksOpened;
    var bar = root.querySelector('.lp-health');
    var fill = bar.querySelector('span');
    var hp = state.status === 'failed' ? 0 : state.pinHealth;
    fill.style.transform = 'scaleX(' + clamp(hp, 0, 1) + ')';
    bar.classList.toggle('lp-low', hp > 0 && hp < 0.34);
    var muteBtn = root.querySelector('.lp-mute');
    muteBtn.textContent = state.muted ? 'Sound Off' : 'Sound On';
    muteBtn.classList.toggle('off', state.muted);
    muteBtn.setAttribute('aria-pressed', state.muted ? 'false' : 'true');

    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (statusOverride && now < statusUntil) {
      setStatus(statusOverride, statusClass);
      return;
    }
    statusOverride = '';

    if (state.status === 'unlocked' || state.status === 'opening') {
      setStatus('Every tumbler is set. The plug turns. The vault opens.', 'success');
    } else if (state.status === 'failed') {
      setStatus('You are out of picks. The lock holds fast.', 'fail');
    } else if (jamHeld) {
      setStatus('Overset. Ease off before the pick snaps.', 'fail');
    } else if (liftOn()) {
      var pin = state.pins[state.selected];
      if (pin && canSet(pin) && inWindow(pin, d)) {
        setStatus('The pin is at the shear line. Release to set it.', 'hint');
      } else if (pin && !canSet(pin) && d.bind && !pin.set) {
        setStatus('This pin is not binding. It will spring back.', 'hint');
      } else {
        setStatus('Lift to the shear line, then release.', '');
      }
    } else {
      setStatus('Slide the pick under a tumbler, then hold Lift.', '');
    }
  }

  /* ---------- game flow ---------- */

  function makePins(heights) {
    var d = currentDiff();
    var n = d.pinCount;
    var h = heights && heights.length === n ? heights.slice() : genHeights(n, d.window);
    var pins = [];
    for (var i = 0; i < n; i++) {
      pins.push({
        index: i,
        lift: 0,
        setHeight: clamp(h[i], 0.18, 0.88),
        set: false
      });
    }
    var order = [];
    for (i = 0; i < n; i++) order.push(i);
    return { pins: pins, bindOrder: shuffle(order) };
  }

  function newLock(opts) {
    opts = opts || {};
    var d = currentDiff();
    var made = makePins(opts.setHeights);
    state.status = 'picking';
    state.pins = made.pins;
    state.bindOrder = made.bindOrder;
    state.selected = 0;
    state.pinHealth = 1;
    state.pinsLeft = d.picks;
    state.wiggle = 0;
    jamHeld = false;
    wasInWindow = false;
    needRelease = false;
    unlockFlash = 0;
    breakFlash = 0;
    plugTurn = 0;
    liftButton = false;
    liftKeys = {};
    statusOverride = '';
    stopScrape();
    var btn = root && root.querySelector('.lp-turn');
    if (btn) btn.classList.remove('lp-held');
    syncUi();
  }

  function dropAllPins() {
    for (var i = 0; i < state.pins.length; i++) {
      var p = state.pins[i];
      if (p.set) p.lift = p.setHeight;
      p.set = false;
    }
  }

  function breakPick() {
    if (state.status !== 'picking') return;
    stopScrape();
    sfxSnap();
    state.pinsLeft -= 1;
    state.pinsBroken += 1;
    state.pinHealth = 0;
    state.wiggle = 0;
    jamHeld = false;
    wasInWindow = false;
    breakFlash = 1;
    needRelease = true;
    dropAllPins();
    saveStore();
    if (state.pinsLeft <= 0) {
      state.status = 'failed';
      syncUi();
      return;
    }
    state.pinHealth = 1;
    syncUi();
    flashStatus('The pick snaps. All tumblers fall. ' + state.pinsLeft + ' remaining.', 'fail', 1800);
  }

  function unlock() {
    if (state.status !== 'picking') return;
    stopScrape();
    state.status = 'opening';
    state.wiggle = 0;
    jamHeld = false;
    unlockFlash = 1;
    state.locksOpened += 1;
    saveStore();
    sfxClunk();
    syncUi();
    if (typeof window.showWin === 'function') {
      window.showWin('Every tumbler catches at the shear line. The vault lock clicks open.');
    }
  }

  function trySetPin(pin) {
    var d = currentDiff();
    if (pin.set) return;
    if (canSet(pin) && inWindow(pin, d)) {
      pin.set = true;
      pin.lift = 0;
      sfxClick();
      flashStatus('A tumbler sets. ' + (d.pinCount - tumblersSet()) + ' remaining.', 'success', 1200);
      if (tumblersSet() >= d.pinCount) unlock();
      return;
    }
    // too low, overset, or a non-binding pin: it will fall in the step loop
    if (d.bind && !canSet(pin) && pin.lift > 0.04) {
      flashStatus('This pin is not binding. It springs back.', 'hint', 1100);
    }
  }

  function step(dt) {
    if (dt > 0.08) dt = 0.08;
    unlockFlash = Math.max(0, unlockFlash - dt * 1.4);
    breakFlash = Math.max(0, breakFlash - dt * 1.8);

    if (state.status === 'opening' || state.status === 'unlocked') {
      var turnSpeed = (Math.PI / 2) / (REDUCE ? 0.35 : 0.7);
      plugTurn = Math.min(Math.PI / 2, plugTurn + turnSpeed * dt);
      if (plugTurn >= Math.PI / 2 - 0.001) state.status = 'unlocked';
      stopScrape();
      state.wiggle = 0;
      return;
    }
    if (state.status !== 'picking') {
      stopScrape();
      state.wiggle = 0;
      // after a snap, set pins have already been unset; let stacks fall
      var dFall = currentDiff();
      for (var f = 0; f < state.pins.length; f++) {
        if (!state.pins[f].set && state.pins[f].lift > 0) {
          state.pins[f].lift = Math.max(0, state.pins[f].lift - dFall.fallSpeed * dt);
        }
      }
      return;
    }

    var d = currentDiff();
    var holding = liftOn();
    var pin = state.pins[state.selected];

    if (holding && pin && !pin.set) {
      var speed = d.liftSpeed;
      if (canSet(pin) && inWindow(pin, d)) speed *= 0.32;
      pin.lift = Math.min(1, pin.lift + speed * dt);
      var nowWin = canSet(pin) && inWindow(pin, d);
      if (nowWin && !wasInWindow) {
        if (d.hint !== 'none') sfxTick();
        wasInWindow = true;
      }
      if (!nowWin) wasInWindow = false;

      var jammed = isOverset(pin, d) || pin.lift >= 0.995;
      if (jammed) {
        if (!jamHeld) { jamHeld = true; startScrape(); }
        state.wiggle = 1;
        state.pinHealth -= d.pinDrain * dt;
        if (state.pinHealth <= 0) {
          state.pinHealth = 0;
          breakPick();
          return;
        }
      } else {
        if (jamHeld) { jamHeld = false; stopScrape(); }
        state.wiggle = 0;
      }
    } else {
      if (jamHeld) { jamHeld = false; stopScrape(); }
      state.wiggle = 0;
      wasInWindow = false;
      for (var i = 0; i < state.pins.length; i++) {
        var p = state.pins[i];
        if (p.set) continue;
        if (holding && i === state.selected) continue;
        if (p.lift > 0) p.lift = Math.max(0, p.lift - d.fallSpeed * dt);
      }
    }
  }

  function onLiftReleased() {
    if (state.status !== 'picking') return;
    var pin = state.pins[state.selected];
    if (!pin || pin.set) return;
    trySetPin(pin);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (document.hidden) return;
    step(dt);
    syncUi();
    drawLock();
  }

  /* ---------- input ---------- */

  function isActive() {
    if (!root) return false;
    return window.getComputedStyle(root).display !== 'none';
  }

  function selectFromClientX(clientX) {
    if (!lastLayout || state.status !== 'picking') return;
    if (liftOn()) return; // don't switch pins mid-lift
    var rect = canvas.getBoundingClientRect();
    var x = (clientX - rect.left) * (canvas.width / rect.width);
    var best = state.selected, bestDist = Infinity;
    for (var i = 0; i < lastLayout.chambers.length; i++) {
      var dist = Math.abs(x - lastLayout.chambers[i].cx);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    if (best !== state.selected) {
      state.selected = best;
      sfxSlide();
    }
  }

  function onCanvasPointerDown(e) {
    if (!isActive()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    selectFromClientX(e.clientX);
    ensureAudio();
  }

  function onPointerMove(e) {
    if (!isActive() || !canvas) return;
    if (e.pointerType === 'touch' && e.buttons === 0 && e.pressure === 0) return;
    if (e.pointerType === 'mouse' || canvas.hasPointerCapture(e.pointerId) || e.buttons) {
      selectFromClientX(e.clientX);
    }
  }

  function onMouseMove(e) {
    if (!isActive() || !canvas) return;
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    var rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left - 20 || e.clientX > rect.right + 20) return;
    if (e.clientY < rect.top - 20 || e.clientY > rect.bottom + 20) return;
    selectFromClientX(e.clientX);
  }

  function onKeyDown(e) {
    if (!isActive()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!LIFT_CODES[e.code]) return;
    if (e.repeat) { liftKeys[e.code] = true; e.preventDefault(); return; }
    liftKeys[e.code] = true;
    e.preventDefault();
    ensureAudio();
  }

  function onKeyUp(e) {
    if (!LIFT_CODES[e.code]) return;
    var was = rawLift();
    liftKeys[e.code] = false;
    if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowUp') e.preventDefault();
    if (was && !rawLift()) onLiftReleased();
  }

  function onLiftDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    liftButton = true;
    e.currentTarget.classList.add('lp-held');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ensureAudio();
  }

  function onLiftUp(e) {
    var was = rawLift();
    liftButton = false;
    var btn = root && root.querySelector('.lp-turn');
    if (btn) btn.classList.remove('lp-held');
    if (e) e.preventDefault();
    if (was && !rawLift()) onLiftReleased();
  }

  function setDifficulty(key) {
    if (!diffByKey(key)) return;
    if (key === state.diffKey && state.status === 'picking' && tumblersSet() === 0 && state.pinsLeft === currentDiff().picks) {
      return;
    }
    state.diffKey = key;
    var btns = root.querySelectorAll('[data-lp-diff]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-lp-diff') === key;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    saveStore();
    newLock();
  }

  function toggleMute() {
    state.muted = !state.muted;
    if (state.muted) stopScrape();
    else ensureAudio();
    saveStore();
    syncUi();
  }

  function onClick(e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-lp-diff],[data-lp-act]') : null;
    if (!t || !root.contains(t)) return;
    if (t.hasAttribute('data-lp-diff')) {
      setDifficulty(t.getAttribute('data-lp-diff'));
      return;
    }
    var act = t.getAttribute('data-lp-act');
    if (act === 'new') newLock();
    else if (act === 'mute') toggleMute();
  }

  /* ---------- init / api ---------- */

  function pinPublic(p) {
    var d = currentDiff();
    return {
      index: p.index,
      lift: p.lift,
      setHeight: p.setHeight,
      set: p.set,
      inWindow: inWindow(p, d),
      overset: isOverset(p, d),
      binding: d.bind && p.index === bindingIndex()
    };
  }

  function getState() {
    var d = currentDiff();
    return {
      difficulty: state.diffKey,
      pinCount: d.pinCount,
      pins: state.pins.map(pinPublic),
      selected: state.selected,
      bindingIndex: bindingIndex(),
      bindOrder: state.bindOrder.slice(),
      pinHealth: state.pinHealth,
      pinsLeft: state.pinsLeft,
      pinsStart: d.picks,
      tumblersSet: tumblersSet(),
      locksOpened: state.locksOpened,
      pinsBroken: state.pinsBroken,
      status: state.status,
      lifting: liftOn(),
      muted: state.muted,
      window: d.window,
      liftSpeed: d.liftSpeed,
      pinDrain: d.pinDrain,
      bind: d.bind,
      plugTurn: plugTurn
    };
  }

  function init() {
    root = document.getElementById('lock');
    if (!root) return;
    injectStyle();
    root.innerHTML = markup();
    canvas = root.querySelector('#lp-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    newLock();
    syncUi();
    drawLock();

    root.addEventListener('click', onClick);
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      var was = rawLift();
      liftKeys = {};
      liftButton = false;
      var btn = root.querySelector('.lp-turn');
      if (btn) btn.classList.remove('lp-held');
      stopScrape();
      if (was) onLiftReleased();
    });
    window.addEventListener('resize', function () { resizeCanvas(); drawLock(); });

    var liftBtn = root.querySelector('.lp-turn');
    liftBtn.addEventListener('pointerdown', onLiftDown);
    liftBtn.addEventListener('pointerup', onLiftUp);
    liftBtn.addEventListener('pointercancel', onLiftUp);
    liftBtn.addEventListener('lostpointercapture', onLiftUp);
    liftBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    liftBtn.addEventListener('click', function (e) { e.preventDefault(); });

    var overlay = document.getElementById('win-overlay');
    if (overlay) {
      overlay.addEventListener('click', function () {
        if (state.status === 'unlocked' || state.status === 'opening') newLock();
      });
    }

    lastTs = 0;
    raf = requestAnimationFrame(loop);
  }

  window.Lockpick = {
    getState: getState,
    selectPin: function (i) {
      i = Number(i);
      if (i >= 0 && i < state.pins.length && state.status === 'picking' && !liftOn()) state.selected = i;
      return getState();
    },
    setLift: function (i, h) {
      i = Number(i);
      if (i >= 0 && i < state.pins.length && !state.pins[i].set && state.status === 'picking') {
        state.selected = i;
        state.pins[i].lift = clamp(Number(h), 0, 1);
      }
      return getState();
    },
    release: function () {
      var wasBtn = liftButton;
      liftButton = false;
      liftKeys = {};
      var btn = root && root.querySelector('.lp-turn');
      if (btn) btn.classList.remove('lp-held');
      if (wasBtn || true) onLiftReleased();
      return getState();
    },
    setLiftHeld: function (on) {
      var was = rawLift();
      liftButton = !!on;
      var btn = root && root.querySelector('.lp-turn');
      if (btn) btn.classList.toggle('lp-held', !!on);
      if (on) ensureAudio();
      else if (was) onLiftReleased();
      return getState();
    },
    newLock: function (opts) {
      opts = opts || {};
      newLock(opts);
      return getState();
    },
    setDifficulty: function (key) { setDifficulty(key); return getState(); },
    diffs: DIFFS.map(function (d) {
      return {
        key: d.key, label: d.label, pinCount: d.pinCount, window: d.window,
        liftSpeed: d.liftSpeed, fallSpeed: d.fallSpeed, pinDrain: d.pinDrain,
        picks: d.picks, bind: d.bind, hint: d.hint
      };
    })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
