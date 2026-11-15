#!/usr/bin/env node
/* Engine tests for Conjurer's Chess reserve / illusion / vanish rules. */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'conjurer-chess.html'), 'utf8');
const m = html.match(/<script id="engine-src">([\s\S]*?)<\/script>/);
if (!m) throw new Error('engine-src not found in conjurer-chess.html');
const tmp = path.join('/tmp', 'conjurer-std-engine.js');
fs.writeFileSync(tmp, m[1]);
const DC = require(tmp);

let failed = 0, passed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ok  ' + msg); }
  else { failed++; console.log('  FAIL  ' + msg); }
}

function sq(name) { return DC.parseSq(name); }
function play(st, pred, label) {
  const legal = DC.legalMoves(st);
  const hit = legal.map(function (mv) { return DC.toObj(mv); }).find(pred);
  if (!hit) {
    ok(false, 'no move for ' + label + ' (turn ' + st.turn + ')');
    throw new Error('missing move: ' + label);
  }
  DC.make(st, hit.m);
  return hit;
}
function objs(st) {
  return DC.legalMoves(st).map(function (mv) { return DC.toObj(mv); });
}
function has(st, pred) {
  return objs(st).some(pred);
}
function res(st, side, typ) { return DC.resOf(st, side)[typ] || 0; }
function quiet(st) {
  return play(st, function (o) {
    return !o.summon && !o.illusionAct && !o.reveal && !o.capture && !o.promo;
  }, (st.turn > 0 ? 'white' : 'black') + ' quiet king move');
}
function passTo(st, side) {
  var n = 0;
  while (st.turn !== side && n++ < 6) quiet(st);
  ok(st.turn === side, 'pass to ' + (side > 0 ? 'white' : 'black'));
}
function dropPiece(st, name, piece, illusion) {
  var s = sq(name);
  st.board[s] = piece;
  st.illusion[s] = illusion ? 1 : 0;
  st.revealed[s] = illusion ? 0 : 2;
  st.paralyzed[s] = 0;
  st.unmoved[s] = 0;
  DC.refresh(st);
  return s;
}

console.log('reserve and illusion limits');
(function () {
  const st = DC.newGame();
  ok(res(st, 1, DC.P) === 8 && res(st, 1, DC.N) === 2 && res(st, 1, DC.B) === 2 &&
     res(st, 1, DC.R) === 2 && res(st, 1, DC.Q) === 1, 'white reserve starts at 8/2/2/2/1');
  ok(res(st, -1, DC.R) === 2 && res(st, -1, DC.Q) === 1, 'black reserve starts independently');

  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('a1'); }, 'weave rook a1');
  ok(res(st, 1, DC.R) === 1, 'weaving a rook illusion spends a rook reserve slot');
  ok(st.board[sq('a1')] === DC.R && st.illusion[sq('a1')] === 1, 'rook illusion is on a1');
  ok(res(st, -1, DC.R) === 2, 'black rook reserve is unchanged');

  quiet(st);
  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('h1'); }, 'weave rook h1');
  ok(res(st, 1, DC.R) === 0, 'second rook illusion empties the rook reserve');
  quiet(st);
  ok(st.turn === 1, 'white to move to check remaining rook placements');
  ok(!has(st, function (o) { return (o.illusionAct || o.summon) && o.typ === DC.R; }),
    'cannot summon or weave a third rook');
  ok(has(st, function (o) { return o.illusionAct && o.typ === DC.B; }),
    'can still weave a bishop while rook reserve is empty');
})();

console.log('shared pool: summon + illusion of the same type');
(function () {
  const st = DC.newGame();
  play(st, function (o) { return o.summon && o.typ === DC.R && o.to === sq('a1'); }, 'summon rook a1');
  ok(res(st, 1, DC.R) === 1, 'summon spends a rook');
  ok(st.illusion[sq('a1')] === 0, 'summoned rook is real');
  quiet(st);
  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('h1'); }, 'weave rook h1');
  ok(res(st, 1, DC.R) === 0, 'illusion spends the last rook slot');
  quiet(st);
  ok(!has(st, function (o) { return (o.illusionAct || o.summon) && o.typ === DC.R; }),
    'no more rook summons or illusions');
})();

console.log('vanish returns the illusion slot to reserve; then a new weave succeeds');
(function () {
  const st = DC.newGame();
  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('a1'); }, 'weave rook a1');
  quiet(st);
  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('h1'); }, 'weave rook h1');
  ok(res(st, 1, DC.R) === 0, 'rook reserve empty after two weaves');
  ok(st.turn === -1, 'black to move after second weave');
  dropPiece(st, 'c2', -DC.N, false);
  play(st, function (o) { return o.capture && o.from === sq('c2') && o.to === sq('a1'); },
    'black knight captures the a1 illusion');
  ok(st.board[sq('a1')] === 0, 'illusion on a1 vanished');
  ok(st.board[sq('c2')] === -DC.N && st.paralyzed[sq('c2')], 'attacker stayed on c2 and is paralyzed');
  ok(res(st, 1, DC.R) === 1, 'vanished rook illusion returns a rook to white reserve');
  ok(has(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('a1'); }),
    'white can weave a rook again after the vanish');
  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('a1'); }, 're-weave rook a1');
  ok(res(st, 1, DC.R) === 0, 're-weaving spends the returned slot');
  ok(st.illusion[sq('a1')] === 1 && st.illusion[sq('h1')] === 1, 'two rook illusions on the board again');
})();

