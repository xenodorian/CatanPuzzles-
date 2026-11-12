/* Knight's Tour puzzle for the Puzzle Vault.
 * Fills #knight, injects its own styles (all selectors prefixed kt-) and
 * exposes only window.KnightTour, containing pure helpers for testing.
 */
(function () {
  'use strict';

  var LEVELS = [
    { key: 'easy', label: 'Easy 5x5', n: 5 },
    { key: 'medium', label: 'Medium 6x6', n: 6 },
    { key: 'hard', label: 'Hard 7x7', n: 7 },
    { key: 'veryhard', label: 'Very Hard 8x8', n: 8 }
  ];

  var DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var GEN_NODE_CAP = 4000;    // node budget per generation attempt
  var GEN_TIME_MS = 4;        // time budget per generation attempt
  var STYLE = [
    '.kt-stage { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; width: 100%; min-width: 0; }',
    '.kt-diff .btn { font-size: 0.66rem; padding: 0.5rem 0.9rem; }',
    '.kt-board {',
    '  display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px;',
    '  width: min(100%, calc(var(--n) * 64px)); margin: 0 auto; padding: 4px; box-sizing: border-box;',
    '  background: var(--stone); border: 1px solid var(--gold-dim);',
    '  box-shadow: 0 0 30px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.5);',
    '  container-type: inline-size;',
    '}',
    '.kt-cell {',
    '  appearance: none; margin: 0; padding: 0; width: 100%; min-width: 0;',
    '  aspect-ratio: 1 / 1; position: relative; overflow: hidden;',
    '  display: flex; align-items: center; justify-content: center;',
    '  border: 1px solid var(--stone-light); color: var(--parchment);',
    '  font-family: "Cinzel", serif; font-weight: 600; line-height: 1;',
    '  font-size: clamp(0.6rem, calc(100cqw / var(--n) * 0.32), 1.25rem);',
    '  cursor: pointer; transition: background-color 0.15s, box-shadow 0.15s, filter 0.15s;',
    '  -webkit-tap-highlight-color: transparent;',
    '}',
    '.kt-light { background-color: #3a2f22; }',
    '.kt-dark { background-color: #201a12; }',
    '.kt-cell:hover { filter: brightness(1.25); }',
    '.kt-cell:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: -3px; }',
    '.kt-visited { background-image: linear-gradient(rgba(201,148,58,0.16), rgba(201,148,58,0.16)); color: var(--parchment-dark); }',
    '.kt-current { background-image: linear-gradient(rgba(201,148,58,0.26), rgba(201,148,58,0.26)); box-shadow: inset 0 0 0 2px var(--gold); }',
    '.kt-legal { box-shadow: inset 0 0 0 2px var(--rune); }',
    '.kt-knight {',
    '  font-family: "Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols", sans-serif;',
    '  font-size: clamp(1rem, calc(100cqw / var(--n) * 0.6), 2.4rem);',
    '  color: var(--gold-bright); line-height: 1;',
    '  text-shadow: 0 0 12px rgba(240,191,90,0.55), 0 2px 3px rgba(0,0,0,0.8);',
    '}',
    '.kt-num { font-weight: 600; }',
    '.kt-current .kt-num { position: absolute; top: 2px; right: 3px; font-size: 0.55em; color: var(--gold); }'
  ].join('\n');

  var MARKUP = [
    '<div class="puzzle-frame">',
    '  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>',
    '  <div class="corner corner-bl"></div><div class="corner corner-br"></div>',
    '  <p class="flavor-text">"The ghost knight must tread every flagstone exactly once. Leap in the knight\'s',
    '  L-shaped stride from stone to stone, and leave no flagstone untrodden."</p>',
    '  <div class="btn-row diff-row kt-diff" id="kt-diff" role="group" aria-label="Difficulty"></div>',
    '  <div class="kt-stage">',
    '    <div class="kt-board" id="kt-board"></div>',
    '    <div class="move-counter" id="kt-count" aria-live="polite"></div>',
    '  </div>',
    '  <div class="status-msg" id="kt-status" role="status" aria-live="polite"></div>',
    '  <div class="btn-row">',
    '    <button type="button" class="btn" data-kt="undo">Undo</button>',
    '    <button type="button" class="btn" data-kt="restart">Restart</button>',
    '    <button type="button" class="btn btn-primary" data-kt="new">New Puzzle</button>',
    '  </div>',
    '</div>',
    '<div class="dm-panel">',
    '  <div class="dm-label">DM Configuration</div>',
    '  <p>Click a ringed flagstone to step the ghost knight onto it. Each puzzle is built by first computing',
    '  a complete tour, and that tour\'s first square becomes the start, so a full tour always exists from',
    '  the start.</p>',
    '</div>'
  ].join('\n');

  function rowOf(i, n) { return Math.floor(i / n); }
  function colOf(i, n) { return i % n; }

  function neighbors(n, i) {
    var r = rowOf(i, n), c = colOf(i, n), out = [];
    for (var k = 0; k < DELTAS.length; k++) {
      var nr = r + DELTAS[k][0], nc = c + DELTAS[k][1];
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
    return out;
  }

  function isKnightStep(n, a, b) {
    var dr = Math.abs(rowOf(a, n) - rowOf(b, n)), dc = Math.abs(colOf(a, n) - colOf(b, n));
    return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  // Warnsdorff-ordered backtracking. vis must already mark pos as visited.
  // Returns { path: [indices] or null, aborted: bool }.
  function search(n, vis, pos, remaining, opts) {
    var path = [], nodes = 0, aborted = false;
    var rng = opts.rng, cap = opts.maxNodes, deadline = opts.deadline;

    function freeDegree(c) {
      var nb = neighbors(n, c), d = 0;
      for (var k = 0; k < nb.length; k++) if (!vis[nb[k]]) d++;
      return d;
    }

    function rec(cur, left) {
      if (left === 0) return true;
      nodes++;
      if (nodes > cap || ((nodes & 255) === 0 && Date.now() > deadline)) {
        aborted = true;
        return false;
      }
      var nb = neighbors(n, cur), cands = [], k;
      for (k = 0; k < nb.length; k++) if (!vis[nb[k]]) cands.push({ id: nb[k], d: 0 });
      if (rng) shuffle(cands, rng);
      for (k = 0; k < cands.length; k++) cands[k].d = freeDegree(cands[k].id);
      cands.sort(function (a, b) { return a.d - b.d; });
      for (k = 0; k < cands.length; k++) {
        var id = cands[k].id;
        vis[id] = 1;
        path.push(id);
        if (rec(id, left - 1)) return true;
        path.pop();
        vis[id] = 0;
        if (aborted) return false;
      }
      return false;
    }

    var ok = rec(pos, remaining);
    return { path: ok ? path : null, aborted: aborted };
  }

  function isValidTour(n, tour) {
    if (!Number.isInteger(n) || n < 1 || !Array.isArray(tour) || tour.length !== n * n) return false;
    var seen = new Uint8Array(n * n), prev = null;
    for (var i = 0; i < tour.length; i++) {
      var p = tour[i];
      if (!Array.isArray(p) || p.length !== 2) return false;
      var r = p[0], c = p[1];
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= n || c >= n) return false;
      var id = r * n + c;
      if (seen[id]) return false;
      seen[id] = 1;
      if (prev) {
        var dr = Math.abs(r - prev[0]), dc = Math.abs(c - prev[1]);
        if (!((dr === 1 && dc === 2) || (dr === 2 && dc === 1))) return false;
      }
      prev = [r, c];
    }
    return true;
  }

  // Returns { n, start: [r,c], tour: [[r,c], ...] } with tour[0] === start.
  // Retries from random starts until a complete tour is found, so it always terminates.
  function generate(n) {
    if (!Number.isInteger(n) || n < 5 || n > 8) throw new RangeError('n must be an integer from 5 to 8');
    var total = n * n;
    for (;;) {
      var start = Math.floor(Math.random() * total);
      var vis = new Uint8Array(total);
      vis[start] = 1;
      var res = search(n, vis, start, total - 1, {
        rng: Math.random,
        maxNodes: GEN_NODE_CAP,
        deadline: Date.now() + GEN_TIME_MS
      });
      if (res.path) {
        var idx = [start].concat(res.path);
        var tour = idx.map(function (i) { return [rowOf(i, n), colOf(i, n)]; });
        if (isValidTour(n, tour)) {
          return { n: n, start: [rowOf(start, n), colOf(start, n)], tour: tour };
        }
      }
    }
  }

  window.KnightTour = { generate: generate, isValidTour: isValidTour };
  /* setLevel / getState / moveTo are attached after the UI functions exist. */

  // ---------- Game state and UI ----------
  var game = { n: 5, level: 'easy', start: 0, tourIdx: [], path: [] };

  function $(id) { return document.getElementById(id); }

  function visitedArr() {
    var vis = new Uint8Array(game.n * game.n);
    for (var k = 0; k < game.path.length; k++) vis[game.path[k]] = 1;
    return vis;
  }

  function setStatus(text, cls) {
    var el = $('kt-status');
    if (!el) return;
    el.className = 'status-msg' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  function levelFor(key) {
    for (var k = 0; k < LEVELS.length; k++) if (LEVELS[k].key === key) return LEVELS[k];
    return null;
  }

  function render() {
    var n = game.n, total = n * n, path = game.path, pos = path[path.length - 1];
    var vn = new Array(total).fill(0), k;
    for (k = 0; k < path.length; k++) vn[path[k]] = k + 1;
    var legal = {};
    neighbors(n, pos).forEach(function (id) { if (!vn[id]) legal[id] = true; });

    var parts = [];
    for (var i = 0; i < total; i++) {
      var r = rowOf(i, n), c = colOf(i, n);
      var cls = 'kt-cell ' + ((r + c) % 2 === 0 ? 'kt-light' : 'kt-dark');
      var label = 'Row ' + (r + 1) + ', column ' + (c + 1);
      if (vn[i]) { cls += ' kt-visited'; label += ', visited as square ' + vn[i]; }
      if (i === pos) cls += ' kt-current';
      if (legal[i]) { cls += ' kt-legal'; label += ', reachable'; }
      var inner = '';
      if (i === pos) inner = '<span class="kt-knight" aria-hidden="true">♞</span>';
      if (vn[i]) inner += '<span class="kt-num">' + vn[i] + '</span>';
      parts.push('<button type="button" class="' + cls + '" data-kt="cell" data-i="' + i +
        '" aria-label="' + label + '">' + inner + '</button>');
    }
    var board = $('kt-board');
    if (board) {
      board.style.setProperty('--n', String(n));
      board.innerHTML = parts.join('');
    }

    var count = $('kt-count');
    if (count) count.textContent = 'Squares: ' + path.length + ' / ' + total;

    var diff = $('kt-diff');
    if (diff) {
      diff.innerHTML = LEVELS.map(function (L) {
        var on = L.key === game.level;
        return '<button type="button" class="btn' + (on ? ' active' : '') + '" data-kt="level" data-level="' +
          L.key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + L.label + '</button>';
      }).join('');
    }
  }

  function newPuzzle() {
    if (onceLocked()) return;
    var g = generate(game.n);
    game.tourIdx = g.tour.map(function (rc) { return rc[0] * game.n + rc[1]; });
    game.start = g.start[0] * game.n + g.start[1];
    game.path = [game.start];
    setStatus('', '');
    render();
  }

  function setLevel(key) {
    var L = levelFor(key);
    if (!L) return;
    game.level = key;
    game.n = L.n;
    newPuzzle();
  }

  function moveTo(id) {
    var n = game.n, total = n * n, path = game.path, pos = path[path.length - 1];
    if (id === pos) return;
    var vis = visitedArr();
    if (vis[id]) { setStatus('That flagstone is already trodden.', 'fail'); return; }
    if (!isKnightStep(n, pos, id)) {
      setStatus('The knight only leaps in an L-shape. Step onto a ringed flagstone.', 'fail');
      return;
    }
    path.push(id);
    if (path.length === total) {
      setStatus('Every flagstone has been trodden exactly once.', 'success');
      render();
      if (typeof window.showWin === 'function') {
        window.showWin('The ghost knight has trodden every flagstone exactly once. The vault door grinds open.');
      }
      return;
    }
    vis[id] = 1;
    var free = neighbors(n, id).some(function (x) { return !vis[x]; });
    if (!free) {
      setStatus(window.VaultOnce && window.VaultOnce.active()
        ? 'The ghost knight is stuck.'
        : 'The ghost knight is stuck. Use Undo or Restart.', 'fail');
      if (window.VaultOnce && window.VaultOnce.active()) {
        window.VaultOnce.fail({
          summary: 'The knight had no legal moves left.',
          reason: 'stuck'
        });
      }
    } else setStatus('', '');
    render();
  }

  function onceLocked() {
    return window.VaultOnce && window.VaultOnce.active() &&
      (window.VaultOnce.started() || window.VaultOnce.frozen());
  }

  function undo() {
    if (window.VaultOnce && window.VaultOnce.active()) return;
    if (game.path.length > 1) {
      game.path.pop();
        setStatus('', '');
    } else {
      setStatus('Nothing to undo. The knight stands on its start.', 'info');
    }
    render();
  }

  function restart() {
    if (onceLocked()) return;
    game.path = [game.start];
    setStatus('', '');
    render();
  }

  function onClick(e) {
    var t = e.target;
    var el = t && t.closest ? t.closest('[data-kt]') : null;
    if (!el) return;
    var act = el.getAttribute('data-kt');
    if (act === 'cell') moveTo(parseInt(el.getAttribute('data-i'), 10));
    else if (act === 'level') setLevel(el.getAttribute('data-level'));
    else if (act === 'undo') undo();
    else if (act === 'restart') restart();
    else if (act === 'new') newPuzzle();
  }

  function init() {
    var root = $('knight');
    if (!root) return;
    var st = document.createElement('style');
    st.textContent = STYLE;
    document.head.appendChild(st);
    root.innerHTML = MARKUP;
    root.addEventListener('click', onClick);
    newPuzzle();
  }

  window.KnightTour.setLevel = setLevel;
  window.KnightTour.newPuzzle = newPuzzle;
  window.KnightTour.moveTo = moveTo;
  window.KnightTour.getState = function () {
    return {
      level: game.level,
      n: game.n,
      path: game.path.slice(),
      tourIdx: game.tourIdx ? game.tourIdx.slice() : [],
      start: game.start
    };
  };

  init();
})();
