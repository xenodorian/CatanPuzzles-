/* Rune Bridges: island bridge puzzle.
   Self-contained IIFE. Exposes only window.RuneBridges (pure helpers for testing). */
(function () {
  'use strict';

  var SIZE_FOR = { 4: 5, 5: 5, 6: 6, 7: 7 };
  var MAX_ATTEMPTS = 200;
  var DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  // Board geometry for the SVG (viewBox units).
  var SPACING = 72;   // distance between neighbouring lattice points
  var PAD = 40;       // margin around the grid
  var RADIUS = 32;    // island radius
  var LANE = 6;       // offset of each line of a double bridge

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
    var isl = puzzle.islands, n = isl.length;
    var edges = visibleEdges(isl), E = edges.length;
    var need = [], cap = [], i;
    for (i = 0; i < n; i++) { need.push(isl[i].n); cap.push(0); }
    for (i = 0; i < E; i++) { cap[edges[i].a] += 2; cap[edges[i].b] += 2; }
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
      for (var cnt = 0; cnt <= 2; cnt++) {
        if (cnt > need[e.a] || cnt > need[e.b]) break;
        if (cnt > 0) {
          var clash = false;
          for (var k = 0; k < active.length; k++) {
            if (crosses(e.g, edges[active[k]].g)) { clash = true; break; }
          }
          if (clash) continue;
        }
        need[e.a] -= cnt; need[e.b] -= cnt;
        cap[e.a] -= 2; cap[e.b] -= 2;
        if (need[e.a] <= cap[e.a] && need[e.b] <= cap[e.b]) {
          counts[idx] = cnt;
          if (cnt > 0) active.push(idx);
          dfs(idx + 1);
          if (cnt > 0) active.pop();
          counts[idx] = 0;
        }
        need[e.a] += cnt; need[e.b] += cnt;
        cap[e.a] += 2; cap[e.b] += 2;
        if (found >= limit) return;
      }
    }
    dfs(0);
    return found;
  }

  // Full rule check of a bridge configuration against a puzzle.
  function isSolved(puzzle, bridges) {
    var isl = puzzle.islands, n = isl.length;
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
      if (c !== 1 && c !== 2) return false;
      if (br.a === br.b) return false;
      var idx = index[Math.min(br.a, br.b) + ',' + Math.max(br.a, br.b)];
      if (idx === undefined) return false;
      cnt[idx] += c;
      if (cnt[idx] > 2) return false;
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
  function buildOnce(k, size) {
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
    function pickCount() { return Math.random() < 0.6 ? 1 : 2; }

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
              } else if (existing.count === 1) {
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
          L.br.count = 2;
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
    return { size: size, islands: islands, solution: solution };
  }

  // Build a puzzle with exactly `islandCount` islands and (preferably) exactly one solution.
  function generate(islandCount) {
    var k = SIZE_FOR[islandCount] ? islandCount : 4;
    var size = SIZE_FOR[k];
    var best = null, tries = 0, emergency = 0;
    while ((tries < MAX_ATTEMPTS || !best) && emergency < 5000) {
      emergency++;
      var p = buildOnce(k, size);
      if (!p) continue;
      tries++;
      var cnt = countSolutions(p, 2);
      if (cnt === 1) return p;
      if (!best || cnt < best.cnt) best = { p: p, cnt: cnt };
    }
    if (!best) throw new Error('Rune Bridges: could not build a puzzle');
    return best.p;
  }

  window.RuneBridges = {
    generate: generate,
    countSolutions: countSolutions,
    isSolved: isSolved
  };

  // ---------------------------------------------------------------- UI

  var CSS = [
    '.rb-title{font-family:"Cinzel",serif;color:var(--gold-bright);text-align:center;font-size:1.3rem;letter-spacing:.08em;margin:0 0 .5rem;}',
    '.rb-diff{flex-wrap:wrap;}',
    '.rb-diff .btn{font-size:.82rem;padding:.5rem .75rem;}',
    '.rb-stage{display:flex;flex-direction:column;align-items:center;gap:1rem;width:100%;}',
    '.rb-board{width:100%;max-width:460px;margin:0 auto;}',
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
    '.rb-isl.rb-hint circle{stroke:var(--rune);stroke-width:8;}'
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
    '    <button class="btn active" data-rb-diff="4" aria-pressed="true">Easy 4</button>',
    '    <button class="btn" data-rb-diff="5" aria-pressed="false">Medium 5</button>',
    '    <button class="btn" data-rb-diff="6" aria-pressed="false">Hard 6</button>',
    '    <button class="btn" data-rb-diff="7" aria-pressed="false">Very Hard 7</button>',
    '  </div>',
    '  <div class="rb-stage">',
    '    <div class="rb-board"></div>',
    '    <div class="move-counter rb-count">Bridges: 0</div>',
    '  </div>',
    '  <div class="status-msg rb-status"></div>',
    '  <div class="btn-row">',
    '    <button class="btn" data-rb-act="clear">Clear</button>',
    '    <button class="btn" data-rb-act="new">New Puzzle</button>',
    '    <button class="btn btn-primary" data-rb-act="hint">Hint</button>',
    '  </div>',
    '</div>',
    '<div class="dm-panel">',
    '  <div class="dm-label">Rune Bridges</div>',
    '  <p>Tap a stone and then a stone in a straight, clear line to add or cycle a bridge (none, single, double).',
    '  Tap a bridge to cycle it directly. Bridges may not cross. Every stone needs exactly its number of bridges,',
    '  and all stones must be linked together.</p>',
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
      diff: 4, puzzle: null, edges: [], index: {}, counts: [], target: [],
      sel: -1, solved: false, hintPair: null
    };

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
          if (cnt === 1) {
            bridgesSvg += seg(A, B, 0, e.g.h, 'rb-bridge', ' stroke-width="8"');
          } else {
            bridgesSvg += seg(A, B, -LANE, e.g.h, 'rb-bridge', ' stroke-width="7"');
            bridgesSvg += seg(A, B, LANE, e.g.h, 'rb-bridge', ' stroke-width="7"');
          }
        }
        hitsSvg += seg(A, B, 0, e.g.h, 'rb-hit', ' data-e="' + idx + '"');
      });

      var islSvg = '';
      isl.forEach(function (p2, idx) {
        var need = p2.n, d = deg[idx];
        var cls = d === need ? 'rb-ok' : (d < need ? 'rb-under' : 'rb-over');
        if (state.sel === idx) cls += ' rb-sel';
        if (state.hintPair && (state.hintPair[0] === idx || state.hintPair[1] === idx)) cls += ' rb-hint';
        var q = xy(idx);
        islSvg += '<g class="rb-isl ' + cls + '" data-i="' + idx + '">' +
          '<circle cx="' + q.x + '" cy="' + q.y + '" r="' + R + '"/>' +
          '<text x="' + q.x + '" y="' + q.y + '">' + need + '</text></g>';
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
      }
    }

    function cycle(e) {
      var cur = state.counts[e];
      if (cur === 0 && crossesExisting(e)) {
        setStatus('That bridge would cross an existing bridge.', 'fail');
        render();
        return;
      }
      state.counts[e] = (cur + 1) % 3;
      setStatus('', '');
      afterChange();
    }

    function onIslandClick(i) {
      if (state.solved) return;
      if (state.sel < 0) {
        state.sel = i;
        setStatus('Now tap a stone in a straight, clear line.', 'hint');
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
      state.hintPair = null;
      setStatus('A new span of ' + p.islands.length + ' stones awaits. Tap two stones in line to bridge them.', '');
      render();
    }

    function clearAll() {
      for (var i = 0; i < state.counts.length; i++) state.counts[i] = 0;
      state.sel = -1;
      setStatus('The bridges are cleared.', '');
      afterChange();
    }

    // Hint: first remove any bridge the stored solution does not have (always valid),
    // then add or correct one bridge toward the solution. Each step keeps the board
    // a subset of the solution, so it can never introduce a crossing.
    function hint() {
      if (state.solved) { setStatus('The puzzle is already solved.', 'hint'); return; }
      var idx = -1, i;
      for (i = 0; i < state.counts.length; i++) {
        if (state.counts[i] > state.target[i]) { idx = i; break; }
      }
      if (idx < 0) {
        for (i = 0; i < state.counts.length; i++) {
          if (state.counts[i] < state.target[i]) { idx = i; break; }
        }
      }
      if (idx < 0) { setStatus('Your bridges already match the solution.', 'hint'); return; }

      var e = state.edges[idx];
      var A = state.puzzle.islands[e.a], B = state.puzzle.islands[e.b];
      var t = state.target[idx];
      state.counts[idx] = t;
      var what = t === 0 ? 'remove the bridge' :
        'set the bridge to ' + t + (t === 1 ? ' span' : ' spans');
      setStatus('Hint: ' + what + ' between the stone at row ' + (A.r + 1) + ', column ' + (A.c + 1) +
        ' and the stone at row ' + (B.r + 1) + ', column ' + (B.c + 1) + '.', 'hint');
      state.hintPair = [e.a, e.b];
      state.sel = -1;
      afterChange();
      setTimeout(function () {
        state.hintPair = null;
        render();
      }, 2500);
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

    board.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var stone = t.closest('[data-i]');
      var hit = t.closest('[data-e]');
      if (stone) {
        onIslandClick(Number(stone.getAttribute('data-i')));
      } else if (hit) {
        if (state.solved) return;
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
        else if (act === 'hint') hint();
      });
    });

    newPuzzle();
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
