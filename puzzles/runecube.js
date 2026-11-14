/* Rune Cube: a 2x2x2 twisty puzzle with Elder Futhark runes instead of colours.
 * Fills #runecube, injects its own styles (prefixed rc-) and exposes window.RuneCube.
 * Needs puzzles/runecube-engine.js (window.RuneCubeEngine).
 */
(function () {
  'use strict';
  var E = window.RuneCubeEngine;
  var KEY = 'runecube.v1';
  var LEVELS = [
    { key: 'easy', label: 'Easy', moves: 4, note: '4 random turns' },
    { key: 'medium', label: 'Medium', moves: 8, note: '8 random turns' },
    { key: 'hard', label: 'Hard', moves: 14, note: '14 random turns' },
    { key: 'expert', label: 'Expert', moves: 0, note: 'a uniformly random position' }
  ];
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
    '.rc-diff .btn { font-size: 0.66rem; padding: 0.5rem 0.9rem; }',
    '.rc-stats { display: flex; gap: 1.5rem; justify-content: center; font-family: "Cinzel", serif; font-size: 0.8rem; letter-spacing: 0.12em; color: var(--parchment-dark); margin-bottom: 0.25rem; }',
    '.rc-stats b { color: var(--gold-bright); font-weight: 600; }',
    '.rc-stage { --c: 96px; position: relative; width: min(100%, 360px); aspect-ratio: 1 / 1; perspective: 900px; touch-action: none; cursor: grab;',
    '  background: radial-gradient(circle at 50% 45%, rgba(201,148,58,0.10), transparent 65%); user-select: none; -webkit-user-select: none; overflow: hidden; }',
    '.rc-stage.rc-orbit { cursor: grabbing; }',
    '.rc-view { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform-style: preserve-3d; }',
    '.rc-cubie { position: absolute; left: calc(var(--c) / -2); top: calc(var(--c) / -2); width: var(--c); height: var(--c); transform-style: preserve-3d; }',
    '.rc-face { position: absolute; inset: 0; background: #0b0906; border: 1px solid #000; backface-visibility: hidden; }',
    '.rc-sticker { position: absolute; inset: 5%; border-radius: 9%; cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  background: radial-gradient(circle at 35% 30%, #4a3c2a, #2d241a 70%); box-shadow: inset 0 0 0 1px rgba(201,148,58,0.55), inset 0 0 12px rgba(0,0,0,0.6); }',
    '.rc-glyph { width: 46%; height: 70%; fill: none; stroke: var(--gold-bright); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round;',
    '  filter: drop-shadow(0 0 3px rgba(240,191,90,0.45)); pointer-events: none; }',
    '.rc-moves { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.35rem; width: min(100%, 420px); margin-top: 1rem; }',
    '.rc-moves .btn { padding: 0.45rem 0; font-size: 0.8rem; letter-spacing: 0.05em; text-transform: none; min-width: 0; }',
    '.rc-moves .btn.rc-hint-on { border-color: var(--rune); color: var(--rune); box-shadow: 0 0 12px rgba(126,207,192,0.45); }',
    '.rc-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem 0.8rem; margin: 1rem auto 0; width: min(100%, 420px); font-size: 0.9rem; color: var(--parchment-dark); }',
    '.rc-legend span { display: flex; align-items: center; gap: 0.35rem; white-space: nowrap; }',
    '.rc-mini { width: 14px; height: 21px; fill: none; stroke: var(--gold-bright); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; flex: none; }',
    '.rc-rules { margin-top: 1rem; }',
    '.rc-rules ul { margin: 0.5rem 0 0 1.1rem; color: var(--parchment-dark); font-size: 0.95rem; line-height: 1.5; }',
    '.rc-rules kbd { font-family: monospace; font-size: 0.85rem; color: var(--rune); background: var(--stone); padding: 0 0.3rem; }',
    '@media (max-width: 480px) { .rc-stats { gap: 0.9rem; font-size: 0.72rem; } .rc-legend { font-size: 0.82rem; } }'
  ].join('\n');

  var MARKUP = [
    '<div class="puzzle-frame">',
    '  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>',
    '  <div class="corner corner-bl"></div><div class="corner corner-br"></div>',
    '  <p class="flavor-text">"Eight stones of the old vault, each carved on three sides. Twist the layers until every face',
    '  bears a single rune, and the lock remembers its shape."</p>',
    '  <div class="btn-row diff-row rc-diff" data-rc-diff></div>',
    '  <div class="rc-wrap">',
    '    <div class="rc-stats"><span>Moves <b data-rc="moves">0</b></span><span>Time <b data-rc="time">0:00</b></span></div>',
    '    <div class="rc-stage" data-rc="stage"><div class="rc-view" data-rc="view"></div></div>',
    '    <div class="rc-moves" data-rc="movebtns"></div>',
    '  </div>',
    '  <div class="status-msg info" data-rc="status">Drag a rune to turn its layer. Drag empty space to look around.</div>',
    '  <div class="btn-row">',
    '    <button type="button" class="btn" data-rc="undo">Undo</button>',
    '    <button type="button" class="btn" data-rc="hint">Hint</button>',
    '    <button type="button" class="btn" data-rc="view-front">Reset view</button>',
    '    <button type="button" class="btn" data-rc="view-back">View back</button>',
    '    <button type="button" class="btn btn-primary" data-rc="new">New Scramble</button>',
    '  </div>',
    '  <div class="rc-legend" data-rc="legend"></div>',
    '  <div class="dm-panel rc-rules">',
    '    <div class="dm-label">How to play</div>',
    '    <ul>',
    '      <li>A 2&times;2&times;2 cube. Each face of the solved cube carries one rune; there are no colours to go by.</li>',
    '      <li>Solve it by making every face show a single rune. A 2&times;2 has no fixed centres, so any face may end up on top.</li>',
    '      <li>Turn a layer by dragging one of its runes in the direction you want it to go, or use the buttons. Drag empty space to look around.</li>',
    '      <li>Keys: <kbd>U</kbd> <kbd>D</kbd> <kbd>L</kbd> <kbd>R</kbd> <kbd>F</kbd> <kbd>B</kbd> turn a face clockwise (as seen from that face); hold <kbd>Shift</kbd> for the prime (anticlockwise) turn. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.</li>',
    '      <li>Hint shows the next turn of a shortest solution. A 2&times;2 never needs more than 14 quarter turns.</li>',
    '    </ul>',
    '  </div>',
    '</div>'
  ].join('\n');

  var root, els = {}, cube, cubieEls = [], level = 'easy', scr = [], hist = [], startAt = 0, elapsed = 0, timerId = 0, solved = false,
    view = { x: -28, y: -38 }, queue = [], animating = false, hintMove = -1, cubeSize = 96;
  var once = function () { return !!(window.VaultOnce && window.VaultOnce.active && window.VaultOnce.active()); };

  /* ---------- 3D transforms ---------- */
  // Model coordinates have y up; CSS has y down. Convert with S = diag(1,-1,1).
  function cssMatrix(O) {
    var s = [1, -1, 1], M = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) M[r * 3 + c] = s[r] * O[r * 3 + c] * s[c];
    return 'matrix3d(' + [M[0], M[3], M[6], 0, M[1], M[4], M[7], 0, M[2], M[5], M[8], 0, 0, 0, 0, 1].join(',') + ')';
  }
  function cubieTransform(q, rot) {
    var h = cubeSize / 2;
    return (rot || 'rotate3d(1,0,0,0deg)') + ' translate3d(' + q.pos[0] * h + 'px,' + (-q.pos[1] * h) + 'px,' + q.pos[2] * h + 'px) ' + cssMatrix(q.O);
  }
  var FACE_CSS = ['rotateX(90deg)', 'rotateX(-90deg)', 'rotateY(-90deg)', 'rotateY(90deg)', 'rotateY(0deg)', 'rotateY(180deg)'];
  function buildCube() {
    els.view.innerHTML = '';
    cubieEls = [];
    cube.forEach(function (q) {
      var d = document.createElement('div');
      d.className = 'rc-cubie';
      var h = '';
      for (var f = 0; f < 6; f++) {
        var n = E.FACES[f].n, outward = q.p0[0] * n[0] + q.p0[1] * n[1] + q.p0[2] * n[2] > 0;
        h += '<div class="rc-face" style="transform:' + FACE_CSS[f] + ' translateZ(' + (cubeSize / 2) + 'px)">' +
          (outward ? '<div class="rc-sticker" data-cubie="' + q.id + '" data-face="' + f + '">' + runeSvg(f) + '</div>' : '') + '</div>';
      }
      d.innerHTML = h;
      d.style.transform = cubieTransform(q);
      els.view.appendChild(d);
      cubieEls[q.id] = d;
    });
    applyView();
  }
  function applyView() { els.view.style.transform = 'rotateX(' + view.x + 'deg) rotateY(' + view.y + 'deg)'; }
  function layout() {
    var w = els.stage.clientWidth || 300;
    var c = Math.max(56, Math.min(110, Math.round(w * 0.27)));
    if (c !== cubeSize) { cubeSize = c; els.stage.style.setProperty('--c', c + 'px'); buildCube(); }
  }
  // Screen direction (x right, y down) of a model-space vector under the current view.
  function screenVec(v) {
    var x = v[0], y = -v[1], z = v[2];
    var ay = view.y * Math.PI / 180, ax = view.x * Math.PI / 180;
    var x1 = Math.cos(ay) * x + Math.sin(ay) * z, z1 = -Math.sin(ay) * x + Math.cos(ay) * z;
    var y2 = Math.cos(ax) * y - Math.sin(ax) * z1;
    return [x1, y2];
  }

  /* ---------- turning ---------- */
  function turn(m, opts) {
    opts = opts || {};
    if (solved && !opts.replay) return;
    queue.push({ m: m, record: opts.record !== false, undo: !!opts.undo });
    if (!animating) next();
  }
  function next() {
    var job = queue.shift();
    if (!job) { animating = false; return; }
    animating = true;
    var mi = E.moveInfo(job.m), n = mi.n;
    var layer = cube.filter(function (q) { return q.pos[0] * n[0] + q.pos[1] * n[1] + q.pos[2] * n[2] > 0; });
    // model rotation R(n, a) is CSS rotate3d(nx, -ny, nz, -a)
    var a = mi.angleAboutNormal, axis = n[0] + ',' + (-n[1]) + ',' + n[2];
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dur = reduce || document.hidden ? 0 : 200;
    layer.forEach(function (q) {
      var el = cubieEls[q.id];
      el.style.transition = 'none';
      el.style.transform = cubieTransform(q, 'rotate3d(' + axis + ',0deg)');
    });
    if (dur) void els.view.offsetWidth;
    layer.forEach(function (q) {
      var el = cubieEls[q.id];
      el.style.transition = dur ? 'transform ' + dur + 'ms ease-in-out' : 'none';
      el.style.transform = cubieTransform(q, 'rotate3d(' + axis + ',' + (-a) + 'deg)');
    });
    E.applyMove(cube, job.m);
    var done = function () {
      layer.forEach(function (q) { var el = cubieEls[q.id]; el.style.transition = 'none'; el.style.transform = cubieTransform(q); });
      afterMove(job);
      next();
    };
    if (dur) setTimeout(done, dur + 20); else done();
  }
  function afterMove(job) {
    if (job.record) {
      if (job.undo) hist.pop(); else hist.push(job.m);
      if (!startAt && !solved && hist.length) startTimer();
      hintMove = -1; markHint();
      refresh();
      if (E.isSolved(cube) && scr.length) win();
      save();
    }
  }
  function startTimer() {
    startAt = Date.now() - elapsed;
    clearInterval(timerId);
    timerId = setInterval(showTime, 250);
  }
  function stopTimer() { if (startAt) elapsed = Date.now() - startAt; startAt = 0; clearInterval(timerId); showTime(); }
  function fmt(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function showTime() { els.time.textContent = fmt(startAt ? Date.now() - startAt : elapsed); }
  function win() {
    solved = true; stopTimer(); queue = [];
    var msg = 'Every face bears a single rune. Solved in ' + hist.length + ' move' + (hist.length === 1 ? '' : 's') + ' and ' + fmt(elapsed) + '.';
    setStatus(msg, 'success');
    refresh(); save();
    if (typeof window.showWin === 'function') window.showWin(msg);
  }
  function setStatus(t, cls) { els.status.textContent = t; els.status.className = 'status-msg ' + (cls || 'info'); }
  function refresh() {
    els.moves.textContent = hist.length;
    showTime();
    els.undo.disabled = !hist.length || solved;
    var bs = els.diff.querySelectorAll('[data-level]');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', bs[i].getAttribute('data-level') === level);
  }

  /* ---------- game ---------- */
  function levelOf(k) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === k) return LEVELS[i]; return LEVELS[0]; }
  function makeScramble(L) {
    if (L.moves) return E.scramble(L.moves);
    // Expert: a uniformly random reachable position, scrambled by the inverse of its optimal solution.
    for (var t = 0; t < 20; t++) {
      var c = E.solvedCube();
      E.applyMoves(c, E.scramble(60));
      var sol = E.solve(c);
      if (sol.length >= 9) return sol.slice().reverse().map(E.inverse);
    }
    return E.scramble(20);
  }
  function setLevel(k) {
    level = levelOf(k).key;
    newGame();
  }
  function newGame(fixed) {
    queue = []; animating = false;
    scr = fixed || makeScramble(levelOf(level));
    cube = E.applyMoves(E.solvedCube(), scr);
    if (E.isSolved(cube)) { scr = E.scramble(4); cube = E.applyMoves(E.solvedCube(), scr); }
    hist = []; solved = false; elapsed = 0; startAt = 0; clearInterval(timerId); hintMove = -1;
    buildCube(); refresh(); markHint();
    setStatus(levelOf(level).label + ': scrambled with ' + levelOf(level).note + '. Drag a rune to turn its layer.');
    save();
  }
  function undo() {
    if (once() || solved || !hist.length || animating || queue.length) return;
    turn(E.inverse(hist[hist.length - 1]), { undo: true });
  }
  function hint() {
    if (once() || solved) return;
    setStatus('Reading the runes...');
    setTimeout(function () {
      var sol = E.solve(cube);
      if (!sol.length) { setStatus('Already solved.'); return; }
      hintMove = sol[0]; markHint();
      setStatus('Hint: turn ' + E.MOVE_NAMES[hintMove] + ' (' + sol.length + ' turn' + (sol.length === 1 ? '' : 's') + ' from solved).');
    }, 20);
  }
  function markHint() {
    var bs = els.movebtns.querySelectorAll('[data-move]');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('rc-hint-on', +bs[i].getAttribute('data-move') === hintMove);
  }

  /* ---------- storage ---------- */
  function save() {
    if (once()) return;
    try { localStorage.setItem(KEY, JSON.stringify({ level: level, scr: scr, hist: hist, elapsed: startAt ? Date.now() - startAt : elapsed, solved: solved, view: view })); } catch (e) { }
  }
  function restore() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      if (!o || !Array.isArray(o.scr) || !Array.isArray(o.hist)) return false;
      var ok = function (m) { return m === (m | 0) && m >= 0 && m < 12; };
      if (!o.scr.every(ok) || !o.hist.every(ok)) return false;
      level = levelOf(o.level).key; scr = o.scr; hist = o.hist.slice();
      cube = E.applyMoves(E.applyMoves(E.solvedCube(), scr), hist);
      solved = !!o.solved && E.isSolved(cube);
      elapsed = +o.elapsed || 0;
      if (o.view && isFinite(o.view.x) && isFinite(o.view.y)) view = { x: +o.view.x, y: +o.view.y };
      buildCube(); refresh();
      if (solved) setStatus('Solved in ' + hist.length + ' moves and ' + fmt(elapsed) + '. Press New Scramble to play again.', 'success');
      else if (hist.length) { startTimer(); setStatus('Welcome back. Your cube is as you left it.'); }
      return true;
    } catch (e) { return false; }
  }

  /* ---------- input ---------- */
  var drag = null;
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    var st = e.target.closest ? e.target.closest('.rc-sticker') : null;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, sticker: st, moved: false };
    try { els.stage.setPointerCapture(e.pointerId); } catch (err) { }
    if (!st) els.stage.classList.add('rc-orbit');
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.sticker) {
      view.y += dx * 0.5; view.x = Math.max(-85, Math.min(85, view.x - dy * 0.5));
      drag.x = e.clientX; drag.y = e.clientY; applyView(); return;
    }
    if (drag.moved || Math.hypot(dx, dy) < 12) return;
    drag.moved = true;
    var m = moveFromDrag(+drag.sticker.getAttribute('data-cubie'), +drag.sticker.getAttribute('data-face'), dx, dy);
    if (m >= 0) turn(m);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; els.stage.classList.remove('rc-orbit'); save();
  }
  // Pick the layer turn whose motion at the grabbed sticker best matches the drag.
  function moveFromDrag(id, homeFace, dx, dy) {
    var q = cube.filter(function (c) { return c.id === id; })[0];
    var I = E._internal, nWorld = I.mulMV(q.O, E.FACES[homeFace].n);
    var p = [q.pos[0] + nWorld[0], q.pos[1] + nWorld[1], q.pos[2] + nWorld[2]]; // a point on the sticker
    var best = null, len = Math.hypot(dx, dy);
    for (var a = 0; a < 3; a++) {
      if (nWorld[a]) continue;
      var ax = [0, 0, 0]; ax[a] = 1;
      var t = [ax[1] * p[2] - ax[2] * p[1], ax[2] * p[0] - ax[0] * p[2], ax[0] * p[1] - ax[1] * p[0]]; // a x p
      var sv = screenVec(t), sl = Math.hypot(sv[0], sv[1]);
      if (sl < 1e-6) continue;
      var d = (sv[0] * dx + sv[1] * dy) / (sl * len);
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { a: a, d: d };
    }
    if (!best || Math.abs(best.d) < 0.45) return -1;
    var s = q.pos[best.a] > 0 ? 1 : -1, sign = best.d > 0 ? 1 : -1; // rotate +90 about +axis when sign>0
    var n = [0, 0, 0]; n[best.a] = s;
    var face = -1; for (var f = 0; f < 6; f++) { var fn = E.FACES[f].n; if (fn[0] === n[0] && fn[1] === n[1] && fn[2] === n[2]) face = f; }
    // +90 about +axis is +90 about the face normal when s > 0 (prime), clockwise when s < 0.
    var prime = sign * s > 0 ? 1 : 0;
    return face * 2 + prime;
  }
  function onKey(e) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { if (!once()) { undo(); e.preventDefault(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = (e.key || '').toUpperCase(), f = 'UDLRFB'.indexOf(k);
    if (f < 0 || k.length !== 1) return;
    turn(f * 2 + (e.shiftKey ? 1 : 0));
    e.preventDefault();
  }
  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-rc],[data-level],[data-move]') : null;
    if (!el || !root.contains(el)) return;
    if (el.hasAttribute('data-level')) { if (!once()) setLevel(el.getAttribute('data-level')); return; }
    if (el.hasAttribute('data-move')) { turn(+el.getAttribute('data-move')); return; }
    var act = el.getAttribute('data-rc');
    if (act === 'undo') undo();
    else if (act === 'hint') hint();
    else if (act === 'new') { if (!once()) newGame(); }
    else if (act === 'view-front') { view = { x: -28, y: -38 }; applyView(); save(); }
    else if (act === 'view-back') { view = { x: 28, y: 142 }; applyView(); save(); }
  }

  function init() {
    root = document.getElementById('runecube');
    if (!root || !E) return;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    root.innerHTML = MARKUP;
    ['stage', 'view', 'movebtns', 'status', 'moves', 'time', 'undo', 'legend'].forEach(function (k) { els[k] = root.querySelector('[data-rc="' + k + '"]'); });
    els.diff = root.querySelector('[data-rc-diff]');
    els.diff.innerHTML = LEVELS.map(function (L) { return '<button type="button" class="btn" data-level="' + L.key + '">' + L.label + '</button>'; }).join('');
    var mb = '';
    for (var f = 0; f < 6; f++) mb += '<button type="button" class="btn" data-move="' + (f * 2) + '" title="' + E.FACES[f].key + ' clockwise">' + E.MOVE_NAMES[f * 2] + '</button>';
    for (f = 0; f < 6; f++) mb += '<button type="button" class="btn" data-move="' + (f * 2 + 1) + '" title="' + E.FACES[f].key + ' anticlockwise">' + E.MOVE_NAMES[f * 2 + 1] + '</button>';
    els.movebtns.innerHTML = mb;
    els.legend.innerHTML = E.FACES.map(function (F, i) {
      return '<span>' + runeSvg(i, 'rc-mini') + E.RUNES[i].name + ' <small>(' + F.key + ')</small></span>';
    }).join('');
    els.stage.addEventListener('pointerdown', onDown);
    els.stage.addEventListener('pointermove', onMove);
    els.stage.addEventListener('pointerup', onUp);
    els.stage.addEventListener('pointercancel', onUp);
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
    state: function () { return { level: level, scramble: scr.slice(), history: hist.slice(), solved: solved, isSolved: E.isSolved(cube), busy: animating || queue.length > 0, moves: hist.length }; },
    _moveFromDrag: function (id, face, dx, dy) { return moveFromDrag(id, face, dx, dy); },
    _view: function (v) { if (v) { view = v; applyView(); } return view; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
