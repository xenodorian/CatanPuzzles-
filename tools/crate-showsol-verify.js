// Verify that CrateVault.solutionMoves() (the Show Solution path) actually
// solves every bank level in every orientation for every difficulty.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'puzzles', 'crate.js'), 'utf8');
const document = {
  readyState: 'complete',
  getElementById: function () { return null; },
  addEventListener: function () {},
  createElement: function () { return { style: {}, appendChild: function () {} }; },
  head: { appendChild: function () {} }
};
const ctx = {
  window: { document: document },
  document: document,
  console: console
};
ctx.window = ctx.window;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const CV = ctx.window.CrateVault;
if (!CV || typeof CV.solutionMoves !== 'function' || typeof CV.loadLevel !== 'function') {
  console.error('CrateVault.solutionMoves / loadLevel not available');
  process.exit(1);
}

const diffs = [2, 3, 4, 5];
const labels = { 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Very Hard' };
let total = 0, ok = 0, bankOk = 0, altUsed = 0, bfsUsed = 0;
const failures = [];
const sourceCounts = { bank: 0, alternate: 0, bfs: 0, none: 0 };

for (let d = 0; d < diffs.length; d++) {
  const k = diffs[d];
  const n = CV.catalog(k);
  let dOk = 0;
  for (let idx = 0; idx < n; idx++) {
    for (let orient = 0; orient < 8; orient++) {
      total++;
      const level = CV.loadLevel(k, idx, orient);
      if (!level) {
        failures.push({ k, idx, orient, reason: 'loadLevel returned null' });
        continue;
      }
      const moves = CV.solutionMoves(level);
      let source = 'none';
      if (moves && moves === level.solution) source = 'bank';
      else if (moves && level.alternate && moves === level.alternate) source = 'alternate';
      else if (moves) source = 'bfs';
      sourceCounts[source]++;
      const r = CV.applyMoves(level, moves);
      if (moves && r.legal && r.solved) {
        ok++;
        dOk++;
        if (source === 'bank') bankOk++;
        if (source === 'alternate') altUsed++;
        if (source === 'bfs') bfsUsed++;
      } else {
        failures.push({
          k, idx, orient, source,
          reason: !moves ? 'no moves' : (!r.legal ? 'illegal' : 'not solved'),
          len: (moves || '').length
        });
      }
    }
  }
  console.log(labels[k] + ' (k=' + k + '): ' + dOk + '/' + (n * 8) + '  (' + n + ' levels × 8 orientations)');
}

console.log('---');
console.log('Total: ' + ok + '/' + total + ' solved');
console.log('Sources: bank=' + sourceCounts.bank +
  ' alternate=' + sourceCounts.alternate +
  ' bfs-fallback=' + sourceCounts.bfs +
  ' none=' + sourceCounts.none);
if (failures.length) {
  console.log('FAILURES:');
  failures.slice(0, 20).forEach(function (f) { console.log(JSON.stringify(f)); });
  if (failures.length > 20) console.log('... and ' + (failures.length - 20) + ' more');
  process.exit(1);
}
console.log('OK');
