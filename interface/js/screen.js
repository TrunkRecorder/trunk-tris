// Draws a game as an NES screen, 256 × 240, laid out the way NES Tetris
// is: the well in the middle with LINES over it, TOP / SCORE, NEXT and
// LEVEL on the right, the statistics on the left (here grouped by the kind
// of message that makes each piece), and a line along the bottom for the
// message that made the latest one. The blocks take NES Tetris's colors,
// which change with the level; "modern" colors are the ones every piece
// has had since.

import { W, H, SHAPES, PIECES } from "./tetris.js";
import { CLEAR, CURTAIN, SCORES_FOR } from "./game.js";
import { GROUPS, GROUP_NAMES } from "./feed.js";
import { text, fontText } from "./font.js";

export const SCREEN_W = 256;
export const SCREEN_H = 240;

/** NES Tetris's two colors for each level, 0–9; level 10 looks like 0 again. */
const NES = [
  ["#0058f8", "#3cbcfc"],
  ["#00a800", "#b8f818"],
  ["#d800cc", "#f878f8"],
  ["#0058f8", "#58d854"],
  ["#e40058", "#58f898"],
  ["#58f898", "#6888fc"],
  ["#f83800", "#7c7c7c"],
  ["#6844fc", "#a80020"],
  ["#0058f8", "#f83800"],
  ["#f83800", "#fca044"],
];
const MODERN = { I: "#00f0f0", O: "#f0f000", T: "#a000f0", S: "#00f000", Z: "#f00000", J: "#0000f0", L: "#f0a000" };
const WHITE = "#fcfcfc";
const GRAY = "#bcbcbc";
const DIM = "#7c7c7c";
const GOLD = "#fca044";
const RED = "#f83800";
const GREEN = "#58d854";

/** The well's place on the screen. */
const WELL_X = 96;
const WELL_Y = 40;

/** How a piece looks: { style: "ring" | "solid", color }. */
export function look(type, level, colors) {
  if (colors === "modern") return { style: "solid", color: MODERN[type] };
  const [a, b] = NES[level % 10];
  if (type === "T" || type === "O" || type === "I") return { style: "ring", color: a };
  return { style: "solid", color: type === "J" || type === "S" ? a : b };
}

/** One block, `size` pixels a side (8 in the well), the last row and column left dark. */
function block(ctx, x, y, { style, color }, size = 8) {
  const s = size - 1;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = WHITE;
  if (style === "ring") {
    if (size >= 6) ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillRect(x, y, 1, 1);
  } else {
    ctx.fillRect(x, y, 1, 1);
    if (size >= 6) ctx.fillRect(x + 1, y + 1, 2, 1), ctx.fillRect(x + 1, y + 2, 1, 1);
  }
}

function curtainBlock(ctx, x, y) {
  ctx.fillStyle = DIM;
  ctx.fillRect(x, y, 7, 7);
  ctx.fillStyle = GRAY;
  ctx.fillRect(x, y, 7, 1);
  ctx.fillRect(x, y + 3, 7, 1);
}

/** A piece by itself (NEXT, the statistics), centered on (cx, cy). */
function pieceAt(ctx, type, cx, cy, lk, size) {
  const cs = SHAPES[type][0];
  const xs = cs.map(([x]) => x),
    ys = cs.map(([, y]) => y);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * size,
    h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  const ox = Math.round(cx - w / 2) - Math.min(...xs) * size,
    oy = Math.round(cy - h / 2) - Math.min(...ys) * size;
  for (const [x, y] of cs) block(ctx, ox + x * size, oy + y * size, lk, size);
}

/** A frame with rounded corners: gray, white, gray, and black inside. */
function frame(ctx, x, y, w, h) {
  const fill = (inset, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + inset + 1, y + inset, w - 2 * inset - 2, h - 2 * inset);
    ctx.fillRect(x + inset, y + inset + 1, w - 2 * inset, h - 2 * inset - 2);
  };
  fill(0, DIM);
  fill(1, WHITE);
  fill(2, DIM);
  ctx.fillStyle = "#000";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
}

const centered = (ctx, s, cx, y, color) => text(ctx, s, Math.round(cx - (fontText(s).length * 8) / 2), y, color);
const pad = (n, k) => String(Math.max(0, Math.floor(n))).padStart(k, "0");

