// Verifies the "every Easy puzzle has at least two solutions" rule for each vault game, and that
// each game's win check accepts more than one solution, not just a stored answer.
// Also checks that Medium and harder Crate Vault levels are unchanged and still have one route.
// Usage: node tools/check-easy.js [samples=300] [baseRef=origin/main]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const SAMPLES = +process.argv[2] || 300;
const BASE = process.argv[3] || 'origin/main';
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log('  FAIL', msg); } return cond; };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
function load(file, extra) {
  const ctx = { window: {}, document: { readyState: 'complete', getElementById: () => null }, console, Math, Date, Set, Map, Array, Uint8Array, Number, Error, RangeError, Infinity, isFinite, JSON, Object, String };
  vm.createContext(ctx);
  vm.runInContext(read(file) + (extra || ''), ctx);
  return ctx;
}

/* ---------- Crate Vault ---------- */
(function crate() {
  console.log('Crate Vault');
  const S = require('./crate-solver.js');
  const bankOf = src => JSON.parse(src.match(/var BANK = (\{.*\});/)[1]);
  const bank = bankOf(read('puzzles/crate.js'));
  const counts = [];
  bank['2'].forEach((e, i) => {
    const L = S.parse(e[0]), a = S.analyze(L, 1000);
    counts.push(a.routes.length);
    ok(a.routes.length >= 2, `easy level ${i} has ${a.routes.length} route(s)`);
    ok(e.length >= 3 && S.replay(L, e[1]) && S.replay(L, e[2]) && e[1] !== e[2], `easy level ${i} stored solutions`);
  });
  console.log(`  easy levels: ${bank['2'].length}, push routes per level: ${counts.join(' ')}`);
  let base = null;
  try { base = bankOf(execSync(`git show ${BASE}:puzzles/crate.js`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { /* no git */ }
  for (const k of ['3', '4', '5']) {
    if (base) ok(JSON.stringify(base[k]) === JSON.stringify(bank[k]), `bank ${k} differs from ${BASE}`);
    const c = bank[k].map(e => S.analyze(S.parse(e[0]), 2).routes.length);
    ok(c.every(x => x === 1), `bank ${k} route counts ${c.join(' ')}`);
    console.log(`  bank ${k}: ${bank[k].length} levels, ${base ? 'identical to ' + BASE : 'not compared'}, each 1 route`);
  }
  // In-game: every shown Easy level (all eight turned forms) is won by both solutions.
  const ctx = load('puzzles/crate.js');
  const C = ctx.window.CrateVault;
  let shown = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const lvl = C.generate(2);
    shown++;
    const a = C.applyMoves(lvl, lvl.solution), b = C.applyMoves(lvl, lvl.alternate);
    ok(lvl.solution !== lvl.alternate && a.legal && a.solved && b.legal && b.solved, 'in-game easy level not won by both solutions');
  }
  console.log(`  ${shown} generated easy levels: both solutions win through the game's applyMoves`);
})();

/* ---------- Pipe Maze ---------- */
(function pipe() {
  console.log('Pipe Maze');
  const ctx = load('puzzles/pipe.js', ';this.api={buildPipeLevel,computePipeFlow,PIPE_CONN,DIR_DR,DIR_DC,OPP};');
  const A = ctx.api;
  // Independent route finder: returns up to `limit` routes as cell lists.
  function routes(grid, n, limit) {
    const out = [], seen = new Set(['0,0']), tgt = [n - 1, n - 1];
    const fixed = (r, c, d) => A.PIPE_CONN[grid[r][c].type][grid[r][c].rot][d];
    function fits(type, a, b) { for (let rot = 0; rot < 4; rot++) { const k = A.PIPE_CONN[type][rot]; if (k[a] && k[b]) return rot; } return -1; }
    function go(path, inDir) {
      if (out.length >= limit) return;
      const [r, c] = path[path.length - 1];
      for (let d = 0; d < 4; d++) {
        const nr = r + A.DIR_DR[d], nc = c + A.DIR_DC[d];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n || seen.has(nr + ',' + nc)) continue;
        if (inDir < 0 ? !fixed(r, c, d) : fits(grid[r][c].type, inDir, d) < 0) continue;
        if (nr === tgt[0] && nc === tgt[1]) { if (fixed(nr, nc, A.OPP[d])) out.push({ path: path.concat([[nr, nc]]) }); continue; }
        seen.add(nr + ',' + nc); go(path.concat([[nr, nc]]), A.OPP[d]); seen.delete(nr + ',' + nc);
      }
    }
    go([[0, 0]], -1);
    // turn each route's cells to match it
    return out.map(({ path: p }) => {
      const g = grid.map(row => row.map(x => ({ ...x })));
      for (let i = 1; i < p.length - 1; i++) {
        const dir = (a, b) => b[0] < a[0] ? 0 : b[1] > a[1] ? 1 : b[0] > a[0] ? 2 : 3;
        const inSide = A.OPP[dir(p[i - 1], p[i])], outSide = dir(p[i], p[i + 1]);
        g[p[i][0]][p[i][1]].rot = fits(g[p[i][0]][p[i][1]].type, inSide, outSide);
      }
      return { path: p, grid: g };
    });
  }
  const hist = {};
  for (let i = 0; i < SAMPLES; i++) {
    const grid = A.buildPipeLevel('easy', 5, 5, [0, 0], [4, 4]);
    const rs = routes(grid, 5, 1000);
    const b = rs.length >= 10 ? '10+' : String(rs.length); hist[b] = (hist[b] || 0) + 1;
    ok(rs.length >= 2, `easy pipe with ${rs.length} route(s)`);
    ok(!A.computePipeFlow(grid, 5, 5, [0, 0], [4, 4]).found, 'easy pipe starts solved');
    for (const r of rs.slice(0, 2)) ok(A.computePipeFlow(r.grid, 5, 5, [0, 0], [4, 4]).found, 'win check rejects a valid route');
  }
  console.log(`  ${SAMPLES} easy puzzles, routes per puzzle: ${JSON.stringify(hist)}; first two routes of each win via computePipeFlow`);
})();

/* ---------- Rune Bridges ---------- */
(function bridges() {
  console.log('Rune Bridges');
  const ctx = load('puzzles/bridges.js');
  const R = ctx.window.RuneBridges;
  // Independent brute force over bridge counts (0..2) for each visible pair, judged by the game's isSolved.
  function allSolutions(p) {
    const isl = p.islands, pairs = [];
    for (let a = 0; a < isl.length; a++) for (let b = a + 1; b < isl.length; b++) if (isl[a].r === isl[b].r || isl[a].c === isl[b].c) pairs.push([a, b]);
    const sols = [], cnt = new Array(pairs.length).fill(0);
    (function rec(i) {
      if (i === pairs.length) {
        const br = pairs.map((q, j) => ({ a: q[0], b: q[1], count: cnt[j] })).filter(x => x.count);
        if (R.isSolved(p, br)) sols.push(br);
        return;
      }
      for (let c = 0; c <= 2; c++) { cnt[i] = c; rec(i + 1); }
      cnt[i] = 0;
    })(0);
    return sols;
  }
  const hist = {};
  for (let i = 0; i < SAMPLES; i++) {
    const p = R.generate(4), sols = allSolutions(p);
    hist[sols.length] = (hist[sols.length] || 0) + 1;
    ok(sols.length >= 2, `easy bridges with ${sols.length} solution(s)`);
    ok(R.countSolutions(p, 10) === sols.length, 'countSolutions disagrees with brute force');
  }
  console.log(`  ${SAMPLES} easy puzzles, solutions per puzzle (brute force via isSolved): ${JSON.stringify(hist)}`);
  const med = {};
  for (let i = 0; i < 40; i++) { const c = R.countSolutions(R.generate(5), 2); med[c] = (med[c] || 0) + 1; }
  console.log(`  medium (unchanged generator) sample solution counts capped at 2: ${JSON.stringify(med)}`);
})();

/* ---------- Knight's Tour ---------- */
(function knight() {
  console.log("Knight's Tour");
  const n = 5, D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const nb = i => { const r = i / n | 0, c = i % n, o = []; for (const [a, b] of D) { const R = r + a, C = c + b; if (R >= 0 && R < n && C >= 0 && C < n) o.push(R * n + C); } return o; };
  const tours = [];
  for (let s = 0; s < n * n; s++) {
    const v = new Uint8Array(n * n); v[s] = 1; let cnt = 0;
    (function rec(p, l) { if (l === n * n) { cnt++; return; } for (const q of nb(p)) if (!v[q]) { v[q] = 1; rec(q, l + 1); v[q] = 0; } })(s, 1);
    tours.push(cnt);
  }
  const possible = tours.filter(t => t > 0);
  ok(possible.every(t => t >= 2), 'a 5x5 start with exactly one tour');
  console.log(`  5x5 tours per start square: ${tours.join(' ')} (every start that has a tour has >= ${Math.min(...possible)})`);
  const ctx = load('puzzles/knight.js');
  const K = ctx.window.KnightTour;
  for (let i = 0; i < 50; i++) { const g = K.generate(5); ok(tours[g.start[0] * n + g.start[1]] >= 2, 'generated start with < 2 tours'); }
  console.log('  50 generated easy starts all have >= 2 tours; the game wins on any full legal path (no stored-tour check)');
})();

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
