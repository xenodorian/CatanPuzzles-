/* Allfall: one adjacent swap must cascade-clear the whole mosaic.
   A different exchange fails the attempt. Same-colored neighbors do nothing. */
(function (root) {
  'use strict';

  var LEVELS = null;
  var SAVE = 'vault-allfall';
  var GEMS = [
    { name: 'Coral disc', fill: '#c4503a', ink: '#1a1610' },
    { name: 'Brass diamond', fill: '#c9943a', ink: '#1a1610' },
    { name: 'Teal hex', fill: '#2a8f86', ink: '#e8d9b0' },
    { name: 'Ivory square', fill: '#e8d9b0', ink: '#1a1610' },
    { name: 'Indigo triangle', fill: '#4a5ea8', ink: '#e8d9b0' }
  ];

  var levelIndex = 0;
  var tiles = [];
  var nextId = 1;
  var selected = null;
  var phase = 'idle';
  var attempt = 1;
  var hinted = false;
  var hintOn = false;
  var token = 0;
  var save = { cleared: [], flawless: [], level: 1 };

  function $(id) { return document.getElementById(id); }

  function onceOn() {
    return !!(root.VaultOnce && root.VaultOnce.active && root.VaultOnce.active());
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        save.cleared = Array.isArray(o.cleared) ? o.cleared : [];
        save.flawless = Array.isArray(o.flawless) ? o.flawless : [];
        save.level = o.level || 1;
      }
    } catch (e) { /* ignore */ }
  }

  function writeSave() {
    if (onceOn()) return;
    try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  function findMatches(grid) {
    var rows = grid.length, cols = grid[0].length;
    var mark = [];
    var r, c, end, color, k;
    for (r = 0; r < rows; r++) {
      mark[r] = [];
      for (c = 0; c < cols; c++) mark[r][c] = false;
    }
    for (r = 0; r < rows; r++) {
      c = 0;
      while (c < cols) {
        color = grid[r][c];
        if (color < 0) { c++; continue; }
        end = c + 1;
        while (end < cols && grid[r][end] === color) end++;
        if (end - c >= 3) for (k = c; k < end; k++) mark[r][k] = true;
        c = end;
      }
    }
    for (c = 0; c < cols; c++) {
      r = 0;
      while (r < rows) {
        color = grid[r][c];
        if (color < 0) { r++; continue; }
        end = r + 1;
        while (end < rows && grid[end][c] === color) end++;
        if (end - r >= 3) for (k = r; k < end; k++) mark[k][c] = true;
        r = end;
      }
    }
    var cells = [];
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (mark[r][c]) cells.push([r, c]);
    return cells;
  }

  function fromGrid(grid) {
    var out = [];
    nextId = 1;
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] >= 0) out.push({ id: nextId++, color: grid[r][c], r: r, c: c, drop: 0 });
      }
    }
    return out;
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function byId(id) {
    for (var i = 0; i < tiles.length; i++) if (tiles[i].id === id) return tiles[i];
    return null;
  }

  function matchIds() {
    var level = LEVELS[levelIndex];
    var at = {};
    for (var i = 0; i < tiles.length; i++) at[tiles[i].r + ',' + tiles[i].c] = tiles[i];
    var grid = [];
    for (var r = 0; r < level.rows; r++) {
      grid[r] = [];
      for (var c = 0; c < level.cols; c++) {
        var t = at[r + ',' + c];
        grid[r][c] = t ? t.color : -1;
      }
    }
    var cells = findMatches(grid);
    var ids = [];
    for (i = 0; i < cells.length; i++) {
      var hit = at[cells[i][0] + ',' + cells[i][1]];
      if (hit) ids.push(hit.id);
    }
    return ids;
  }

  function swapPos(idA, idB) {
    var a = byId(idA), b = byId(idB);
    if (!a || !b) return;
    var r = a.r, c = a.c;
    a.r = b.r; a.c = b.c; a.drop = 0;
    b.r = r; b.c = c; b.drop = 0;
  }

  function gravity() {
    var rows = LEVELS[levelIndex].rows;
    var colsMap = {};
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      (colsMap[t.c] || (colsMap[t.c] = [])).push(t);
    }
    var next = [];
    for (var c in colsMap) {
      var list = colsMap[c];
      list.sort(function (a, b) { return a.r - b.r; });
      var start = rows - list.length;
      for (var j = 0; j < list.length; j++) {
        var tile = list[j];
        var nr = start + j;
        tile.drop = nr - tile.r;
        tile.r = nr;
        next.push(tile);
      }
    }
    tiles = next;
  }

  function glyph(color) {
    if (color === 0) return '<circle cx="16" cy="16" r="6.5"/>';
    if (color === 1) return '<path d="M16 4.5 27.5 16 16 27.5 4.5 16Z"/>';
    if (color === 2) return '<polygon points="16,4 26.5,10 26.5,22 16,28 5.5,22 5.5,10"/>';
    if (color === 3) return '<rect x="6.5" y="6.5" width="19" height="19" rx="3.5"/>';
    return '<polygon points="16,4 28,26.5 4,26.5"/>';
  }

  function setStatus(text, kind) {
    var el = $('af-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status-msg' + (kind ? ' ' + kind : '');
  }

  function renderNav() {
    var nav = $('allfall-nav');
    if (!nav) return;
    var html = '';
    for (var i = 0; i < LEVELS.length; i++) {
      var done = save.cleared.indexOf(LEVELS[i].id) >= 0;
      var open = i === 0 || save.cleared.indexOf(LEVELS[i].id) >= 0 || save.cleared.indexOf(LEVELS[i - 1].id) >= 0;
      html += '<button type="button" class="btn' + (i === levelIndex ? ' active' : '') + '" data-af-level="' + (i + 1) + '"' +
        (open ? '' : ' disabled') + '>' + (i + 1) + (done ? ' ✓' : '') + '</button>';
    }
    nav.innerHTML = html;
  }

  function render() {
    var level = LEVELS[levelIndex];
    var board = $('af-board');
    if (!board) return;
    board.style.setProperty('--cols', level.cols);
    board.style.setProperty('--rows', level.rows);
    var slots = '';
    for (var i = 0; i < level.rows * level.cols; i++) slots += '<div class="af-slot"></div>';
    var pieces = '';
    var sel = selected ? byId(selected) : null;
    var sol = level.solution;
    for (var t = 0; t < tiles.length; t++) {
      var tile = tiles[t];
      var gem = GEMS[tile.color] || GEMS[0];
      var cls = 'af-face';
      if (selected === tile.id) cls += ' is-selected';
      if (sel && sel.id !== tile.id && adjacent(sel, tile)) cls += ' is-legal';
      if (tile.clearing) cls += ' is-clearing';
      if (tile.charged) cls += ' is-charged';
      if (hintOn && ((tile.r === sol[0] && tile.c === sol[1]) || (tile.r === sol[2] && tile.c === sol[3]))) cls += ' is-hint';
      pieces += '<button type="button" class="af-piece" data-id="' + tile.id + '" data-pos="' + tile.r + ',' + tile.c + '"' +
        ' style="--c:' + tile.c + ';--r:' + tile.r + ';--delay:' + (tile.drop * 16) + 'ms" aria-label="' +
        gem.name + ', row ' + (tile.r + 1) + ', column ' + (tile.c + 1) + '">' +
        '<span class="' + cls + '" style="--gem:' + gem.fill + ';--ink:' + gem.ink + '">' +
        '<svg viewBox="0 0 32 32" aria-hidden="true">' + glyph(tile.color) + '</svg></span></button>';
    }
    board.innerHTML = '<div class="af-slots">' + slots + '</div>' + pieces;
    var title = $('af-title');
    if (title) title.textContent = level.title;
    var att = $('af-attempt');
    if (att) att.textContent = 'Attempt ' + attempt + (hinted ? ' · pair shown' : '');
    var hintBtn = $('allfall-hint');
    if (hintBtn) hintBtn.disabled = phase !== 'idle';
    renderNav();
  }

  function sleep(ms, tok) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (tok !== token) reject(new Error('halt'));
        else resolve();
      }, ms);
    });
  }

  function failAttempt(kind, left) {
    phase = 'lost';
    var msg = kind === 'nomatch'
      ? 'Those tiles never line up. The turn is spent.'
      : 'The cascade stopped. ' + left + (left === 1 ? ' tile still stands.' : ' tiles still stand.');
    setStatus(msg, 'fail');
    var retry = $('allfall-retry');
    if (retry) retry.hidden = !!onceOn();
    render();
    if (onceOn() && root.VaultOnce.fail) {
      root.VaultOnce.fail({ summary: msg, reason: kind });
    }
  }

  function winAttempt(waves) {
    phase = 'won';
    var level = LEVELS[levelIndex];
    var flawless = attempt === 1 && !hinted;
    if (save.cleared.indexOf(level.id) < 0) save.cleared.push(level.id);
    if (flawless && save.flawless.indexOf(level.id) < 0) save.flawless.push(level.id);
    save.level = Math.min(LEVELS.length, level.id + 1);
    writeSave();
    var msg = 'Cleared in ' + waves + (waves === 1 ? ' wave.' : ' waves.');
    if (flawless) msg += ' Flawless.';
    setStatus('The board is clear.', 'success');
    render();
    if (typeof root.showWin === 'function') root.showWin(msg);
  }

  function runSwap(idA, idB) {
    if (phase !== 'idle') return;
    var a = byId(idA), b = byId(idB);
    if (!a || !b || !adjacent(a, b)) return;
    if (a.color === b.color) {
      selected = null;
      setStatus('Same glaze. That exchange changes nothing.', 'info');
      render();
      return;
    }
    selected = null;
    phase = 'anim';
    var tok = ++token;
    var speed = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    swapPos(idA, idB);
    render();
    setStatus('Exchanging…', 'info');
    sleep(220 * speed, tok).then(function () {
      if (matchIds().length === 0) {
        return sleep(240 * speed, tok).then(function () {
          swapPos(idA, idB);
          failAttempt('nomatch');
        });
      }
      var wave = 0;
      function step() {
        var ids = matchIds();
        if (!ids.length) {
          if (!tiles.length) winAttempt(wave);
          else failAttempt('short', tiles.length);
          return;
        }
        wave++;
        setStatus('Wave ' + wave + '.', 'info');
        for (var i = 0; i < tiles.length; i++) tiles[i].charged = ids.indexOf(tiles[i].id) >= 0;
        render();
        return sleep(90 * speed, tok).then(function () {
          for (var i = 0; i < tiles.length; i++) {
            tiles[i].charged = false;
            tiles[i].clearing = ids.indexOf(tiles[i].id) >= 0;
          }
          render();
          return sleep(240 * speed, tok);
        }).then(function () {
          tiles = tiles.filter(function (tile) { return ids.indexOf(tile.id) < 0; });
          gravity();
          render();
          return sleep(260 * speed, tok);
        }).then(function () {
          for (var i = 0; i < tiles.length; i++) tiles[i].drop = 0;
          step();
        });
      }
      return step();
    }).catch(function () { /* superseded */ });
  }

  function reset(keepAttempt) {
    token++;
    var level = LEVELS[levelIndex];
    tiles = fromGrid(level.grid);
    selected = null;
    phase = 'idle';
    hintOn = false;
    if (!keepAttempt) {
      attempt = 1;
      hinted = false;
    }
    var retry = $('allfall-retry');
    if (retry) retry.hidden = true;
    setStatus('One swap. The board must clear.', '');
    render();
  }

  function load(n) {
    var idx = Math.max(1, Math.min(LEVELS.length, n | 0)) - 1;
    if (!onceOn()) {
      var open = idx === 0 || save.cleared.indexOf(LEVELS[idx].id) >= 0 || save.cleared.indexOf(LEVELS[idx].id - 1) >= 0;
      if (!open) idx = 0;
    }
    levelIndex = idx;
    save.level = LEVELS[idx].id;
    writeSave();
    reset(false);
  }

  function bind() {
    var board = $('af-board');
    if (board) {
      board.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-id]') : null;
        if (!btn || phase !== 'idle') return;
        var id = Number(btn.getAttribute('data-id'));
        var tile = byId(id);
        var cur = selected ? byId(selected) : null;
        if (cur && cur.id !== id && adjacent(cur, tile)) {
          runSwap(cur.id, id);
          return;
        }
        selected = cur && cur.id === id ? null : id;
        if (selected) setStatus('Choose a neighboring tile. This will be the attempt.', 'info');
        render();
      });
    }
    var nav = $('allfall-nav');
    if (nav) {
      nav.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-af-level]') : null;
        if (!btn || btn.disabled || onceOn()) return;
        load(Number(btn.getAttribute('data-af-level')));
      });
    }
    var hint = $('allfall-hint');
    if (hint) hint.addEventListener('click', function () {
      if (phase !== 'idle' || onceOn()) return;
      hinted = true;
      hintOn = true;
      render();
      setTimeout(function () { hintOn = false; render(); }, 2200);
    });
    var retry = $('allfall-retry');
    if (retry) retry.addEventListener('click', function () {
      if (onceOn()) return;
      attempt++;
      reset(true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if ((e.key === 'r' || e.key === 'R') && phase === 'lost' && !onceOn()) {
        attempt++;
        reset(true);
      }
      if ((e.key === 'h' || e.key === 'H') && phase === 'idle' && !onceOn()) {
        hinted = true;
        hintOn = true;
        render();
      }
    });
  }

  function startLevelFromUrl() {
    var n = NaN;
    try {
      var q = new URL(location.href).searchParams;
      if (q.get('p')) n = parseInt(q.get('p'), 10);
      else if (q.get('d')) n = parseInt(q.get('d'), 10);
    } catch (e) { /* ignore */ }
    if (!isFinite(n) && root.VaultOnce && root.VaultOnce.params) {
      var p = root.VaultOnce.params();
      n = parseInt(p.p || p.d, 10);
    }
    if (!isFinite(n)) n = save.level || 1;
    load(n);
  }

  function boot(data) {
    LEVELS = data;
    loadSave();
    bind();
    startLevelFromUrl();
  }

  root.Allfall = {
    load: function (n) { if (LEVELS) load(n); },
    boot: boot
  };
})(typeof window !== 'undefined' ? window : this);

