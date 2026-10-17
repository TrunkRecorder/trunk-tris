// The Game Boy look: a game drawn as Game Boy Tetris draws it, on a 160 × 144
// screen of four shades (brick walls each side of a well 18 deep, SCORE,
// LEVEL and LINES boxes and the next piece on a dotted panel), then shown
// as the Game Boy's LCD looked, the way emulators recreate it:
//
// - Slow pixels. The LCD took a few frames to change, so moving pieces
//   leave a fading trail. Each frame moves every pixel part of the way to
//   its new shade, as libretro's Game Boy shader blends the frames before.
// - A dot matrix. Each pixel is a square of dark ink over a pale backing,
//   with a lighter gap round it, and even a blank pixel is a little darker
//   than the gaps, so the grid shows everywhere (libretro's "base pixel
//   transparency"; SameBoy's monochrome LCD dims each pixel's edges).
// - Shadows. The ink sits above the backing and casts a soft shadow down
//   and to the right, seen through the pale pixels and in the gaps
//   (libretro's shadow passes: offset, blurred, about half as dark).
// - A little bloom: some of the picture again, smoothed (SameBoy's LCD
//   filter mixes 40% of a smooth picture in; this is gentler).
// - The backing's texture, and the bezel's shadow at the top and left of
//   the screen, which sits below it.
//
// The palettes are SameBoy's (Core/display.c): its DMG green and its Game
// Boy Pocket, darkest first, then the LCD with nothing on it.

import { W, SHAPES, PIECES } from "./tetris.js";
import { CLEAR, SCORES_FOR } from "./game.js";
import { tile, fontText } from "./font.js";

export const LCD_W = 160;
export const LCD_H = 144;

export const PALETTES = {
  dmg: ["#081810", "#396139", "#84a563", "#c6de8c", "#d2e6a6"],
  pocket: ["#07100e", "#3a4c3a", "#818d66", "#c2ce93", "#cfdaac"],
};

/** How long the LCD takes to change: the time constant of its fade, s. */
const RESPONSE = 0.05;
/** How dark a blank pixel's ink is, against the gaps. */
const BASE_INK = 0.12;
/** The shadow: how dark under the darkest ink, and how far down-right, in pixels. */
const SHADOW = 0.5;
const SHADOW_X = 0.5;
const SHADOW_Y = 0.6;
const BLOOM = 0.18;

// ── The picture, in shades: 0 the lightest, 3 the darkest ─────────────────

/** 8 × 8 tiles, a digit a pixel. Each piece has its own, as the Game Boy's had: no colors to tell them apart. */
const T8 = (s) => s.split(" ").map((r) => [...r].map(Number));
const PIECE_TILES = {
  T: T8("33333333 31111113 31111113 31111113 31111113 31111113 31111113 33333333"),
  J: T8("33333333 31111113 31333313 31333313 31333313 31333313 31111113 33333333"),
  Z: T8("33333333 32222223 32222223 32200223 32200223 32222223 32222223 33333333"),
  O: T8("33333333 30000003 30333303 30300303 30300303 30333303 30000003 33333333"),
  S: T8("33333333 31111113 31111113 31133113 31133113 31111113 31111113 33333333"),
  L: T8("33333333 30202023 32020203 30202023 32020203 30202023 32020203 33333333"),
  I: T8("33333333 30000003 32222223 32222223 32222223 32222223 32222223 33333333"),
};
const WALL = T8("33333333 22232222 22232222 22232222 33333333 22222223 22222223 22222223");
const CURTAIN = T8("33333333 22222222 11111111 22222222 33333333 22222222 11111111 22222222");

/** The well's place on the screen: between brick walls, two tiles wide on the left, one on the right. */
const WELL_X = 16;
const PANEL_X = 104;

class Shades {
  constructor() {
    this.px = new Uint8Array(LCD_W * LCD_H);
  }
  set(x, y, v) {
    if (x >= 0 && y >= 0 && x < LCD_W && y < LCD_H) this.px[y * LCD_W + x] = v;
  }
  rect(x, y, w, h, v) {
    for (let j = Math.max(0, y); j < Math.min(LCD_H, y + h); j++) this.px.fill(v, j * LCD_W + Math.max(0, x), j * LCD_W + Math.min(LCD_W, x + w));
  }
  tile(t, x, y) {
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) this.set(x + i, y + j, t[j][i]);
  }
  text(s, x, y, v) {
    let cx = x;
    for (const ch of fontText(s)) {
      const rows = tile(ch);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (rows[j] & (0x80 >> i)) this.set(cx + i, y + j, v);
      cx += 8;
    }
  }
  centered(s, cx, y, v) {
    this.text(s, Math.round(cx - (fontText(s).length * 8) / 2), y, v);
  }
  /** A box with a heavy dark border and rounded corners, as Game Boy Tetris draws them. */
  box(x, y, w, h, border = 3) {
    this.rect(x + 2, y + 2, w - 4, h - 4, 0);
    this.rect(x + 1, y, w - 2, 2, border);
    this.rect(x + 1, y + h - 2, w - 2, 2, border);
    this.rect(x, y + 1, 2, h - 2, border);
    this.rect(x + w - 2, y + 1, 2, h - 2, border);
  }
}

