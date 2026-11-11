// Searches for Easy Crate Vault levels and prints candidates as JSON lines of stats.
// Easy rules (checked again by tools/check-easy.js):
//   - original 6x7 room size, 2 crates
//   - fewest pushes 9 to 14 (the old Easy range)
//   - at least 2 distinct push routes (see tools/crate-solver.js)
//   - forgiving: no push from the start makes the vault unsolvable, and as few "trap" pushes
//     (a push from a solvable position to an unsolvable one) as possible anywhere
// Method: simulated annealing that starts from the original Easy rooms (commit b3b8b77) and
// mutates walls, crates, runes and the warden, scoring push-count shortfall, missing second
// route, opening traps, traps on a shortest solution, and total traps.
// Usage: node tools/crate-easy-gen.js [seconds=150] [targetPushes=9] > candidates.json
// The Easy bank in puzzles/crate.js was picked from several runs (targets 9 to 14 on 8 cores):
// lowest trap counts per push length, with layouts at least 5 cells apart. Zero-trap levels and
// forgiving 13+ push levels were not found in a 6x7 room.
'use strict';
const S = require('./crate-solver.js');
const { execSync } = require('child_process');
const path = require('path');
const H = 6, W = 7, rnd = n => Math.floor(Math.random() * n);
const secs = +process.argv[2] || 150, TGT = +process.argv[3] || 9;

function connected(g) {
  let tot = 0, start = null;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] !== '#') { tot++; if (!start) start = [r, c]; }
  if (!start) return false;
  const seen = new Set([start.join()]), st = [start];
  while (st.length) {
    const [r, c] = st.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (g[nr][nc] === '#' || seen.has(nr + ',' + nc)) continue;
      seen.add(nr + ',' + nc); st.push([nr, nc]);
    }
  }
  return seen.size === tot;
}

const cache = new Map();
function evaluate(s) {
  if (cache.has(s)) return cache.get(s);
  let res = { score: 1e9 };
  if (connected(s.split('/').map(r => r.split('')))) {
    const a = S.analyze(S.parse(s), 3);
    if (a && a.minPushes >= 0) {
      const distinct = new Set(a.routes.map(S.pushKey)).size;
      const score = Math.max(0, TGT - a.minPushes) * 12 + Math.max(0, a.minPushes - 14) * 12 +
        (distinct < 2 ? 25 : 0) + a.deadFromStart * 10 + a.deadOnShortest * 3 + a.deadPushes;
      res = { score, a, distinct };
    }
  }
  if (cache.size > 200000) cache.clear();
  cache.set(s, res);
  return res;
}

function mutate(s) {
  const g = s.split('/').map(r => r.split('')), r = 1 + rnd(H - 2), c = 1 + rnd(W - 2);
  if (rnd(3) === 0) {
    if (g[r][c] === '#') g[r][c] = '.'; else if (g[r][c] === '.') g[r][c] = '#';
  } else {
    const objs = [];
    for (let i = 1; i < H - 1; i++) for (let j = 1; j < W - 1; j++) if ('copP'.includes(g[i][j])) objs.push([i, j]);
    const [i, j] = objs[rnd(objs.length)];
    if (g[r][c] !== '.') return s;
    const ch = g[i][j];
    if (ch === 'P') { g[i][j] = 'o'; g[r][c] = 'p'; } else { g[i][j] = '.'; g[r][c] = ch; }
  }
  return g.map(x => x.join('')).join('/');
}

const seeds = JSON.parse(execSync('git show b3b8b77:puzzles/crate.js', { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
  .match(/var BANK = (\{.*\});/)[1])['2'].map(e => e[0]);
const found = new Map(), t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  let cur = seeds[rnd(seeds.length)], ce = evaluate(cur), T = 4;
  for (let it = 0; it < 4000; it++) {
    const n = mutate(cur);
    if (n === cur) continue;
    const ne = evaluate(n);
    if (ne.score <= ce.score || Math.random() < Math.exp((ce.score - ne.score) / T)) { cur = n; ce = ne; }
    T = Math.max(0.3, T * 0.999);
    const a = ce.a;
    if (a && a.minPushes >= TGT && a.minPushes <= 14 && ce.distinct >= 2 && !a.deadFromStart && !found.has(cur)) {
      found.set(cur, { s: cur, min: a.minPushes, traps: a.deadPushes, onShortest: a.deadOnShortest, pushes: a.pushes });
    }
  }
}
const arr = [...found.values()].sort((x, y) => (x.onShortest * 2 + x.traps) - (y.onShortest * 2 + y.traps));
console.error('found', arr.length);
console.log(JSON.stringify(arr));
