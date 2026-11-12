/* One-time challenge links for The Puzzle Vault.
 *
 * A link looks like:  lock.html?once=CODE&d=hard&seed=48291
 * CODE is 8 random characters plus a 3-character checksum, so typo'd or
 * invented codes are rejected ("This link isn't valid").
 *
 * This is only deterrence on a static site. There is no server. The used/unused
 * state lives in localStorage in the player's browser, so a private window,
 * another device, or cleared site data can bypass the lock. That is expected.
 */
(function (root) {
  'use strict';

  var STORE = 'vault-once:';
  var SALT = 'vault-once-v1';
  var ALPH = 'abcdefghijklmnopqrstuvwxyz234567'; /* 32 chars */
  var CODE_BODY = 8;
  var CODE_SUM = 3;
  var CODE_LEN = CODE_BODY + CODE_SUM;

  var GAMES = [
    { id: 'lock', file: 'lock.html', name: 'Lockpick',
      diffs: [
        { key: 'easy', label: 'Easy' },
        { key: 'medium', label: 'Medium' },
        { key: 'hard', label: 'Hard' }
      ],
      hasSeed: true, seedLabel: 'Seed (same lock for every player)' },
    { id: 'crate', file: 'crate.html', name: 'Crate Vault',
      diffs: [
        { key: '2', label: 'Easy' },
        { key: '3', label: 'Medium 3' },
        { key: '4', label: 'Hard 4' },
        { key: '5', label: 'Very Hard 5' }
      ],
      hasPuzzle: true, puzzleCount: 20, puzzleLabel: 'Puzzle number (1–20)',
      hasOrient: true },
    { id: 'pipe', file: 'pipe.html', name: 'Pipe Maze',
      diffs: [
        { key: 'easy', label: 'Easy 5x5' },
        { key: 'medium', label: 'Medium 6x6' },
        { key: 'hard', label: 'Hard 7x7' }
      ],
      hasSeed: true },
    { id: 'bridges', file: 'bridges.html', name: 'Rune Bridges',
      diffs: [
        { key: '4', label: 'Easy 4' },
        { key: '5', label: 'Medium 5' },
        { key: '6', label: 'Hard 6' },
        { key: '7', label: 'Very Hard 7' }
      ],
      hasSeed: true },
    { id: 'knight', file: 'knight.html', name: "Knight's Tour",
      diffs: [
        { key: 'easy', label: 'Easy 5x5' },
        { key: 'medium', label: 'Medium 6x6' },
        { key: 'hard', label: 'Hard 7x7' },
        { key: 'veryhard', label: 'Very Hard 8x8' }
      ],
      hasSeed: true },
    { id: 'chess-in-one', file: 'chess-in-one.html', name: 'Chess in One',
      diffs: [
        { key: '1', label: 'Warm-up' },
        { key: '2', label: 'Tricky' },
        { key: '3', label: 'Devious' },
        { key: '4', label: 'Brutal' }
      ],
      hasCio: true },
    { id: 'dragonchess', file: 'dragonchess.html', name: 'Dragon Chess',
      diffs: [
        { key: '0', label: 'Easy' },
        { key: '1', label: 'Medium' },
        { key: '2', label: 'Hard' },
        { key: '3', label: 'Very Hard' },
        { key: '4', label: 'Expert' }
      ],
      hasSide: true },
    { id: 'wyvern', file: 'wyvern.html', name: 'Wyvern Chess',
      diffs: [
        { key: '0', label: 'Easy' },
        { key: '1', label: 'Medium' },
        { key: '2', label: 'Hard' },
        { key: '3', label: 'Very Hard' },
        { key: '4', label: 'Expert' }
      ],
      hasSide: true }
  ];

  var HIDE = [
    '.back-row',
    'a[href="index.html"]',
    'a[href="index.html?v=' /* closed below as attribute prefix - handled in CSS */,
  ];

  var CSS = [
    'html.vault-once .back-row{display:none!important}',
    'html.vault-once a[href="index.html"],html.vault-once a[href^="index.html?"]{display:none!important}',
    'html.vault-once .diff-row,',
    'html.vault-once #pipe-diff,',
    'html.vault-once [data-cv-diff],',
    'html.vault-once [data-cv-act="undo"],',
    'html.vault-once [data-cv-act="restart"],',
    'html.vault-once [data-cv-act="new"],',
    'html.vault-once [data-rb-diff],',
    'html.vault-once [data-rb-act],',
    'html.vault-once [data-kt="undo"],',
    'html.vault-once [data-kt="restart"],',
    'html.vault-once [data-kt="hint"],',
    'html.vault-once [data-kt="new"],',
    'html.vault-once [data-kt="level"],',
    'html.vault-once [data-lp-diff],',
    'html.vault-once [data-lp-act="new"],',
    'html.vault-once #hint,',
    'html.vault-once #reveal,',
    'html.vault-once #skip,',
    'html.vault-once #next,',
    'html.vault-once #tier,',
    'html.vault-once label[for="tier"],',
    'html.vault-once #bNew,',
    'html.vault-once #bUndo,',
    'html.vault-once #overNew,',
    'html.vault-once #dlgNew,',
    'html.vault-once #optMode,',
    'html.vault-once #sideOpts,',
    'html.vault-once #optLevel,',
    'html.vault-once #levelNote,',
    'html.vault-once #pipe-new,',
    'html.vault-once button[onclick="initPipe()"],',
    'html.vault-once #overClose,',
    'html.vault-once #dlgOver{display:none!important}',
    'html.vault-once #win-overlay{display:none!important}',
    'html.vault-once.vault-once-frozen .lp-turn{pointer-events:none;opacity:0.45}',
    '.once-banner{',
    '  text-align:center;font-family:Cinzel,serif;font-size:0.75rem;letter-spacing:0.14em;',
    '  text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-dim);',
    '  background:rgba(201,148,58,0.08);padding:0.65rem 1rem;margin:0 auto 1rem;max-width:640px',
    '}',
    '.once-giveup{margin:1rem auto 0;display:flex;justify-content:center}',
    '.once-giveup button,.once-giveup .btn{',
    '  font-family:Cinzel,serif;letter-spacing:0.08em;text-transform:uppercase;',
    '  background:transparent;border:1px solid #8a3030;color:#e8a0a0;',
    '  padding:0.55rem 1.15rem;cursor:pointer;font-size:0.85rem',
    '}',
    '.once-giveup button:hover,.once-giveup .btn:hover{border-color:#e07070;color:#ffd0d0;background:#2a1212}',
    '.once-freeze{',
    '  position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;',
    '  background:rgba(0,0,0,0.72);padding:1.5rem',
    '}',
    '.once-card{',
    '  background:var(--stone-mid);border:2px solid var(--gold);padding:2.5rem 2rem;text-align:center;',
    '  max-width:420px;width:100%;box-shadow:0 0 60px rgba(201,148,58,0.3)',
    '}',
    '.once-card.fail{border-color:var(--danger);box-shadow:0 0 60px rgba(192,64,64,0.25)}',
    '.once-card h2{font-family:Cinzel,serif;font-size:1.6rem;color:var(--gold-bright);margin-bottom:0.75rem}',
    '.once-card.fail h2{color:#e8a0a0}',
    '.once-card p{color:var(--parchment-dark);line-height:1.6;margin:0.4rem 0}',
    '.once-card .once-meta{font-family:Cinzel,serif;font-size:0.75rem;letter-spacing:0.12em;',
    '  text-transform:uppercase;color:var(--gold-dim);margin-top:1rem}',
    '.once-card .once-note{font-size:0.9rem;font-style:italic;margin-top:1.25rem}',
    '.once-invalid{max-width:520px;margin:3rem auto;padding:2rem;text-align:center}',
    '.once-invalid h1{font-family:Cinzel,serif;color:var(--gold-bright);margin-bottom:1rem}'
  ].join('');

  /* ---------- codes ---------- */

  function fnv(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function toDigits(n, len) {
    var out = '';
    for (var i = 0; i < len; i++) {
      out = ALPH[n & 31] + out;
      n = Math.floor(n / 32);
    }
    return out;
  }

  function randomBody() {
    var chars = [];
    if (root.crypto && crypto.getRandomValues) {
      var buf = new Uint8Array(CODE_BODY);
      crypto.getRandomValues(buf);
      for (var i = 0; i < CODE_BODY; i++) chars.push(ALPH[buf[i] & 31]);
    } else {
      for (var j = 0; j < CODE_BODY; j++) chars.push(ALPH[Math.floor(Math.random() * 32)]);
    }
    return chars.join('');
  }

  function checksum(body) {
    return toDigits(fnv(body + SALT), CODE_SUM);
  }

  function makeCode() {
    var body = randomBody();
    return body + checksum(body);
  }

  function normalizeCode(raw) {
    return String(raw || '').trim().toLowerCase();
  }

  function isValidCode(code) {
    code = normalizeCode(code);
    if (!new RegExp('^[' + ALPH + ']{' + CODE_LEN + '}$').test(code)) return false;
    var body = code.slice(0, CODE_BODY);
    return checksum(body) === code.slice(CODE_BODY);
  }

  /* ---------- storage ---------- */

  function storeKey(code) { return STORE + normalizeCode(code); }

  function readRecord(code) {
    try {
      var raw = localStorage.getItem(storeKey(code));
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }

  function writeRecord(code, rec) {
    try { localStorage.setItem(storeKey(code), JSON.stringify(rec)); } catch (e) { /* private mode */ }
  }

  /* ---------- query helpers ---------- */

  function gameIdFromPath() {
    var path = (location.pathname || '').split('/').pop() || '';
    path = path.replace(/\.html$/i, '');
    return path || '';
  }

  function gameById(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  function diffLabel(gameId, key) {
    var g = gameById(gameId);
    if (!g) return String(key || '');
    for (var i = 0; i < g.diffs.length; i++) if (g.diffs[i].key === String(key)) return g.diffs[i].label;
    return String(key || '');
  }

  /* ---------- public state ---------- */

  var params = {};
  var code = null;
  var active = false;
  var valid = true;
  var invalidReason = '';
  var record = null;
  var frozen = false;
  var started = false;
  var gameId = gameIdFromPath();

  function parseParams() {
    var q;
    try { q = new URL(location.href).searchParams; }
    catch (e) { return; }
    var once = q.get('once');
    if (!once) return;
    code = normalizeCode(once);
    params = {
      d: q.get('d') || q.get('diff') || '',
      p: q.get('p') || q.get('puzzle') || '',
      seed: q.get('seed') || '',
      side: q.get('side') || '',
      xf: q.get('xf') || '',
      xt: q.get('xt') || '',
      xc: q.get('xc') || '',
      orient: q.get('orient') || q.get('o') || ''
    };
    if (!isValidCode(code)) {
      valid = false;
      invalidReason = 'This link isn\'t valid.';
      return;
    }
    active = true;
    record = readRecord(code);
  }

  function injectStyle() {
    if (document.getElementById('once-style')) return;
    var s = document.createElement('style');
    s.id = 'once-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function markHtml() {
    var el = document.documentElement;
    if (active && valid) el.classList.add('vault-once');
    if (frozen) el.classList.add('vault-once-frozen');
  }

  /* ---------- freeze / result UI ---------- */

  function formatTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return iso; }
  }

  function showFreeze(rec, opts) {
    opts = opts || {};
    frozen = true;
    markHtml();
    hideGiveUp();
    var existing = document.getElementById('once-freeze');
    if (existing) existing.parentNode.removeChild(existing);
    var wrap = document.createElement('div');
    wrap.id = 'once-freeze';
    wrap.className = 'once-freeze';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-modal', 'true');
    var ok = rec && rec.result === 'success';
    var title = ok ? '✦ Challenge complete ✦' : '✦ Challenge failed ✦';
    var gameName = (gameById(rec && rec.game || gameId) || {}).name || (rec && rec.game) || '';
    var diff = rec && rec.difficultyLabel ? rec.difficultyLabel : diffLabel(rec && rec.game || gameId, rec && rec.difficulty);
    var when = formatTime(rec && rec.finished);
    var summary = (rec && rec.summary) || '';
    var html = '<div class="once-card' + (ok ? '' : ' fail') + '">' +
      '<h2>' + title + '</h2>' +
      '<p>' + escapeHtml(summary) + '</p>' +
      '<p class="once-meta">' + escapeHtml(gameName) + (diff ? ' · ' + escapeHtml(diff) : '') +
      (when ? '<br>' + escapeHtml(when) : '') + '</p>' +
      '<p class="once-note">This link cannot be used again.</p>' +
      '</div>';
    wrap.innerHTML = html;
    (document.body || document.documentElement).appendChild(wrap);
    blockInput();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showInvalid(msg) {
    injectStyle();
    function paint() {
      document.documentElement.classList.add('vault-once');
      var main = document.querySelector('main') || document.getElementById('app') || document.body;
      if (!main) return;
      var box = document.createElement('div');
      box.className = 'once-invalid puzzle-frame';
      box.innerHTML = '<h1>This link isn\'t valid</h1>' +
        '<p style="color:var(--parchment-dark);line-height:1.6">' +
        escapeHtml(msg || 'This link isn\'t valid.') +
        ' A one-time challenge link has to be used exactly as it was sent.</p>';
      if (main.tagName === 'MAIN' || main.id === 'app') {
        main.innerHTML = '';
        main.appendChild(box);
      } else {
        document.body.innerHTML = '<main></main>';
        document.querySelector('main').appendChild(box);
      }
    }
    if (document.body) paint();
    else document.addEventListener('DOMContentLoaded', paint);
  }

  var inputBlocked = false;
  function blockInput() {
    if (inputBlocked) return;
    inputBlocked = true;
    function stop(e) {
      if (!frozen) return;
      var t = e.target;
      if (t && t.closest && t.closest('#once-freeze')) return;
      if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Escape')) {
        e.preventDefault();
      }
      if (e.type === 'keydown' || e.type === 'pointerdown' || e.type === 'touchstart' || e.type === 'click') {
        if (t && t.closest && t.closest('#once-freeze')) return;
        /* swallow gameplay, allow copy on the card only */
      }
    }
    document.addEventListener('keydown', function (e) {
      if (!frozen) return;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    document.addEventListener('pointerdown', function (e) {
      if (!frozen) return;
      if (e.target && e.target.closest && e.target.closest('#once-freeze')) return;
      e.stopPropagation();
    }, true);
  }

  /* ---------- session lifecycle ---------- */

  function currentDiffKey() { return params.d || ''; }

  function finish(result, info) {
    if (!active || !valid || frozen) return record;
    info = info || {};
    var rec = {
      v: 1,
      result: result,
      game: gameId,
      difficulty: currentDiffKey(),
      difficultyLabel: diffLabel(gameId, currentDiffKey()),
      finished: new Date().toISOString(),
      summary: info.summary || (result === 'success' ? 'The challenge was completed.' : 'The challenge was failed.'),
      reason: info.reason || result,
      started: (record && record.started) || new Date().toISOString()
    };
    record = rec;
    writeRecord(code, rec);
    showFreeze(rec);
    return rec;
  }

  function markStarted() {
    if (!active || !valid || frozen || started) return;
    started = true;
    var rec = record || {};
    if (!rec.started) rec.started = new Date().toISOString();
    rec.game = rec.game || gameId;
    rec.difficulty = rec.difficulty || currentDiffKey();
    record = rec;
    writeRecord(code, rec);
  }

  function succeed(info) { return finish('success', info || {}); }
  function fail(info) { return finish('fail', info || {}); }

  function giveUp() {
    fail({ summary: 'You gave up.', reason: 'give-up' });
  }

  /* ---------- UI chrome for live attempts ---------- */

  function showBanner() {
    if (document.getElementById('once-banner')) return;
    var el = document.createElement('div');
    el.id = 'once-banner';
    el.className = 'once-banner';
    el.textContent = 'One-time challenge: you get one attempt.';
    var header = document.querySelector('header');
    if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
    else if (document.body) document.body.insertBefore(el, document.body.firstChild);
  }

  function showGiveUp() {
    if (document.getElementById('once-giveup')) return;
    var row = document.createElement('div');
    row.id = 'once-giveup';
    row.className = 'once-giveup';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = 'Give Up';
    btn.addEventListener('click', function () { giveUp(); });
    row.appendChild(btn);
    var host = document.querySelector('main') || document.getElementById('app') || document.body;
    if (host) host.appendChild(row);
  }

  function hideGiveUp() {
    var el = document.getElementById('once-giveup');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function wrapShowWin() {
    var orig = root.showWin;
    root.showWin = function (msg) {
      if (active && valid && !frozen) {
        succeed({ summary: msg || 'Solved.', reason: 'solved' });
        return;
      }
      if (frozen) return;
      if (typeof orig === 'function') orig(msg);
    };
  }

  function listenFirstInput() {
    function onFirst(e) {
      if (frozen || !active) return;
      var t = e.target;
      if (t && t.closest && (t.closest('#once-giveup') || t.closest('#once-banner') || t.closest('#once-freeze'))) return;
      markStarted();
    }
    document.addEventListener('pointerdown', onFirst, true);
    document.addEventListener('keydown', onFirst, true);
  }

  /* ---------- seeded random ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function seedFromString(s) {
    return fnv(String(s)) >>> 0;
  }

  function withSeed(fn) {
    if (!params.seed) { fn(); return; }
    var rng = mulberry32(seedFromString(params.seed));
    var orig = Math.random;
    Math.random = rng;
    try { fn(); }
    finally { Math.random = orig; }
  }

  /* ---------- per-game boot ---------- */

  function hideNewDialog() {
    var dlg = document.getElementById('dlgNew');
    if (dlg) dlg.hidden = true;
  }

  function bootLock() {
    if (!root.Lockpick) return;
    if (params.d) {
      withSeed(function () { root.Lockpick.setDifficulty(params.d); });
    } else if (params.seed) {
      withSeed(function () { root.Lockpick.newLock(); });
    }
    var origNew = root.Lockpick.newLock;
    var origDiff = root.Lockpick.setDifficulty;
    root.Lockpick.newLock = function () { if (active) return root.Lockpick.getState(); return origNew.apply(this, arguments); };
    root.Lockpick.setDifficulty = function () { if (active) return root.Lockpick.getState(); return origDiff.apply(this, arguments); };
    /* Snap = fail. Poll the public state so we don't have to rewrite lock.js timing. */
    var last = '';
    setInterval(function () {
      if (frozen || !root.Lockpick) return;
      var s = root.Lockpick.getState();
      if (s.status === last) return;
      last = s.status;
      if (s.status === 'failed') {
        fail({
          summary: 'The pick snapped' + (s.tumblersSet ? ' after ' + s.tumblersSet + ' tumbler' + (s.tumblersSet === 1 ? '' : 's') + '.' : '.'),
          reason: 'snap'
        });
      }
    }, 100);
  }

  function bootCrate() {
    if (!root.CrateVault) return;
    var CV = root.CrateVault;
    var k = parseInt(params.d, 10);
    if (!isFinite(k)) k = 2;
    /* p is 1-based in the URL so "puzzle 1" is the first bank entry. */
    var idx = params.p !== '' && params.p != null ? parseInt(params.p, 10) : NaN;
    var mask = params.orient !== '' ? parseInt(params.orient, 10) : NaN;
    if (typeof CV.load === 'function' && isFinite(idx) && idx >= 1) {
      var o = isFinite(mask) ? mask : 0;
      CV.load(k, idx - 1, o);
    } else if (typeof CV.setDifficulty === 'function') {
      withSeed(function () { CV.setDifficulty(k); });
    } else if (params.d && typeof CV.generate === 'function') {
      /* generate is used internally; setDifficulty is added in the crate patch */
    }
  }

  function bootPipe() {
    if (typeof root.setPipeDifficulty === 'function') {
      withSeed(function () { root.setPipeDifficulty(params.d || 'easy'); });
    } else if (typeof root.initPipe === 'function') {
      withSeed(function () { root.initPipe(); });
    }
  }

  function bootBridges() {
    if (root.RuneBridges && typeof root.RuneBridges.setDifficulty === 'function') {
      var k = parseInt(params.d, 10);
      withSeed(function () { root.RuneBridges.setDifficulty(isFinite(k) ? k : 4); });
    }
  }

  function bootKnight() {
    if (root.KnightTour && typeof root.KnightTour.setLevel === 'function') {
      withSeed(function () { root.KnightTour.setLevel(params.d || 'easy'); });
    }
  }

  function bootChessInOne() {
    if (!root.ChessInOne) return;
    var CIO = root.ChessInOne;
    if (params.p && typeof CIO.load === 'function') CIO.load(params.p);
    else if (params.d && typeof CIO.loadTier === 'function') CIO.loadTier(parseInt(params.d, 10));
  }

  function bootDragon() {
    var ui = root.DragonChessUI;
    if (!ui || typeof ui.startOnce !== 'function') return;
    hideNewDialog();
    var level = parseInt(params.d, 10);
    if (!isFinite(level)) level = 1;
    var side = 1;
    if (params.side === 'scarlet' || params.side === '-1') side = -1;
    ui.startOnce({ level: level, side: side });
    var lastOver = false;
    setInterval(function () {
      if (frozen || !ui.result) return;
      var r = ui.result();
      if (!r || !r.over) { lastOver = false; return; }
      if (lastOver) return;
      lastOver = true;
      if (r.success) succeed({ summary: r.summary || 'You won.', reason: 'win' });
      else fail({ summary: r.summary || (r.draw ? 'The game was a draw.' : 'You lost.'), reason: r.draw ? 'draw' : 'loss' });
    }, 200);
  }

  function bootGame() {
    try {
      if (gameId === 'lock') bootLock();
      else if (gameId === 'crate') bootCrate();
      else if (gameId === 'pipe') bootPipe();
      else if (gameId === 'bridges') bootBridges();
      else if (gameId === 'knight') bootKnight();
      else if (gameId === 'chess-in-one') bootChessInOne();
      else if (gameId === 'dragonchess' || gameId === 'wyvern') bootDragon();
    } catch (e) { /* adapters must never break a normal page; once mode still freezes via showWin */ }
  }

  /* ---------- boot ---------- */

  function boot() {
    injectStyle();
    if (!code) return;
    if (!valid) {
      showInvalid(invalidReason);
      return;
    }
    markHtml();
    wrapShowWin();
    if (record && record.result) {
      showFreeze(record);
      return;
    }
    if (record && record.started && !record.result) {
      fail({ summary: 'Session was left before finishing.', reason: 'left' });
      return;
    }
    showBanner();
    showGiveUp();
    listenFirstInput();
    bootGame();
  }

  function whenReady(fn) {
    /* Wait for window load so game onload handlers (e.g. Pipe Maze) finish first,
       then a 0-timeout so any remaining init runs before we pin the puzzle. */
    function go() { setTimeout(fn, 0); }
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  }

  parseParams();
  if (code && !valid) {
    injectStyle();
    whenReady(function () { showInvalid(invalidReason); });
  } else if (active) {
    try { document.documentElement.classList.add('vault-once'); } catch (e) { /* ignore */ }
    injectStyle();
    whenReady(boot);
  }

  function buildQuery(opts) {
    opts = opts || {};
    var c = opts.code || makeCode();
    var q = ['once=' + encodeURIComponent(c)];
    if (opts.d) q.push('d=' + encodeURIComponent(opts.d));
    if (opts.p != null && opts.p !== '') q.push('p=' + encodeURIComponent(opts.p));
    if (opts.seed) q.push('seed=' + encodeURIComponent(opts.seed));
    if (opts.side) q.push('side=' + encodeURIComponent(opts.side));
    if (opts.orient != null && opts.orient !== '') q.push('orient=' + encodeURIComponent(opts.orient));
    return { code: c, query: q.join('&') };
  }

  function makeUrl(gameFile, opts) {
    var b = buildQuery(opts);
    var base = String(gameFile || '');
    return { code: b.code, url: base + '?' + b.query };
  }

  root.VaultOnce = {
    GAMES: GAMES,
    ALPH: ALPH,
    active: function () { return active && valid; },
    code: function () { return code; },
    params: function () { return params; },
    valid: function () { return valid; },
    frozen: function () { return frozen; },
    started: function () { return started; },
    record: function () { return record; },
    makeCode: makeCode,
    isValidCode: isValidCode,
    makeUrl: makeUrl,
    buildQuery: buildQuery,
    markStarted: markStarted,
    succeed: succeed,
    fail: fail,
    giveUp: giveUp,
    withSeed: withSeed,
    seedFromString: seedFromString,
    diffLabel: diffLabel,
    gameById: gameById,
    /* Test helper: force a mid-session started record without finishing. */
    _forceStarted: markStarted
  };
})(typeof window !== 'undefined' ? window : this);