const pad = (n, k) => String(Math.max(0, Math.floor(n))).padStart(k, "0");

/** A piece by itself, centered on (cx, cy). */
function pieceAt(lcd, type, cx, cy) {
  const cs = SHAPES[type][0];
  const xs = cs.map(([x]) => x),
    ys = cs.map(([, y]) => y);
  const ox = Math.round(cx - ((Math.max(...xs) - Math.min(...xs) + 1) * 8) / 2) - Math.min(...xs) * 8;
  const oy = Math.round(cy - ((Math.max(...ys) - Math.min(...ys) + 1) * 8) / 2) - Math.min(...ys) * 8;
  for (const [x, y] of cs) lcd.tile(PIECE_TILES[type], ox + x * 8, oy + y * 8);
}

/** The game, in shades. `view` as screen.js's. */
function picture(lcd, game, view) {
  if (game.mode === "scores") return scores(lcd, game, view);
  const blink = Math.floor(view.now * 2) % 2 === 0;
  // The panel's dotted ground, and the walls.
  for (let y = 0; y < LCD_H; y++) for (let x = PANEL_X; x < LCD_W; x++) lcd.px[y * LCD_W + x] = x % 2 === 0 && y % 2 === 0 ? 1 : 0;
  for (let y = 0; y < LCD_H; y += 8) {
    lcd.tile(WALL, 0, y);
    lcd.tile(WALL, 8, y);
    lcd.tile(WALL, WELL_X + W * 8, y);
  }
  lcd.rect(WELL_X, 0, W * 8, LCD_H, 0);

  // The well. Full rows blink before they go, as on the Game Boy.
  const clearing = game.mode === "play" && game.phase === "clear" ? game.clearing : null;
  const hide = clearing && Math.floor(((CLEAR - game.timer) / CLEAR) * 6) % 2 === 1;
  const curtain = game.curtain;
  for (let y = 0; y < game.rows; y++) {
    if (y < curtain) {
      for (let x = 0; x < W; x++) lcd.tile(CURTAIN, WELL_X + x * 8, y * 8);
      continue;
    }
    if (hide && clearing.rows.includes(y)) continue;
    for (let x = 0; x < W; x++) {
      const v = game.board[y][x];
      if (v && v <= PIECES.length) lcd.tile(PIECE_TILES[PIECES[v - 1]], WELL_X + x * 8, y * 8);
    }
  }
  const p = game.piece;
  if (p && game.mode === "play")
    for (const [dx, dy] of SHAPES[p.type][p.rot]) {
      const y = p.y + dy;
      if (y >= 0 && y >= curtain) lcd.tile(PIECE_TILES[p.type], WELL_X + (p.x + dx) * 8, y * 8);
    }

  // The panel: SCORE, LEVEL, LINES, the system, NEXT.
  const right = (s, y) => lcd.text(s, 155 - fontText(s).length * 8, y, 3);
  lcd.box(PANEL_X + 1, 2, 54, 26);
  lcd.centered("SCORE", 132, 6, 3);
  right(String(game.score), 17);
  lcd.box(PANEL_X + 1, 31, 54, 24);
  lcd.centered("LEVEL", 132, 34, 3);
  right(String(game.level), 44);
  lcd.box(PANEL_X + 1, 58, 54, 24);
  lcd.centered("LINES", 132, 61, 3);
  right(String(game.lines), 71);
  lcd.rect(PANEL_X, 85, 56, 12, 0);
  lcd.centered(view.name.slice(0, 7), 132, 87, 3);
  lcd.box(PANEL_X + 5, 100, 46, 42);
  if (game.next) pieceAt(lcd, game.next.type, 132, 121);
  else if (game.mode === "play" && !view.paused) lcd.centered("?", 132, 117, blink ? 2 : 1);

  if (view.paused && game.mode === "play") messageBox(lcd, ["PAUSE"], "info", blink);
  else if (game.boxes.length) {
    const b = game.boxes[0];
    // The Game Boy's own words, for a game lost.
    messageBox(lcd, b.kind === "lose" ? ["GAME", "OVER", "", "PLEASE", "TRY", "AGAIN ♥"] : b.lines, b.kind, blink);
  }
}