window.Allfall.boot([{"id":1,"title":"Loose Thread","rows":4,"cols":4,"grid":[[-1,-1,-1,-1],[-1,0,0,-1],[-1,1,1,0],[0,1,0,0]],"solution":[3,0,3,1],"depth":3},{"id":2,"title":"Hairline","rows":4,"cols":5,"grid":[[-1,-1,0,-1,-1],[-1,0,1,-1,-1],[0,1,0,2,-1],[0,0,2,1,2]],"solution":[2,3,3,3],"depth":4},{"id":3,"title":"Second Crack","rows":5,"cols":5,"grid":[[-1,-1,0,-1,-1],[-1,0,1,-1,-1],[-1,1,0,1,-1],[0,1,2,2,-1],[0,0,1,1,2]],"solution":[3,1,4,1],"depth":5},{"id":4,"title":"The Seam","rows":5,"cols":6,"grid":[[-1,-1,0,-1,-1,-1],[-1,0,1,2,-1,-1],[-1,1,3,0,2,-1],[1,0,0,2,0,-1],[0,2,2,3,3,2]],"solution":[3,3,4,3],"depth":6},{"id":5,"title":"Fault Line","rows":6,"cols":6,"grid":[[-1,-1,0,0,-1,-1],[-1,-1,1,1,-1,-1],[-1,0,2,3,-1,-1],[-1,2,3,2,1,-1],[0,3,1,3,2,2],[2,1,3,1,3,3]],"solution":[4,3,5,3],"depth":7},{"id":6,"title":"Keystone","rows":6,"cols":6,"grid":[[-1,-1,0,1,-1,-1],[-1,-1,2,0,-1,-1],[-1,2,0,3,1,-1],[-1,1,1,2,0,-1],[0,4,4,0,3,1],[1,0,0,4,0,3]],"solution":[4,0,5,0],"depth":8},{"id":7,"title":"Load-Bearing","rows":6,"cols":7,"grid":[[-1,-1,0,1,-1,-1,-1],[-1,-1,1,2,2,-1,-1],[-1,0,0,3,1,2,-1],[-1,1,2,1,2,2,-1],[0,0,3,3,1,1,-1],[0,3,1,2,3,3,1]],"solution":[4,3,5,3],"depth":9},{"id":8,"title":"Quiet Joint","rows":7,"cols":6,"grid":[[-1,-1,0,1,-1,-1],[-1,-1,1,2,-1,-1],[-1,-1,3,1,1,-1],[-1,0,2,0,2,-1],[-1,3,1,3,0,2],[0,1,3,2,4,0],[3,2,2,4,3,4]],"solution":[5,4,6,4],"depth":9},{"id":9,"title":"Shear","rows":7,"cols":7,"grid":[[-1,-1,-1,0,1,-1,-1],[-1,-1,-1,1,0,-1,-1],[-1,-1,1,0,2,1,-1],[-1,1,3,3,1,0,-1],[-1,0,0,2,0,2,1],[-1,1,1,4,3,0,2],[1,4,4,0,2,2,0]],"solution":[5,3,6,3],"depth":10},{"id":10,"title":"Underpin","rows":7,"cols":7,"grid":[[-1,-1,-1,-1,0,-1,-1],[-1,-1,1,0,2,0,-1],[-1,-1,0,1,1,2,-1],[-1,1,1,3,4,1,-1],[-1,4,4,0,3,4,2],[1,1,0,4,2,3,4],[0,0,1,1,0,2,2]],"solution":[5,1,6,1],"depth":11},{"id":11,"title":"Total Collapse","rows":8,"cols":7,"grid":[[-1,-1,0,1,1,-1,-1],[-1,-1,2,0,3,-1,-1],[-1,0,1,1,0,-1,-1],[-1,2,0,4,1,-1,-1],[-1,1,4,2,2,1,-1],[-1,0,2,1,4,3,-1],[2,4,1,4,1,4,3],[0,0,1,0,0,1,1]],"solution":[7,1,7,2],"depth":12},{"id":12,"title":"Allfall","rows":8,"cols":8,"grid":[[-1,-1,-1,0,-1,1,-1,-1],[-1,-1,-1,2,-1,0,-1,-1],[-1,-1,3,4,0,3,-1,-1],[-1,3,1,3,2,2,1,-1],[-1,1,2,2,0,4,0,-1],[-1,2,1,0,4,0,3,1],[1,4,0,1,0,4,4,3],[1,1,4,4,1,1,0,4]],"solution":[6,1,7,1],"depth":14}]);
