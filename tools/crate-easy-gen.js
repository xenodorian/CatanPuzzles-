// Searches for Easy Crate Vault levels (6x7 rooms, 2 crates) with exactly two push routes
// (see tools/crate-solver.js) and prints bank entries [rows, solution, alternate].
// Usage: node tools/crate-easy-gen.js [count=20] [seconds=240]
// The Easy bank in puzzles/crate.js was produced with this script (best 20 of 60 found,
// ranked by shortest-route length so they stay in the same push range as the old Easy set).
'use strict';
const S = require('./crate-solver.js');
const H = 6, W = 7;
const want = +process.argv[2] || 20, seconds = +process.argv[3] || 240;
const rnd = n => Math.floor(Math.random() * n);

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
// smallest of the eight turned/mirrored forms, to skip duplicates
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

const found = new Map(), t0 = Date.now();
while (found.size < want * 3 && Date.now() - t0 < seconds * 1000) {
  const g = [];
  for (let r = 0; r < H; r++) {
    g.push([]);
    for (let c = 0; c < W; c++) {
      const edge = r === 0 || c === 0 || r === H - 1 || c === W - 1;
      g[r].push(edge || Math.random() < 0.18 + Math.random() * 0.15 ? '#' : '.');
    }
  }
  if (!connected(g)) continue;
  const fl = [];
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (g[r][c] === '.') fl.push([r, c]);
  if (fl.length < 9) continue;
  for (let i = fl.length - 1; i > 0; i--) { const j = rnd(i + 1); [fl[i], fl[j]] = [fl[j], fl[i]]; }
  'ccoop'.split('').forEach((ch, i) => { g[fl[i][0]][fl[i][1]] = ch; });
  const s = g.map(r => r.join('')).join('/');
  const L = S.parse(s), a = S.analyze(L, 3);
  if (!a || a.routes.length !== 2) continue;
  const [ra, rb] = a.routes;
  if (Math.min(ra.length, rb.length) < 8) continue;          // not trivially short
  if (S.pushKey(ra) === S.pushKey(rb)) continue;             // not just the same pushes reordered
  const k = canon(s);
  if (found.has(k)) continue;
  const moves = a.routes.map(r => S.routeToMoves(L, r)).sort((x, y) => x.length - y.length);
  found.set(k, { entry: [s, moves[0], moves[1]], min: Math.min(ra.length, rb.length), max: Math.max(ra.length, rb.length) });
}
const best = [...found.values()].sort((x, y) => (y.min - x.min) || (y.max - x.max)).slice(0, want);
console.error('found', found.size, 'kept', best.length);
console.log(JSON.stringify(best.map(b => b.entry)));