/** The layout: what's drawn once, under everything else. */
const BOXES = {
  name: [8, 8, 80, 32],
  lines: [96, 8, 80, 24],
  well: [WELL_X - 3, WELL_Y - 3, W * 8 + 6, H * 8 + 6],
  stats: [8, 48, 80, 156],
  score: [184, 8, 64, 56],
  next: [184, 72, 64, 48],
  level: [184, 128, 64, 32],
  rate: [184, 168, 64, 36],
  feed: [8, 210, 240, 24],
};

/** The rows of the statistics: a heading for each kind of message, then its pieces. */
const STAT_ROWS = (() => {
  const rows = [];
  let y = 54;
  for (const [group, pieces] of Object.entries(GROUPS)) {
    rows.push({ group, y });
    y += 11;
    for (const type of pieces) {
      rows.push({ type, group, y });
      y += 15;
    }
  }
  return rows;
})();

let backdrop = null;

/** The background tiles and the empty boxes, drawn once. */
function background() {
  if (backdrop) return backdrop;
  const c = new OffscreenCanvas(SCREEN_W, SCREEN_H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // A brickwork of dark tiles, as NES Tetris has around its boxes.
  for (let y = 0; y < SCREEN_H; y += 8)
    for (let x = 0; x < SCREEN_W; x += 8) {
      const off = (y / 8) % 2 ? 4 : 0;
      ctx.fillStyle = "#262626";
      ctx.fillRect(x, y, 8, 1);
      ctx.fillRect((x + off) % SCREEN_W, y, 1, 8);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x + 1, y + 1, 7, 7);
      ctx.fillStyle = "#303030";
      ctx.fillRect(x + 2, y + 2, 1, 1);
    }
  for (const [x, y, w, h] of Object.values(BOXES)) frame(ctx, x, y, w, h);
  return (backdrop = c);
}

/**
 * Draws `game` (game.js) into `ctx`. `view`: { name, colors, paused, calls
 * (on the air now), playing (its live audio is playing), label (the feed's
 * text), now (s, for blinking), scores (the high score table), dates (the
 * table's dates, formatted), top }.
 */
export function draw(ctx, game, view) {
  ctx.imageSmoothingEnabled = false;
  if (game.mode === "scores") return drawScores(ctx, game, view);
  ctx.drawImage(background(), 0, 0);
  const blink = Math.floor(view.now * 2) % 2 === 0;
  const lv = game.level;
  const lk = (type) => look(type, lv, view.colors);

  // The system, and whether it's on the air.
  text(ctx, view.name.slice(0, 9), 12, 14, WHITE);
  if (view.playing) text(ctx, "♪ ON AIR", 12, 26, blink ? GREEN : WHITE);
  else if (view.calls) text(ctx, `ON AIR ${Math.min(view.calls, 9)}`, 12, 26, GREEN);
  else if (game.mode === "play" && game.phase === "wait" && !view.paused) text(ctx, "WAITING", 12, 26, DIM);

  text(ctx, `LINES-${pad(game.lines, 3)}`, 100, 16, WHITE);

  text(ctx, "TOP", 188, 14, WHITE);
  text(ctx, pad(Math.max(view.top, game.score), 6), 192, 24, WHITE);
  text(ctx, "SCORE", 188, 38, WHITE);
  text(ctx, pad(game.score, 6), 192, 48, WHITE);

  text(ctx, "NEXT", 200, 78, WHITE);
  if (game.next) pieceAt(ctx, game.next.type, 216, 104, lk(game.next.type), 8);
  else if (game.mode === "play" && !view.paused) text(ctx, "?", 212, 100, blink ? DIM : "#3c3c3c");

  text(ctx, "LEVEL", 196, 134, WHITE);
  text(ctx, pad(lv, 2), 208, 146, WHITE);

  text(ctx, "MSG/MIN", 188, 174, GRAY);
  const rate = String(Math.min(9999, game.rate));
  text(ctx, rate, 244 - rate.length * 8, 188, WHITE);

  // The statistics: which message makes which piece, and how many of each this game.
  const fresh = game.feed && game.t - game.feed.at < 1.5 ? game.feed : null;
  for (const r of STAT_ROWS) {
    if (!r.type) {
      text(ctx, GROUP_NAMES[r.group], 14, r.y, fresh?.group === r.group ? WHITE : DIM);
      continue;
    }
    pieceAt(ctx, r.type, 30, r.y + 4, lk(r.type), 5);
    text(ctx, pad(game.stats[r.type], 3), 56, r.y + 1, fresh?.type === r.type ? GOLD : RED);
  }

  drawWell(ctx, game, view, lk);

  // The message that made the latest piece.
  if (game.feed) {
    pieceAt(ctx, game.feed.type, 24, 222, lk(game.feed.type), 4);
    text(ctx, (view.label ?? "").slice(0, 25), 36, 218, fresh ? WHITE : GRAY);
  } else text(ctx, view.paused ? "THE RECORDER IS STOPPED" : "LISTENING TO THE RADIO...", 16, 218, DIM);

  if (view.paused && game.mode === "play") messageBox(ctx, ["PAUSE"], "info", blink);
  else if (game.boxes.length) messageBox(ctx, game.boxes[0].lines, game.boxes[0].kind, blink);
}

