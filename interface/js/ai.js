// The computer player. It looks at every place the piece can go (each
// rotation, each column, dropped straight down), scores the well each would
// leave with Pierre Dellacherie's features (the weights El-Tetris found),
// and picks one. A perfect player never loses, and a game that never ends
// never puts up a high score, so this one is a little relaxed: it picks one
// of the three best places by chance, weighted towards the best, and how
// much better the best has to be before it's sure of it is its
// `temperature`. Only the three best, so a slip is a near miss, never
// something silly.

import { W, H, SHAPES, cells, fits, dropDistance } from "./tetris.js";

const WEIGHTS = {
  landing: -4.500158825082766,
  eroded: 3.4181268101392694,
  rowTransitions: -3.2178882868487753,
  colTransitions: -9.348695305445199,
  holes: -7.899265427351652,
  wells: -3.3855972247263626,
};

/**
 * How each skill plays: higher temperature, more slips. Tuned with
 * tools/sim.mjs; the lines a game lasts, mean (quartiles):
 * beginner 43 (30–52), good 85 (57–94), expert 186 (109–225).
 */
export const SKILLS = {
  beginner: 30,
  good: 20,
  expert: 15,
};

/** The places it chooses between. */
const TOP = 3;

/**
 * Where to put piece `p` ({ type, rot, x, y }), reached from where it is now:
 * turn it there, slide it along that row, drop it. → { rot, x, score }, or
 * null when it can't move at all. `random` gives [0, 1). Temperature 0: always
 * the best.
 */
export function choose(board, p, temperature, random = Math.random) {
  const options = placements(board, p).sort((a, b) => b.score - a.score).slice(0, TOP);
  if (!options.length) return null;
  const best = options[0].score;
  if (temperature <= 0) return options[0];
  let total = 0;
  for (const o of options) total += o.w = Math.exp((o.score - best) / temperature);
  let r = random() * total;
  for (const o of options) if ((r -= o.w) <= 0) return o;
  return options[options.length - 1];
}

/** Every place `p` can reach, scored. */
export function placements(board, p) {
  const out = [];
  const turns = SHAPES[p.type].length;
  for (let r = 0; r < turns; r++) {
    // The shorter way round, and every state on the way has to fit.
    const cw = (r - p.rot + turns) % turns;
    const dir = cw <= turns - cw ? 1 : -1;
    let q = { ...p },
      ok = true;
    while (q.rot !== r) {
      q = { ...q, rot: (q.rot + dir + turns) % turns };
      if (!fits(board, q)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    out.push(score(board, q));
    for (const step of [-1, 1]) {
      for (let s = { ...q, x: q.x + step }; fits(board, s); s = { ...s, x: s.x + step }) out.push(score(board, s));
    }
  }
  return out;
}

function score(board, p) {
  const landed = { ...p, y: p.y + dropDistance(board, p) };
  const where = cells(landed);
  // The well after: the piece in, full rows out.
  const rows = board.map((r) => r.slice());
  let above = false;
  for (const [x, y] of where) {
    if (y < 0) above = true;
    else rows[y][x] = 1;
  }
  let cleared = 0,
    pieceCleared = 0;
  const kept = [];
  for (let y = 0; y < H; y++) {
    if (rows[y].every((c) => c)) {
      cleared++;
      pieceCleared += where.filter(([, py]) => py === y).length;
    } else kept.push(rows[y]);
  }
  while (kept.length < H) kept.unshift(new Uint8Array(W));
  const f = features(kept);
  const ys = where.map(([, y]) => y);
  const landing = H - (Math.min(...ys) + Math.max(...ys)) / 2;
  let s =
    WEIGHTS.landing * landing +
    WEIGHTS.eroded * cleared * pieceCleared +
    WEIGHTS.rowTransitions * f.rowTransitions +
    WEIGHTS.colTransitions * f.colTransitions +
    WEIGHTS.holes * f.holes +
    WEIGHTS.wells * f.wells;
  if (above) s -= 1e6;
  return { rot: p.rot, x: p.x, score: s };
}

/** Dellacherie's measures of a well: how ragged, how holey. */
export function features(rows) {
  let rowTransitions = 0,
    colTransitions = 0,
    holes = 0,
    wells = 0;
  const filled = (x, y) => x < 0 || x >= W || y >= H || (y >= 0 && rows[y][x] !== 0);
  for (let y = 0; y < H; y++) {
    // Walls count as filled.
    for (let x = 0; x <= W; x++) if (filled(x - 1, y) !== filled(x, y)) rowTransitions++;
  }
  for (let x = 0; x < W; x++) {
    let seen = false,
      depth = 0;
    // The floor counts as filled; above the top as empty.
    for (let y = 0; y <= H; y++) {
      const f = filled(x, y);
      if (f !== filled(x, y - 1)) colTransitions++;
      if (y < H) {
        if (f) seen = true;
        else if (seen) holes++;
        if (!f && filled(x - 1, y) && filled(x + 1, y)) wells += ++depth;
        else depth = 0;
      }
    }
  }
  return { rowTransitions, colTransitions, holes, wells };
}
