/* Crate Vault: a generic crate-pushing puzzle. Self-contained, no libraries, no network.
   Levels are grown by reverse play from the solved state and verified by replay before use. */
(function () {
  'use strict';

  var DIRS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
  var ORDER = ['U', 'D', 'L', 'R'];
  var OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };
  var NAMES = { U: 'Up', D: 'Down', L: 'Left', R: 'Right' };
  var KEYS = {
    ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
    w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R'
  };
  var SIZES = [[6, 6], [7, 7], [8, 8], [8, 9]]; // interior [rows, cols]
  var DIFFS = [[2, 'Easy 2'], [3, 'Medium 3'], [4, 'Hard 4'], [5, 'Very Hard 5']];
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

  /* ---------- generation ---------- */

  /*
   * One build attempt. The level starts with every crate on a goal and is shuffled by
   * random reverse moves (pulls and free walks). Each reverse step is recorded as its
   * forward equivalent; the reversed record is the stored solution.
   */
  function tryBuild(k, attempt) {
    var size = SIZES[rint(SIZES.length)];
    var ih = size[0], iw = size[1];
    var h = ih + 2, w = iw + 2;
    var walls = [], r, c;
    for (r = 0; r < h; r++) {
      var row = [];
      for (c = 0; c < w; c++) row.push(r === 0 || c === 0 || r === h - 1 || c === w - 1);
      walls.push(row);
    }

    // Random interior walls, keeping all floor connected. Fewer walls after many failures.
    var maxWalls = Math.max(0, Math.round(ih * iw * 0.12) - Math.floor(attempt / 40));
    var wantWalls = maxWalls >= 3 ? 2 + rint(maxWalls - 1) : maxWalls;
    var placed = 0;
    for (var tries = 0; placed < wantWalls && tries < 300; tries++) {
      var wr = 1 + rint(ih), wc = 1 + rint(iw);
      if (walls[wr][wc]) continue;
      walls[wr][wc] = true;
      if (floorConnected(walls, h, w)) placed++;
      else walls[wr][wc] = false;
    }

    var floor = [];
    for (r = 1; r < h - 1; r++) {
      for (c = 1; c < w - 1; c++) if (!walls[r][c]) floor.push([r, c]);
    }
    if (floor.length < 2 * k + 2) return null;
    shuffle(floor);

    var goals = cloneCells(floor.slice(0, k));
    var crates = cloneCells(goals);
    var player = cell(floor[k + rint(floor.length - k)]);

    function freeCell(rr, cc) {
      return !walls[rr][cc] && indexAt(crates, rr, cc) < 0;
    }

    // Pull options: crate i sits next to the warden in direction d, and the cell behind the warden is free.
    function pulls() {
      var out = [];
      for (var i = 0; i < k; i++) {
        for (var j = 0; j < 4; j++) {
          var d = DIRS[ORDER[j]];
          if (crates[i][0] === player[0] + d[0] && crates[i][1] === player[1] + d[1] &&
              freeCell(player[0] - d[0], player[1] - d[1])) {
            out.push({ i: i, d: ORDER[j] });
          }
        }
      }
      return out;
    }

    // First step of a shortest free path from the warden to a cell beside crate i, or null.
    function walkToward(i) {
      var target = crates[i];
      var dist = {}, first = {}, queue = [cell(player)], head = 0;
      dist[player[0] * w + player[1]] = 0;
      while (head < queue.length) {
        var p = queue[head++];
        var pk = p[0] * w + p[1];
        for (var j = 0; j < 4; j++) {
          var ch = ORDER[j], d = DIRS[ch];
          var nr = p[0] + d[0], nc = p[1] + d[1], nk = nr * w + nc;
          if (dist[nk] === undefined && freeCell(nr, nc)) {
            dist[nk] = dist[pk] + 1;
            first[nk] = dist[pk] === 0 ? ch : first[pk];
            queue.push([nr, nc]);
          }
        }
      }
      var cands = [];
      for (var q = 1; q < queue.length; q++) {
        var pp = queue[q];
        if (Math.abs(pp[0] - target[0]) + Math.abs(pp[1] - target[1]) === 1) {
          cands.push(first[pp[0] * w + pp[1]]);
        }
      }
      if (!cands.length) return null;
      return cands[rint(cands.length)];
    }

    var trail = [];          // forward move characters, in reverse-play order
    var perCrate = [];
    for (var z = 0; z < k; z++) perCrate.push(0);
    var steps = 120 + 50 * k;
    var last = -1;

    for (var s = 0; s < steps; s++) {
      var opts = pulls();
      if (opts.length && Math.random() < 0.8) {
        var pick = null;
        if (last >= 0 && Math.random() < 0.7) {
          var same = opts.filter(function (o) { return o.i === last; });
          if (same.length) pick = same[rint(same.length)];
        }
        if (!pick) pick = opts[rint(opts.length)];
        var pd = DIRS[pick.d];
        // Crate beside the warden moves onto the warden's cell; the warden steps back.
        var pr = player[0], pc = player[1];
        crates[pick.i] = [pr, pc];
        player = [pr - pd[0], pc - pd[1]];
        trail.push(pick.d);          // the forward push runs the other way
        perCrate[pick.i]++;
        last = pick.i;
      } else {
        var e = null;
        if (Math.random() < 0.7) e = walkToward(rint(k));
        if (!e) {
          var nb = ORDER.filter(function (ch) {
            var dd = DIRS[ch];
            return freeCell(player[0] + dd[0], player[1] + dd[1]);
          });
          if (!nb.length) break;
          e = nb[rint(nb.length)];
        }
        var ed = DIRS[e];
        player = [player[0] + ed[0], player[1] + ed[1]];
        trail.push(OPP[e]);
      }
    }

    var off = 0, i2;
    for (i2 = 0; i2 < k; i2++) {
      if (indexAt(goals, crates[i2][0], crates[i2][1]) < 0) off++;
    }
    var total = 0, minPer = Infinity;
    for (i2 = 0; i2 < k; i2++) {
      total += perCrate[i2];
      minPer = Math.min(minPer, perCrate[i2]);
    }
    // Quality tiers: strict first, relaxed later so generation always terminates.
    var ok = attempt < 150 ? (off === k && minPer >= 4)
           : attempt < 400 ? (off >= k - 1 && total >= 4 * k)
           : (off >= 1 && total >= k);
    if (!ok) return null;

    var solution = trail.slice().reverse().join('');
    var level = {
      w: w, h: h, walls: walls,
      goals: goals, crates: crates, player: player,
      solution: solution
    };
    var check = applyMoves(level, solution);
    if (!check.legal || !check.solved) return null;
    return level;
  }

  function generate(crateCount) {
    var k = Math.round(Number(crateCount));
    if (!isFinite(k)) k = 2;
    k = Math.min(5, Math.max(2, k));
    for (var attempt = 0; attempt < 5000; attempt++) {
      var level = tryBuild(k, attempt);
      if (level) return level;
    }
    throw new Error('Crate Vault: could not build a verified level');
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
    '.cv-floor{background:radial-gradient(ellipse at 50% 35%,#3b3224 0%,#27200f 75%);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.4)}',
    '.cv-wall{background:linear-gradient(145deg,#352c1e,#120e08);box-shadow:inset 0 0 0 1px #050402,inset 0 2px 0 rgba(255,235,190,0.07),inset 0 -3px 0 rgba(0,0,0,0.55)}',
    '.cv-cell > *{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}',
    '.cv-rune{width:42%;height:42%;border:2px solid var(--rune);transform:translate(-50%,-50%) rotate(45deg);',
    'box-shadow:0 0 10px rgba(126,207,192,0.35),inset 0 0 6px rgba(126,207,192,0.25);z-index:0}',
    '.cv-rune::after{content:"";position:absolute;left:50%;top:50%;width:30%;height:30%;background:var(--rune);transform:translate(-50%,-50%)}',
    '.cv-crate{width:80%;height:80%;border:2px solid #3b2611;',
    'background:repeating-linear-gradient(90deg,transparent 0 15%,rgba(0,0,0,0.28) 15% 17%),linear-gradient(135deg,#ad7b3f,#663f1d);',
    'box-shadow:0 3px 6px rgba(0,0,0,0.65),inset 0 0 0 1px rgba(255,220,150,0.15);z-index:1;transition:background 0.2s,box-shadow 0.2s}',
    '.cv-crate.cv-on{border-color:#1d4a2e;',
    'background:repeating-linear-gradient(90deg,transparent 0 15%,rgba(0,0,0,0.25) 15% 17%),linear-gradient(135deg,#72c48f,#2c6a44);',
    'box-shadow:0 0 14px rgba(90,170,112,0.6),0 3px 6px rgba(0,0,0,0.65)}',
    '.cv-warden{width:70%;height:70%;z-index:2;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.75))}',
    '.cv-warden svg{display:block;width:100%;height:100%;fill:var(--gold-bright);stroke:#4a3210;stroke-width:1.2}',
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
          '<button class="btn" data-cv-act="hint">Hint</button>' +
          '<button class="btn" data-cv-act="restart">Restart</button>' +
          '<button class="btn btn-primary" data-cv-act="new">New Puzzle</button>' +
        '</div>' +
      '</div>' +
      '<div class="dm-panel">' +
        '<div class="dm-label">DM Configuration</div>' +
        '<p>Each level is grown in reverse from the solved state: crates are dragged back off the rune plates ' +
        'by a random walk, and the recorded route is the solution. Every level is replayed through the game rules ' +
        'before it is shown, so it is always solvable and never starts solved. Hint reveals the next move of that ' +
        'route while the player is still following it.</p>' +
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
    }
  }

  function undo() {
    if (!state.history.length) return;
    state.history = state.history.slice(0, -1);
    setStatus('');
    render();
  }

  function restart() {
    state.history = '';
    setStatus('');
    render();
  }

  function newPuzzle() {
    state.level = generate(state.k);
    state.history = '';
    setStatus('');
    render();
  }

  function setDifficulty(k) {
    state.k = k;
    var btns = root.querySelectorAll('[data-cv-diff]');
    for (var i = 0; i < btns.length; i++) {
      var on = Number(btns[i].getAttribute('data-cv-diff')) === k;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    newPuzzle();
  }

  function hint() {
    var lvl = state.level, h = state.history;
    if (applyMoves(lvl, h).solved) {
      setStatus('The vault is already open.', 'success');
    } else if (lvl.solution.indexOf(h) === 0 && h.length < lvl.solution.length) {
      setStatus('Hint: next move is ' + NAMES[lvl.solution.charAt(h.length)] + '.', 'hint');
    } else {
      setStatus('Your route has left the hinted path. Undo or Restart to get hints again.', 'hint');
    }
    render();
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
        case 'hint': hint(); break;
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

  window.CrateVault = { generate: generate, applyMoves: applyMoves };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