console.log('captured real piece does not return to reserve');
(function () {
  const st = DC.newGame();
  play(st, function (o) { return o.summon && o.typ === DC.R && o.to === sq('a1'); }, 'summon rook a1');
  quiet(st);
  play(st, function (o) { return o.summon && o.typ === DC.R && o.to === sq('h1'); }, 'summon rook h1');
  ok(res(st, 1, DC.R) === 0, 'both real rooks summoned');
  dropPiece(st, 'c2', -DC.N, false);
  play(st, function (o) { return o.capture && o.from === sq('c2') && o.to === sq('a1'); },
    'black knight captures real rook');
  ok(st.board[sq('a1')] === -DC.N, 'real capture: knight occupies a1');
  ok(res(st, 1, DC.R) === 0, 'captured real rook does not return to reserve');
  passTo(st, 1);
  ok(!has(st, function (o) { return (o.illusionAct || o.summon) && o.typ === DC.R; }),
    'still cannot place a third rook');
})();

console.log('queen limit is 1, shared; both sides independent');
(function () {
  const st = DC.newGame();
  play(st, function (o) { return o.illusionAct && o.typ === DC.Q && o.to === sq('d1'); }, 'white weaves queen');
  ok(res(st, 1, DC.Q) === 0, 'white queen reserve empty');
  quiet(st);
  ok(st.turn === 1, 'white to move');
  ok(!has(st, function (o) { return (o.illusionAct || o.summon) && o.typ === DC.Q; }),
    'white cannot place a second queen');
  // give the turn to black via a non-queen white move, then black weaves
  play(st, function (o) { return o.illusionAct && o.typ === DC.R && o.to === sq('a1'); }, 'white weaves rook so black can move');
  ok(has(st, function (o) { return o.illusionAct && o.typ === DC.Q && o.to === sq('d8'); }),
    'black can still weave a queen');
  play(st, function (o) { return o.illusionAct && o.typ === DC.Q && o.to === sq('d8'); }, 'black weaves queen');
  ok(res(st, -1, DC.Q) === 0 && res(st, 1, DC.Q) === 0, 'each side spent only its own queen');
})();

console.log('unmake restores reserve after a weave and after a vanish');
(function () {
  const st = DC.newGame();
  const weave = objs(st).find(function (o) {
    return o.illusionAct && o.typ === DC.R && o.to === sq('a1');
  });
  DC.make(st, weave.m);
  ok(res(st, 1, DC.R) === 1, 'after weave, reserve is 1');
  DC.unmake(st, weave.m);
  ok(res(st, 1, DC.R) === 2, 'unmake of weave restores reserve to 2');
  ok(st.board[sq('a1')] === 0 && st.illusion[sq('a1')] === 0, 'unmake clears the illusion');

  DC.make(st, weave.m);
  ok(st.turn === -1, 'black to move after weave');
  dropPiece(st, 'c2', -DC.N, false);
  const cap = objs(st).find(function (o) {
    return o.capture && o.from === sq('c2') && o.to === sq('a1');
  });
  ok(!!cap, 'capture of illusion is legal');
  const before = res(st, 1, DC.R);
  DC.make(st, cap.m);
  ok(res(st, 1, DC.R) === before + 1, 'vanish increments reserve');
  DC.unmake(st, cap.m);
  ok(res(st, 1, DC.R) === before, 'unmake of vanish restores reserve');
  ok(st.illusion[sq('a1')] === 1 && st.board[sq('a1')] === DC.R, 'illusion is back after unmake');
})();

console.log('pawn limit 8: 8 weaves, ninth refused');
(function () {
  const st = DC.newGame();
  const files = 'abcdefgh';
  for (var i = 0; i < 8; i++) {
    passTo(st, 1);
    play(st, function (o) { return o.illusionAct && o.typ === DC.P && o.to === sq(files[i] + '2'); },
      'weave pawn ' + files[i] + '2');
  }
  ok(res(st, 1, DC.P) === 0, 'all 8 pawn slots used');
  passTo(st, 1);
  ok(!has(st, function (o) { return (o.illusionAct || o.summon) && o.typ === DC.P; }),
    'cannot place a ninth pawn');
})();

console.log((passed + failed) + ' tests, ' + failed + ' failed, ' + passed + ' passed');
process.exit(failed ? 1 : 0);
