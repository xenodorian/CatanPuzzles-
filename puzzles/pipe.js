// ════════════════════════════════════════
//  PUZZLE 1: PIPE MAZE
// ════════════════════════════════════════
// Pipe types: 'L' (corner), 'I' (straight), 'T' (tee), '+' (cross)
// PIPE_CONN[type][rotation] = [N,E,S,W] open sides. Each rotation is a 90 degree clockwise turn.
const PIPE_CONN = {
  'L': [[0,1,1,0],[0,0,1,1],[1,0,0,1],[1,1,0,0]], // ES, SW, WN, NE
  'I': [[1,0,1,0],[0,1,0,1],[1,0,1,0],[0,1,0,1]],
  'T': [[0,1,1,1],[1,0,1,1],[1,1,0,1],[1,1,1,0]], // missing N, E, S, W
  '+': [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
};
// N=0 connects to cell above (row-1), E=1 right (col+1), S=2 below (row+1), W=3 left (col-1)
const DIR_DR = [-1,0,1,0];
const DIR_DC = [0,1,0,-1];
const OPP = [2,3,0,1];

const PIPE_LEVELS = { easy: 5, medium: 6, hard: 7 };
// Easy puzzles must have at least this many distinct routes from source to seal.
const PIPE_EASY_MIN_ROUTES = 2;
let pipeDifficulty = 'easy';

let pipeGrid = [], pipeRows = 5, pipeCols = 5, pipeMoves = 0;
let pipeSource = [0,0], pipeTarget = [4,4];

function isPipeFixed(r, c) {
  return (r===pipeSource[0] && c===pipeSource[1]) || (r===pipeTarget[0] && c===pipeTarget[1]);
}

// Water flow from the source. Returns { found, lit } where lit is a Set of "r,c" keys reached.
// A step between neighbours only counts if BOTH tiles are open toward each other.
// Any connected route from source to target counts, not only the generated one.
function computePipeFlow(grid, rows, cols, src, tgt) {
  const lit = new Set([`${src[0]},${src[1]}`]);
  const queue = [[src[0], src[1]]];
  let found = false;
  while (queue.length) {
    const [r,c] = queue.shift();
    if (r===tgt[0] && c===tgt[1]) found = true;
    const conn = PIPE_CONN[grid[r][c].type][grid[r][c].rot];
    for (let d=0; d<4; d++) {
      if (!conn[d]) continue;
      const nr=r+DIR_DR[d], nc=c+DIR_DC[d];
      if (nr<0||nr>=rows||nc<0||nc>=cols) continue;
      const key = `${nr},${nc}`;
      if (lit.has(key)) continue;
      const nconn = PIPE_CONN[grid[nr][nc].type][grid[nr][nc].rot];
      if (!nconn[OPP[d]]) continue;
      lit.add(key);
      queue.push([nr,nc]);
    }
  }
  return { found, lit };
}

// Counts distinct water routes: simple chains of cells from source to target where every
// cell on the chain can be turned to open toward both of its chain neighbours (L: a corner,
// I: straight through, T and +: any two sides). Source and target cannot turn, so they must
// already face the chain. Each route is a different way to solve the puzzle. Stops at `limit`.
function countPipeRoutes(grid, rows, cols, src, tgt, limit = Infinity) {
  const fixedOpen = (r,c,d) => PIPE_CONN[grid[r][c].type][grid[r][c].rot][d] === 1;
  const canJoin = (r,c,a,b) => {
    const t = grid[r][c].type;
    if (t === 'T' || t === '+') return true;
    const straight = OPP[a] === b;
    return t === 'I' ? straight : !straight;
  };
  const seen = new Set([`${src[0]},${src[1]}`]);
  let count = 0;
  function walk(r, c, inDir) {
    if (count >= limit) return;
    for (let d=0; d<4; d++) {
      const nr=r+DIR_DR[d], nc=c+DIR_DC[d];
      if (nr<0||nr>=rows||nc<0||nc>=cols) continue;
      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      // leaving (r,c) through side d
      if (inDir === -1 ? !fixedOpen(r,c,d) : !canJoin(r,c,inDir,d)) continue;
      if (nr===tgt[0] && nc===tgt[1]) {
        if (fixedOpen(nr,nc,OPP[d])) count++;
        if (count >= limit) return;
        continue;
      }
      seen.add(key);
      walk(nr, nc, OPP[d]);
      seen.delete(key);
      if (count >= limit) return;
    }
  }
  walk(src[0], src[1], -1);
  return count;
}

// Build a puzzle from a known solution: a connected path first, each path cell given the
// piece type that path needs, then only rotations are used to scramble.
// Returns { grid, path }.
function buildPipePuzzle(rows, cols, src, tgt) {
  const path = generatePath(src, tgt, rows, cols);
  const grid = Array.from({length:rows}, () =>
    Array.from({length:cols}, () => ({type:'I', rot:0, lit:false}))
  );

  // Path cells get the exact piece the solution needs.
  for (let k=0; k<path.length; k++) {
    const [r,c] = path[k];
    let fromDir = -1, toDir = -1;
    if (k>0) { const [pr,pc]=path[k-1]; fromDir=getDirIndex(pr,pc,r,c); }
    if (k<path.length-1) { const [nr,nc]=path[k+1]; toDir=getDirIndex(r,c,nr,nc); }
    grid[r][c] = assignPipe(fromDir, toDir);
  }

  // Non-path cells get random filler pipes.
  const pathSet = new Set(path.map(([r,c])=>`${r},${c}`));
  const fillers = ['L','I','T','+'];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    if (!pathSet.has(`${r},${c}`)) {
      grid[r][c] = { type: fillers[Math.floor(Math.random()*fillers.length)], rot: Math.floor(Math.random()*4), lit:false };
    }
  }

  // Scramble by rotation only. Source and target are fixed (the player cannot rotate them),
  // so they keep their solved orientation. Re-roll until the puzzle is not already solved.
  const movable = [];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    if (!(r===src[0]&&c===src[1]) && !(r===tgt[0]&&c===tgt[1])) movable.push([r,c]);
  }
  const solvedNow = () => computePipeFlow(grid, rows, cols, src, tgt).found;
  for (let attempt=0; attempt<1000; attempt++) {
    for (const [r,c] of movable) grid[r][c].rot = Math.floor(Math.random()*4);
    if (!solvedNow()) return { grid, path };
  }
  // Deterministic fallback: turn path cells away from the solution until flow breaks.
  for (const [r,c] of path) {
    if (!movable.some(([mr,mc])=>mr===r&&mc===c)) continue;
    if (grid[r][c].type === 'I' || grid[r][c].type === 'L') {
      for (let t=0;t<4;t++) {
        grid[r][c].rot = t;
        if (!solvedNow()) return { grid, path };
      }
    }
  }
  return { grid, path };
}