function drawWell(ctx, game, view, lk) {
  const clearing = game.mode === "play" && game.phase === "clear" ? game.clearing : null;
  // A Tetris flashes the well.
  if (clearing?.tetris && Math.floor(game.timer * 15) % 2) {
    ctx.fillStyle = "#fcfcfc";
    ctx.fillRect(WELL_X, WELL_Y, W * 8, H * 8);
  }
  // Full rows vanish from the middle out, as on the NES: five steps, two columns each.
  const gone = clearing ? Math.min(5, Math.floor(((CLEAR - game.timer) / CLEAR) * 6)) : 0;
  const curtain = game.curtain;
  for (let y = 0; y < H; y++) {
    const full = clearing?.rows.includes(y);
    for (let x = 0; x < W; x++) {
      const px = WELL_X + x * 8,
        py = WELL_Y + y * 8;
      if (y < curtain) {
        curtainBlock(ctx, px, py);
        continue;
      }
      const v = game.board[y][x];
      if (!v) continue;
      if (full && Math.abs(x - 4.5) < gone) continue;
      if (v === CURTAIN) curtainBlock(ctx, px, py);
      else block(ctx, px, py, lk(PIECES[v - 1]));
    }
  }
  const p = game.piece;
  if (p && game.mode === "play") {
    for (const [dx, dy] of SHAPES[p.type][p.rot]) {
      const y = p.y + dy;
      if (y >= 0 && y >= curtain) block(ctx, WELL_X + (p.x + dx) * 8, WELL_Y + y * 8, lk(p.type));
    }
  }
}

/** A message box over the well: "win" gold, "lose" red, "info" white. */
function messageBox(ctx, lines, kind, blink) {
  const len = Math.max(...lines.map((l) => fontText(l).length));
  const w = len * 8 + 24,
    h = lines.length * 12 + 16;
  const x = Math.round(WELL_X + (W * 8) / 2 - w / 2),
    y = Math.round(WELL_Y + (H * 8) / 2 - h / 2);
  frame(ctx, x, y, w, h);
  const first = kind === "win" ? (blink ? GOLD : WHITE) : kind === "lose" ? RED : WHITE;
  lines.forEach((l, i) => centered(ctx, l, x + w / 2, y + 10 + i * 12, i === 0 ? first : WHITE));
}

/** Between games: the high score table, every system's. */
function drawScores(ctx, game, view) {
  ctx.drawImage(background(), 0, 0);
  frame(ctx, 8, 8, 240, 226);
  const blink = Math.floor(view.now * 3) % 2 === 0;
  centered(ctx, "HIGH SCORES", 128, 18, GOLD);
  text(ctx, "SYSTEM", 36, 36, DIM);
  text(ctx, "SCORE", 108, 36, DIM);
  text(ctx, "DATE", 168, 36, DIM);
  const rows = view.scores.slice(0, 10);
  if (!rows.length) centered(ctx, "NO SCORES YET", 128, 100, GRAY);
  rows.forEach((s, i) => {
    const y = 52 + i * 15;
    const mine = game.rank === i + 1;
    const color = mine ? (blink ? GOLD : WHITE) : i === 0 ? WHITE : GRAY;
    text(ctx, String(i + 1).padStart(2, " "), 12, y, color);
    text(ctx, s.system.slice(0, 8), 36, y, color);
    text(ctx, pad(s.score, 6), 108, y, color);
    text(ctx, view.dates[i] ?? "", 168, y, color);
  });
  const left = Math.max(1, Math.ceil(SCORES_FOR - game.timer));
  centered(ctx, `${view.name.slice(0, 12)} NEXT GAME ${left}`, 128, 214, DIM);
}
