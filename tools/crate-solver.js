// Crate Vault solver used by tools/crate-easy-gen.js and tools/check-easy.js.
// A "route" is a sequence of crate pushes from the start to a solved position that never
// revisits a position (crate cells + warden region) and never passes through a dead position
// (one from which the vault can no longer be solved). Easy levels must have exactly two routes;
// the original bank levels have exactly one.
'use strict';
const D = [[-1, 0, 'U'], [1, 0, 'D'], [0, -1, 'L'], [0, 1, 'R']];

function parse(rowsStr) {
  const rows = rowsStr.split('/');
  const h = rows.length, w = rows[0].length;
  const walls = [], goals = [], crates = [];
  let player = -1;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c], i = r * w + c;
    walls[i] = ch === '#';
    if (ch === 'o' || ch === 'P') goals.push(i);
    if (ch === 'c') crates.push(i);
    if (ch === 'p' || ch === 'P') player = i;
  }
  return { h, w, walls, goals, crates, player };
}

function region(L, crates, p) {
  const set = new Set(crates), seen = new Set([p]), st = [p];
  while (st.length) {
    const x = st.pop();
    for (const [dr, dc] of D) {
      const y = x + dr * L.w + dc;
      if (L.walls[y] || set.has(y) || seen.has(y)) continue;
      seen.add(y); st.push(y);
    }
  }
  return seen;
}

// Returns { routes: [[{from,to}...], ...] (at most cap), states } or null if the space is too big.
function analyze(L, cap) {
  if (cap === undefined) cap = 3;
  const goalSet = new Set(L.goals);
  const nodes = new Map();
  const key = (cr, reg) => cr.slice().sort((a, b) => a - b).join(',') + '|' + Math.min(...reg);
  function node(cr, p) {
    const reg = region(L, cr, p), k = key(cr, reg);
    if (!nodes.has(k)) nodes.set(k, { cr, reg, goal: cr.every(x => goalSet.has(x)), succ: null });
    return k;
  }
  const start = node(L.crates, L.player), q = [start];
  while (q.length) {
    const k = q.pop(), N = nodes.get(k);
    if (N.succ) continue;
    N.succ = [];
    if (N.goal) continue;
    const set = new Set(N.cr);
    for (let i = 0; i < N.cr.length; i++) for (const [dr, dc] of D) {
      const d = dr * L.w + dc, from = N.cr[i] - d, to = N.cr[i] + d;
      if (!N.reg.has(from) || L.walls[to] || set.has(to)) continue;
      const nc = N.cr.slice(); nc[i] = to;
      const k2 = node(nc, N.cr[i]);
      N.succ.push({ k: k2, push: { from: N.cr[i], to } });
      if (!nodes.get(k2).succ) q.push(k2);
    }
    if (nodes.size > 500000) return null;
  }
  const pred = new Map();
  for (const [k, N] of nodes) for (const s of N.succ) {
    if (!pred.has(s.k)) pred.set(s.k, []);
    pred.get(s.k).push(k);
  }
  const alive = new Set(), st = [];
  for (const [k, N] of nodes) if (N.goal) { alive.add(k); st.push(k); }
  while (st.length) {
    const k = st.pop();
    for (const p of pred.get(k) || []) if (!alive.has(p)) { alive.add(p); st.push(p); }
  }
  const routes = [], on = new Set(), path = [];
  function dfs(k) {
    if (routes.length >= cap) return;
    const N = nodes.get(k);
    if (N.goal) { routes.push(path.slice()); return; }
    on.add(k);
    for (const s of N.succ) {
      if (!alive.has(s.k) || on.has(s.k)) continue;
      path.push(s.push); dfs(s.k); path.pop();
      if (routes.length >= cap) break;
    }
    on.delete(k);
  }
  if (alive.has(start)) dfs(start);
  // fewest pushes to solve (BFS over positions)
  let minPushes = -1;
  const dist = new Map([[start, 0]]), bq = [start];
  while (bq.length) {
    const k = bq.shift(), N = nodes.get(k);
    if (N.goal) { minPushes = dist.get(k); break; }
    for (const s of N.succ) if (!dist.has(s.k)) { dist.set(s.k, dist.get(k) + 1); bq.push(s.k); }
  }
  // positions on some shortest solution (distance from start + distance to solved == minPushes)
  const toGoal = new Map(), rq = [];
  for (const [k, N] of nodes) if (N.goal) { toGoal.set(k, 0); rq.push(k); }
  while (rq.length) {
    const k = rq.shift();
    for (const p of pred.get(k) || []) if (!toGoal.has(p)) { toGoal.set(p, toGoal.get(k) + 1); rq.push(p); }
  }
  // traps: pushes that take a still-solvable position to one that can no longer be solved
  let pushes = 0, deadPushes = 0, deadFromStart = 0, deadOnShortest = 0;
  for (const [k, N] of nodes) {
    if (!alive.has(k) || N.goal) continue;
    const onShortest = dist.has(k) && toGoal.has(k) && dist.get(k) + toGoal.get(k) === minPushes;
    for (const s of N.succ) {
      pushes++;
      if (!alive.has(s.k)) {
        deadPushes++;
        if (k === start) deadFromStart++;
        if (onShortest) deadOnShortest++;
      }
    }
  }
  return { routes, states: nodes.size, minPushes, deadPushes, deadFromStart, deadOnShortest, pushes };
}

// Turns a push route into a U/D/L/R move string (shortest walks between pushes).
function routeToMoves(L, route) {
  let crates = L.crates.slice(), p = L.player, out = '';
  for (const { from, to } of route) {
    const d = to - from, behind = from - d;
    const set = new Set(crates), prev = new Map([[p, null]]), q = [p];
    while (q.length && !prev.has(behind)) {
      const x = q.shift();
      for (const [dr, dc, ch] of D) {
        const y = x + dr * L.w + dc;
        if (L.walls[y] || set.has(y) || prev.has(y)) continue;
        prev.set(y, [x, ch]); q.push(y);
      }
    }
    if (!prev.has(behind)) throw new Error('route not walkable');
    let walk = '', x = behind;
    while (prev.get(x)) { walk = prev.get(x)[1] + walk; x = prev.get(x)[0]; }
    out += walk + D.find(([dr, dc]) => dr * L.w + dc === d)[2];
    crates[crates.indexOf(from)] = to;
    p = from;
  }
  return out;
}

// Replays moves with the game rules; returns true when every crate ends on a rune.
function replay(L, moves) {
  let crates = L.crates.slice(), p = L.player;
  for (const ch of moves) {
    const dd = D.find(x => x[2] === ch); if (!dd) return false;
    const d = dd[0] * L.w + dd[1], n = p + d;
    if (L.walls[n]) return false;
    const i = crates.indexOf(n);
    if (i >= 0) { if (L.walls[n + d] || crates.includes(n + d)) return false; crates[i] = n + d; }
    p = n;
  }
  const g = new Set(L.goals);
  return crates.every(c => g.has(c));
}

function pushKey(route) { return route.map(x => x.from + '>' + x.to).sort().join(','); }

module.exports = { parse, analyze, routeToMoves, replay, pushKey };
