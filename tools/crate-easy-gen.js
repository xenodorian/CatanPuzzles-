// Searches for Easy Crate Vault levels and prints bank entries [rows, solution, alternate].
// Easy rules (checked again by tools/check-easy.js):
//   - small open room (6x7 with at most 3 inner walls), 1 or 2 crates
//   - each crate starts in line with a rune (same row or column, clear floor between)
//   - solvable in 2 to 5 pushes, with at least 2 distinct push routes
//   - no trap on the way: no push from the start, or from any position on a shortest
//     solution, makes the vault unsolvable
// Usage: node tools/crate-easy-gen.js [count=20] [seconds=120]
// The Easy bank in puzzles/crate.js was hand-picked from runs of this search: lowest share of
// trap pushes, varied layouts, and four one-crate rooms.
'use strict';
const S = require('./crate-solver.js');
const H = 6, W = 7;
const want = +process.argv[2] || 20, seconds = +process.argv[3] || 120;
const rnd = n => Math.floor(Math.random() * n);

function canon(s) {
  const rows = s.split('/'), forms = [];
  for (let t = 0; t < 2; t++) for (let fr = 0; fr < 2; fr++) for (let fc = 0; fc < 2; fc++) {
    let g = rows.map(x => x.split(''));
    if (t) g = g[0].map((_, c) => g.map(r => r[c]));
    if (fr) g = g.reverse();
    if (fc) g = g.map(r => r.reverse());
    forms.push(g.map(r => r.join('')).join('/'));
  }
  return forms.sort()[0];
}

// true when crate (r,c) has a rune in the same row/column with only floor between
function inLine(g, r, c) {
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 1; ; k++) {
      const ch = g[r + dr * k][c + dc * k];
      if (ch === 'o') return true;
      if (ch !== '.' && ch !== 'p') break;
    }
  }
  return false;
}

function easyStats(s) {
  const L = S.parse(s), a = S.analyze(L, 50);
  if (!a) return null;
  return { L, a };
}

function isEasy(s) {
  const g = s.split('/').map(x => x.split(''));
  const crates = [];
  g.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'c') crates.push([r, c]); }));
  if (!crates.every(([r, c]) => inLine(g, r, c))) return null;
  const st = easyStats(s);
  if (!st) return null;
  const { a } = st;
  if (a.minPushes < 2 || a.minPushes > 5) return null;
  if (a.routes.length < 2) return null;
  if (a.deadFromStart || a.deadOnShortest) return null;
  const keys = new Set(a.routes.map(S.pushKey));
  if (keys.size < 2) return null;
  return st;
}

module.exports = { isEasy, inLine };

if (require.main === module) {
  const found = new Map(), t0 = Date.now();
  while (found.size < want && Date.now() - t0 < seconds * 1000) {
    const g = [];
    for (let r = 0; r < H; r++) { g.push([]); for (let c = 0; c < W; c++) g[r].push(r === 0 || c === 0 || r === H - 1 || c === W - 1 ? '#' : '.'); }
    const free = () => { for (;;) { const r = 1 + rnd(H - 2), c = 1 + rnd(W - 2); if (g[r][c] === '.') return [r, c]; } };
    const nWalls = rnd(4);
    for (let i = 0; i < nWalls; i++) { const [r, c] = free(); g[r][c] = '#'; }
    const nCrates = 1 + rnd(2);
    let okPlace = true;
    for (let i = 0; i < nCrates && okPlace; i++) {
      // crate with a rune 1 to 3 cells away in a straight line
      const [r, c] = free(), d = [[1, 0], [-1, 0], [0, 1], [0, -1]][rnd(4)], k = 1 + rnd(3);
      const gr = r + d[0] * k, gc = c + d[1] * k;
      if (gr < 1 || gc < 1 || gr > H - 2 || gc > W - 2 || g[gr][gc] !== '.') { okPlace = false; break; }
      g[r][c] = 'c'; g[gr][gc] = 'o';
    }
    if (!okPlace) continue;
    const [pr, pc] = free(); g[pr][pc] = 'p';
    const s = g.map(r => r.join('')).join('/');
    const st = isEasy(s);
    if (!st) continue;
    const k = canon(s);
    if (found.has(k)) continue;
    const { L, a } = st;
    // the two solutions to store: the shortest route, plus a different route of shortest-ish length
    const sorted = a.routes.slice().sort((x, y) => x.length - y.length);
    const first = sorted[0], second = sorted.find(r => S.pushKey(r) !== S.pushKey(first));
    found.set(k, { entry: [s, S.routeToMoves(L, first), S.routeToMoves(L, second)], crates: L.crates.length, min: a.minPushes });
  }
  const all = [...found.values()];
  // keep a mix: about half one-crate, half two-crate levels
  const one = all.filter(x => x.crates === 1), two = all.filter(x => x.crates === 2);
  const pick = [];
  while (pick.length < want && (one.length || two.length)) {
    if (two.length && (pick.length % 2 === 0 || !one.length)) pick.push(two.shift()); else pick.push(one.shift());
  }
  console.error('found', all.length, 'one-crate', all.filter(x => x.crates === 1).length, 'kept', pick.length);
  console.log(JSON.stringify(pick.map(p => p.entry)));
}
