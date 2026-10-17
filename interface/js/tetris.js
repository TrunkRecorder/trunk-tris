// The rules: a well 10 wide and 20 deep (18 on the Game Boy), the seven
// pieces as NES Tetris has them (its spawn place and rotations, no wall
// kicks), line clears, and NES scoring.
// No timing here: game.js decides when things happen.

export const W = 10;
/** NES Tetris's well; the Game Boy's is GB_H. A board is as deep as its rows. */
export const H = 20;
export const GB_H = 18;

/** In the order NES Tetris's statistics list them. */
export const PIECES = ["T", "J", "Z", "O", "S", "L", "I"];

/** Each piece's cells around its pivot, as it spawns: x right, y down. */
const SPAWN = {
  T: [[-1, 0], [0, 0], [1, 0], [0, 1]],
  J: [[-1, 0], [0, 0], [1, 0], [1, 1]],
  Z: [[-1, 0], [0, 0], [0, 1], [1, 1]],
  O: [[-1, 0], [0, 0], [-1, 1], [0, 1]],
  S: [[0, 0], [1, 0], [-1, 1], [0, 1]],
  L: [[-1, 0], [0, 0], [1, 0], [-1, 1]],
  I: [[-2, 0], [-1, 0], [0, 0], [1, 0]],
};
const TURNS = { T: 4, J: 4, L: 4, Z: 2, S: 2, I: 2, O: 1 };

/** SHAPES[piece][rotation]: its cells, each a quarter turn clockwise from the last. */
export const SHAPES = Object.fromEntries(
  PIECES.map((p) => {
    const states = [SPAWN[p]];
    for (let r = 1; r < TURNS[p]; r++) states.push(states[r - 1].map(([x, y]) => [-y, x]));
    return [p, states];
  }),
);

/** Where a piece's pivot appears. */
export const SPAWN_X = 5;
export const SPAWN_Y = 0;

/** An empty well: `rows` rows of W cells, 0 empty, else 1 + the piece's index in PIECES. */
export const emptyBoard = (rows = H) => Array.from({ length: rows }, () => new Uint8Array(W));

export const cellOf = (type) => PIECES.indexOf(type) + 1;

/** The cells piece `p` ({ type, rot, x, y }) covers. */
export const cells = (p) => SHAPES[p.type][p.rot].map(([dx, dy]) => [p.x + dx, p.y + dy]);

/** Whether `p` fits: inside the walls and the floor, on nothing. Above the top is open. */
export function fits(board, p) {
  for (const [x, y] of cells(p)) {
    if (x < 0 || x >= W || y >= board.length) return false;
    if (y >= 0 && board[y][x]) return false;
  }
  return true;
}

/** How far `p` falls before it lands. */
export function dropDistance(board, p) {
  let d = 0;
  while (fits(board, { ...p, y: p.y + d + 1 })) d++;
  return d;
}

/**
 * Writes `p` into the board. Returns false when part of it is above the top
 * (the stack has reached the ceiling: game over).
 */
export function place(board, p) {
  const v = cellOf(p.type);
  let inside = true;
  for (const [x, y] of cells(p)) {
    if (y < 0) inside = false;
    else board[y][x] = v;
  }
  return inside;
}

/** The rows that are full, top to bottom. */
export function fullRows(board) {
  const rows = [];
  for (let y = 0; y < board.length; y++) if (board[y].every((c) => c)) rows.push(y);
  return rows;
}

/** Takes `rows` out, and everything above drops. */
export function removeRows(board, rows) {
  const gone = new Set(rows);
  const kept = board.filter((_, y) => !gone.has(y));
  while (kept.length < board.length) kept.unshift(new Uint8Array(W));
  for (let y = 0; y < board.length; y++) board[y] = kept[y];
}

/** NES Tetris's points for clearing `n` lines at once on `level`. */
export const points = (n, level) => [0, 40, 100, 300, 1200][n] * (level + 1);

/** NES Tetris from level 0: up a level every 10 lines. */
export const levelFor = (lines) => Math.floor(lines / 10);
