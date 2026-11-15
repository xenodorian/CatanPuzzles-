/* Rune Cube: a 2x2x2 twisty puzzle with Elder Futhark runes instead of colours.
 * Fills #runecube, injects its own styles (prefixed rc-) and exposes window.RuneCube.
 * Needs puzzles/runecube-engine.js (window.RuneCubeEngine).
 */
(function () {
  'use strict';
  var E = window.RuneCubeEngine;
  var KEY = 'runecube.v1';
  // There are no difficulty levels: every scramble is 4 random turns.
  var SCRAMBLE_TURNS = 4;
  // Rune glyphs drawn as strokes (viewBox 0 0 40 60) so no runic font is needed.
  var GLYPH = [
    'M20 6V54M20 24L8 8M20 24L32 8',                 // Algiz (U)
    'M20 5L32 19L9 52M20 5L8 19L31 52',              // Othala (D)
    'M13 6V54M13 22L29 10M13 34L29 22',              // Fehu (L)
    'M11 54V6L29 20V54',                             // Uruz (R)
    'M14 6V54M14 18L28 30L14 42',                    // Thurisaz (F)
    'M20 6V54M20 6L8 20M20 6L32 20'                  // Tiwaz (B)
  ];
  function runeSvg(i, cls) {
    return '<svg class="' + (cls || 'rc-glyph') + '" viewBox="0 0 40 60" aria-hidden="true"><path d="' + GLYPH[i] + '"/></svg>';
  }
  var STYLE = [
    '.rc-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; min-width: 0; }',
    '.rc-stats { display: flex; gap: 1.5rem; justify-content: center; font-family: "Cinzel", serif; font-size: 0.8rem; letter-spacing: 0.12em; color: var(--parchment-dark); margin-bottom: 0.25rem; }',
    '.rc-stats b { color: var(--gold-bright); font-weight: 600; }',
    '.rc-views { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem 1rem; width: 100%; }',
    '.rc-pane { display: flex; flex-direction: column; align-items: center; min-width: 0; }',
    '.rc-pane-main { width: min(100%, 360px); }',
    '.rc-stage { --c: 96px; position: relative; width: 100%; aspect-ratio: 1 / 1; perspective: 900px; touch-action: none;',
    '  background: radial-gradient(circle at 50% 45%, rgba(201,148,58,0.10), transparent 65%); user-select: none; -webkit-user-select: none; overflow: hidden; }',
    '.rc-arrows { position: absolute; inset: 0; pointer-events: none; z-index: 5; }',
    '.rc-arrow { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; pointer-events: auto; cursor: pointer; touch-action: none;',
    '  background: rgba(26,22,16,0.88); border: 1.5px solid var(--gold); box-shadow: 0 0 8px rgba(0,0,0,0.7); transition: background 0.1s, transform 0.1s, border-color 0.1s; }',
    '.rc-arrow svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; fill: var(--gold-bright); }',
    '.rc-arrow.rc-arrow-on { background: rgba(126,207,192,0.35); border-color: var(--rune); transform: scale(1.18); }',
    '.rc-arrow.rc-arrow-on svg { fill: #e8fffb; }',
    '.rc-sticker { cursor: pointer; }',
    '.rc-sticker.rc-grab { box-shadow: inset 0 0 0 2px var(--rune), inset 0 0 14px rgba(126,207,192,0.5); }',
    '.rc-cubie.rc-layer .rc-sticker { box-shadow: inset 0 0 0 2px var(--rune), inset 0 0 12px rgba(0,0,0,0.6); }',
    '.rc-view { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform-style: preserve-3d; }',
    '.rc-cubie { position: absolute; left: calc(var(--c) / -2); top: calc(var(--c) / -2); width: var(--c); height: var(--c); transform-style: preserve-3d; pointer-events: none; }',
    '.rc-face { position: absolute; inset: 0; background: #0b0906; border: 1px solid #000; backface-visibility: hidden; pointer-events: auto; }',
    '.rc-sticker { position: absolute; inset: 5%; border-radius: 9%; cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  background: radial-gradient(circle at 35% 30%, #4a3c2a, #2d241a 70%); box-shadow: inset 0 0 0 1px rgba(201,148,58,0.55), inset 0 0 12px rgba(0,0,0,0.6); }',
    '.rc-glyph { width: 46%; height: 70%; fill: none; stroke: var(--gold-bright); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round;',
    '  filter: drop-shadow(0 0 3px rgba(240,191,90,0.45)); pointer-events: none; }',
    '.rc-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem 0.8rem; margin: 1rem auto 0; width: min(100%, 420px); font-size: 0.9rem; color: var(--parchment-dark); }',
    '.rc-legend span { display: flex; align-items: center; gap: 0.35rem; white-space: nowrap; }',
    '.rc-mini { width: 14px; height: 21px; fill: none; stroke: var(--gold-bright); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; flex: none; }',
    '.rc-rules { margin-top: 1rem; }',
    '.rc-rules ul { margin: 0.5rem 0 0 1.1rem; color: var(--parchment-dark); font-size: 0.95rem; line-height: 1.5; }',
    '.rc-rules kbd { font-family: monospace; font-size: 0.85rem; color: var(--rune); background: var(--stone); padding: 0 0.3rem; }',
    '.rc-winbar { width: min(100%, 460px); margin: 0.4rem 0 0.2rem; padding: 0.7rem 0.9rem; border: 1px solid var(--gold); background: rgba(201,148,58,0.12);',
    '  box-shadow: 0 0 18px rgba(201,148,58,0.25); text-align: center; box-sizing: border-box; }',
    '.rc-winbar[hidden] { display: none; }',
    '.rc-wintitle { font-family: "Cinzel", serif; color: var(--gold-bright); letter-spacing: 0.16em; font-size: 0.95rem; }',
    '.rc-winmsg { margin: 0.25rem 0 0.55rem; color: var(--parchment); font-size: 0.95rem; }',
    '.rc-winbar .btn-row { margin: 0; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }',
    '.rc-winbar .btn { font-size: 0.66rem; padding: 0.45rem 0.8rem; }',
    '.rc-stats .rc-countdown b { color: var(--gold-bright); font-variant-numeric: tabular-nums; font-size: 1.05em; }',
    '.rc-stats .rc-countdown.rc-low b { color: var(--danger, #e07070); }',
    '@media (max-width: 480px) { .rc-stats { gap: 0.9rem; font-size: 0.72rem; } .rc-legend { font-size: 0.82rem; } }'
  ].join('\n');

  var MARKUP = [
    '<div class="puzzle-frame">',
    '  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>',
    '  <div class="corner corner-bl"></div><div class="corner corner-br"></div>',
    '  <p class="flavor-text">"Eight stones of the old vault, each carved on three sides. Twist the layers until every face',
    '  bears a single rune, and the lock remembers its shape."</p>',
    '  <div class="rc-wrap">',
    '    <div class="rc-stats"><span>Moves <b data-rc="moves">0</b></span><span data-rc="timespan">Time <b data-rc="time">0:00</b></span></div>',
    '    <div class="rc-winbar" data-rc="winbar" role="status" hidden><div class="rc-wintitle">\u2726 Solved \u2726</div><div class="rc-winmsg" data-rc="winmsg"></div>',
    '      <div class="btn-row"><button type="button" class="btn" data-rc="win-undo">Undo</button><button type="button" class="btn" data-rc="win-keep">Keep turning</button><button type="button" class="btn btn-primary" data-rc="win-new">New scramble</button></div></div>',
    '    <div class="rc-views">',
    '      <div class="rc-pane rc-pane-main"><div class="rc-stage" data-rc="stage0"><div class="rc-view" data-rc="view0"></div><div class="rc-arrows" data-rc="arrows0"></div></div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="status-msg info" data-rc="status">Press a rune, then drag (or tap) an arrow to turn its layer. W A S D rotate the whole cube.</div>',
    '  <div class="btn-row">',
    '    <button type="button" class="btn" data-rc="undo">Undo</button>',
    '    <button type="button" class="btn btn-primary" data-rc="new">New Scramble</button>',
    '  </div>',
    '  <div class="rc-legend" data-rc="legend"></div>',
    '  <div class="dm-panel rc-rules">',
    '    <div class="dm-label">How to play</div>',
    '    <ul>',
    '      <li>A 2&times;2&times;2 cube. Each face of the solved cube carries one rune; there are no colours to go by.</li>',
    '      <li>Solve it by making every face show a single rune. A 2&times;2 has no fixed centres, so any face may end up on top.</li>',
    '      <li>The cube stays still: it never spins around, only its layers turn.</li>',
    '      <li>Press any rune on the cube: four arrows appear, two for its row and two for its column. Drag toward an arrow to turn that layer that way (the layer lights up as you go), or tap the rune and then tap an arrow. Tap elsewhere to hide the arrows.</li>',
    '      <li>Keys rotate the whole cube so you can see its hidden faces: <kbd>W</kbd> tips the front face up (the bottom comes into view), <kbd>S</kbd> tips it down (the top comes to the front), <kbd>A</kbd> turns it left (the right face comes to the front) and <kbd>D</kbd> turns it right (the left face comes to the front). Rotating the cube is free: it is not a move and Undo skips it.</li>',
    '      <li>Solving it does not lock the cube. From the message you can Undo the last turn (the clock and move count carry on), Keep turning to scramble it yourself, or start a New scramble.</li>',
    '    </ul>',
    '  </div>',
    '</div>'
  ].join('\n');

  var root, els = {}, cube, cubieEls = [], level = 'easy', scr = [], hist = [], startAt = 0, elapsed = 0, timerId = 0, solved = false,
    lost = false, onceDeadline = 0, onceTimerId = 0, queue = [], animating = false;
  // The cube is shown from one fixed standard 3/4 view; it never orbits.
  var VIEWS = [{ x: -28, y: -38, size: 96, els: [] }];
  var ONCE_MS = 5 * 60 * 1000;
  var once = function () { return !!(window.VaultOnce && window.VaultOnce.active && window.VaultOnce.active()); };
  function onceCode() {
    if (window.VaultOnce && typeof window.VaultOnce.code === 'function' && window.VaultOnce.code()) return window.VaultOnce.code();
    try { return String(new URL(location.href).searchParams.get('once') || '').trim().toLowerCase(); } catch (e) { return ''; }
  }
  function onceLimitMs() {
    try { if (typeof window.__RC_ONCE_LIMIT_MS === 'number' && window.__RC_ONCE_LIMIT_MS > 0) return window.__RC_ONCE_LIMIT_MS; } catch (e) { }
    return ONCE_MS;
  }
  function onceStartKey() {
    var c = onceCode();
    return c ? 'runecube.once.start:' + c : '';
  }
  function readOnceStart() {
    var k = onceStartKey();
    if (!k) return 0;
    try { var v = +localStorage.getItem(k); return v > 0 ? v : 0; } catch (e) { return 0; }
  }
  function writeOnceStart(t) {
    var k = onceStartKey();
    if (!k) return;
    try { localStorage.setItem(k, String(t)); } catch (e) { }
  }
  function onceAlreadyFinished() {
    if (window.VaultOnce && typeof window.VaultOnce.frozen === 'function' && window.VaultOnce.frozen()) return true;
    var rec = window.VaultOnce && typeof window.VaultOnce.record === 'function' && window.VaultOnce.record();
    return !!(rec && rec.result);
  }

  /* ---------- 3D transforms ---------- */
  // Model coordinates have y up; CSS has y down. Convert with S = diag(1,-1,1).
  function cssMatrix(O) {
    var s = [1, -1, 1], M = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) M[r * 3 + c] = s[r] * O[r * 3 + c] * s[c];
    return 'matrix3d(' + [M[0], M[3], M[6], 0, M[1], M[4], M[7], 0, M[2], M[5], M[8], 0, 0, 0, 0, 1].join(',') + ')';
  }
  function cubieTransform(q, rot, V) {
    var h = V.size / 2;
    return (rot || 'rotate3d(1,0,0,0deg)') + ' translate3d(' + q.pos[0] * h + 'px,' + (-q.pos[1] * h) + 'px,' + q.pos[2] * h + 'px) ' + cssMatrix(q.O);
  }
  var FACE_CSS = ['rotateX(90deg)', 'rotateX(-90deg)', 'rotateY(-90deg)', 'rotateY(90deg)', 'rotateY(0deg)', 'rotateY(180deg)'];
  function buildCube() { VIEWS.forEach(function (V, vi) { buildView(V, vi); }); hideArrows(); }
  function buildView(V, vi) {
    var host = els['view' + vi], cubeSize = V.size;
    host.innerHTML = '';
    V.els = [];
    cube.forEach(function (q) {
      var d = document.createElement('div');
      d.className = 'rc-cubie';
      var h = '';
      for (var f = 0; f < 6; f++) {
        var n = E.FACES[f].n, outward = q.p0[0] * n[0] + q.p0[1] * n[1] + q.p0[2] * n[2] > 0;
        h += '<div class="rc-face" style="transform:' + FACE_CSS[f] + ' translateZ(' + (cubeSize / 2) + 'px)">' +
          (outward ? '<div class="rc-sticker" data-view="' + vi + '" data-cubie="' + q.id + '" data-face="' + f + '">' + runeSvg(f) + '</div>' : '') + '</div>';
      }
      d.innerHTML = h;
      d.style.transform = cubieTransform(q, null, V);
      host.appendChild(d);
      V.els[q.id] = d;
    });
    host.style.transform = 'rotateX(' + V.x + 'deg) rotateY(' + V.y + 'deg)';
  }
  function layout() {
    var changed = false;
    VIEWS.forEach(function (V, vi) {
      var w = els['stage' + vi].clientWidth || 300;
      var c = Math.max(56, Math.min(110, Math.round(w * 0.27)));
      if (c !== V.size) { V.size = c; els['stage' + vi].style.setProperty('--c', c + 'px'); changed = true; }
    });
    if (changed && cube) buildCube();
  }
  // Screen direction (x right, y down) of a model-space vector under the current view.
  function screenVec(v, V) {
    var x = v[0], y = -v[1], z = v[2];
    var ay = V.y * Math.PI / 180, ax = V.x * Math.PI / 180;
    var x1 = Math.cos(ay) * x + Math.sin(ay) * z, z1 = -Math.sin(ay) * x + Math.cos(ay) * z;
    var y2 = Math.cos(ax) * y - Math.sin(ax) * z1;
    return [x1, y2];
  }

  /* ---------- whole-cube rotations (W A S D) ---------- */
  // The view never moves; W/A/S/D rotate the cube itself. G maps the original (scramble) frame to the
  // current world frame, so history stays in the original frame and Undo turns the right physical layer.
  var ROTS = {
    w: { M: [1, 0, 0, 0, 0, 1, 0, -1, 0], n: [1, 0, 0], a: -90 },  // front tips up, bottom comes to the front
    s: { M: [1, 0, 0, 0, 0, -1, 0, 1, 0], n: [1, 0, 0], a: 90 },   // front tips down, top comes to the front
    a: { M: [0, 0, -1, 0, 1, 0, 1, 0, 0], n: [0, 1, 0], a: -90 },  // front turns to the left, right face comes to the front
    d: { M: [0, 0, 1, 0, 1, 0, -1, 0, 0], n: [0, 1, 0], a: 90 }    // front turns to the right, left face comes to the front
  };
  var IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1], G = IDENT.slice();
  function mapMove(m, M) { // the same turn, re-expressed after a whole-cube rotation M
    var n = E._internal.mulMV(M, E.FACES[m >> 1].n);
    for (var f = 0; f < 6; f++) { var fn = E.FACES[f].n; if (fn[0] === n[0] && fn[1] === n[1] && fn[2] === n[2]) return f * 2 + (m & 1); }
    return m;
  }
  function rotateAll(c, M) {
    c.forEach(function (q) { q.pos = E._internal.mulMV(M, q.pos); q.O = E._internal.mulMM(M, q.O); });
    return c;
  }
  function rotateCube(k) {
    if (!ROTS[k] || locked()) return;
    queue.push({ rot: k });
    if (!animating) next();
  }

  // A solve locks the cube only for one-time challenge links; otherwise play simply carries on.
  function locked() { return lost || (solved && once()); }
  function showWinBar(msg) { if (!els.winbar) return; els.winmsg.textContent = msg; els.winbar.hidden = false; }
  function hideWinBar() { if (els.winbar) els.winbar.hidden = true; }

  /* ---------- turning ---------- */
  function turn(m, opts) {
    opts = opts || {};
    if (locked() && !opts.replay) return;
    queue.push({ m: m, record: opts.record !== false, undo: !!opts.undo });
    if (!animating) next();
  }
  function next() {
    var job = queue.shift();
    if (!job) { animating = false; return; }
    animating = true;
    var rot = job.rot ? ROTS[job.rot] : null, mi = rot ? null : E.moveInfo(job.m), n = rot ? rot.n : mi.n;
    var layer = rot ? cube.slice() : cube.filter(function (q) { return q.pos[0] * n[0] + q.pos[1] * n[1] + q.pos[2] * n[2] > 0; });
    // model rotation R(n, a) is CSS rotate3d(nx, -ny, nz, -a)
    var a = rot ? rot.a : mi.angleAboutNormal, axis = n[0] + ',' + (-n[1]) + ',' + n[2];
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dur = reduce || document.hidden ? 0 : 200;
    hideArrows();
    VIEWS.forEach(function (V) {
      layer.forEach(function (q) {
        var el = V.els[q.id];
        el.style.transition = 'none';
        el.style.transform = cubieTransform(q, 'rotate3d(' + axis + ',0deg)', V);
      });
    });
    if (dur) void els.view0.offsetWidth;
    VIEWS.forEach(function (V) {
      layer.forEach(function (q) {
        var el = V.els[q.id];
        el.style.transition = dur ? 'transform ' + dur + 'ms ease-in-out' : 'none';
        el.style.transform = cubieTransform(q, 'rotate3d(' + axis + ',' + (-a) + 'deg)', V);
      });
    });
    if (rot) { rotateAll(cube, rot.M); G = E._internal.mulMM(rot.M, G); } else E.applyMove(cube, job.m);
    var done = function () {
      VIEWS.forEach(function (V) { layer.forEach(function (q) { var el = V.els[q.id]; el.style.transition = 'none'; el.style.transform = cubieTransform(q, null, V); }); });
      afterMove(job);
      next();
    };
    if (dur) setTimeout(done, dur + 20); else done();
  }
  function afterMove(job) {
    if (job.rot) { save(); return; } // reorientation: not a move, not in Undo
    if (job.record) {
      if (job.undo) hist.pop(); else hist.push(mapMove(job.m, E._internal.transpose(G))); // history in the original frame
      var nowSolved = E.isSolved(cube);
      if (solved && !nowSolved) { solved = false; hideWinBar(); setStatus('Turning on. The timer runs again; solve it once more to finish.'); } // undid the solve, or turning on
      if (!once() && !startAt && !solved && !nowSolved && hist.length) startTimer();
      refresh();
      if (nowSolved && !solved && (scr.length || hist.length)) win();
      save();
    }
  }
  function startTimer() {
    startAt = Date.now() - elapsed;
    clearInterval(timerId);
    timerId = setInterval(showTime, 250);
  }
  function stopTimer() { if (startAt) elapsed = Date.now() - startAt; startAt = 0; clearInterval(timerId); showTime(); }
  function fmt(ms) { var s = Math.floor(Math.max(0, ms) / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function remainingMs() { return onceDeadline ? Math.max(0, onceDeadline - Date.now()) : 0; }
  function showTime() {
    if (!els.time) return;
    if (once() && onceDeadline) {
      var left = remainingMs();
      els.time.textContent = fmt(left);
      if (els.timespan) els.timespan.classList.toggle('rc-low', left <= 30000 && !solved && !lost);
      return;
    }
    els.time.textContent = fmt(startAt ? Date.now() - startAt : elapsed);
  }
  function stopOnceTimer() { clearInterval(onceTimerId); onceTimerId = 0; showTime(); }
  function tickOnce() {
    showTime();
    if (!lost && !solved && remainingMs() <= 0) timeoutFail();
  }
  function ensureOnceTimer() {
    if (!once() || onceAlreadyFinished()) return;
    var t0 = readOnceStart();
    if (!t0) { t0 = Date.now(); writeOnceStart(t0); }
    onceDeadline = t0 + onceLimitMs();
    if (els.timespan && !els.timespan.getAttribute('data-rc-labeled')) {
      els.timespan.innerHTML = 'Time left <b data-rc="time">5:00</b>';
      els.time = els.timespan.querySelector('[data-rc="time"]');
      els.timespan.classList.add('rc-countdown');
      els.timespan.setAttribute('data-rc-labeled', '1');
    }
    showTime();
    clearInterval(onceTimerId);
    onceTimerId = setInterval(tickOnce, 250);
    if (remainingMs() <= 0) timeoutFail();
  }
  function timeoutFail() {
    if (lost || solved) return;
    lost = true;
    stopOnceTimer();
    hideArrows();
    queue = [];
    setStatus("Time's up — game over", 'fail');
    refresh();
    if (window.VaultOnce && typeof window.VaultOnce.fail === 'function') {
      window.VaultOnce.fail({
        summary: "Time's up — game over",
        reason: 'timeout'
      });
    }
  }
  function win() {
    if (lost) return;
    solved = true; stopTimer(); stopOnceTimer();
    var msg = 'Every face bears a single rune. Solved in ' + hist.length + ' move' + (hist.length === 1 ? '' : 's') + ' and ' + fmt(elapsed) + '.';
    setStatus(msg, 'success');
    refresh(); save();
    if (once()) { queue = []; if (typeof window.showWin === 'function') window.showWin(msg); return; } // one-time link: the challenge is complete
    showWinBar(msg); // not blocking: Undo, Keep turning or New scramble
  }
  function setStatus(t, cls) { els.status.textContent = t; els.status.className = 'status-msg ' + (cls || 'info'); }
  function refresh() {
    els.moves.textContent = hist.length;
    showTime();
    els.undo.disabled = !hist.length || locked();
  }

  /* ---------- game ---------- */
  // Kept for one-time links and old callers; any level name gives the same 4-turn scramble.
  function setLevel() { level = 'easy'; newGame(); }
  function newGame(fixed) {
    queue = []; animating = false;
    scr = fixed || E.scramble(SCRAMBLE_TURNS); G = IDENT.slice();
    cube = E.applyMoves(E.solvedCube(), scr);
    if (E.isSolved(cube)) { scr = E.scramble(4); cube = E.applyMoves(E.solvedCube(), scr); }
    hist = []; solved = false; lost = false; elapsed = 0; startAt = 0; clearInterval(timerId); hideWinBar();
    buildCube(); refresh();
    if (once()) {
      if (onceAlreadyFinished()) {
        var rec = window.VaultOnce && typeof window.VaultOnce.record === 'function' && window.VaultOnce.record();
        if (rec && rec.result === 'fail') lost = true;
        if (rec && rec.result === 'success') solved = true;
        stopOnceTimer();
        if (lost) setStatus("Time's up — game over", 'fail');
      } else {
        ensureOnceTimer();
        if (!lost) setStatus('Scrambled with ' + SCRAMBLE_TURNS + ' random turns. You have 5 minutes. Press a rune and drag toward an arrow to turn its layer; W A S D rotate the whole cube.');
      }
    } else {
      onceDeadline = 0; stopOnceTimer();
      setStatus('Scrambled with ' + SCRAMBLE_TURNS + ' random turns. Press a rune and drag toward an arrow to turn its layer; W A S D rotate the whole cube.');
    }
    save();
  }
  function undo() {
    if (once() || !hist.length || animating || queue.length) return;
    turn(mapMove(E.inverse(hist[hist.length - 1]), G), { undo: true });
  }

  /* ---------- storage ---------- */
  function save() {
    if (once()) return;
    try { localStorage.setItem(KEY, JSON.stringify({ level: level, scr: scr, hist: hist, elapsed: startAt ? Date.now() - startAt : elapsed, solved: solved, winOpen: !!(els.winbar && !els.winbar.hidden), orient: G })); } catch (e) { }
  }
  function validOrient(M) { // a whole-cube rotation: 9 entries of -1/0/1, rows orthonormal, determinant +1
    if (!Array.isArray(M) || M.length !== 9 || !M.every(function (x) { return x === -1 || x === 0 || x === 1; })) return false;
    var MMt = E._internal.mulMM(M, E._internal.transpose(M));
    for (var i = 0; i < 9; i++) if (MMt[i] !== IDENT[i]) return false;
    var det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
    return det === 1;
  }
  function restore() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      if (!o || !Array.isArray(o.scr) || !Array.isArray(o.hist)) return false;
      var ok = function (m) { return m === (m | 0) && m >= 0 && m < 12; };
      if (!o.scr.every(ok) || !o.hist.every(ok)) return false;
      if (o.level && o.level !== 'easy') return false; // saves from the old Medium/Hard/Expert levels start a fresh cube
      level = 'easy'; scr = o.scr; hist = o.hist.slice();
      G = validOrient(o.orient) ? o.orient.slice() : IDENT.slice();
      cube = rotateAll(E.applyMoves(E.applyMoves(E.solvedCube(), scr), hist), G);
      solved = !!o.solved && E.isSolved(cube);
      elapsed = +o.elapsed || 0;
      buildCube(); refresh();
      hideWinBar();
      if (solved) {
        var wm = 'Every face bears a single rune. Solved in ' + hist.length + ' move' + (hist.length === 1 ? '' : 's') + ' and ' + fmt(elapsed) + '.';
        setStatus(wm, 'success');
        if (o.winOpen !== false) showWinBar(wm);
      }
      else if (hist.length) { startTimer(); setStatus('Welcome back. Your cube is as you left it.'); }
      return true;
    } catch (e) { return false; }
  }

  /* ---------- input: press a rune, then drag toward (or tap) an arrow ---------- */
  var drag = null, arrows = null;
  var DRAG_PICK = 10, DRAG_TURN = 28;
  // The four turns available from a sticker: for each in-plane axis, both senses. dir is the unit
  // screen direction (x right, y down) in which the grabbed sticker travels for that turn.
  function stickerOptions(vi, id, homeFace) {
    var V = VIEWS[vi], q = cube.filter(function (c) { return c.id === id; })[0];
    var I = E._internal, nWorld = I.mulMV(q.O, E.FACES[homeFace].n);
    var p = [q.pos[0] + nWorld[0], q.pos[1] + nWorld[1], q.pos[2] + nWorld[2]]; // a point on the sticker
    var out = [];
    for (var a = 0; a < 3; a++) {
      if (nWorld[a]) continue;
      var ax = [0, 0, 0]; ax[a] = 1;
      var t = [ax[1] * p[2] - ax[2] * p[1], ax[2] * p[0] - ax[0] * p[2], ax[0] * p[1] - ax[1] * p[0]]; // velocity for +90 about +axis
      for (var k = 0; k < 3; k++) if (nWorld[k]) t[k] = 0; // keep the in-face part, so arrows follow the face's grid lines
      var sv = screenVec(t, V), sl = Math.hypot(sv[0], sv[1]) || 1;
      var s = q.pos[a] > 0 ? 1 : -1, n = [0, 0, 0]; n[a] = s;
      var face = -1;
      for (var f = 0; f < 6; f++) { var fn = E.FACES[f].n; if (fn[0] === n[0] && fn[1] === n[1] && fn[2] === n[2]) face = f; }
      for (var sign = 1; sign >= -1; sign -= 2) {
        // +90 about +axis is anticlockwise (prime) seen from the +axis face, clockwise seen from the -axis face.
        // reach: screen pixels from the sticker centre to its edge along this direction
        out.push({ m: face * 2 + (sign * s > 0 ? 1 : 0), dir: [sign * sv[0] / sl, sign * sv[1] / sl], reach: sl / Math.hypot(t[0], t[1], t[2]) * V.size / 2 * 0.9 });
      }
    }
    return out;
  }
  function showArrows(vi, st) {
    hideArrows();
    if (locked()) return;
    var id = +st.getAttribute('data-cubie'), face = +st.getAttribute('data-face');
    var opts = stickerOptions(vi, id, face), box = els['arrows' + vi];
    var sb = els['stage' + vi].getBoundingClientRect(), r = st.getBoundingClientRect();
    var cx = r.left + r.width / 2 - sb.left, cy = r.top + r.height / 2 - sb.top;

    opts.forEach(function (o, k) {
      var b = makeArrow(o, cx, cy, sb);
      b.setAttribute('data-arrow', k);
      box.appendChild(b); o.el = b;
    });
    st.classList.add('rc-grab');
    els.stage0.classList.add('rc-picking');
    arrows = { view: vi, cubie: id, face: face, opts: opts };
  }
  function makeArrow(o, cx, cy, sb) {
    var b = document.createElement('div');
    b.className = 'rc-arrow'; b.setAttribute('data-move', o.m); b.setAttribute('role', 'button');
    b.setAttribute('aria-label', 'Turn this layer this way');
    b.setAttribute('data-dx', o.dir[0].toFixed(4)); b.setAttribute('data-dy', o.dir[1].toFixed(4));
    var x = Math.max(15, Math.min(sb.width - 15, cx + o.dir[0] * (o.reach + 22))), y = Math.max(15, Math.min(sb.height - 15, cy + o.dir[1] * (o.reach + 22)));
    b.style.left = x + 'px'; b.style.top = y + 'px';
    b.innerHTML = '<svg viewBox="-10 -10 20 20" aria-hidden="true"><path transform="rotate(' + (Math.atan2(o.dir[1], o.dir[0]) * 180 / Math.PI).toFixed(1) + ')" d="M7.5,0 L0.5,-6.5 L0.5,-2.4 L-7,-2.4 L-7,2.4 L0.5,2.4 L0.5,6.5 Z"/></svg>';
    return b;
  }
  function hideArrows() {
    if (!els.arrows0) return;
    els.arrows0.innerHTML = '';
    els.stage0.classList.remove('rc-picking');
    var g = root.querySelectorAll('.rc-grab'); for (var i = 0; i < g.length; i++) g[i].classList.remove('rc-grab');
    highlight(null);
    arrows = null;
  }
  function highlight(o) {
    if (arrows) arrows.opts.forEach(function (x) { x.el.classList.toggle('rc-arrow-on', x === o); });
    var mi = o ? E.moveInfo(o.m) : null;
    VIEWS.forEach(function (V) {
      cube.forEach(function (q) {
        var on = !!mi && q.pos[0] * mi.n[0] + q.pos[1] * mi.n[1] + q.pos[2] * mi.n[2] > 0;
        if (V.els[q.id]) V.els[q.id].classList.toggle('rc-layer', on);
      });
    });
  }
  function bestOption(dx, dy) {
    var len = Math.hypot(dx, dy), best = null, bd = -2;
    if (!arrows || !len) return null;
    arrows.opts.forEach(function (o) { var d = (o.dir[0] * dx + o.dir[1] * dy) / len; if (d > bd) { bd = d; best = o; } });
    return bd > 0.6 ? best : null;
  }
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest && e.target.closest('.rc-arrow')) return; // tapping an arrow is handled on click
    var st = e.target.closest ? e.target.closest('.rc-sticker') : null;
    if (!st) { hideArrows(); return; } // empty space does nothing
    e.preventDefault();
    if (locked()) return;
    var vi = +st.getAttribute('data-view');
    showArrows(vi, st);
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, stage: els['stage' + vi] };
    try { drag.stage.setPointerCapture(e.pointerId); } catch (err) { }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id || !arrows) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y, len = Math.hypot(dx, dy);
    var o = len >= DRAG_PICK ? bestOption(dx, dy) : null;
    highlight(o);
    if (o && len >= DRAG_TURN) { drag = null; turn(o.m); }
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    drag = null;
    if (moved < DRAG_PICK) highlight(null); // a tap: leave the arrows up so one can be tapped
    else hideArrows(); // released before the turn threshold: cancel
  }
  function onDocDown(e) {
    if (!arrows || drag) return;
    var t = e.target;
    if (t.closest && (t.closest('.rc-arrow') || t.closest('.rc-sticker'))) return;
    hideArrows(); // tapping anywhere else hides the arrows
  }
  // The only keys: W/A/S/D rotate the whole cube. No other shortcuts.
  function onKey(e) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (locked()) return;
    var k = (e.key || '').toLowerCase();
    if (k.length !== 1 || !ROTS[k]) return;
    rotateCube(k);
    e.preventDefault();
  }
  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-rc],[data-move]') : null;
    if (!el || !root.contains(el)) return;
    if (el.hasAttribute('data-move')) { turn(+el.getAttribute('data-move')); return; }
    var act = el.getAttribute('data-rc');
    if (act === 'undo') undo();
    else if (act === 'new' || act === 'win-new') { if (!once()) newGame(); }
    else if (act === 'win-undo') { hideWinBar(); undo(); }
    else if (act === 'win-keep') { hideWinBar(); save(); setStatus('Keep turning: scramble it by hand. Every turn counts as a move, Undo walks back through them, and solving it again counts as a new win.', 'success'); }
  }

  function init() {
    root = document.getElementById('runecube');
    if (!root || !E) return;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    root.innerHTML = MARKUP;
    ['stage0', 'view0', 'arrows0', 'winbar', 'winmsg', 'status', 'moves', 'time', 'timespan', 'undo', 'legend'].forEach(function (k) { els[k] = root.querySelector('[data-rc="' + k + '"]'); });
    els.legend.innerHTML = E.FACES.map(function (F, i) {
      return '<span>' + runeSvg(i, 'rc-mini') + E.RUNES[i].name + ' <small>(' + F.key + ')</small></span>';
    }).join('');
    [els.stage0].forEach(function (stg) {
      stg.addEventListener('pointerdown', onDown);
      stg.addEventListener('pointermove', onMove);
      stg.addEventListener('pointerup', onUp);
      stg.addEventListener('pointercancel', onUp);
    });
    document.addEventListener('pointerdown', onDocDown, true);
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);
    cube = E.solvedCube();
    layout(); buildCube();
    var onceLink = false;
    try { onceLink = new URL(location.href).searchParams.has('once'); } catch (e) { }
    if (onceLink || !restore()) newGame();
  }

  window.RuneCube = {
    setLevel: setLevel,
    newGame: function () { newGame(); },
    turn: function (m) { turn(typeof m === 'string' ? E.parseMove(m) : m); },
    state: function () { return { level: level, scramble: scr.slice(), history: hist.slice(), solved: solved, lost: lost, isSolved: E.isSolved(cube), busy: animating || queue.length > 0, moves: hist.length, onceRemaining: once() && onceDeadline ? remainingMs() : null }; },
    _options: function (vi, id, face) { return stickerOptions(vi, id, face).map(function (o) { return { m: o.m, name: E.MOVE_NAMES[o.m], dir: o.dir }; }); },
    rotate: function (k) { rotateCube(String(k).toLowerCase()); },
    _orient: function () { return G.slice(); },
    _load: function (list) { scr = []; queue = []; animating = false; G = IDENT.slice(); cube = E.applyMoves(E.solvedCube(), list || []); hist = []; solved = false; elapsed = 0; startAt = 0; clearInterval(timerId); hideWinBar(); buildCube(); refresh(); },
    _cube: function () { return cube; },
    _views: VIEWS
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
