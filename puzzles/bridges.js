/* Rune Bridges: island bridge puzzle.
   Self-contained IIFE. Exposes only window.RuneBridges (pure helpers for testing). */
(function () {
  'use strict';

  var SIZE_FOR = { 8: 7, 10: 8, 12: 9, 15: 10 };
  // Most bridges allowed between one pair of stones on each level (classic Hashi uses 2).
  var MAX_FOR = { 8: 3, 10: 3, 12: 4, 15: 4 };
  // Chance of each bridge count (1..max) when the generator lays a bridge.
  var COUNT_WEIGHTS = { 2: [0.6, 0.4], 3: [0.42, 0.33, 0.25], 4: [0.32, 0.28, 0.22, 0.18] };
  var MAX_ATTEMPTS = 200;
  var EASY_ISLANDS = 8;       // the Easy tier
  var EASY_MIN_SOLUTIONS = 2; // Easy puzzles need at least this many solutions
  var DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  // Board geometry for the SVG (viewBox units).
  var SPACING = 72;   // distance between neighbouring lattice points
  var PAD = 40;       // margin around the grid
  var RADIUS = 32;    // island radius
  var LANES = { 1: [0], 2: [-6, 6], 3: [-9, 0, 9], 4: [-12, -4, 4, 12] }; // line offsets per bridge count

  function rnd(n) { return Math.floor(Math.random() * n); }

  // Axis-aligned segment: h = horizontal, f = fixed coordinate (row for a
  // horizontal segment, column for a vertical one), lo..hi = span.
  function geom(r1, c1, r2, c2) {
    if (r1 === r2) return { h: true, f: r1, lo: Math.min(c1, c2), hi: Math.max(c1, c2) };
    return { h: false, f: c1, lo: Math.min(r1, r2), hi: Math.max(r1, r2) };
  }

  // True when two segments cross at a point strictly inside both.
  function crosses(g1, g2) {
    if (g1.h === g2.h) return false;
    var hz = g1.h ? g1 : g2;
    var vt = g1.h ? g2 : g1;
    return vt.f > hz.lo && vt.f < hz.hi && hz.f > vt.lo && hz.f < vt.hi;
  }

  // Island pairs that may be joined: same row or column with no island between.
  function visibleEdges(islands) {
    var out = [];
    for (var a = 0; a < islands.length; a++) {
      for (var b = a + 1; b < islands.length; b++) {
        var p = islands[a], q = islands[b];
        if (p.r !== q.r && p.c !== q.c) continue;
        var blocked = false;
        for (var t = 0; t < islands.length; t++) {
          if (t === a || t === b) continue;
          var s = islands[t];
          if (p.r === q.r) {
            if (s.r === p.r && s.c > Math.min(p.c, q.c) && s.c < Math.max(p.c, q.c)) { blocked = true; break; }
          } else if (s.c === p.c && s.r > Math.min(p.r, q.r) && s.r < Math.max(p.r, q.r)) {
            blocked = true; break;
          }
        }
        if (!blocked) out.push({ a: a, b: b, g: geom(p.r, p.c, q.r, q.c) });
      }
    }
    return out;
  }

  // Union-find connectivity over n nodes with the given pairs.
  function connected(n, pairs) {
    var parent = [];
    for (var i = 0; i < n; i++) parent.push(i);
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    for (var j = 0; j < pairs.length; j++) parent[find(pairs[j][0])] = find(pairs[j][1]);
    for (var k = 1; k < n; k++) if (find(k) !== find(0)) return false;
    return true;
  }

  // Exact solution counter (stops once `limit` solutions are found).
  function countSolutions(puzzle, limit) {
    if (limit === undefined) limit = Infinity;
    var isl = puzzle.islands, n = isl.length, MAX = puzzle.max || 2;
    var edges = visibleEdges(isl), E = edges.length;
    var need = [], cap = [], i;
    for (i = 0; i < n; i++) { need.push(isl[i].n); cap.push(0); }
    for (i = 0; i < E; i++) { cap[edges[i].a] += MAX; cap[edges[i].b] += MAX; }
    for (i = 0; i < n; i++) if (need[i] < 0 || need[i] > cap[i]) return 0;

    var counts = [], active = [], found = 0;
    for (i = 0; i < E; i++) counts.push(0);

    function dfs(idx) {
      if (found >= limit) return;
      if (idx === E) {
        var pairs = [];
        for (var q = 0; q < E; q++) if (counts[q] > 0) pairs.push([edges[q].a, edges[q].b]);
        if (connected(n, pairs)) found++;
        return;
      }
      var e = edges[idx];
      for (var cnt = 0; cnt <= MAX; cnt++) {
        if (cnt > need[e.a] || cnt > need[e.b]) break;
        if (cnt > 0) {
          var clash = false;
          for (var k = 0; k < active.length; k++) {
            if (crosses(e.g, edges[active[k]].g)) { clash = true; break; }
          }
          if (clash) continue;
        }
        need[e.a] -= cnt; need[e.b] -= cnt;
        cap[e.a] -= MAX; cap[e.b] -= MAX;
        if (need[e.a] <= cap[e.a] && need[e.b] <= cap[e.b]) {
          counts[idx] = cnt;
          if (cnt > 0) active.push(idx);
          dfs(idx + 1);
          if (cnt > 0) active.pop();
          counts[idx] = 0;
        }
        need[e.a] += cnt; need[e.b] += cnt;
        cap[e.a] += MAX; cap[e.b] += MAX;
        if (found >= limit) return;
      }
    }
    dfs(0);
    return found;
  }

  // Full rule check of a bridge configuration against a puzzle.
  function isSolved(puzzle, bridges) {
    var isl = puzzle.islands, n = isl.length, MAX = puzzle.max || 2;
    var edges = visibleEdges(isl);
    var index = {}, e, i, j;
    for (e = 0; e < edges.length; e++) index[edges[e].a + ',' + edges[e].b] = e;
    var cnt = [], deg = [];
    for (e = 0; e < edges.length; e++) cnt.push(0);
    for (i = 0; i < n; i++) deg.push(0);

    var list = bridges || [];
    for (var k = 0; k < list.length; k++) {
      var br = list[k];
      if (!br) continue;
      var c = br.count;
      if (c === 0) continue;
      if (c !== Math.floor(c) || c < 1 || c > MAX) return false;
      if (br.a === br.b) return false;
      var idx = index[Math.min(br.a, br.b) + ',' + Math.max(br.a, br.b)];
      if (idx === undefined) return false;
      cnt[idx] += c;
      if (cnt[idx] > MAX) return false;
    }

    var pairs = [];
    for (e = 0; e < edges.length; e++) {
      if (cnt[e] === 0) continue;
      deg[edges[e].a] += cnt[e];
      deg[edges[e].b] += cnt[e];
      pairs.push([edges[e].a, edges[e].b]);
    }
    for (i = 0; i < n; i++) if (deg[i] !== isl[i].n) return false;
    for (i = 0; i < edges.length; i++) {
      if (cnt[i] === 0) continue;
      for (j = i + 1; j < edges.length; j++) {
        if (cnt[j] > 0 && crosses(edges[i].g, edges[j].g)) return false;
      }
    }
    return connected(n, pairs);
  }

  // One random construction from a solution. Returns null if it gets stuck.
  function buildOnce(k, size, max) {
    max = max || 2;
    var isl = [{ r: rnd(size), c: rnd(size) }];
    var bridges = []; // {a, b, count, g}

    function islandAt(r, c) {
      for (var i = 0; i < isl.length; i++) if (isl[i].r === r && isl[i].c === c) return i;
      return -1;
    }
    function onBridge(r, c) {
      for (var i = 0; i < bridges.length; i++) {
        var g = bridges[i].g;
        if (g.h ? (r === g.f && c > g.lo && c < g.hi) : (c === g.f && r > g.lo && r < g.hi)) return true;
      }
      return false;
    }
    function crossesAny(g) {
      for (var i = 0; i < bridges.length; i++) if (crosses(g, bridges[i].g)) return true;
      return false;
    }
    function findBridge(a, b) {
      for (var i = 0; i < bridges.length; i++) {
        var x = bridges[i];
        if ((x.a === a && x.b === b) || (x.a === b && x.b === a)) return x;
      }
      return null;
    }
    function adjacentToIsland(r, c) {
      for (var i = 0; i < isl.length; i++) {
        if (Math.abs(isl[i].r - r) + Math.abs(isl[i].c - c) === 1) return true;
      }
      return false;
    }
    function pickCount() {
      var w = COUNT_WEIGHTS[max], x = Math.random();
      for (var q = 0; q < w.length; q++) { x -= w[q]; if (x < 0) return q + 1; }
      return w.length;
    }

    var guard = 0;
    while (isl.length < k) {
      if (++guard > 400) return null;
      var fresh = [], links = [];
      for (var i = 0; i < isl.length; i++) {
        for (var d = 0; d < 4; d++) {
          for (var s = 1; ; s++) {
            var pr = isl[i].r + DIRS[d][0] * s, pc = isl[i].c + DIRS[d][1] * s;
            if (pr < 0 || pc < 0 || pr >= size || pc >= size) break;
            var j = islandAt(pr, pc);
            if (j >= 0) {
              // Connection to an existing island in line.
              var existing = findBridge(i, j);
              if (!existing) {
                if (!crossesAny(geom(isl[i].r, isl[i].c, pr, pc))) links.push({ a: i, b: j, br: null });
              } else if (existing.count < max) {
                links.push({ a: i, b: j, br: existing });
              }
              break;
            }
            var g = geom(isl[i].r, isl[i].c, pr, pc);
            if (crossesAny(g) || onBridge(pr, pc)) break;
            fresh.push({ from: i, r: pr, c: pc, g: g, adj: adjacentToIsland(pr, pc) });
          }
        }
      }

      // Avoid placing islands orthogonally adjacent to another island when possible.
      var pool = fresh.filter(function (m) { return !m.adj; });
      if (!pool.length) pool = fresh;
      var useLink = links.length > 0 && (pool.length === 0 || Math.random() < 0.25);

      if (useLink) {
        var L = links[rnd(links.length)];
        if (L.br) {
          L.br.count += 1 + rnd(max - L.br.count);
        } else {
          bridges.push({
            a: L.a, b: L.b, count: pickCount(),
            g: geom(isl[L.a].r, isl[L.a].c, isl[L.b].r, isl[L.b].c)
          });
        }
      } else if (pool.length) {
        var m = pool[rnd(pool.length)];
        isl.push({ r: m.r, c: m.c });
        bridges.push({ a: m.from, b: isl.length - 1, count: pickCount(), g: m.g });
      } else {
        return null;
      }
    }

    var islands = isl.map(function (p) { return { r: p.r, c: p.c, n: 0 }; });
    var solution = bridges.map(function (b) {
      islands[b.a].n += b.count;
      islands[b.b].n += b.count;
      return { a: Math.min(b.a, b.b), b: Math.max(b.a, b.b), count: b.count };
    });
    return { size: size, max: max, islands: islands, solution: solution };
  }

  // Build a puzzle with exactly `islandCount` islands and (preferably) exactly one solution.
  // Islands per level: Easy 8, Medium 10, Hard 12, Very Hard 15 (grid 7x7, 8x8, 9x9, 10x10).
  // Easy (8 islands) is the exception: it must have at least two solutions, so there is
  // more than one way to win.
  function generate(islandCount) {
    var k = SIZE_FOR[islandCount] ? islandCount : EASY_ISLANDS;
    var size = SIZE_FOR[k], max = MAX_FOR[k];
    if (k === EASY_ISLANDS) return generateEasy(k, size, max);
    var best = null, tries = 0, emergency = 0;
    while ((tries < MAX_ATTEMPTS || !best) && emergency < 5000) {
      emergency++;
      var p = buildOnce(k, size, max);
      if (!p) continue;
      tries++;
      var cnt = countSolutions(p, 2);
      if (cnt === 1) return p;
      if (!best || cnt < best.cnt) best = { p: p, cnt: cnt };
    }
    if (!best) throw new Error('Rune Bridges: could not build a puzzle');
    return best.p;
  }

  function generateEasy(k, size, max) {
    for (;;) {
      var p = buildOnce(k, size, max);
      if (p && countSolutions(p, EASY_MIN_SOLUTIONS) >= EASY_MIN_SOLUTIONS) return p;
    }
  }

  window.RuneBridges = {
    generate: generate,
    countSolutions: countSolutions,
    MAX_FOR: MAX_FOR,
    isSolved: isSolved
  };

  // ---------------------------------------------------------------- UI

  var CSS = [
    '.rb-title{font-family:"Cinzel",serif;color:var(--gold-bright);text-align:center;font-size:1.3rem;letter-spacing:.08em;margin:0 0 .5rem;}',
    '.rb-diff{flex-wrap:wrap;}',
    '.rb-diff .btn{font-size:.82rem;padding:.5rem .75rem;}',
    '.rb-stage{display:flex;flex-direction:column;align-items:center;gap:1rem;width:100%;}',
    '.rb-board{width:100%;max-width:560px;margin:0 auto;}',
    '.rb-board svg{display:block;width:100%;height:auto;touch-action:manipulation;user-select:none;-webkit-user-select:none;}',
    '.rb-bridge{stroke:var(--gold);stroke-linecap:round;}',
    '.rb-solved .rb-bridge{stroke:var(--success);}',
    '.rb-hit{stroke:transparent;stroke-width:30;fill:none;cursor:pointer;}',
    '.rb-isl{cursor:pointer;}',
    '.rb-isl circle{fill:var(--stone-mid);stroke:var(--gold-dim);stroke-width:4;}',
    '.rb-isl text{font-family:"Cinzel",serif;font-weight:700;font-size:30px;text-anchor:middle;dominant-baseline:central;fill:var(--parchment);pointer-events:none;}',
    '.rb-under circle{stroke:var(--gold);}',
    '.rb-under text{fill:var(--gold-bright);}',
    '.rb-ok circle{stroke:var(--success);}',
    '.rb-ok text{fill:var(--success);}',
    '.rb-over circle{stroke:var(--danger);}',
    '.rb-over text{fill:var(--danger);}',
    '.rb-isl.rb-sel circle{stroke:var(--rune);stroke-width:8;}',
    '.rb-badge{pointer-events:none;}',
    '.rb-badge circle{fill:var(--stone);stroke:var(--gold);stroke-width:3;}',
    '.rb-solved .rb-badge circle{stroke:var(--success);}',
    '.rb-badge text{font-family:"Cinzel",serif;font-weight:700;font-size:21px;text-anchor:middle;dominant-baseline:central;fill:var(--gold-bright);}'
  ].join('\n');

  var MARKUP = [
    '<div class="puzzle-frame">',
    '  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>',
    '  <div class="corner corner-bl"></div><div class="corner corner-br"></div>',
    '  <div class="rb-title">Rune Bridges</div>',
    '  <p class="flavor-text">',
    '    "Span the chasm with runic bridges. Each <span style="color:var(--gold)">golden stone</span>',
    '    must carry exactly the number of bridges it shows, and every stone must join one single span."',
    '  </p>',
    '  <div class="btn-row diff-row rb-diff" role="group" aria-label="Difficulty">',
    '    <button class="btn active" data-rb-diff="8" aria-pressed="true">Easy 8</button>',
    '    <button class="btn" data-rb-diff="10" aria-pressed="false">Medium 10</button>',
    '    <button class="btn" data-rb-diff="12" aria-pressed="false">Hard 12</button>',
    '    <button class="btn" data-rb-diff="15" aria-pressed="false">Very Hard 15</button>',
    '  </div>',
    '  <div class="rb-stage">',
    '    <div class="rb-board"></div>',
    '    <div class="move-counter rb-count">Bridges: 0</div>',
    '  </div>',
    '  <div class="status-msg rb-status"></div>',
    '  <div class="btn-row">',
    '    <button class="btn" data-rb-act="clear">Clear</button>',
    '    <button class="btn btn-primary" data-rb-act="new">New Puzzle</button>',
    '  </div>',
    '</div>',
    '<div class="dm-panel">',
    '  <div class="dm-label">Rune Bridges</div>',
    '  <p>Tap a stone and then a stone in a straight, clear line to add a bridge; tap again to add more, and past the limit',
    '  it goes back to none. Tap a bridge to cycle it directly. Easy and Medium allow up to 3 bridges between two stones,',
    '  Hard and Very Hard up to 4 (shown as stacked lines with a number). Bridges may not cross. Every stone needs exactly its number of bridges,',
    '  and all stones must be linked together. The number on each level is how many stones it has: Easy 8 (7 by 7 grid),',
    '  Medium 10 (8 by 8), Hard 12 (9 by 9), Very Hard 15 (10 by 10). Easy spans have at least two different solutions;',
    '  harder spans have exactly one. Any layout that follows the rules wins.</p>',
    '</div>'
  ].join('\n');

  function init() {
    var host = document.getElementById('bridges');
    if (!host) return;
    if (!document.getElementById('rb-style')) {
      var style = document.createElement('style');
      style.id = 'rb-style';
      style.textContent = CSS;
      (document.head || document.body).appendChild(style);
    }
    host.innerHTML = MARKUP;

    var board = host.querySelector('.rb-board');
    var countEl = host.querySelector('.rb-count');
    var statusEl = host.querySelector('.rb-status');
    var diffButtons = host.querySelectorAll('[data-rb-diff]');

    var S = SPACING, P = PAD, R = RADIUS;
    var state = {
      diff: 8, puzzle: null, edges: [], index: {}, counts: [], target: [],
      sel: -1, solved: false, lost: false
    };

    function isOnceMode() {
      return !!(window.VaultOnce && typeof window.VaultOnce.active === 'function' && window.VaultOnce.active());
    }

    function anyStoneOver() {
      if (!state.puzzle) return false;
      var isl = state.puzzle.islands, deg = [], i;
      for (i = 0; i < isl.length; i++) deg.push(0);
      for (i = 0; i < state.edges.length; i++) {
        var c = state.counts[i];
        if (c > 0) {
          deg[state.edges[i].a] += c;
          deg[state.edges[i].b] += c;
        }
      }
      for (i = 0; i < isl.length; i++) if (deg[i] > isl[i].n) return true;
      return false;
    }

    function setStatus(msg, cls) {
      statusEl.className = 'status-msg rb-status' + (cls ? ' ' + cls : '');
      statusEl.textContent = msg;
    }

    function key(a, b) { return Math.min(a, b) + ',' + Math.max(a, b); }

    function totalBridges() {
      var t = 0;
      for (var i = 0; i < state.counts.length; i++) t += state.counts[i];
      return t;
    }

    function crossesExisting(e) {
      for (var j = 0; j < state.counts.length; j++) {
        if (state.counts[j] > 0 && crosses(state.edges[e].g, state.edges[j].g)) return true;
      }
      return false;
    }

    function render() {
      var p = state.puzzle, isl = p.islands, size = p.size;
      var W = (size - 1) * S + 2 * P;
      function xy(i) { return { x: P + isl[i].c * S, y: P + isl[i].r * S }; }
      function seg(A, B, off, horiz, cls, extra) {
        var dx = horiz ? 0 : off, dy = horiz ? off : 0;
        return '<line class="' + cls + '" x1="' + (A.x + dx) + '" y1="' + (A.y + dy) +
          '" x2="' + (B.x + dx) + '" y2="' + (B.y + dy) + '"' + (extra || '') + '/>';
      }

      var deg = [], i;
      for (i = 0; i < isl.length; i++) deg.push(0);
      var bridgesSvg = '', hitsSvg = '';
      state.edges.forEach(function (e, idx) {
        var cnt = state.counts[idx];
        var A = xy(e.a), B = xy(e.b);
        if (cnt > 0) {
          deg[e.a] += cnt; deg[e.b] += cnt;
          // stacked parallel lines, one per bridge
          var lanes = LANES[cnt], sw = cnt <= 2 ? (cnt === 1 ? 8 : 7) : (cnt === 3 ? 5.5 : 4.5);
          for (var li = 0; li < lanes.length; li++) bridgesSvg += seg(A, B, lanes[li], e.g.h, 'rb-bridge', ' stroke-width="' + sw + '"');
          // numeral badge on triple and quadruple bridges so they read at a glance
          if (cnt >= 3) {
            var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            bridgesSvg += '<g class="rb-badge"><circle cx="' + mx + '" cy="' + my + '" r="17"/><text x="' + mx + '" y="' + my + '">' + cnt + '</text></g>';
          }
        }
        hitsSvg += seg(A, B, 0, e.g.h, 'rb-hit', ' data-e="' + idx + '"');
      });

      var islSvg = '';
      isl.forEach(function (p2, idx) {
        var need = p2.n, d = deg[idx];
        var cls = d === need ? 'rb-ok' : (d < need ? 'rb-under' : 'rb-over');
        if (state.sel === idx) cls += ' rb-sel';
        var q = xy(idx);
        islSvg += '<g class="rb-isl ' + cls + '" data-i="' + idx + '">' +
          '<circle cx="' + q.x + '" cy="' + q.y + '" r="' + R + '"/>' +
          '<text x="' + q.x + '" y="' + q.y + '"' + (need > 9 ? ' style="font-size:24px"' : '') + '>' + need + '</text></g>';
      });

      board.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="Rune Bridges board, ' +
        size + ' by ' + size + ' grid, ' + isl.length + ' stones">' + bridgesSvg + hitsSvg + islSvg + '</svg>';
      board.classList.toggle('rb-solved', state.solved);
      countEl.textContent = 'Bridges: ' + totalBridges();
    }

    function currentBridges() {
      return state.edges.map(function (e, idx) {
        return { a: e.a, b: e.b, count: state.counts[idx] };
      });
    }

    // Re-check the win after every change; shows the overlay on the transition to solved.
    function afterChange() {
      var ok = isSolved(state.puzzle, currentBridges());
      var was = state.solved;
      state.solved = ok;
      render();
      if (ok && !was) {
        setStatus('The runes are bound. The span is whole!', 'success');
        if (typeof window.showWin === 'function') {
          window.showWin('The Rune Bridges are complete! Every stone is satisfied and the span is whole.');
        }
        return;
      }
      // One-time links: going over a stone's required count (red rune) is an immediate loss.
      if (isOnceMode() && !state.lost && anyStoneOver()) {
        state.lost = true;
        state.sel = -1;
        setStatus('Too many bridges on a stone — game over', 'fail');
        render();
        if (window.VaultOnce && typeof window.VaultOnce.fail === 'function') {
          window.VaultOnce.fail({
            summary: 'Too many bridges on a stone — game over',
            reason: 'overflow'
          });
        }
      }
    }

    function cycle(e) {
      if (state.solved || state.lost) return;
      var cur = state.counts[e];
      if (cur === 0 && crossesExisting(e)) {
        setStatus('That bridge would cross an existing bridge.', 'fail');
        render();
        return;
      }
      state.counts[e] = (cur + 1) % ((state.puzzle.max || 2) + 1);
      setStatus('', '');
      afterChange();
    }

    function onIslandClick(i) {
      if (state.solved || state.lost) return;
      if (state.sel < 0) {
        state.sel = i;
        setStatus('Now tap a stone in a straight, clear line.', 'info');
        render();
        return;
      }
      if (state.sel === i) {
        state.sel = -1;
        setStatus('', '');
        render();
        return;
      }
      var e = state.index[key(state.sel, i)];
      if (e === undefined) {
        state.sel = i;
        setStatus('Those stones are not in a clear straight line. Selected the new stone instead.', 'fail');
        render();
        return;
      }
      state.sel = -1;
      cycle(e);
    }

    function newPuzzle() {
      var p = window.RuneBridges.generate(state.diff);
      state.puzzle = p;
      state.edges = visibleEdges(p.islands);
      state.index = {};
      state.counts = [];
      state.target = [];
      state.edges.forEach(function (e, idx) {
        state.index[e.a + ',' + e.b] = idx;
        state.counts.push(0);
        state.target.push(0);
      });
      p.solution.forEach(function (s) {
        state.target[state.index[key(s.a, s.b)]] = s.count;
      });
      state.sel = -1;
      state.solved = false;
      state.lost = false;
      setStatus('A new span of ' + p.islands.length + ' stones awaits, with up to ' + (p.max || 2) + ' bridges between two stones. Tap two stones in line to bridge them.', '');
      render();
    }

    function clearAll() {
      if (state.lost && isOnceMode()) return;
      for (var i = 0; i < state.counts.length; i++) state.counts[i] = 0;
      state.sel = -1;
      setStatus('The bridges are cleared.', '');
      afterChange();
    }

    function setDifficulty(k) {
      state.diff = k;
      diffButtons.forEach(function (b) {
        var on = Number(b.getAttribute('data-rb-diff')) === k;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      newPuzzle();
    }

    window.RuneBridges.setDifficulty = setDifficulty;

    board.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (state.solved || state.lost) return;
      var stone = t.closest('[data-i]');
      var hit = t.closest('[data-e]');
      if (stone) {
        onIslandClick(Number(stone.getAttribute('data-i')));
      } else if (hit) {
        state.sel = -1;
        cycle(Number(hit.getAttribute('data-e')));
      }
    });

    diffButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        setDifficulty(Number(b.getAttribute('data-rb-diff')));
      });
    });

    host.querySelectorAll('[data-rb-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-rb-act');
        if (act === 'clear') clearAll();
        else if (act === 'new') newPuzzle();
      });
    });

    newPuzzle();
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
