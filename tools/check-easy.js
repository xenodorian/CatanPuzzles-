// Verifies the "every Easy puzzle has at least two solutions" rule for each vault game, and that
// each game's win check accepts more than one solution, not just a stored answer.
// Also checks that Medium and harder Crate Vault levels are unchanged and still have one route.
// Crate Vault Easy levels must also be forgiving: 2 crates (1 allowed), 9 to 14 pushes, at least
// two distinct push routes, and no push from the start that makes the vault unsolvable. Trap
// pushes (solvable -> unsolvable) anywhere are counted and reported per level.
// Usage: node tools/check-easy.js [samples=300] [baseRef=b3b8b77]
// baseRef is the commit the Medium/Hard/Very Hard Crate banks are compared against (they must not change).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const SAMPLES = +process.argv[2] || 300;
const BASE = process.argv[3] || 'b3b8b77';
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
  const counts = [], pushes = [], traps = [], onShortest = [];
  bank['2'].forEach((e, i) => {
    const L = S.parse(e[0]), a = S.analyze(L, 1000);
    counts.push(a.routes.length + (a.routes.length >= 1000 ? '+' : ''));
    pushes.push(a.minPushes); traps.push(a.deadPushes + '/' + a.pushes); onShortest.push(a.deadOnShortest);
    ok(a.routes.length >= 2, `easy level ${i} has ${a.routes.length} route(s)`);
    ok(new Set(a.routes.map(S.pushKey)).size >= 2, `easy level ${i} routes are only reorderings`);
    ok(a.minPushes >= 9 && a.minPushes <= 14, `easy level ${i} needs ${a.minPushes} pushes`);
    ok(L.crates.length >= 1 && L.crates.length <= 2, `easy level ${i} has ${L.crates.length} crates`);
    ok(e[0].split('/').length === 6 && e[0].split('/')[0].length === 7, `easy level ${i} is not a 6x7 room`);
    ok(a.deadFromStart === 0, `easy level ${i} has ${a.deadFromStart} trap push(es) from the start`);
    ok(e.length >= 3 && S.replay(L, e[1]) && S.replay(L, e[2]) && e[1] !== e[2], `easy level ${i} stored solutions`);
  });
  console.log(`  easy levels: ${bank['2'].length}`);
  console.log(`  fewest pushes per level: ${pushes.join(' ')} (range ${Math.min(...pushes)}-${Math.max(...pushes)})`);
  console.log(`  push routes per level: ${counts.join(' ')}`);
  console.log(`  trap pushes / all pushes from solvable positions: ${traps.join(' ')}`);
  console.log(`  trap pushes from positions on a shortest solution: ${onShortest.join(' ')}; from the start: 0 for all`);
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
    // Only pairs with no stone between them can carry a bridge (isSolved rejects the rest), and a stone
    // can never carry more bridges than its number, so those branches are skipped. Counts go up to p.max.
    const isl = p.islands, pairs = [], MAX = p.max || 2;
    for (let a = 0; a < isl.length; a++) for (let b = a + 1; b < isl.length; b++) {
      const A = isl[a], B = isl[b];
      if (A.r !== B.r && A.c !== B.c) continue;
      const between = isl.some((s, t) => t !== a && t !== b && (A.r === B.r ? s.r === A.r && s.c > Math.min(A.c, B.c) && s.c < Math.max(A.c, B.c) : s.c === A.c && s.r > Math.min(A.r, B.r) && s.r < Math.max(A.r, B.r)));
      if (!between) pairs.push([a, b]);
    }
    const sols = [], cnt = new Array(pairs.length).fill(0), left = isl.map(s => s.n);
    (function rec(i) {
      if (i === pairs.length) {
        if (left.some(x => x !== 0)) return;
        const br = pairs.map((q, j) => ({ a: q[0], b: q[1], count: cnt[j] })).filter(x => x.count);
        if (R.isSolved(p, br)) sols.push(br);
        return;
      }
      const [a, b] = pairs[i];
      for (let c = 0; c <= MAX && c <= left[a] && c <= left[b]; c++) { cnt[i] = c; left[a] -= c; left[b] -= c; rec(i + 1); left[a] += c; left[b] += c; }
      cnt[i] = 0;
    })(0);
    return sols;
  }
  const hist = {};
  for (let i = 0; i < SAMPLES; i++) {
    const p = R.generate(8), sols = allSolutions(p);
    hist[sols.length] = (hist[sols.length] || 0) + 1;
    ok(sols.length >= 2, `easy bridges with ${sols.length} solution(s)`);
    ok(R.countSolutions(p, 1000) === sols.length, 'countSolutions disagrees with brute force');
    ok(p.max === 3 && p.solution.every(b => b.count >= 1 && b.count <= 3), 'easy bridge counts outside 1..3');
  }
  console.log(`  ${SAMPLES} easy (8 stones, up to 3 bridges a pair) puzzles, solutions per puzzle (brute force via isSolved): ${JSON.stringify(hist)}`);
  for (const k of [10, 12, 15]) {
    const h = {}, top = {}; let ms = 0;
    for (let i = 0; i < 40; i++) {
      const t = Date.now(), p = R.generate(k); ms += Date.now() - t;
      ok(p.islands.length === k, `${k}-stone level built ${p.islands.length} stones`);
      ok(p.max === R.MAX_FOR[k] && p.solution.every(b => b.count >= 1 && b.count <= p.max), `${k}-stone bridge counts outside 1..max`);
      ok(R.isSolved(p, p.solution), `${k}-stone stored solution rejected`);
      const c = R.countSolutions(p, 2); h[c] = (h[c] || 0) + 1;
      ok(c === 1, `${k}-stone puzzle with ${c} solution(s)`);
      const m = Math.max(...p.solution.map(b => b.count)); top[m] = (top[m] || 0) + 1;
    }
    console.log(`  ${k} stones (max ${R.MAX_FOR[k]} a pair): 40 puzzles, solutions ${JSON.stringify(h)}, biggest bridge per puzzle ${JSON.stringify(top)}, avg ${(ms / 40).toFixed(1)} ms`);
  }
  // a smaller cross-check of the counter against brute force on harder levels
  for (let i = 0; i < 15; i++) { const p = R.generate(10); ok(allSolutions(p).length === 1, 'brute force finds more than one medium solution'); }
})();

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