function messageBox(lcd, lines, kind, blink) {
  const len = Math.max(...lines.map((l) => fontText(l).length));
  const w = len * 8 + 12,
    h = lines.length * 10 + 10;
  // Over the well when it fits, else over the middle of the screen.
  const cx = w <= W * 8 ? WELL_X + (W * 8) / 2 : LCD_W / 2;
  const x = Math.round(cx - w / 2),
    y = Math.round(LCD_H / 2 - h / 2) - 8;
  lcd.box(x, y, w, h, kind === "win" && !blink ? 2 : 3);
  lines.forEach((l, i) => lcd.centered(l, cx, y + 6 + i * 10, 3));
}

/** Between games: the high score table, every system's, two lines a game (the best six; 🏆 has ten). */
function scores(lcd, game, view) {
  const blink = Math.floor(view.now * 3) % 2 === 0;
  lcd.px.fill(0);
  lcd.box(0, 0, LCD_W, LCD_H);
  lcd.rect(2, 2, LCD_W - 4, 11, 3);
  lcd.centered("HIGH SCORES", 80, 4, 0);
  const rows = view.scores.slice(0, 6);
  if (!rows.length) lcd.centered("NO SCORES YET", 80, 60, 2);
  rows.forEach((s, i) => {
    const y = 17 + i * 18;
    const mine = game.rank === i + 1 && blink;
    if (mine) lcd.rect(4, y - 1, LCD_W - 8, 18, 3);
    const ink = mine ? 0 : 3;
    lcd.text(`${i + 1} ${s.system.slice(0, 6).padEnd(6)} ${pad(s.score, 6)}`, 8, y, ink);
    lcd.text(`${view.dates[i] ?? ""} L${pad(s.level ?? 0, 2)}`, 24, y + 8, mine ? 0 : 2);
  });
  lcd.centered(`NEXT GAME ${Math.max(1, Math.ceil(SCORES_FOR - game.timer))}`, 80, 128, 2);
}

