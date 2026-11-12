/* Crate Vault: a generic crate-pushing puzzle. Self-contained, no libraries, no network.
   Levels come from a searched bank of tight rooms and are verified by replay before use. */
(function () {
  'use strict';

  var DIRS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
  var ORDER = ['U', 'D', 'L', 'R'];
  var OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };
  var KEYS = {
    ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
    w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R'
  };
  var DIFFS = [[2, 'Easy'], [3, 'Medium 3'], [4, 'Hard 4'], [5, 'Very Hard 5']];
  var WARDEN = '<span class="cv-warden"><svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="6" r="4.5"/><path d="M4 23 L6.5 13 Q12 9 17.5 13 L20 23 Z"/></svg></span>';

  /* ---------- pure helpers ---------- */

  function rint(n) { return Math.floor(Math.random() * n); }
  function cell(p) { return [p[0], p[1]]; }
  function cloneCells(list) { return list.map(cell); }
  function indexAt(list, r, c) {
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] === r && list[i][1] === c) return i;
    }
    return -1;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = rint(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function isWall(level, r, c) {
    if (r < 0 || c < 0 || r >= level.h || c >= level.w) return true;
    return level.walls[r][c] === true;
  }
  function isSolvedCrates(level, crates) {
    if (crates.length !== level.goals.length) return false;
    for (var i = 0; i < crates.length; i++) {
      if (indexAt(level.goals, crates[i][0], crates[i][1]) < 0) return false;
    }
    return true;
  }
  function floorConnected(walls, h, w) {
    var total = 0, start = null, r, c;
    for (r = 1; r < h - 1; r++) {
      for (c = 1; c < w - 1; c++) {
        if (!walls[r][c]) { total++; if (!start) start = [r, c]; }
      }
    }
    if (!start) return false;
    var seen = {}, queue = [start], reached = 0;
    seen[start[0] * w + start[1]] = true;
    while (queue.length) {
      var p = queue.pop();
      reached++;
      for (var j = 0; j < 4; j++) {
        var d = DIRS[ORDER[j]];
        var nr = p[0] + d[0], nc = p[1] + d[1], key = nr * w + nc;
        if (!walls[nr][nc] && !seen[key]) { seen[key] = true; queue.push([nr, nc]); }
      }
    }
    return reached === total;
  }

  /* One forward move. Returns the new {crates, player} or null when illegal. */
  function stepState(level, st, ch) {
    var d = DIRS[ch];
    if (!d) return null;
    var nr = st.player[0] + d[0], nc = st.player[1] + d[1];
    if (isWall(level, nr, nc)) return null;
    var crates = cloneCells(st.crates);
    var idx = indexAt(crates, nr, nc);
    if (idx >= 0) {
      var br = nr + d[0], bc = nc + d[1];
      if (isWall(level, br, bc) || indexAt(crates, br, bc) >= 0) return null;
      crates[idx] = [br, bc];
    }
    return { crates: crates, player: [nr, nc] };
  }

  /* Replays a move string from the level start. Stops at the first illegal move. */
  function applyMoves(level, moves) {
    var st = { crates: cloneCells(level.crates), player: cell(level.player) };
    var s = String(moves == null ? '' : moves).toUpperCase();
    var legal = true;
    for (var i = 0; i < s.length; i++) {
      var next = stepState(level, st, s.charAt(i));
      if (!next) { legal = false; break; }
      st = next;
    }
    return {
      solved: isSolvedCrates(level, st.crates),
      crates: st.crates,
      player: st.player,
      legal: legal
    };
  }

  /* ---------- levels ---------- */

  /*
   * Levels come from a bank found by an offline exhaustive search. Each one sits on a small
   * floor and is solvable. Medium and harder levels have exactly one push route that never
   * revisits a position: any other push either leads to a dead end or has to be taken back.
   * Easy levels (bank key 2) have 2 crates and need 9 to 12 pushes like the old Easy set, but
   * have at least two such routes and are chosen to be forgiving: no push from the start can jam
   * the vault, and few pushes anywhere can. They carry two solutions ([rows, solution,
   * alternate]); see tools/crate-easy-gen.js and tools/check-easy.js.
   * A level is shown in one of eight mirrored or turned forms. Rows use: # wall, . floor,
   * o rune, c crate, p warden, P warden standing on a rune.
   */
  var BANK = {"2":[["#######/#....o#/#..#.##/##c#cp#/#o....#/#######","DLLLUULURRRDDRDLLL","DLLLUULURRLDDDRRUDLLUUURRDDRDLLL"],["#######/#o...o#/#..#..#/##cc..#/##.p###/#######","LUULURRRDDLDLUUDRRUULL","LUULURRLDDRLUURRDRDLLDLUUDRRUULL"],["#######/#...#p#/#...co#/#.c####/#....o#/#######","DLLULLDRRRLLDLDRRR","DLLULLDRRLLDDRULUURRDRLULDDLDRRR"],["#######/#...oo#/#.c#..#/##pc..#/#...###/#######","ULURRRDDLDLUULURR","ULURRLDDRLUURRDRDLLDLUULURR"],["#######/#op...#/#.##..#/#.c.c##/###..o#/#######","LDDRLUURRRDDUULLLDDRRDRUURULLL","LDDRLUURRRDDLDRUUULLLDDRRDRUURULLL"],["#######/#.o.p.#/#.##c.#/#.c..##/#.#..o#/#######","DDLDRUUULLLDDRRDRUURULL","DULLLDDRLUURRRDDLDRUUULLLDDRRDRUURULL"],["#######/#oc...#/#.pc#.#/###...#/#o....#/#######","LURRDDRRUULLLDRDRDLL","LURRDDRRUULLDDRDLUULLURDRDDLRURRUULLL"],["#######/#...oo#/#..####/##cc..#/#....p#/#######","LLLUULURRRLLDDDRRULDLUULURR","LLLUULURRLDDRLUURRLLDDDRRRULLDLUULURR"],["#######/#o#..o#/#....c#/#.c#..#/##p#..#/#######","ULURRURRDLDDRUULLLDLU","ULURRURRDLDDRULULURRDLLLRRDDRUULLLDLU"],["#######/#.#...#/#.pc#.#/#.c...#/#o#..o#/#######","LDRRDRRULLLRRRUULLDLDRRLUURRDDLLULLD","LDRRDRRULLLRRRUULLDURRDDLLULLDRRRLUURRDD"],["#######/#o#...#/#p.c..#/#..c#.#/###..o#/#######","RRURRDLLLDLURRRRDDLLULURRURDD","RRURRDLLLRRRDDLLUDRRUULLDLLURRRURDD"],["#######/##..#o#/#...c.#/#..#..#/#..cpo#/#######","URULLULDLDDRULURRRDRULLLDDRR","URULLULDLDDRULURRRDDLRURULLLDLDRRR"],["#######/##..oo#/#...###/#.cc..#/###.p.#/#######","LUULLDRRDRRULDLULUURRLLDDRULUR","LUULLDRRDRRULDLULUURDLDRUURLDDDRRULDLUULUR"],["#######/#o#..p#/#..cc.#/#.#.#.#/#...#o#/#######","LLDRLLLDDRRUDLLUURRURRDLLLRDDLLUURRRRD","LLDRLLLDDRRUDLLUURRURRDLULDRRDULLLLDDRRUDLLUURRURRDLLLRDDLLUU"],["#######/#oo...#/####..#/#pc.c.#/##...##/#######","RDRRUUDDLLURDRURUULLLRRRDDLURULL","RDRRUUDDLLURDRURUULDRDLUULRDDDLLURDRURUULLLRRRDDLURULL"],["#######/#.o#..#/#..#cp#/#...c.#/#...#o#/#######","DLLDLURRRUULDRDLLDLLURRRURDLLLU","DLLDLURRRUULDRDLLDLLURRRLLLUURDLDDRRURURDLLDLUU"],["#######/##p#..#/#oc#..#/#..c..#/#.o...#/#######","DDRDRULLLDRURRRUULDRDLLLDLURRRDL","DDRDRULLLDRRURRUULDRDDLRULLLDLURRRDL"],["#######/#..#op#/#..#c##/#..c..#/#.o...#/#######","LDDLDLURRRDLLULLUURDLDRRDRUU","LDDLDLURRRDLLULLUURDLDRRDRULLLDRURRUDDL"],["#######/###p..#/#o.#c.#/#...c.#/#o...##/#######","RRDDLLDLLUURDLDRURRRUULDRDLLLDLURRRDLL","RRDDLLRRUULDRDLDLLLUURDRDRULLLDRURRRUULDRDLLLDLURRRDLL"],["#######/#o.#..#/#..c..#/#.c...#/##p#o.#/#######","ULUURDRDRRUULDLLLDRURRRDDLURULLLDLUDRRURD","ULUURDRDRRUULDLLLDRURRRDDLURULLLDRURRDDLULLLUDRRRRUULDD"]],"3":[["#######/#..#p##/#..#co#/#cc...#/#o...o#/#######","DRDDLLLLURUULDDRDRRRUULDLDLURRRDLULLLUURDLDRRRDRULLLDRR"],["#######/#..o.o#/#..#cc#/##..c.#/#.p.#o#/#######","UUURRRDDLLDLUULURRRDRDLLDLUULUR"],["#######/#..##.#/#..#.o#/#cc.c.#/#op..o#/#######","LURUULDDRDRRRUULDLDLURRRDLULLLUURDLDRRRDRULLLDRR"],["#######/##P#..#/#occ..#/#...c.#/#.#o..#/#######","DRDDRRULRUULDLDULLDRURRRDDLURULLLDRURRDDLURULLDLU"],["#######/#.#...#/#op#..#/#.c.cc#/#o...o#/#######","LDDRRRRULUURDDLDLLLUURDRDRULLLDRURRRUULDRDLLLDLURRRDLL"],["#######/#o.p.o#/#.c.cc#/#o.#..#/###...#/#######","RRDLDDRUULULLLDDRURURDLLLURDRRRDDLURULLLULDRRRULL"],["#######/#o#...#/#.cp.##/#cc#..#/#o.o..#/#######","RDDLLLUURRURDDRDLLLULURRURDDRDL"],["#######/###o..#/#.cc..#/#oc...#/#po#..#/#######","URRURRDDLULLLURDRRRUULDRDLLLURDRRUULDRDLLULD"],["#######/#oo#..#/#o.cc.#/#...cp#/##.#..#/#######","LRUULDLLDLURRRRDDLURULLLDRURRDDLURULLDLU"],["#######/#..#P.#/#..c.o#/#.c.c.#/#..o###/#######","DLDDLLURLUURDRDURRDLULLLDDRULURRRDLULLDDRULURRDRU"],["#######/#..#o.#/#..c.##/#..cco#/#.#p.o#/#######","RUULRDDLULLUURDLDRRRULDLLUURDLDRRURDLDR"],["#######/##.o#o#/##c.co#/#...cp#/#...###/#######","LLURDRUDLLDLLURRUULDRDDLLURDRUURRDLULLDDRULURR"],["#######/#o.o.o#/#...cc#/#.c#..#/##p#..#/#######","ULUURRRRDLDDRUULULLLDDRURURDLLLURDRRRDDLURULLLDLU"],["#######/#o..#p#/#.#cc.#/#...co#/#...o##/#######","DDLLDLLUUURRDDUULLDDDRRURRULDLDLLURRRLLLUURRDRDLLDLUU"],["#######/#o.#..#/#.c.c.#/#oo.cp#/##..#.#/#######","LLULRDDLULURDRRRUULDRDLLLURDRRUULDRDLL"],["#######/#..#oo#/#.cc.o#/#.c...#/#.p#.##/#######","LURLUURDRRDRULLLLDDRULURRRDLULLDDRULURRDRU"],["#######/#.p#.o#/#..#.o#/#.c.cc#/##...o#/#######","DLDRDRRRUULDLDLURRRDLULLLUURDLDRRRDRULLLDRR"],["#######/#...#.#/#...cp#/##c.co#/##.o#o#/#######","LLDRURDULLULLDRRDDLURUULLDRURDDRRULDLLUURDLDRR"],["#######/##p#..#/#oc#..#/#...cc#/#..o.o#/#######","DLDDRRRRULUURDDLDLLLUURDRDRULLLDRURRRUULDRDLLLDLU"],["#######/##...o#/#.c.cc#/#p.#.o#/#...#o#/#######","URURRRDDLULULDRRRULDLLLDDRULURRRURDLLLURR"]],"4":[["#######/#.#..o#/#..c#p#/#occ..#/#oo.c.#/#######","DDLLLURDRRUUULLDDUURRDDDLLULLURDRDRRULLLRRRUULLDLDRRDRUU"],["#######/##..o##/#pc.oo#/#.cc#.#/#oc...#/#######","DDRRUUDDLLUURURDRRDDLLLULURRRLLDDRULUR"],["#######/##o.cP#/#..cc.#/#...#c#/#..o.o#/#######","LLDLDDRRRUULLDURRDDLLULLURDRDRRUULULDLDLDRRRLLUURD"],["#######/#o.o..#/#c#...#/#.cc..#/#Pc.o##/#######","RRURUULLLDDRRUDLLUURRDRRDLULULLDDRDRURURULLLRRDDLU"],["#######/#..##o#/#o.oc.#/#.c.cc#/#o.#.p#/#######","UULLLULDDRURRRDDLURULLLDRURRDDLURUL"],["#######/#P.#.o#/#cc.c.#/#.c..o#/#o#..##/#######","DDRRURLDDRURULDLLLUURDLDRRRULLDLU"],["#######/#o##p.#/#.c.cc#/#o.oc.#/#..#.o#/#######","RDDLLLDLUURDRRRUULDRDLLLURDRRUULDRDL"],["#######/#o..c.#/#occ..#/##p#c.#/#oo..##/#######","DRRURUULLLDDUURRRDDLDLLUUURRDLLDDRRURULLULDD"],["#######/#oc...#/#.cc#.#/#pco.o#/##..o##/#######","UURRDDUULLDDRDRURRUULLLDLDRRRLLUURD"],["#######/#..##o#/#o..c.#/#.c.cc#/#o.#.P#/#######","UULLLULDDRURRRDDLURULLLDRRURD"],["#######/#o..co#/#.ccco#/#...#.#/#o.##p#/#######","UUULLLDLDDRURURLDLLURURRDLULDRDLULD"],["#######/#P#o..#/#ccoc##/#.c...#/#o#...#/#######","DDRRULDLUDRRDRRULLUURDLDDRRULDLUULLDRURRDDLU"],["#######/##..#.#/#o..c.#/#.ccc.#/#o#P.o#/#######","RRUULLDLRUULDLDRURRRDDLURULLLDRRURD"],["#######/#pc.oo#/#.#cc##/##.c.o#/#o....#/#######","RRRDDRDLLLURRUULDRDDLLURDRUU"],["#######/#o..c.#/#cc.#.#/#..coo#/#o..#p#/#######","ULLUULLDDRDRURRUULLLDLDRRRLLUURDLDR"],["#######/#.c.o.#/#pcc#.#/##c...#/##oo#o#/#######","URRDDUULLDRDRRRUULLDLDRRLUURRDDLLULLURR"],["#######/#o..#.#/#pcc..#/##.c.o#/##ooc.#/#######","URDDRLUURDRRDDLURULLULLDRDRRULDLURUL"],["#######/##o..o#/#..cc.#/#oc.p##/#.co.##/#######","URULLDLLDDRULURRURRDLDLLURDRULUR"],["#######/#...#.#/#p#c..#/#.occo#/#.c.oo#/#######","DDRRRULDLLUUURRDDUULLDDDRRURRULDLDLLURRRLLLUURRDRDL"],["#######/#o.#po#/#o#.c.#/#cc.c.#/#o...##/#######","RDDLDLLLUUDDRRRURUULDLDLDLURRURRDLDLLURDRULURDRU"]],"5":[["#######/#..o#o#/#c..co#/#oc.c.#/#o.c#p#/#....##/#######","UULLULLDDUURRDDLRURRDLULULLDRRRDRULLLDRLDDRUUURRDLULLDDRULURR"],["#######/#.o.cp#/#.#.cc#/#.cc.o#/#o#o#o#/#.....#/#######","LLDDRRDDLLLLUURRUURRDDUULLDDRLUURRDLDLLLUURRDRDLLRUULLDDRRURRULL"],["#######/#.#po.#/#.#..c#/#oc.co#/##.cc.#/#o..#o#/#######","DDLDDRURURDLLLURUURRDLULDDLDDRURUULDRDLULDRDL"],["#######/#..##o#/#..oco#/#.#..c#/##.cc.#/#Pc..o#/#######","RRRURUULDLDURRDLDLLURDRULURDRU"],["#######/#.p#.o#/#cc.#o#/#.c.#.#/#ococ.#/#.o#..#/#######","LDDRDRRDRUUUDDLLLULUURDRDULLDRDRRDRUUDLLLUURD"],["#######/#oc...#/#.ococ#/#.#.c.#/#.p#co#/##...o#/#######","LUURRURRDDDUUULLDDRLUURRDDLLULLURRDDRRULLULLDDDRDRRUURUULLL"],["#######/#o.#..#/#.cP#.#/#ccc..#/#....o#/##oco##/#######","DRDDLULLUURDLDRRRULDLLUURDLDRRURD"],["#######/#o.####/#.cco.#/#...cP#/#o.cco#/#.##..#/#######","LRDDLULLULUURDRDRLULLDRDRRULDLURULDLU"],["#######/#o.#.o#/#c#...#/#oocc.#/##..cc#/#.o.#p#/#######","UUULLDLLUDRRURRDLLLDDRULURURRDDLLULDRRRULL"],["#######/#..co.#/##oc.##/#ocpc##/#.c#..#/#oo...#/#######","LUURDRDDRDLLLUURURDDRDLL"],["#######/#pcoo##/##coco#/#o.c.##/#.c.#.#/#.....#/#######","RRDRDLLRUULDRDDDLLURDRUUULDRDDLLURDRUU"],["#######/#.#P..#/#.oo#c#/#..c#.#/##c.c.#/#o.c.o#/#######","RRDDDLDLLUUDDRRULUUDLLURDRDDLUU"],["#######/#o#o..#/#..co##/#.#ccp#/#co.co#/#...#.#/#######","DLLDLLUUURRLLDDDRRUUUDDRRULDLDLLURRRLLLUURRDRDL"],["#######/#..#o##/#..cc.#/#.ccoo#/#.co#o#/#p#...#/#######","URURRURDLLLLUURDLDRRRULDLLUURDLDRR"],["#######/#.p#..#/#cc.#.#/#.c.o.#/#occ.##/##oo.o#/#######","LDDRDRLULUURDRDRDULULLDRDRDRULLUURDD"],["#######/#...o.#/#oo.c.#/#coc.##/#.cc###/#..op##/#######","LLUUULDURRURRDLDLDLULUURRDRDLDLDLUU"],["#######/#.oocp#/##occ.#/##c.o##/#...#.#/#oc...#/#######","LLDLDRDDLUURUURRDLULDDLDDRUUU"],["#######/#.#o..#/#.oc..#/#.oco.#/##cc#.#/#po.c.#/#######","RUURURRDDDLLULULURRLDDRUDDRRUULLRRUULDL"],["#######/#oco.##/#o.co##/#.c.cP#/##.c..#/###...#/#######","DDLLULULUURDRDRDDLULUDRRULULRDDLULUDRRUL"],["#######/##.##.#/#.o..o#/##c.oc#/#pccco#/#...o##/#######","DRRUDLLURURURRDLDLDLLURURLDDRURUDLLURUR"]]};
  var lastPick = {};

  function decode(entry, t, fr, fc) {
    var rows = entry[0].split('/');
    var h0 = rows.length, w0 = rows[0].length;
    var h = t ? w0 : h0, w = t ? h0 : w0;
    function map(r, c) {
      var rr = t ? c : r, cc = t ? r : c;
      if (fr) rr = h - 1 - rr;
      if (fc) cc = w - 1 - cc;
      return [rr, cc];
    }
    var walls = [], goals = [], crates = [], player = null, r, c;
    for (r = 0; r < h; r++) { walls.push([]); for (c = 0; c < w; c++) walls[r].push(false); }
    for (r = 0; r < h0; r++) {
      for (c = 0; c < w0; c++) {
        var ch = rows[r].charAt(c), p = map(r, c);
        if (ch === '#') walls[p[0]][p[1]] = true;
        if (ch === 'o' || ch === 'P') goals.push(p);
        if (ch === 'c') crates.push(p);
        if (ch === 'p' || ch === 'P') player = p;
      }
    }
    function moves(str) {
      return str.split('').map(function (m) {
        if (t) m = { U: 'L', L: 'U', D: 'R', R: 'D' }[m];
        if (fr && (m === 'U' || m === 'D')) m = OPP[m];
        if (fc && (m === 'L' || m === 'R')) m = OPP[m];
        return m;
      }).join('');
    }
    var level = { w: w, h: h, walls: walls, goals: goals, crates: crates, player: player, solution: moves(entry[1]) };
    if (entry[2]) level.alternate = moves(entry[2]);
    return level;
  }

  function generate(crateCount) {
    var k = Math.round(Number(crateCount));
    if (!isFinite(k)) k = 2;
    k = Math.min(5, Math.max(2, k));
    var list = BANK[k];
    for (var attempt = 0; attempt < 50; attempt++) {
      var idx = rint(list.length);
      if (list.length > 1 && idx === lastPick[k]) continue;
      var tform = rint(2) === 1, fr = rint(2) === 1, fc = rint(2) === 1;
      var level = decode(list[idx], tform, fr, fc);
      var check = applyMoves(level, level.solution);
      if (!check.legal || !check.solved) continue;
      if (level.alternate) {
        var alt = applyMoves(level, level.alternate);
        if (!alt.legal || !alt.solved) continue;
      }
      lastPick[k] = idx;
      level.bankK = k;
      level.bankIdx = idx;
      level.orient = (tform ? 1 : 0) | (fr ? 2 : 0) | (fc ? 4 : 0);
      return level;
    }
    throw new Error('Crate Vault: could not load a verified level');
  }

  function loadLevel(k, idx, orient) {
    k = Math.round(Number(k));
    if (!isFinite(k)) k = 2;
    k = Math.min(5, Math.max(2, k));
    var list = BANK[k];
    if (!list || !list.length) return null;
    idx = Math.round(Number(idx));
    if (!isFinite(idx)) idx = 0;
    idx = ((idx % list.length) + list.length) % list.length;
    orient = (Number(orient) || 0) & 7;
    var level = decode(list[idx], !!(orient & 1), !!(orient & 2), !!(orient & 4));
    level.bankK = k;
    level.bankIdx = idx;
    level.orient = orient;
    return level;
  }

  function isCornerDead(level, crates) {
    for (var i = 0; i < crates.length; i++) {
      var r = crates[i][0], c = crates[i][1];
      if (indexAt(level.goals, r, c) >= 0) continue;
      var N = isWall(level, r - 1, c), S = isWall(level, r + 1, c);
      var W = isWall(level, r, c - 1), E = isWall(level, r, c + 1);
      if ((N && W) || (N && E) || (S && W) || (S && E)) return true;
    }
    return false;
  }

  function playerReach(level, crates, player) {
    var w = level.w, blocked = {}, i, j;
    for (i = 0; i < crates.length; i++) blocked[crates[i][0] * w + crates[i][1]] = true;
    var seen = {}, queue = [cell(player)];
    var min = player[0] * w + player[1];
    seen[min] = true;
    while (queue.length) {
      var p = queue.pop();
      var k = p[0] * w + p[1];
      if (k < min) min = k;
      for (j = 0; j < 4; j++) {
        var d = DIRS[ORDER[j]];
        var nr = p[0] + d[0], nc = p[1] + d[1], key = nr * w + nc;
        if (isWall(level, nr, nc) || blocked[key] || seen[key]) continue;
        seen[key] = true;
        queue.push([nr, nc]);
      }
    }
    return { seen: seen, min: min };
  }

  /* Cheap dead-position check, then a capped BFS of crate configurations.
     If the search hits the node cap we treat the position as still open —
     we never fail a player on an uncertain solver abort. */
  function isSolvable(level, crates, player, cap) {
    cap = cap || 80000;
    if (isSolvedCrates(level, crates)) return { solvable: true, aborted: false };
    if (isCornerDead(level, crates)) return { solvable: false, reason: 'corner', aborted: false };
    var w = level.w;
    var startCrates = cloneCells(crates);
    var startPlayer = cell(player);
    var reach0 = playerReach(level, startCrates, startPlayer);
    function keyOf(cs, min) {
      var parts = [];
      for (var i = 0; i < cs.length; i++) parts.push(cs[i][0] * w + cs[i][1]);
      parts.sort(function (a, b) { return a - b; });
      return parts.join(',') + '|' + min;
    }
    var seen = {};
    seen[keyOf(startCrates, reach0.min)] = true;
    var queue = [{ crates: startCrates, player: startPlayer }];
    var head = 0, nodes = 0;
    while (head < queue.length) {
      var st = queue[head++];
      nodes++;
      if (nodes > cap) return { solvable: true, aborted: true };
      if (isSolvedCrates(level, st.crates)) return { solvable: true, aborted: false };
      var reach = playerReach(level, st.crates, st.player);
      for (var i = 0; i < st.crates.length; i++) {
        for (var j = 0; j < 4; j++) {
          var d = DIRS[ORDER[j]];
          var cr = st.crates[i][0], cc = st.crates[i][1];
          var pr = cr - d[0], pc = cc - d[1];
          var nr = cr + d[0], nc = cc + d[1];
          if (isWall(level, nr, nc) || indexAt(st.crates, nr, nc) >= 0) continue;
          if (!reach.seen[pr * w + pc]) continue;
          var ncrates = cloneCells(st.crates);
          ncrates[i] = [nr, nc];
          if (isCornerDead(level, ncrates) && !isSolvedCrates(level, ncrates)) continue;
          var nplayer = [cr, cc];
          var nreach = playerReach(level, ncrates, nplayer);
          var key = keyOf(ncrates, nreach.min);
          if (seen[key]) continue;
          seen[key] = true;
          queue.push({ crates: ncrates, player: nplayer });
        }
      }
    }
    return { solvable: false, reason: 'no-path', aborted: false };
  }

  /* ---------- UI ---------- */

  var root = null;
  var state = { k: 2, level: null, history: '', status: '', statusClass: '' };

  var CSS = [
    '.cv-stage{width:100%;display:flex;justify-content:center;margin-top:0.5rem}',
    '.cv-board{--cols:8;display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));',
    'width:min(100%,calc(var(--cols) * 56px));border:2px solid var(--gold-dim);background:var(--stone);',
    'box-shadow:0 0 30px rgba(0,0,0,0.6);touch-action:none;user-select:none;-webkit-user-select:none}',
    '.cv-board.cv-won{border-color:var(--success);box-shadow:0 0 40px rgba(90,170,112,0.35)}',
    '.cv-cell{position:relative;min-width:0;aspect-ratio:1/1;overflow:hidden}',
    '.cv-floor{background:radial-gradient(ellipse at 50% 35%,#efe0b8 0%,#d9c393 80%);box-shadow:inset 0 0 0 1px rgba(110,80,35,0.35)}',
    '.cv-wall{background:linear-gradient(145deg,#352c1e,#120e08);box-shadow:inset 0 0 0 1px #050402,inset 0 2px 0 rgba(255,235,190,0.07),inset 0 -3px 0 rgba(0,0,0,0.55)}',
    '.cv-cell > *{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}',
    '.cv-rune{width:46%;height:46%;border:3px solid #1d7a6c;background:rgba(126,207,192,0.35);transform:translate(-50%,-50%) rotate(45deg);',
    'box-shadow:0 0 8px rgba(29,122,108,0.45);z-index:0}',
    '.cv-rune::after{content:"";position:absolute;left:50%;top:50%;width:34%;height:34%;background:#1d7a6c;transform:translate(-50%,-50%)}',
    '.cv-crate{width:80%;height:80%;border:2px solid #3b2611;',
    'background:repeating-linear-gradient(90deg,transparent 0 15%,rgba(0,0,0,0.28) 15% 17%),linear-gradient(135deg,#ad7b3f,#663f1d);',
    'box-shadow:0 3px 6px rgba(0,0,0,0.65),inset 0 0 0 1px rgba(255,220,150,0.15);z-index:1;transition:background 0.2s,box-shadow 0.2s}',
    '.cv-crate.cv-on{border-color:#1d4a2e;',
    'background:repeating-linear-gradient(90deg,transparent 0 15%,rgba(0,0,0,0.25) 15% 17%),linear-gradient(135deg,#72c48f,#2c6a44);',
    'box-shadow:0 0 14px rgba(90,170,112,0.6),0 3px 6px rgba(0,0,0,0.65)}',
    '.cv-warden{width:70%;height:70%;z-index:2;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.55))}',
    '.cv-warden svg{display:block;width:100%;height:100%;fill:#2f4a7a;stroke:#f0bf5a;stroke-width:1.4}',
    '.cv-dpad{display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,44px);gap:6px;justify-content:center;margin:1.25rem auto 0}',
    '.cv-dir{padding:0;font-size:1.1rem;letter-spacing:0;display:flex;align-items:center;justify-content:center;line-height:1}',
    '.cv-status{min-height:2rem}'
  ].join('');

  function dirButton(ch, glyph, label, row, col) {
    return '<button class="btn cv-dir" data-cv-dir="' + ch + '" aria-label="' + label +
      '" style="grid-row:' + row + ';grid-column:' + col + '">' + glyph + '</button>';
  }

  function markup() {
    var diffs = DIFFS.map(function (d) {
      var on = d[0] === state.k;
      return '<button class="btn' + (on ? ' active' : '') + '" data-cv-diff="' + d[0] +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' + d[1] + '</button>';
    }).join('');
    return '' +
      '<div class="puzzle-frame">' +
        '<div class="corner corner-tl"></div><div class="corner corner-tr"></div>' +
        '<div class="corner corner-bl"></div><div class="corner corner-br"></div>' +
        '<p class="flavor-text">"Crates of oak and iron sit scattered across the vault floor. ' +
        'Shove each one onto a glowing <span style="color:var(--rune)">rune plate</span>. ' +
        'Crates can be pushed but never pulled, and the warden moves one crate at a time."</p>' +
        '<div class="btn-row diff-row" role="group" aria-label="Difficulty">' + diffs + '</div>' +
        '<div class="cv-stage"><div class="cv-board" role="application" aria-label="Crate Vault board"></div></div>' +
        '<div class="move-counter cv-moves">Moves: 0</div>' +
        '<div class="move-counter cv-runes">Crates on runes: 0/' + state.k + '</div>' +
        '<div class="status-msg cv-status" aria-live="polite"></div>' +
        '<div class="cv-dpad" role="group" aria-label="Movement">' +
          dirButton('U', '&#8593;', 'Move up', 1, 2) +
          dirButton('L', '&#8592;', 'Move left', 2, 1) +
          dirButton('R', '&#8594;', 'Move right', 2, 3) +
          dirButton('D', '&#8595;', 'Move down', 3, 2) +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn" data-cv-act="undo">Undo</button>' +
          '<button class="btn" data-cv-act="restart">Restart</button>' +
          '<button class="btn btn-primary" data-cv-act="new">New Puzzle</button>' +
        '</div>' +
      '</div>' +
      '<div class="dm-panel">' +
        '<div class="dm-label">DM Configuration</div>' +
        '<p>Easy vaults are forgiving: there are always at least two ways to solve them, and few pushes can ' +
        'jam a crate for good. Harder vaults are tight rooms found by ' +
        'exhaustive search with exactly one sequence of pushes that solves them without going back on itself: ' +
        'every other push either jams a crate for good or must be undone. Any arrangement with every crate on a ' +
        'rune opens the vault. Every level is replayed through the game rules before it is shown, so it is always ' +
        'solvable.</p>' +
      '</div>';
  }

  function injectStyle() {
    if (document.getElementById('cv-style')) return;
    var s = document.createElement('style');
    s.id = 'cv-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function isActive() {
    if (!root) return false;
    return window.getComputedStyle(root).display !== 'none';
  }

  function setStatus(text, cls) {
    state.status = text;
    state.statusClass = cls || '';
  }

  function render() {
    var lvl = state.level;
    var cur = applyMoves(lvl, state.history);
    var board = root.querySelector('.cv-board');
    board.style.setProperty('--cols', String(lvl.w));
    board.classList.toggle('cv-won', cur.solved);

    var html = '';
    for (var r = 0; r < lvl.h; r++) {
      for (var c = 0; c < lvl.w; c++) {
        if (lvl.walls[r][c]) {
          html += '<div class="cv-cell cv-wall"></div>';
          continue;
        }
        var goal = indexAt(lvl.goals, r, c) >= 0;
        var ci = indexAt(cur.crates, r, c);
        var here = cur.player[0] === r && cur.player[1] === c;
        var inner = '';
        if (goal && ci < 0) inner += '<span class="cv-rune"></span>';
        if (ci >= 0) inner += '<span class="cv-crate' + (goal ? ' cv-on' : '') + '"></span>';
        if (here) inner += WARDEN;
        html += '<div class="cv-cell cv-floor">' + inner + '</div>';
      }
    }
    board.innerHTML = html;

    var onRunes = 0;
    for (var i = 0; i < cur.crates.length; i++) {
      if (indexAt(lvl.goals, cur.crates[i][0], cur.crates[i][1]) >= 0) onRunes++;
    }
    root.querySelector('.cv-moves').textContent = 'Moves: ' + state.history.length;
    root.querySelector('.cv-runes').textContent = 'Crates on runes: ' + onRunes + '/' + lvl.goals.length;

    var text = state.status, cls = state.statusClass;
    if (!text) {
      if (cur.solved) { text = 'The runes are lit. The vault door grinds open.'; cls = 'success'; }
      else { text = 'Push every crate onto a rune plate.'; cls = ''; }
    }
    var st = root.querySelector('.cv-status');
    st.textContent = text;
    st.className = 'status-msg cv-status' + (cls ? ' ' + cls : '');
  }

  function move(ch) {
    var lvl = state.level;
    if (applyMoves(lvl, state.history).solved) return;
    var next = applyMoves(lvl, state.history + ch);
    if (!next.legal) {
      setStatus('The way is blocked.', 'fail');
      render();
      return;
    }
    state.history += ch;
    setStatus('');
    render();
    if (next.solved && typeof window.showWin === 'function') {
      window.showWin('Every crate rests on a rune. The vault door grinds open.');
    } else if (window.VaultOnce && window.VaultOnce.active() && !window.VaultOnce.frozen()) {
      var dead = isSolvable(lvl, next.crates, next.player);
      if (!dead.solvable && !dead.aborted) {
        if (typeof window.VaultOnce.fail === 'function') {
          window.VaultOnce.fail({
            summary: 'The crates can no longer be solved.',
            reason: 'unsolvable'
          });
        }
      }
    }
  }

  function onceLocked() {
    return window.VaultOnce && window.VaultOnce.active() &&
      (window.VaultOnce.started() || window.VaultOnce.frozen());
  }

  function undo() {
    if (onceLocked()) return;
    if (!state.history.length) return;
    state.history = state.history.slice(0, -1);
    setStatus('');
    render();
  }

  function restart() {
    if (onceLocked()) return;
    state.history = '';
    setStatus('');
    render();
  }

  function newPuzzle() {
    if (onceLocked()) return;
    state.level = generate(state.k);
    state.history = '';
    setStatus('');
    render();
  }

  function setDifficulty(k) {
    if (onceLocked()) return;
    state.k = k;
    var btns = root.querySelectorAll('[data-cv-diff]');
    for (var i = 0; i < btns.length; i++) {
      var on = Number(btns[i].getAttribute('data-cv-diff')) === k;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    newPuzzle();
  }


  function onClick(e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-cv-dir],[data-cv-diff],[data-cv-act]') : null;
    if (!t || !root.contains(t)) return;
    if (t.hasAttribute('data-cv-dir')) {
      move(t.getAttribute('data-cv-dir'));
    } else if (t.hasAttribute('data-cv-diff')) {
      setDifficulty(Number(t.getAttribute('data-cv-diff')));
    } else {
      switch (t.getAttribute('data-cv-act')) {
        case 'undo': undo(); break;
        case 'restart': restart(); break;
        case 'new': newPuzzle(); break;
      }
    }
  }

  function onKey(e) {
    if (!isActive()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!Object.prototype.hasOwnProperty.call(KEYS, e.key)) return;
    if (e.key.indexOf('Arrow') === 0) e.preventDefault();
    move(KEYS[e.key]);
  }

  var touchStart = null;
  function onTouchStart(e) {
    var t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (!isActive()) return;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L');
    else move(dy > 0 ? 'D' : 'U');
  }

  function init() {
    root = document.getElementById('crate');
    if (!root) return;
    injectStyle();
    root.innerHTML = markup();
    state.level = generate(state.k);
    state.history = '';
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    var board = root.querySelector('.cv-board');
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });
    render();
  }

  function load(k, idx, orient) {
    var level = loadLevel(k, idx, orient);
    if (!level) return null;
    state.k = level.bankK;
    state.level = level;
    state.history = '';
    setStatus('');
    if (root) {
      var btns = root.querySelectorAll('[data-cv-diff]');
      for (var i = 0; i < btns.length; i++) {
        var on = Number(btns[i].getAttribute('data-cv-diff')) === state.k;
        btns[i].classList.toggle('active', on);
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      render();
    }
    return getState();
  }

  function getState() {
    var cur = state.level ? applyMoves(state.level, state.history) : null;
    return {
      k: state.k,
      history: state.history,
      bankIdx: state.level && state.level.bankIdx,
      orient: state.level && state.level.orient,
      solution: state.level && state.level.solution,
      solved: !!(cur && cur.solved),
      crates: cur && cur.crates,
      player: cur && cur.player
    };
  }

  window.CrateVault = {
    generate: generate,
    applyMoves: applyMoves,
    load: load,
    loadLevel: loadLevel,
    setDifficulty: setDifficulty,
    catalog: function (k) { return (BANK[k] || []).length; },
    getState: getState,
    move: move,
    isSolvable: isSolvable,
    isCornerDead: isCornerDead
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
