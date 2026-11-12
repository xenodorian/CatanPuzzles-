/* Lockpick: a vault-themed lockpicking puzzle. Original sweet-spot / tension-wrench
   minigame, with consecutive tumbler sets shown on a cutaway sidebar. No third-party
   code or assets. */
(function () {
  'use strict';

  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;
  var PIN_MIN = -Math.PI / 2;
  var PIN_MAX = Math.PI / 2;
  var UNLOCK_TURN = Math.PI / 2;
  var TURN_SPEED = UNLOCK_TURN / 0.75;
  var RETURN_SPEED = UNLOCK_TURN / 0.45;
  var STORE_KEY = 'vault-lockpick';
  var REDUCE = false;
  try {
    REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* ignore */ }

  var DIFFS = [
    { key: 'easy',     label: 'Easy',      sweetWidth: 14 * DEG, falloff: 40 * DEG, pinDrain: 0.55, pins: 7, tumblers: 3 },
    { key: 'medium',   label: 'Medium',    sweetWidth:  8 * DEG, falloff: 26 * DEG, pinDrain: 0.85, pins: 6, tumblers: 4 },
    { key: 'hard',     label: 'Hard',      sweetWidth: 4.5 * DEG, falloff: 16 * DEG, pinDrain: 1.30, pins: 5, tumblers: 5 },
    { key: 'veryhard', label: 'Very Hard', sweetWidth:  2 * DEG, falloff: 10 * DEG, pinDrain: 2.00, pins: 4, tumblers: 6 }
  ];
  var TUMBLER_FALL = 2.4;

  var TENSION_CODES = { KeyW: 1, Space: 1, KeyD: 1, ArrowRight: 1 };

  var CSS = [
    '.lp-stage{width:100%;display:flex;flex-direction:column;align-items:center;gap:0.6rem}',
    '.lp-boards{width:100%;display:flex;flex-wrap:wrap;justify-content:center;align-items:stretch;gap:0.75rem}',
    '.lp-canvas-wrap{width:min(100%,460px);flex:1 1 320px;max-width:460px;aspect-ratio:1/1;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.lp-side-wrap{width:min(100%,280px);flex:1 1 200px;max-width:300px;aspect-ratio:3/5;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.lp-canvas-wrap canvas,.lp-side-wrap canvas{display:block;width:100%;height:100%;border:1px solid var(--gold-dim);',
    'background:#120e08;box-shadow:0 0 30px rgba(0,0,0,0.6),inset 0 0 24px rgba(0,0,0,0.45)}',
    '.lp-canvas-wrap canvas{cursor:crosshair}',
    '.lp-boards.lp-won canvas{border-color:var(--success);box-shadow:0 0 40px rgba(90,170,112,0.35)}',
    '.lp-boards.lp-failed canvas{border-color:var(--danger)}',
    '@media (max-width:700px){',
    '.lp-canvas-wrap{max-width:520px;flex-basis:100%}',
    '.lp-side-wrap{width:100%;max-width:520px;aspect-ratio:16/10;flex-basis:100%}',
    '}',
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

  /* ---------- storage ---------- */

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
    playNoise(0.04, 0.35, 1800, 2.2);
    playTone('triangle', 920, 0.05, 0.12);
  }

  function sfxTick() {
    playTone('square', 260, 0.06, 0.1, 340);
    playNoise(0.05, 0.2, 700, 1.4);
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

  function maxTurn(pin, sweet, width, falloff) {
    var d = Math.abs(pin - sweet);
    if (d <= width) return UNLOCK_TURN;
    if (d >= width + falloff) return 0;
    return UNLOCK_TURN * (1 - (d - width) / falloff);
  }

  function randomSweet(prev) {
    var a, tries = 0;
    do {
      a = (Math.random() * 170 - 85) * DEG;
      tries++;
    } while (prev != null && Math.abs(a - prev) < 20 * DEG && tries < 8);
    return a;
  }

  /* ---------- state ---------- */

  var root = null;
  var canvas = null;
  var ctx = null;
  var dpr = 1;
  var saved = loadStore();
  var tensionKeys = {};
  var tensionButton = false;
  var lastTs = 0;
  var lastClickAng = 0;
  var bindHeld = false;
  var bindTime = 0;
  var needRelease = false;
  var unlockFlash = 0;
  var breakFlash = 0;
  var raf = 0;
  var sideCanvas = null;
  var sideCtx = null;
  var tumblersFalling = false;
  var awaitReturn = false;
  var statusHold = { text: '', cls: '', until: 0 };

  var state = {
    diffKey: saved.difficulty,
    sweet: 0,
    pin: 0,
    cylinder: 0,
    pinHealth: 1,
    pinsLeft: 7,
    locksOpened: saved.locksOpened,
    pinsBroken: saved.pinsBroken,
    status: 'picking',
    muted: saved.muted,
    wiggle: 0,
    tumblersSet: 0,
    tumblerLift: [],
    pattern: []
  };

  function currentDiff() { return diffByKey(state.diffKey) || DIFFS[0]; }

  function rawTension() {
    if (tensionButton) return true;
    for (var k in tensionKeys) if (tensionKeys[k]) return true;
    return false;
  }

  function tensionOn() {
    if (state.status !== 'picking') return false;
    if (needRelease) {
      if (!rawTension()) needRelease = false;
      else return false;
    }
    return rawTension();
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
        '<p class="flavor-text">"A heavy iron lock guards the vault. Guide your pick to the hidden sweet ' +
        'spot and turn the wrench until a tumbler sets. Each lock hides several tumblers &mdash; set them ' +
        'all in a row and the plug yields. Snap the pick, and every tumbler you had set falls back."</p>' +
        '<div class="btn-row diff-row" role="group" aria-label="Difficulty">' + diffs + '</div>' +
        '<div class="lp-stage">' +
          '<div class="lp-boards">' +
            '<div class="lp-canvas-wrap"><canvas id="lp-canvas" width="520" height="520" role="img" ' +
            'aria-label="Vault lock. Move to aim the pick. Hold Turn to apply tension."></canvas></div>' +
            '<div class="lp-side-wrap"><canvas id="lp-side" width="300" height="500" role="img" ' +
            'aria-label="Cutaway of the lock tumblers. Set pins stay at the shear line."></canvas></div>' +
          '</div>' +
          '<div class="lp-health-label">Pick strength</div>' +
          '<div class="lp-health" aria-hidden="true"><span></span></div>' +
          '<div class="lp-stats">' +
            '<div class="move-counter lp-set">Tumblers: 0/3</div>' +
            '<div class="move-counter lp-pins">Picks: 0</div>' +
            '<div class="move-counter lp-opened">Locks opened: 0</div>' +
          '</div>' +
        '</div>' +
        '<div class="status-msg lp-status" aria-live="polite"></div>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn btn-primary lp-turn" data-lp-act="turn">Hold to Turn</button>' +
          '<button type="button" class="btn" data-lp-act="new">New Lock</button>' +
          '<button type="button" class="btn lp-mute" data-lp-act="mute">Sound</button>' +
        '</div>' +
      '</div>' +
      '<div class="dm-panel">' +
        '<div class="dm-label">How to Play</div>' +
        '<p>Move the mouse, or drag a finger, around the lock to aim the pick across the top half of the ' +
        'keyhole. Hold <code>W</code>, <code>Space</code>, <code>D</code>, <code>Right Arrow</code>, or the ' +
        '<em>Hold to Turn</em> button to apply tension with the wrench. The closer the pick is to the lock&rsquo;s ' +
        'hidden sweet spot, the farther the cylinder turns. If the cylinder stops short, the pick is off the ' +
        'mark &mdash; release and try a new angle. Holding against a bind will snap the pick. A full quarter-turn ' +
        'sets one tumbler: you will hear a click, the cylinder springs back, and the next tumbler&rsquo;s sweet spot takes over. ' +
        'Set every tumbler in a row to open the lock. Easy needs 3 successful turns, Medium 4, Hard 5, and ' +
        'Very Hard 6. The sidebar shows those tumblers: set pins stay raised at the shear line, and the current ' +
        'pin rises as you turn. If the pick snaps, every set tumbler falls and you start that lock over, keeping ' +
        'any picks you have left. The lock keeps the same sweet spots until you start a new lock. Difficulty also narrows the sweet spot, shortens the forgiving range, and makes ' +
        'picks more brittle. On a touch screen, drag to aim and hold the Turn button to apply tension.</p>' +
      '</div>';
  }

  function injectStyle() {
    if (document.getElementById('lp-style')) return;
    var s = document.createElement('style');
    s.id = 'lp-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- drawing ---------- */

  function resizeOne(cnv, fallbackW, fallbackH) {
    if (!cnv) return;
    var wrap = cnv.parentNode;
    var cssW = wrap.clientWidth || fallbackW;
    var cssH = wrap.clientHeight || fallbackH;
    dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    var pxW = Math.round(cssW * dpr);
    var pxH = Math.round(cssH * dpr);
    if (cnv.width !== pxW || cnv.height !== pxH) {
      cnv.width = pxW;
      cnv.height = pxH;
    }
  }

  function resizeCanvas() {
    resizeOne(canvas, 520, 520);
    resizeOne(sideCanvas, 300, 500);
  }

  function drawLock() {
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2;
    var R = Math.min(w, h) * 0.42;
    var time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var wig = state.wiggle;
    var pinAng = state.pin + wig * (REDUCE ? 0.15 : 1) * Math.sin(time * 42) * (0.018 + bindTime * 0.01);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#2a2218');
    bg.addColorStop(1, '#100c08');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);

    // stone door texture
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (var t = -6; t <= 6; t++) {
      ctx.fillRect(-w, t * (h / 14) - h * 0.01, w * 2, dpr);
    }

    // drop shadow
    ctx.beginPath();
    ctx.ellipse(0, R * 0.12, R * 1.08, R * 1.02, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();

    // outer plate
    var plate = ctx.createRadialGradient(-R * 0.28, -R * 0.32, R * 0.1, 0, 0, R * 1.05);
    plate.addColorStop(0, '#f0d07a');
    plate.addColorStop(0.22, '#e0b24a');
    plate.addColorStop(0.55, '#b07a28');
    plate.addColorStop(0.82, '#6e4a14');
    plate.addColorStop(1, '#3a250a');
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = plate;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.strokeStyle = '#2a1a08';
    ctx.lineWidth = R * 0.03;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.97, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.35)';
    ctx.lineWidth = R * 0.012;
    ctx.stroke();

    // engraved rings and rune ticks
    ctx.strokeStyle = 'rgba(40, 24, 8, 0.55)';
    ctx.lineWidth = Math.max(1, dpr);
    for (var ring = 0.88; ring >= 0.72; ring -= 0.08) {
      ctx.beginPath();
      ctx.arc(0, 0, R * ring, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(30, 90, 82, 0.55)';
    ctx.lineWidth = R * 0.012;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.8, 0, TAU);
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = 'rgba(30, 80, 72, 0.7)';
    for (var k = 0; k < 12; k++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.835);
      ctx.lineTo(R * 0.012, -R * 0.78);
      ctx.lineTo(-R * 0.012, -R * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // rivets
    for (var i = 0; i < 8; i++) {
      var ra = -Math.PI / 2 + i * (TAU / 8) + Math.PI / 8;
      var rx = Math.cos(ra) * R * 0.9, ry = Math.sin(ra) * R * 0.9;
      var rr = R * 0.055;
      var rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, rr * 0.1, rx, ry, rr);
      rg.addColorStop(0, '#f3d48a');
      rg.addColorStop(0.5, '#c9943a');
      rg.addColorStop(1, '#5a3a10');
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, TAU);
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,8,0.6)';
      ctx.lineWidth = Math.max(1, dpr * 0.8);
      ctx.stroke();
    }

    // recessed well
    var wellR = R * 0.62;
    ctx.beginPath();
    ctx.arc(0, 0, wellR, 0, TAU);
    ctx.fillStyle = '#1a140c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, wellR, 0, TAU);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = R * 0.02;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, wellR * 0.98, 0, TAU);
    ctx.strokeStyle = 'rgba(201,148,58,0.18)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();

    // inner cylinder
    var cylR = R * 0.56;
    ctx.save();
    ctx.rotate(state.cylinder);
    var cyl = ctx.createRadialGradient(-cylR * 0.25, -cylR * 0.3, cylR * 0.1, 0, 0, cylR);
    cyl.addColorStop(0, '#d8b056');
    cyl.addColorStop(0.45, '#9a6e22');
    cyl.addColorStop(1, '#4a300c');
    ctx.beginPath();
    ctx.arc(0, 0, cylR, 0, TAU);
    ctx.fillStyle = cyl;
    ctx.fill();

    ctx.strokeStyle = 'rgba(30,18,6,0.5)';
    ctx.lineWidth = Math.max(1, dpr);
    for (var g = 0; g < 18; g++) {
      ctx.beginPath();
      ctx.arc(0, 0, cylR * (0.92 - g * 0.018), 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, cylR, 0, TAU);
    ctx.strokeStyle = '#2a1a08';
    ctx.lineWidth = R * 0.014;
    ctx.stroke();

    // keyhole
    keyholePath(ctx, cylR);
    ctx.fillStyle = '#070504';
    ctx.fill();
    keyholePath(ctx, cylR);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();

    // faint inner highlight on the hole rim
    ctx.save();
    keyholePath(ctx, cylR);
    ctx.clip();
    var hole = ctx.createRadialGradient(0, -cylR * 0.08, 0, 0, 0, cylR * 0.4);
    hole.addColorStop(0, 'rgba(80,60,30,0.35)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hole;
    ctx.fillRect(-cylR, -cylR, cylR * 2, cylR * 2);
    ctx.restore();

    // tension wrench, seated in the bottom of the keyhole, turns with the cylinder
    drawWrench(ctx, cylR, wig, time);
    ctx.restore();

    // pick stays at the aimed world angle
    drawPick(ctx, cylR, pinAng, wig, time);

    // unlock / break flashes
    if (unlockFlash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.02, 0, TAU);
      ctx.strokeStyle = 'rgba(90,170,112,' + (0.7 * unlockFlash) + ')';
      ctx.lineWidth = R * 0.04;
      ctx.stroke();
    }
    if (breakFlash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.02, 0, TAU);
      ctx.strokeStyle = 'rgba(192,64,64,' + (0.75 * breakFlash) + ')';
      ctx.lineWidth = R * 0.035;
      ctx.stroke();
    }

    ctx.restore();
  }

  function keyholePath(c, cylR) {
    var cr = cylR * 0.155;
    var cy = -cylR * 0.06;
    var slotW = cylR * 0.075;
    var slotBottom = cylR * 0.38;
    var midY = cylR * 0.08;
    c.beginPath();
    c.arc(0, cy, cr, Math.PI * 0.85, Math.PI * 0.15, false);
    c.lineTo(slotW, midY);
    c.lineTo(slotW * 0.72, slotBottom);
    c.quadraticCurveTo(0, slotBottom + cylR * 0.04, -slotW * 0.72, slotBottom);
    c.lineTo(-slotW, midY);
    c.closePath();
  }

  function drawWrench(c, cylR, wig, time) {
    var shake = wig * (REDUCE ? 0.1 : 1) * Math.sin(time * 51) * 0.025;
    c.save();
    c.rotate(shake);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // short bit in the lower keyhole, long handle out and down-right at rest
    var y0 = cylR * 0.16;
    var y1 = cylR * 0.42;
    c.strokeStyle = '#8a8c92';
    c.fillStyle = '#b8bac0';
    c.lineWidth = cylR * 0.055;
    c.beginPath();
    c.moveTo(0, y0);
    c.lineTo(0, y1);
    c.stroke();
    c.lineWidth = cylR * 0.07;
    c.strokeStyle = '#c5c7cc';
    c.beginPath();
    c.moveTo(0, y1);
    c.lineTo(cylR * 0.62, y1 + cylR * 0.18);
    c.lineTo(cylR * 0.82, y1 + cylR * 0.08);
    c.stroke();
    // handle tip
    c.beginPath();
    c.arc(cylR * 0.82, y1 + cylR * 0.08, cylR * 0.05, 0, TAU);
    c.fillStyle = '#6a4a18';
    c.fill();
    c.strokeStyle = '#f0d07a';
    c.lineWidth = Math.max(1, dpr);
    c.stroke();
    c.restore();
  }

  function drawPick(c, cylR, ang, wig, time) {
    c.save();
    c.rotate(ang);
    var shake = wig * (REDUCE ? 0.2 : 1) * Math.sin(time * 47) * cylR * 0.02;
    c.translate(shake, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    var y0 = -cylR * 0.12;
    var y1 = -cylR * 0.95;
    // shaft
    c.strokeStyle = '#9aa0a8';
    c.lineWidth = cylR * 0.045;
    c.beginPath();
    c.moveTo(0, y0);
    c.lineTo(0, y1 + cylR * 0.12);
    c.stroke();
    c.strokeStyle = 'rgba(230,232,236,0.7)';
    c.lineWidth = cylR * 0.016;
    c.beginPath();
    c.moveTo(-cylR * 0.01, y0);
    c.lineTo(-cylR * 0.01, y1 + cylR * 0.14);
    c.stroke();

    // tip hook inside the keyhole
    c.strokeStyle = '#c8ccd2';
    c.lineWidth = cylR * 0.04;
    c.beginPath();
    c.moveTo(0, y0);
    c.quadraticCurveTo(cylR * 0.08, y0 + cylR * 0.04, cylR * 0.05, y0 + cylR * 0.1);
    c.stroke();

    // loop handle
    c.beginPath();
    c.ellipse(0, y1 + cylR * 0.02, cylR * 0.07, cylR * 0.11, 0, 0, TAU);
    c.strokeStyle = '#d0d4da';
    c.lineWidth = cylR * 0.04;
    c.stroke();
    c.beginPath();
    c.ellipse(0, y1 + cylR * 0.02, cylR * 0.07, cylR * 0.11, 0, 0, TAU);
    c.strokeStyle = 'rgba(80,84,90,0.6)';
    c.lineWidth = Math.max(1, dpr);
    c.stroke();

    c.restore();
  }


  /* ---------- sidebar tumbler cutaway (art from the pin-tumbler diagram) ---------- */

  function tumblerCount() { return currentDiff().tumblers; }

  function ensureLifts() {
    var n = tumblerCount();
    if (!state.tumblerLift) state.tumblerLift = [];
    while (state.tumblerLift.length < n) state.tumblerLift.push(0);
    if (state.tumblerLift.length > n) state.tumblerLift.length = n;
  }

  function flashStatus(text, cls, ms) {
    statusHold.text = text;
    statusHold.cls = cls || '';
    statusHold.until = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + (ms || 1400);
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

  function sideLayout(w, h, n) {
    var margin = { l: w * 0.06, r: w * 0.06, t: h * 0.12, b: h * 0.07 };
    var bodyX = margin.l;
    var bodyY = margin.t;
    var bodyW = w - margin.l - margin.r;
    var bodyH = h - margin.t - margin.b;
    var shearY = bodyY + bodyH * 0.46;
    var travel = bodyH * 0.28;
    var keywayH = bodyH * 0.12;
    var keywayY = bodyY + bodyH - keywayH - bodyH * 0.04;
    var boreW = Math.min(bodyW * 0.18, bodyH * 0.16);
    var gap = (bodyW - n * boreW) / (n + 1);
    if (gap < boreW * 0.18) {
      boreW = bodyW / (n + 0.4 * (n + 1));
      gap = (bodyW - n * boreW) / (n + 1);
    }
    var chambers = [];
    for (var i = 0; i < n; i++) {
      var cx = bodyX + gap + boreW * 0.5 + i * (boreW + gap);
      chambers.push({
        i: i, cx: cx,
        left: cx - boreW * 0.5, right: cx + boreW * 0.5, w: boreW,
        top: bodyY + bodyH * 0.07, bottom: keywayY
      });
    }
    return {
      bodyX: bodyX, bodyY: bodyY, bodyW: bodyW, bodyH: bodyH,
      bodyBottom: bodyY + bodyH, shearY: shearY, travel: travel,
      keywayY: keywayY, keywayH: keywayH, chambers: chambers, boreW: boreW
    };
  }

  function pinGeometry(pin, ch, L) {
    var shearY = L.shearY;
    var travel = L.travel;
    var keyLen = ch.w * 1.05 + 0.5 * travel * 0.55;
    var driverLen = ch.w * 0.85;
    if (pin.set) {
      return {
        keyTop: shearY + travel * 0.12,
        keyBot: shearY + travel * 0.12 + keyLen * 0.7,
        driverTop: shearY - driverLen,
        driverBot: shearY,
        set: true
      };
    }
    var gapY = shearY + (1 - pin.lift) * travel;
    return {
      keyTop: gapY,
      keyBot: gapY + keyLen,
      driverTop: gapY - driverLen,
      driverBot: gapY,
      set: false
    };
  }

  function drawSidebar() {
    if (!sideCtx || !sideCanvas) return;
    ensureLifts();
    var w = sideCanvas.width, h = sideCanvas.height;
    var n = tumblerCount();
    var L = sideLayout(w, h, n);
    var time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var c = sideCtx;
    var current = state.tumblersSet;
    var wigAmt = (bindHeld && !tumblersFalling) ? (REDUCE ? 0.2 : 1) * Math.sin(time * 48) * L.boreW * 0.05 : 0;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    var bg = c.createRadialGradient(w * 0.4, h * 0.4, h * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    bg.addColorStop(0, '#2a2218');
    bg.addColorStop(1, '#100c08');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    var bx = L.bodyX, by = L.bodyY, bw = L.bodyW, bh = L.bodyH;
    roundRect(c, bx, by, bw, bh, 10 * dpr);
    var bodyGrad = c.createLinearGradient(bx, by, bx, by + bh);
    bodyGrad.addColorStop(0, '#c9943a');
    bodyGrad.addColorStop(0.45, '#8a5a18');
    bodyGrad.addColorStop(0.46, '#6e4a14');
    bodyGrad.addColorStop(1, '#4a320e');
    c.fillStyle = bodyGrad;
    c.fill();
    c.strokeStyle = '#2a1a08';
    c.lineWidth = Math.max(2, dpr * 1.5);
    c.stroke();

    c.save();
    roundRect(c, bx, by, bw, bh, 10 * dpr);
    c.clip();
    c.fillStyle = '#8a5e20';
    c.fillRect(bx, by, bw, L.shearY - by);
    c.fillStyle = '#3a2a10';
    c.fillRect(bx, L.shearY, bw, L.bodyBottom - L.shearY);
    c.strokeStyle = 'rgba(0,0,0,0.08)';
    c.lineWidth = dpr;
    for (var gy = by + 8; gy < L.bodyBottom; gy += 7 * dpr) {
      c.beginPath(); c.moveTo(bx, gy); c.lineTo(bx + bw, gy); c.stroke();
    }
    c.restore();

    var i, ch;
    for (i = 0; i < n; i++) {
      ch = L.chambers[i];
      c.fillStyle = '#1a140c';
      roundRect(c, ch.left, ch.top, ch.w, ch.bottom - ch.top, ch.w * 0.2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = Math.max(1, dpr);
      c.stroke();
    }

    c.fillStyle = '#0c0a07';
    c.fillRect(bx + bw * 0.04, L.keywayY, bw * 0.92, L.keywayH);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.strokeRect(bx + bw * 0.04, L.keywayY, bw * 0.92, L.keywayH);

    for (i = 0; i < n; i++) {
      ch = L.chambers[i];
      var isSet = !tumblersFalling && i < state.tumblersSet;
      var pin = { lift: state.tumblerLift[i] || 0, set: isSet };
      var geo = pinGeometry(pin, ch, L);
      var jx = (i === current && wigAmt) ? wigAmt : 0;
      var left = ch.left + ch.w * 0.12 + jx;
      var pw = ch.w * 0.76;

      c.strokeStyle = '#c8ccd0';
      c.lineWidth = Math.max(1.2, dpr * 1.1);
      c.lineCap = 'round';
      drawSpring(c, ch.cx + jx, ch.top + 3 * dpr, geo.driverTop, ch.w, 6);

      var dTop = geo.driverTop, dBot = geo.driverBot, dH = Math.max(2, dBot - dTop);
      c.fillStyle = isSet
        ? cylinderShade(c, left, dTop, pw, dH, '#8ed0c4', '#3d8a7c', '#1a4a44')
        : cylinderShade(c, left, dTop, pw, dH, '#c8cdd4', '#7a8088', '#3a3e44');
      roundRect(c, left, dTop, pw, dH, pw * 0.15);
      c.fill();
      c.strokeStyle = isSet ? 'rgba(126,207,192,0.7)' : 'rgba(0,0,0,0.45)';
      c.lineWidth = Math.max(1, dpr);
      c.stroke();

      var kTop = geo.keyTop, kBot = Math.min(geo.keyBot, L.keywayY);
      var kH = Math.max(2, kBot - kTop);
      c.fillStyle = cylinderShade(c, left, kTop, pw, kH, '#e0b24a', '#a06a20', '#5a3a10');
      roundRect(c, left, kTop, pw, kH, pw * 0.15);
      c.fill();
      c.strokeStyle = 'rgba(40,24,8,0.55)';
      c.stroke();

      if (i === current && state.status === 'picking' && !tumblersFalling) {
        c.strokeStyle = 'rgba(240,191,90,0.9)';
        c.lineWidth = Math.max(2, dpr * 1.4);
        c.strokeRect(ch.left - 3 * dpr, ch.top - 3 * dpr, ch.w + 6 * dpr, ch.bottom - ch.top + 6 * dpr);
      }
      if (isSet) {
        c.fillStyle = 'rgba(126,207,192,0.35)';
        c.fillRect(ch.left + 2, L.shearY - 2 * dpr, ch.w - 4, 4 * dpr);
      }
    }

    c.save();
    c.beginPath();
    c.moveTo(bx + 4, L.shearY);
    c.lineTo(bx + bw - 4, L.shearY);
    c.strokeStyle = 'rgba(240,191,90,0.95)';
    c.lineWidth = Math.max(2, dpr * 1.6);
    c.setLineDash([8 * dpr, 5 * dpr]);
    c.stroke();
    c.setLineDash([]);
    c.restore();

    c.fillStyle = '#f0bf5a';
    c.font = '600 ' + Math.max(9, 10 * dpr) + 'px Cinzel, serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText('SHEAR LINE', bx + 6 * dpr, L.shearY - 4 * dpr);
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(232,217,176,0.7)';
    c.fillText('HOUSING', bx + 6 * dpr, by + 5 * dpr);
    c.textBaseline = 'bottom';
    c.fillText('PLUG', bx + 6 * dpr, L.keywayY - 3 * dpr);

    c.strokeStyle = '#2a1a08';
    c.lineWidth = Math.max(2, dpr * 1.5);
    roundRect(c, bx, by, bw, bh, 10 * dpr);
    c.stroke();

    c.fillStyle = '#f0bf5a';
    c.font = '600 ' + Math.max(10, 11 * dpr) + 'px Cinzel, serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText('TUMBLERS', w / 2, by - 8 * dpr);
  }

  /* ---------- ui ---------- */

  function setStatus(text, cls) {
    var el = root.querySelector('.lp-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status-msg lp-status' + (cls ? ' ' + cls : '');
  }

  function syncUi() {
    var d = currentDiff();
    var boards = root.querySelector('.lp-boards');
    boards.classList.toggle('lp-won', state.status === 'unlocked');
    boards.classList.toggle('lp-failed', state.status === 'failed');
    root.querySelector('.lp-set').textContent = 'Tumblers: ' + state.tumblersSet + '/' + d.tumblers;
    root.querySelector('.lp-pins').textContent = 'Picks: ' + state.pinsLeft + '/' + d.pins;
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
    if (statusHold.text && now < statusHold.until) {
      setStatus(statusHold.text, statusHold.cls);
      return;
    }
    statusHold.text = '';

    if (state.status === 'unlocked') {
      setStatus('The lock yields. The vault opens.', 'success');
    } else if (state.status === 'failed') {
      setStatus('You are out of picks. The lock holds fast.', 'fail');
    } else if (bindHeld) {
      setStatus('The pick catches. Ease off before it snaps.', 'fail');
    } else if (state.tumblersSet > 0) {
      setStatus('Tumbler set. ' + (d.tumblers - state.tumblersSet) + ' remaining. Find the next sweet spot.', 'success');
    } else {
      setStatus('Set the pick, then hold Turn to apply tension.', '');
    }
  }

  /* ---------- game flow ---------- */

  function newLock(opts) {
    opts = opts || {};
    var d = currentDiff();
    var prev = state.sweet;
    state.status = 'picking';
    // The lock's pattern: one sweet spot per tumbler, fixed for the life of this lock.
    // A broken pick drops the tumblers but keeps the pattern; only a new lock rerolls it.
    state.pattern = [];
    var nT = d.tumblers, last = prev;
    for (var pi = 0; pi < nT; pi++) {
      last = (pi === 0 && opts.sweet != null) ? opts.sweet : randomSweet(last);
      state.pattern.push(last);
    }
    state.sweet = state.pattern[0];
    if (opts.pin != null) state.pin = clamp(opts.pin, PIN_MIN, PIN_MAX);
    state.cylinder = 0;
    state.pinHealth = 1;
    state.pinsLeft = d.pins;
    state.wiggle = 0;
    state.tumblersSet = 0;
    state.tumblerLift = [];
    ensureLifts();
    tumblersFalling = false;
    awaitReturn = false;
    statusHold = { text: '', cls: '', until: 0 };
    bindHeld = false;
    bindTime = 0;
    needRelease = false;
    unlockFlash = 0;
    breakFlash = 0;
    tensionButton = false;
    tensionKeys = {};
    stopScrape();
    var turn = root && root.querySelector('.lp-turn');
    if (turn) turn.classList.remove('lp-held');
    syncUi();
  }

  function breakPin() {
    if (state.status !== 'picking') return;
    stopScrape();
    sfxSnap();
    state.pinsLeft -= 1;
    state.pinsBroken += 1;
    state.pinHealth = 0;
    state.wiggle = 0;
    bindHeld = false;
    bindTime = 0;
    breakFlash = 1;
    needRelease = true;
    ensureLifts();
    var n = tumblerCount();
    var curLift = state.cylinder / UNLOCK_TURN;
    for (var i = 0; i < n; i++) {
      if (i < state.tumblersSet) state.tumblerLift[i] = 1;
      else if (i === state.tumblersSet) state.tumblerLift[i] = curLift;
      else state.tumblerLift[i] = 0;
    }
    state.tumblersSet = 0;
    tumblersFalling = true;
    awaitReturn = false;
    state.sweet = state.pattern[0];
    saveStore();
    if (state.pinsLeft <= 0) {
      state.status = 'failed';
      state.cylinder = Math.min(state.cylinder, maxAllowed());
      syncUi();
      flashStatus('You are out of picks. The lock holds fast.', 'fail', 2000);
      return;
    }
    state.pinHealth = 1;
    syncUi();
    flashStatus('The pick snaps. All tumblers fall. ' + state.pinsLeft + ' remaining.', 'fail', 1800);
  }

  function onFullTurn() {
    if (state.status !== 'picking') return;
    ensureLifts();
    var n = tumblerCount();
    if (state.tumblersSet < n) {
      state.tumblerLift[state.tumblersSet] = 1;
      state.tumblersSet += 1;
    }
    if (state.tumblersSet >= n) {
      unlock();
      return;
    }
    stopScrape();
    bindHeld = false;
    bindTime = 0;
    state.wiggle = 0;
    needRelease = true;
    awaitReturn = true;
    state.sweet = state.pattern[state.tumblersSet];
    sfxClick();
    playTone('triangle', 720, 0.1, 0.16, 980);
    flashStatus('A tumbler sets. ' + (n - state.tumblersSet) + ' remaining.', 'success', 1500);
    syncUi();
  }

  function unlock() {
    if (state.status !== 'picking') return;
    stopScrape();
    state.status = 'unlocked';
    state.cylinder = UNLOCK_TURN;
    state.wiggle = 0;
    bindHeld = false;
    bindTime = 0;
    awaitReturn = false;
    tumblersFalling = false;
    ensureLifts();
    var n = tumblerCount();
    state.tumblersSet = n;
    for (var i = 0; i < n; i++) state.tumblerLift[i] = 1;
    unlockFlash = 1;
    state.locksOpened += 1;
    saveStore();
    sfxClunk();
    syncUi();
    if (typeof window.showWin === 'function') {
      window.showWin('Every tumbler has set. The vault lock clicks open.');
    }
  }

  function maxAllowed() {
    var d = currentDiff();
    return maxTurn(state.pin, state.sweet, d.sweetWidth, d.falloff);
  }

  function stepTumblers(dt) {
    ensureLifts();
    var n = tumblerCount();
    var i;
    if (tumblersFalling) {
      var any = false;
      for (i = 0; i < n; i++) {
        if (state.tumblerLift[i] > 0) {
          state.tumblerLift[i] = Math.max(0, state.tumblerLift[i] - TUMBLER_FALL * dt);
          any = true;
        }
      }
      if (!any) tumblersFalling = false;
      return;
    }
    if (state.status === 'unlocked') {
      for (i = 0; i < n; i++) state.tumblerLift[i] = 1;
      return;
    }
    for (i = 0; i < n; i++) {
      if (i < state.tumblersSet) state.tumblerLift[i] = 1;
      else if (i === state.tumblersSet && !awaitReturn && state.status === 'picking') {
        state.tumblerLift[i] = clamp(state.cylinder / UNLOCK_TURN, 0, 1);
      } else {
        state.tumblerLift[i] = 0;
      }
    }
  }

  function step(dt) {
    if (dt > 0.08) dt = 0.08;
    unlockFlash = Math.max(0, unlockFlash - dt * 1.4);
    breakFlash = Math.max(0, breakFlash - dt * 1.8);

    if (state.status !== 'picking') {
      state.wiggle = 0;
      stopScrape();
      if (state.status === 'unlocked' && state.cylinder < UNLOCK_TURN) {
        state.cylinder = Math.min(UNLOCK_TURN, state.cylinder + TURN_SPEED * dt);
      }
      stepTumblers(dt);
      return;
    }

    var target = maxAllowed();
    var pulling = tensionOn();
    if (pulling) {
      if (state.cylinder < target - 0.002) {
        state.cylinder = Math.min(target, state.cylinder + TURN_SPEED * dt);
        if (bindHeld) { bindHeld = false; bindTime = 0; stopScrape(); }
        state.wiggle = 0;
        if (state.cylinder >= UNLOCK_TURN - 0.002 && target >= UNLOCK_TURN - 0.002) {
          state.cylinder = UNLOCK_TURN;
          onFullTurn();
          return;
        }
      } else {
        state.cylinder = Math.min(state.cylinder, target);
        if (target >= UNLOCK_TURN - 0.002) {
          state.cylinder = UNLOCK_TURN;
          onFullTurn();
          return;
        }
        if (!bindHeld) {
          bindHeld = true;
          sfxTick();
          startScrape();
        }
        bindTime += dt;
        state.wiggle = 1;
        var d = currentDiff();
        state.pinHealth -= d.pinDrain * dt;
        if (state.pinHealth <= 0) {
          state.pinHealth = 0;
          breakPin();
        }
      }
    } else {
      if (state.cylinder > 0) {
        state.cylinder = Math.max(0, state.cylinder - RETURN_SPEED * dt);
      }
      if (bindHeld) { bindHeld = false; bindTime = 0; stopScrape(); }
      state.wiggle = 0;
    }
    if (awaitReturn && state.cylinder <= 0.002) awaitReturn = false;
    stepTumblers(dt);
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
    drawSidebar();
  }

  /* ---------- input ---------- */

  function isActive() {
    if (!root) return false;
    return window.getComputedStyle(root).display !== 'none';
  }

  function pointToAngle(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var x = clientX - (rect.left + rect.width / 2);
    var y = clientY - (rect.top + rect.height / 2);
    var ang = Math.atan2(x, -y);
    return clamp(ang, PIN_MIN, PIN_MAX);
  }

  function aimTo(ang, fromUser) {
    if (state.status !== 'picking') return;
    var next = clamp(ang, PIN_MIN, PIN_MAX);
    if (fromUser && Math.abs(next - lastClickAng) > 4 * DEG) {
      lastClickAng = next;
      sfxClick();
    }
    state.pin = next;
  }

  function onPointerMove(e) {
    if (!isActive() || !canvas) return;
    if (e.pointerType === 'touch' && e.buttons === 0 && e.pressure === 0) return;
    // Mouse always aims; touch aims while in contact with the canvas.
    if (e.pointerType === 'mouse' || canvas.hasPointerCapture(e.pointerId) || e.buttons) {
      aimTo(pointToAngle(e.clientX, e.clientY), true);
    }
  }

  function onCanvasPointerDown(e) {
    if (!isActive()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    aimTo(pointToAngle(e.clientX, e.clientY), true);
    ensureAudio();
  }

  function onMouseMove(e) {
    if (!isActive() || !canvas) return;
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    aimTo(pointToAngle(e.clientX, e.clientY), true);
  }

  function onKeyDown(e) {
    if (!isActive()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!TENSION_CODES[e.code]) return;
    if (e.repeat) { tensionKeys[e.code] = true; e.preventDefault(); return; }
    tensionKeys[e.code] = true;
    e.preventDefault();
    ensureAudio();
  }

  function onKeyUp(e) {
    if (!TENSION_CODES[e.code]) return;
    tensionKeys[e.code] = false;
    if (e.code === 'Space' || e.code === 'ArrowRight') e.preventDefault();
  }

  function onTurnDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    tensionButton = true;
    e.currentTarget.classList.add('lp-held');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ensureAudio();
  }

  function onTurnUp(e) {
    tensionButton = false;
    var btn = root && root.querySelector('.lp-turn');
    if (btn) btn.classList.remove('lp-held');
    if (e) e.preventDefault();
  }

  function setDifficulty(key) {
    if (!diffByKey(key) || key === state.diffKey && state.status === 'picking') {
      if (diffByKey(key) && key === state.diffKey) return;
    }
    if (!diffByKey(key)) return;
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

  function getState() {
    return {
      difficulty: state.diffKey,
      pinDeg: state.pin / DEG,
      sweetDeg: state.sweet / DEG,
      cylinderDeg: state.cylinder / DEG,
      maxTurnDeg: maxAllowed() / DEG,
      pinHealth: state.pinHealth,
      pinsLeft: state.pinsLeft,
      pinsStart: currentDiff().pins,
      locksOpened: state.locksOpened,
      pinsBroken: state.pinsBroken,
      status: state.status,
      tension: tensionOn(),
      muted: state.muted,
      sweetWidthDeg: currentDiff().sweetWidth / DEG,
      falloffDeg: currentDiff().falloff / DEG,
      pinDrain: currentDiff().pinDrain,
      tumblersSet: state.tumblersSet,
      tumblerCount: currentDiff().tumblers,
      patternDeg: state.pattern.map(function (a) { return a / DEG; }),
      tumblerLift: state.tumblerLift.slice(),
      tumblersFalling: tumblersFalling
    };
  }

  function init() {
    root = document.getElementById('lock');
    if (!root) return;
    injectStyle();
    root.innerHTML = markup();
    canvas = root.querySelector('#lp-canvas');
    ctx = canvas.getContext('2d');
    sideCanvas = root.querySelector('#lp-side');
    sideCtx = sideCanvas.getContext('2d');
    resizeCanvas();
    newLock();
    syncUi();
    drawLock();
    drawSidebar();

    root.addEventListener('click', onClick);
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      tensionKeys = {};
      tensionButton = false;
      var btn = root.querySelector('.lp-turn');
      if (btn) btn.classList.remove('lp-held');
      stopScrape();
    });
    window.addEventListener('resize', function () { resizeCanvas(); drawLock(); drawSidebar(); });

    var turn = root.querySelector('.lp-turn');
    turn.addEventListener('pointerdown', onTurnDown);
    turn.addEventListener('pointerup', onTurnUp);
    turn.addEventListener('pointercancel', onTurnUp);
    turn.addEventListener('lostpointercapture', onTurnUp);
    turn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    turn.addEventListener('click', function (e) { e.preventDefault(); });

    // After a win, starting the next lock when the overlay is dismissed keeps play moving.
    var overlay = document.getElementById('win-overlay');
    if (overlay) {
      overlay.addEventListener('click', function () {
        if (state.status === 'unlocked') newLock();
      });
    }

    lastTs = 0;
    raf = requestAnimationFrame(loop);
  }

  window.Lockpick = {
    getState: getState,
    aimAt: function (deg) { aimTo(Number(deg) * DEG, false); return getState(); },
    setTension: function (on) {
      tensionButton = !!on;
      var btn = root && root.querySelector('.lp-turn');
      if (btn) btn.classList.toggle('lp-held', !!on);
      if (on) ensureAudio();
      return getState();
    },
    newLock: function (opts) {
      opts = opts || {};
      var o = {};
      if (opts.sweetDeg != null) o.sweet = Number(opts.sweetDeg) * DEG;
      if (opts.pinDeg != null) o.pin = Number(opts.pinDeg) * DEG;
      newLock(o);
      return getState();
    },
    setDifficulty: function (key) { setDifficulty(key); return getState(); },
    diffs: DIFFS.map(function (d) {
      return {
        key: d.key, label: d.label,
        sweetWidthDeg: d.sweetWidth / DEG, falloffDeg: d.falloff / DEG,
        pinDrain: d.pinDrain, pins: d.pins, tumblers: d.tumblers
      };
    })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