// ── The LCD ───────────────────────────────────────────────────────────────

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Shows a game on a Game Boy LCD, drawn into `canvas`. */
export class GameBoyScreen {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.lcd = new Shades();
    this.level = new Float32Array(LCD_W * LCD_H); // each pixel's shade as the slow LCD shows it now
    this.fresh = true;
    this.ink = new OffscreenCanvas(LCD_W, LCD_H);
    this.inkData = new ImageData(LCD_W, LCD_H);
    this.shade = new OffscreenCanvas(LCD_W, LCD_H);
    this.shadeData = new ImageData(LCD_W, LCD_H);
    this.k = 0;
    this.palette = null;
  }

  /**
   * `k` device pixels a Game Boy pixel, in palette `name` ("dmg" or
   * "pocket"): the layers that don't change, made again when these do.
   */
  setup(k, name) {
    if (k === this.k && name === this.palette) return;
    this.k = k;
    this.palette = name;
    const w = LCD_W * k,
      h = LCD_H * k;
    this.canvas.width = w;
    this.canvas.height = h;
    const pal = PALETTES[name] ?? PALETTES.dmg;
    const back = rgb(pal[4]);

    // Each shade's ink: the color and opacity that, over the backing, make the
    // palette's color (so a blank pixel is a little darker than the gaps).
    // 64 steps, for the shades in between while pixels fade.
    this.lut = new Uint8ClampedArray(64 * 4);
    this.shadowLut = new Uint8ClampedArray(64 * 4);
    const dark = rgb(pal[0]);
    for (let q = 0; q < 64; q++) {
      const s = (q / 63) * 3;
      const lo = Math.floor(s),
        hi = Math.min(3, lo + 1),
        f = s - lo;
      const a = rgb(pal[3 - lo]),
        b = rgb(pal[3 - hi]);
      const alpha = BASE_INK + (1 - BASE_INK) * (s / 3);
      for (let c = 0; c < 3; c++) {
        const want = a[c] + (b[c] - a[c]) * f;
        this.lut[q * 4 + c] = back[c] + (want - back[c]) / alpha;
        this.shadowLut[q * 4 + c] = dark[c];
      }
      this.lut[q * 4 + 3] = alpha * 255;
      this.shadowLut[q * 4 + 3] = (s / 3) * SHADOW * 255;
    }

    // The backing: pale, faintly grainy, lighter where the light comes from.
    this.back = new OffscreenCanvas(w, h);
    const bctx = this.back.getContext("2d");
    const grain = bctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const n = (Math.random() - 0.5) * 7;
      grain.data[i * 4] = back[0] + n;
      grain.data[i * 4 + 1] = back[1] + n;
      grain.data[i * 4 + 2] = back[2] + n;
      grain.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(grain, 0, 0);
    const light = bctx.createLinearGradient(0, 0, w, h);
    light.addColorStop(0, "rgba(255,255,255,0.10)");
    light.addColorStop(0.6, "rgba(255,255,255,0)");
    light.addColorStop(1, "rgba(0,0,0,0.05)");
    bctx.fillStyle = light;
    bctx.fillRect(0, 0, w, h);

    // The gaps between pixels, to cut out of the ink: a line at each pixel's
    // right and bottom edge, a sixth of it wide (SameBoy's proportion), at
    // least one device pixel, and fainter when the pixels are small.
    this.gaps = new OffscreenCanvas(w, h);
    const g = this.gaps.getContext("2d");
    const gap = Math.max(1, Math.round(k / 6));
    g.fillStyle = `rgba(0,0,0,${k >= 4 ? 0.8 : k >= 3 ? 0.65 : 0.4})`;
    for (let x = 0; x < LCD_W; x++) g.fillRect(x * k + k - gap, 0, gap, h);
    for (let y = 0; y < LCD_H; y++) g.fillRect(0, y * k + k - gap, w, gap);
    this.dots = new OffscreenCanvas(w, h);

    // The bezel's shadow on the screen below it, along the top and left.
    this.recess = new OffscreenCanvas(w, h);
    const r = this.recess.getContext("2d");
    const [dr, dg, db] = dark;
    const top = r.createLinearGradient(0, 0, 0, 4 * k);
    top.addColorStop(0, `rgba(${dr},${dg},${db},0.45)`);
    top.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    r.fillStyle = top;
    r.fillRect(0, 0, w, 4 * k);
    const left = r.createLinearGradient(0, 0, 3 * k, 0);
    left.addColorStop(0, `rgba(${dr},${dg},${db},0.35)`);
    left.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    r.fillStyle = left;
    r.fillRect(0, 0, 3 * k, h);
    this.fresh = true;
  }

  /** Draws `game` as it is now; `dt`: seconds since the last frame, for the slow pixels. */
  draw(game, view, dt) {
    const lcd = this.lcd;
    picture(lcd, game, view);

    // The slow LCD: every pixel moves part of the way to its new shade.
    const a = this.fresh ? 1 : 1 - Math.exp(-Math.max(0, dt) / RESPONSE);
    this.fresh = false;
    const level = this.level,
      px = lcd.px,
      ink = this.inkData.data,
      shade = this.shadeData.data,
      lut = this.lut,
      slut = this.shadowLut;
    for (let i = 0; i < px.length; i++) {
      const v = (level[i] += (px[i] - level[i]) * a);
      const q = Math.round((v / 3) * 63) * 4,
        o = i * 4;
      ink[o] = lut[q];
      ink[o + 1] = lut[q + 1];
      ink[o + 2] = lut[q + 2];
      ink[o + 3] = lut[q + 3];
      shade[o] = slut[q];
      shade[o + 1] = slut[q + 1];
      shade[o + 2] = slut[q + 2];
      shade[o + 3] = slut[q + 3];
    }
    this.ink.getContext("2d").putImageData(this.inkData, 0, 0);
    this.shade.getContext("2d").putImageData(this.shadeData, 0, 0);

    const ctx = this.ctx,
      k = this.k,
      w = this.canvas.width,
      h = this.canvas.height;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.back, 0, 0);
    // The shadow, smoothed by scaling the small picture up.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.shade, SHADOW_X * k, SHADOW_Y * k, w, h);
    // The ink, square pixels with the gaps cut out.
    const d = this.dots.getContext("2d");
    d.globalCompositeOperation = "copy";
    d.imageSmoothingEnabled = false;
    d.drawImage(this.ink, 0, 0, w, h);
    d.globalCompositeOperation = "destination-out";
    d.drawImage(this.gaps, 0, 0);
    ctx.drawImage(this.dots, 0, 0);
    // A little bloom.
    ctx.globalAlpha = BLOOM;
    ctx.drawImage(this.ink, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.recess, 0, 0);
  }
}
