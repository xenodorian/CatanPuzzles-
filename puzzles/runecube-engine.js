/* Rune Cube engine: a 2x2x2 twisty puzzle model plus an optimal solver.
 * Pure logic, no DOM. Used by puzzles/runecube.js and by the Node tests.
 *
 * Model coordinates: x right, y up, z toward the viewer. Faces: U +y, D -y, L -x, R +x, F +z, B -z.
 * A cube is 8 cubies. Each keeps its home position p0, its current position pos and an integer
 * rotation matrix O (row-major, 9 numbers), with pos = O * p0. A face move rotates every cubie in
 * that layer by the same quarter turn.
 */
(function (root) {
  'use strict';

  var FACES = [
    { key: 'U', n: [0, 1, 0] }, { key: 'D', n: [0, -1, 0] },
    { key: 'L', n: [-1, 0, 0] }, { key: 'R', n: [1, 0, 0] },
    { key: 'F', n: [0, 0, 1] }, { key: 'B', n: [0, 0, -1] }
  ];
  // One Elder Futhark rune per face. Order matches FACES.
  var RUNES = [
    { ch: '\u16C9', name: 'Algiz' },     // U
    { ch: '\u16DF', name: 'Othala' },    // D
    { ch: '\u16A0', name: 'Fehu' },      // L
    { ch: '\u16A2', name: 'Uruz' },      // R
    { ch: '\u16A6', name: 'Thurisaz' },  // F
    { ch: '\u16CF', name: 'Tiwaz' }      // B
  ];
  var MOVE_NAMES = [];
  FACES.forEach(function (f) { MOVE_NAMES.push(f.key, f.key + "'"); });

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function mulMV(M, v) {
    return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  }
  function mulMM(A, B) {
    var C = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return C;
  }
  function transpose(M) { return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]; }
  var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // Right-handed quarter rotation about principal axis a (0 x, 1 y, 2 z) by q * 90 degrees (q = +1 or -1).
  function axisRot(a, q) {
    if (a === 0) return [1, 0, 0, 0, 0, -q, 0, q, 0];
    if (a === 1) return [0, 0, q, 0, 1, 0, -q, 0, 0];
    return [0, -q, 0, q, 0, 0, 0, 0, 1];
  }
  function axisOf(n) { return n[0] ? 0 : n[1] ? 1 : 2; }
  function signOf(n) { return n[0] + n[1] + n[2]; }
  // Move m = face * 2 + prime. Clockwise (seen from outside the face) = -90 degrees about the outward normal.
  function moveInfo(m) {
    var f = FACES[m >> 1], prime = m & 1, q = prime ? 1 : -1; // rotation about the outward normal
    var a = axisOf(f.n), s = signOf(f.n);
    return { face: m >> 1, n: f.n, axis: a, q: q * s, R: axisRot(a, q * s), angleAboutNormal: q * 90 };
  }
  function inverse(m) { return m ^ 1; }
  function parseMove(str) {
    var i = MOVE_NAMES.indexOf(String(str).replace('\u2019', "'"));
    return i;
  }

  var HOME = [];
  (function () {
    for (var x = -1; x <= 1; x += 2) for (var y = -1; y <= 1; y += 2) for (var z = -1; z <= 1; z += 2) HOME.push([x, y, z]);
  })();

  function solvedCube() {
    return HOME.map(function (p, i) { return { id: i, p0: p.slice(), pos: p.slice(), O: I3.slice() }; });
  }
  function cloneCube(c) { return c.map(function (q) { return { id: q.id, p0: q.p0, pos: q.pos.slice(), O: q.O.slice() }; }); }
  function applyMove(cube, m) {
    var mi = moveInfo(m);
    for (var i = 0; i < cube.length; i++) {
      var q = cube[i];
      if (dot(q.pos, mi.n) > 0) { q.pos = mulMV(mi.R, q.pos); q.O = mulMM(mi.R, q.O); }
    }
    return cube;
  }
  function applyMoves(cube, list) { for (var i = 0; i < list.length; i++) applyMove(cube, list[i]); return cube; }
  function sameVec(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
  // Which home face (0..5) is showing on world face fi of cubie q, or -1.
  function faceShowing(q, fi) {
    var n = FACES[fi].n;
    if (dot(q.pos, n) <= 0) return -1;
    var Ot = transpose(q.O), local = mulMV(Ot, n);
    for (var j = 0; j < 6; j++) if (sameVec(FACES[j].n, local)) return dot(q.p0, local) > 0 ? j : -1;
    return -1;
  }
  // 24 stickers: for each face in FACES order, its 4 squares sorted by position. Values are home-face indices (runes).
  function stickers(cube) {
    var out = [];
    for (var fi = 0; fi < 6; fi++) {
      var slots = cube.filter(function (q) { return dot(q.pos, FACES[fi].n) > 0; });
      slots.sort(function (a, b) { return (a.pos[0] - b.pos[0]) * 9 + (a.pos[1] - b.pos[1]) * 3 + (a.pos[2] - b.pos[2]); });
      for (var k = 0; k < slots.length; k++) out.push(faceShowing(slots[k], fi));
    }
    return out;
  }
  // Solved means every face shows one rune, whichever way the whole cube is held.
  function isSolved(cube) {
    var s = stickers(cube);
    for (var f = 0; f < 6; f++) for (var k = 1; k < 4; k++) if (s[f * 4 + k] !== s[f * 4]) return false;
    return true;
  }

  /* ---------- scrambles ---------- */
  // Random quarter turns with no immediate undo and no three equal turns in a row.
  function scramble(len, rnd) {
    rnd = rnd || Math.random;
    var out = [];
    while (out.length < len) {
      var m = Math.floor(rnd() * 12);
      var k = out.length;
      if (k && out[k - 1] === inverse(m)) continue;
      if (k >= 2 && out[k - 1] === m && out[k - 2] === m) continue;
      out.push(m);
    }
    return out;
  }

  /* ---------- optimal solver (quarter-turn metric) ----------
   * The cube is re-expressed so the cubie that started at D-L-B sits home, then solved with
   * U, R and F turns only (they never move that corner) using a full distance table over the
   * 7! * 3^6 = 3,674,160 positions. Moves are translated back to the player's frame.
   */
  var FIXED = 0; // HOME[0] = (-1,-1,-1): the D-L-B corner
  var SLOTS = HOME.slice(1); // 7 slots that move
  // Corner faces in a fixed chirality: the y face first, then the other two with triple product +1.
  function slotFaces(p) {
    var n0 = [0, p[1], 0], a = [p[0], 0, 0], b = [0, 0, p[2]];
    var cr = [n0[1] * a[2] - n0[2] * a[1], n0[2] * a[0] - n0[0] * a[2], n0[0] * a[1] - n0[1] * a[0]];
    return dot(cr, b) > 0 ? [n0, a, b] : [n0, b, a];
  }
  var SLOT_FACES = HOME.map(slotFaces);
  function slotIndex(p) { for (var i = 0; i < 8; i++) if (sameVec(HOME[i], p)) return i; return -1; }
  // Coordinates of a cube whose fixed corner is home: cp (permutation of 7) and co (twists of 7).
  function cubieCoords(cube) {
    var cp = new Array(7), co = new Array(7);
    for (var i = 0; i < cube.length; i++) {
      var q = cube[i];
      if (q.id === FIXED) continue;
      var slot = slotIndex(q.pos) - 1;
      cp[slot] = q.id - 1;
      var w = mulMV(q.O, [0, q.p0[1], 0]); // where its home U/D sticker now points
      var fs = SLOT_FACES[slot + 1];
      co[slot] = sameVec(fs[0], w) ? 0 : sameVec(fs[1], w) ? 1 : 2;
    }
    return { cp: cp, co: co };
  }
  function normalize(cube) {
    // Whole-cube rotation G = O^T of the fixed cubie brings it home.
    var fixed = cube.filter(function (q) { return q.id === FIXED; })[0];
    var G = transpose(fixed.O);
    var c2 = cube.map(function (q) { return { id: q.id, p0: q.p0, pos: mulMV(G, q.pos), O: mulMM(G, q.O) }; });
    return { cube: c2, O: fixed.O };
  }
  var FACT = [1, 1, 2, 6, 24, 120, 720, 5040];
  function permRank(p) {
    var n = p.length, r = 0;
    for (var i = 0; i < n; i++) { var c = 0; for (var j = i + 1; j < n; j++) if (p[j] < p[i]) c++; r += c * FACT[n - 1 - i]; }
    return r;
  }
  function permUnrank(r, n) {
    var items = []; for (var i = 0; i < n; i++) items.push(i);
    var out = [];
    for (i = 0; i < n; i++) { var f = FACT[n - 1 - i], k = Math.floor(r / f); r %= f; out.push(items.splice(k, 1)[0]); }
    return out;
  }
  function twistRank(co) { var r = 0; for (var i = 0; i < 6; i++) r = r * 3 + co[i]; return r; }
  function twistUnrank(r) {
    var co = new Array(7), s = 0;
    for (var i = 5; i >= 0; i--) { co[i] = r % 3; r = (r / 3) | 0; s += co[i]; }
    co[6] = (3 - s % 3) % 3; return co;
  }
  var SOLVER_MOVES = [0, 1, 6, 7, 8, 9]; // U U' R R' F F'
  var tables = null;
  function cubieMove(m) {
    // The move as a cubie-level permutation and twist, read off a solved cube.
    var c = applyMove(solvedCube(), m), k = cubieCoords(c);
    return k;
  }
  function multiply(a, mv) {
    var cp = new Array(7), co = new Array(7);
    for (var i = 0; i < 7; i++) { cp[i] = a.cp[mv.cp[i]]; co[i] = (a.co[mv.cp[i]] + mv.co[i]) % 3; }
    return { cp: cp, co: co };
  }
  function buildTables() {
    if (tables) return tables;
    var NP = 5040, NT = 729, k, j;
    var mv = SOLVER_MOVES.map(cubieMove);
    var pMove = new Uint16Array(NP * 6), tMove = new Uint16Array(NT * 6);
    var id7 = [0, 0, 0, 0, 0, 0, 0];
    for (k = 0; k < NP; k++) {
      var p = permUnrank(k, 7);
      for (j = 0; j < 6; j++) pMove[k * 6 + j] = permRank(multiply({ cp: p, co: id7 }, mv[j]).cp);
    }
    var ident = [0, 1, 2, 3, 4, 5, 6];
    for (k = 0; k < NT; k++) {
      var t = twistUnrank(k);
      for (j = 0; j < 6; j++) tMove[k * 6 + j] = twistRank(multiply({ cp: ident, co: t }, mv[j]).co);
    }
    var N = NP * NT, dist = new Uint8Array(N).fill(255), frontier = new Uint32Array(N), head = 0, tail = 0;
    dist[0] = 0; frontier[tail++] = 0;
    while (head < tail) {
      var s = frontier[head++], pp = (s / NT) | 0, tt = s - pp * NT, d = dist[s] + 1;
      for (j = 0; j < 6; j++) {
        var ns = pMove[pp * 6 + j] * NT + tMove[tt * 6 + j];
        if (dist[ns] === 255) { dist[ns] = d; frontier[tail++] = ns; }
      }
    }
    tables = { pMove: pMove, tMove: tMove, dist: dist, NT: NT };
    return tables;
  }
  function stateIndex(k) { return permRank(k.cp) * 729 + twistRank(k.co); }
  // Optimal solution (array of moves in the player's frame). Builds the table on first use (about a second).
  function solve(cube) {
    var T = buildTables(), nz = normalize(cube), k = cubieCoords(nz.cube), s = stateIndex(k), out = [];
    var NT = T.NT;
    while (T.dist[s] > 0) {
      var pp = (s / NT) | 0, tt = s - pp * NT, found = -1;
      for (var j = 0; j < 6; j++) {
        var ns = T.pMove[pp * 6 + j] * NT + T.tMove[tt * 6 + j];
        if (T.dist[ns] === T.dist[s] - 1) { found = j; s = ns; break; }
      }
      if (found < 0) throw new Error('solver table inconsistent');
      out.push(SOLVER_MOVES[found]);
    }
    // translate canonical moves back: canonical face normal n -> player face normal O * n, same turning sense
    return out.map(function (m) {
      var n = mulMV(nz.O, FACES[m >> 1].n), f = -1;
      for (var i = 0; i < 6; i++) if (sameVec(FACES[i].n, n)) f = i;
      return f * 2 + (m & 1);
    });
  }
  function distance(cube) { var T = buildTables(); return T.dist[stateIndex(cubieCoords(normalize(cube).cube))]; }

  var api = {
    FACES: FACES, RUNES: RUNES, MOVE_NAMES: MOVE_NAMES, HOME: HOME,
    solvedCube: solvedCube, cloneCube: cloneCube, applyMove: applyMove, applyMoves: applyMoves, moveInfo: moveInfo,
    inverse: inverse, parseMove: parseMove, stickers: stickers, isSolved: isSolved, faceShowing: faceShowing,
    scramble: scramble, solve: solve, distance: distance, buildTables: buildTables,
    _internal: { cubieCoords: cubieCoords, normalize: normalize, multiply: multiply, cubieMove: cubieMove, SOLVER_MOVES: SOLVER_MOVES,
      permRank: permRank, permUnrank: permUnrank, twistRank: twistRank, twistUnrank: twistUnrank, mulMV: mulMV, mulMM: mulMM, transpose: transpose }
  };
  root.RuneCubeEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