// Easy puzzles are rebuilt until they have at least two distinct routes, so there is more
// than one way to win (most builds already qualify, so this takes a try or two). Medium and
// Hard are built exactly as before.
function buildPipeLevel(level, rows, cols, src, tgt) {
  for (;;) {
    const { grid } = buildPipePuzzle(rows, cols, src, tgt);
    if (level !== 'easy') return grid;
    if (countPipeRoutes(grid, rows, cols, src, tgt, PIPE_EASY_MIN_ROUTES) >= PIPE_EASY_MIN_ROUTES) return grid;
  }
}

function setPipeDifficulty(level) {
  if (!PIPE_LEVELS[level]) return;
  pipeDifficulty = level;
  initPipe();
}

function updateDifficultyButtons() {
  document.querySelectorAll('#pipe-diff .btn').forEach(b => {
    const on = b.dataset.level === pipeDifficulty;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function initPipe() {
  const n = PIPE_LEVELS[pipeDifficulty];
  pipeRows = n; pipeCols = n;
  pipeSource = [0,0];
  pipeTarget = [n-1,n-1];
  pipeMoves = 0;
  document.getElementById('pipe-moves').textContent = 'Rotations: 0';
  document.getElementById('pipe-status').textContent = '';
  document.getElementById('pipe-status').className = 'status-msg';

  pipeGrid = buildPipeLevel(pipeDifficulty, pipeRows, pipeCols, pipeSource, pipeTarget);
  updateDifficultyButtons();
  renderPipe();
}

function getDirIndex(r1,c1,r2,c2) {
  if (r2<r1) return 0; // N
  if (c2>c1) return 1; // E
  if (r2>r1) return 2; // S
  return 3; // W
}

function assignPipe(fromDir, toDir) {
  // fromDir: direction we travelled to arrive here (-1 for the source)
  // toDir: direction we travel to leave here (-1 for the target)
  if (fromDir === -1) return straightOrCorner(toDir);            // source: open toward the path
  if (toDir === -1) return straightOrCorner(OPP[fromDir]);       // target: open toward the path
  const backDir = OPP[fromDir]; // the side that faces the previous cell
  // Path cells use only L (turn) or I (straight): exactly the two sides the path needs.
  for (const type of ['L','I']) {
    for (let rot=0;rot<4;rot++) {
      const conn = PIPE_CONN[type][rot];
      if (conn[backDir] && conn[toDir] && conn[0]+conn[1]+conn[2]+conn[3] === 2) return {type, rot, lit:false};
    }
  }
  throw new Error('no pipe fits path cell');
}

function straightOrCorner(dir) {
  // Source and target are straight pipes laid along the axis of their single path neighbour.
  if (dir===0||dir===2) return {type:'I',rot:0,lit:false};
  return {type:'I',rot:1,lit:false};
}

function generatePath(src, tgt, rows, cols) {
  // Random self-avoiding walk. A step is only taken if the target stays reachable through
  // unvisited cells, so the walk can never dead-end and always finishes at the target.
  const key = (r,c) => `${r},${c}`;
  const visited = new Set([key(src[0],src[1])]);
  const path = [[src[0], src[1]]];

  function reachable(fr, fc) {
    if (fr===tgt[0] && fc===tgt[1]) return true;
    const seen = new Set([key(fr,fc)]);
    const stack = [[fr,fc]];
    while (stack.length) {
      const [r,c] = stack.pop();
      for (let d=0; d<4; d++) {
        const nr=r+DIR_DR[d], nc=c+DIR_DC[d];
        if (nr<0||nr>=rows||nc<0||nc>=cols) continue;
        const k = key(nr,nc);
        if (seen.has(k)) continue;
        if (nr===tgt[0] && nc===tgt[1]) return true;
        if (visited.has(k)) continue;
        seen.add(k);
        stack.push([nr,nc]);
      }
    }
    return false;
  }

  while (true) {
    const [r,c] = path[path.length-1];
    if (r===tgt[0] && c===tgt[1]) break;
    let moved = false;
    for (const d of shuffleArray([0,1,2,3])) {
      const nr=r+DIR_DR[d], nc=c+DIR_DC[d];
      if (nr<0||nr>=rows||nc<0||nc>=cols||visited.has(key(nr,nc))) continue;
      visited.add(key(nr,nc));
      if (reachable(nr,nc)) { path.push([nr,nc]); moved = true; break; }
      visited.delete(key(nr,nc));
    }
    if (!moved) throw new Error('path generation failed'); // cannot happen on an open grid
  }
  return path;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function rotatePipe(r,c) {
  if (isPipeFixed(r,c)) return;
  const cell = pipeGrid[r][c];
  cell.rot = (cell.rot+1)%4;
  pipeMoves++;
  document.getElementById('pipe-moves').textContent = `Rotations: ${pipeMoves}`;
  // The old highlight no longer reflects the new layout
  for (let rr=0;rr<pipeRows;rr++) for (let cc=0;cc<pipeCols;cc++) pipeGrid[rr][cc].lit=false;
  renderPipe();
}

function getConnections(r,c) {
  const {type,rot} = pipeGrid[r][c];
  return PIPE_CONN[type][rot];
}

function checkPipe() {
  const { found, lit } = computePipeFlow(pipeGrid, pipeRows, pipeCols, pipeSource, pipeTarget);
  for (let r=0;r<pipeRows;r++) for (let c=0;c<pipeCols;c++) pipeGrid[r][c].lit = lit.has(`${r},${c}`);

  renderPipe();
  const st = document.getElementById('pipe-status');
  if (found) {
    st.textContent = '✦ The water flows! The seal glows green. ✦';
    st.className = 'status-msg success';
    setTimeout(() => showWin('The mechanism unlocks with a resonant hum.'), 600);
  } else {
    st.textContent = 'The water stalls. The flow is blocked.';
    st.className = 'status-msg fail';
  }
}

function renderPipe() {
  const grid = document.getElementById('pipe-grid');
  grid.innerHTML = '';
  grid.style.setProperty('--n', pipeCols);
  for (let r=0;r<pipeRows;r++) {
    for (let c=0;c<pipeCols;c++) {
      const cell = pipeGrid[r][c];
      const div = document.createElement('div');
      div.className = 'pipe-cell';
      if (r===pipeSource[0]&&c===pipeSource[1]) div.classList.add('source');
      if (r===pipeTarget[0]&&c===pipeTarget[1]) div.classList.add('target');
      if (cell.lit) div.classList.add('lit');
      div.onclick = () => rotatePipe(r,c);

      // Draw pipe
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 56 56');
      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('stroke', cell.lit ? 'var(--rune)' : 'var(--gold)');
      g.setAttribute('stroke-width','4');
      g.setAttribute('fill','none');
      g.setAttribute('stroke-linecap','round');

      const conn = getConnections(r,c);
      if (conn[0]) { const l = document.createElementNS('http://www.w3.org/2000/svg','line'); l.setAttribute('x1','28'); l.setAttribute('y1','4'); l.setAttribute('x2','28'); l.setAttribute('y2','28'); g.appendChild(l); }
      if (conn[1]) { const l = document.createElementNS('http://www.w3.org/2000/svg','line'); l.setAttribute('x1','52'); l.setAttribute('y1','28'); l.setAttribute('x2','28'); l.setAttribute('y2','28'); g.appendChild(l); }
      if (conn[2]) { const l = document.createElementNS('http://www.w3.org/2000/svg','line'); l.setAttribute('x1','28'); l.setAttribute('y1','52'); l.setAttribute('x2','28'); l.setAttribute('y2','28'); g.appendChild(l); }
      if (conn[3]) { const l = document.createElementNS('http://www.w3.org/2000/svg','line'); l.setAttribute('x1','4'); l.setAttribute('y1','28'); l.setAttribute('x2','28'); l.setAttribute('y2','28'); g.appendChild(l); }

      svg.appendChild(g);
      div.appendChild(svg);
      grid.appendChild(div);
    }
  }
}

// ════════════════════════════════════════
//  INITIALIZATION
// ════════════════════════════════════════
window.onload = function() {
  initPipe();
};
