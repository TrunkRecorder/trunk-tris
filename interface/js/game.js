// One system's game: the well, the piece falling, the computer moving it,
// the next piece waiting for a message from the radio, lines, score, level,
// the message boxes, game over and the high score table, and a new game.
// It keeps its own clock, moved on by update(dt), so it can be played
// faster than real time in the tests. Nothing here draws (screen.js does).

import { H, emptyBoard, fits, place, fullRows, removeRows, points, levelFor, SHAPES, SPAWN_X, SPAWN_Y, PIECES } from "./tetris.js";
import { choose, SKILLS } from "./ai.js";
import { Bag, KINDS, groupOf } from "./feed.js";
import { rng } from "./rng.js";

/**
 * How fast it goes. `gravity(level)`: rows a second; `think`: the pause
 * before the computer moves a new piece; `step`: between its moves.
 */
export const PACES = {
  relaxed: { gravity: (l) => Math.min(4.5, 2.5 + 0.15 * l), think: 0.7, step: 0.15 },
  normal: { gravity: (l) => Math.min(8, 4 + 0.3 * l), think: 0.45, step: 0.1 },
  lively: { gravity: (l) => Math.min(14, 7 + 0.6 * l), think: 0.25, step: 0.06 },
};

/** Seconds: after a piece lands, before the next appears (NES's "ARE")… */
const ARE = 0.3;
/** …while full lines vanish… */
export const CLEAR = 0.6;
/** …after a piece appears, before a message may become the one after it. */
const SETTLE = 0.8;
/** Game over: the curtain comes down a row at a time… */
export const CURTAIN_ROW = 0.07;
/** …and the high score table, before the next game. */
export const SCORES_FOR = 10;
/** How long a message box stays up, s. */
const BOX = { short: 1.8, long: 3.2 };
/** The well's cell for the curtain. */
export const CURTAIN = 8;

export class Game {
  /**
   * `options()` → { pace, skill } (the names in PACES, SKILLS);
   * `top()` → the best score in the high score table;
   * `onEvent(e)`: { type: "lines", n } | { type: "level", level } |
   * { type: "record" } | { type: "over", score, lines, level } → the
   * score's place in the table (1…) or null | { type: "spawn" }.
   */
  constructor({ seed = Date.now(), options = () => ({ pace: "relaxed", skill: "good" }), top = () => 0, onEvent = () => null } = {}) {
    this.random = rng(seed >>> 0);
    this.options = options;
    this.top = top;
    this.onEvent = onEvent;
    this.games = 0;
    this.heard = []; // when piece-making messages came, for the rate
    this.heardFrom = 0;
    this.reset();
  }

  reset() {
    this.board = emptyBoard();
    this.mode = "play"; // "play" | "over" | "scores"
    this.phase = "wait"; // in play: "wait" | "think" | "move" | "fall" | "clear" | "are"
    this.timer = 0;
    this.t = this.t ?? 0;
    this.piece = null;
    this.plan = null;
    this.next = null;
    this.nextSince = this.t;
    this.fall = 0;
    this.lines = 0;
    this.score = 0;
    this.level = 0;
    this.stats = Object.fromEntries(PIECES.map((p) => [p, 0]));
    this.clearing = null; // { rows, tetris }
    this.boxes = []; // message boxes, the first showing: { lines, kind, left }
    this.feed = null; // the latest message that made a piece: { type, group, line, at }
    this.recordSaid = false;
    this.rank = null;
    this.bag = new Bag();
    this.games++;
  }

  get pace() {
    return PACES[this.options().pace] ?? PACES.relaxed;
  }

  /** A control message on this game's system ({ kind, text, … }). True when it made the next piece. */
  offer(line) {
    if (KINDS[line.kind]) {
      this.heard.push(this.t);
      while (this.heard.length && this.t - this.heard[0] > 60) this.heard.shift();
    }
    if (this.mode !== "play" || this.next || this.t - this.nextSince < SETTLE) return false;
    const type = this.bag.take(line, this.t - this.nextSince);
    if (!type) return false;
    this.next = { type };
    this.feed = { type, group: KINDS[line.kind] ?? groupOf(type), line, at: this.t };
    return true;
  }

  /** Piece-making messages a minute: the last minute's, or as many as there have been so far, as a rate. */
  get rate() {
    while (this.heard.length && this.t - this.heard[0] > 60) this.heard.shift();
    const span = Math.min(60, this.t - this.heardFrom);
    return span < 5 ? 0 : Math.round((this.heard.length * 60) / span);
  }

  box(lines, kind = "info", long = false) {
    this.boxes.push({ lines, kind, left: long ? BOX.long : BOX.short });
  }

  update(dt) {
    this.t += dt;
    if (this.boxes.length && (this.boxes[0].left -= dt) <= 0) this.boxes.shift();
    if (this.mode === "over") {
      this.timer += dt;
      // The curtain, then the boxes it put up, then the table.
      if (this.timer > H * CURTAIN_ROW && !this.boxes.length) {
        this.mode = "scores";
        this.timer = 0;
      }
      return;
    }
    if (this.mode === "scores") {
      if ((this.timer += dt) >= SCORES_FOR) this.reset();
      return;
    }
    const pace = this.pace;
    switch (this.phase) {
      case "wait":
        if (this.next) this.spawn();
        return;
      case "think":
        if ((this.timer -= dt) <= 0) {
          this.phase = "move";
          this.timer = pace.step;
        }
        return;
      case "move":
        if ((this.timer -= dt) <= 0) {
          this.timer += pace.step;
          this.moveOnce();
        }
        this.gravity(dt);
        return;
      case "fall":
        this.gravity(dt);
        return;
      case "clear":
        if ((this.timer -= dt) <= 0) this.cleared();
        return;
      case "are":
        if ((this.timer -= dt) <= 0) this.spawn();
        return;
    }
  }

  spawn() {
    if (!this.next) {
      this.phase = "wait";
      this.piece = null;
      return;
    }
    const p = { type: this.next.type, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    this.next = null;
    this.nextSince = this.t;
    this.stats[p.type]++;
    this.onEvent({ type: "spawn" });
    if (!fits(this.board, p)) {
      this.piece = p;
      return this.gameOver();
    }
    this.piece = p;
    this.fall = 0;
    this.plan = this.choose();
    this.phase = "think";
    this.timer = this.pace.think;
  }

  choose() {
    const skill = SKILLS[this.options().skill] ?? SKILLS.good;
    return choose(this.board, this.piece, skill, this.random) ?? { rot: this.piece.rot, x: this.piece.x };
  }

  /** One of the computer's moves towards its plan: a turn, else a step sideways. */
  moveOnce() {
    const p = this.piece,
      plan = this.plan;
    let q = null;
    if (p.rot !== plan.rot) {
      const turns = SHAPES[p.type].length;
      const cw = (plan.rot - p.rot + turns) % turns;
      q = { ...p, rot: (p.rot + (cw <= turns - cw ? 1 : -1) + turns) % turns };
    } else if (p.x !== plan.x) q = { ...p, x: p.x + Math.sign(plan.x - p.x) };
    else {
      this.phase = "fall";
      return;
    }
    if (fits(this.board, q)) this.piece = q;
    else {
      // It fell into something on the way: think again from here.
      this.plan = this.choose();
      if (this.plan.rot === p.rot && this.plan.x === p.x) this.phase = "fall";
    }
  }

  gravity(dt) {
    this.fall += dt * this.pace.gravity(this.level);
    while (this.fall >= 1 && this.piece) {
      this.fall -= 1;
      const down = { ...this.piece, y: this.piece.y + 1 };
      if (fits(this.board, down)) this.piece = down;
      else this.land();
    }
  }

  land() {
    const p = this.piece;
    this.piece = null;
    this.fall = 0;
    if (!place(this.board, p)) return this.gameOver();
    const rows = fullRows(this.board);
    if (rows.length) {
      this.phase = "clear";
      this.timer = CLEAR;
      this.clearing = { rows, tetris: rows.length === 4 };
      this.onEvent({ type: "lines", n: rows.length });
    } else {
      this.phase = "are";
      this.timer = ARE;
    }
  }

  cleared() {
    const n = this.clearing.rows.length;
    removeRows(this.board, this.clearing.rows);
    this.clearing = null;
    this.score = Math.min(999999, this.score + points(n, this.level));
    this.lines += n;
    if (n === 4) this.box(["TETRIS!"], "win");
    const level = levelFor(this.lines);
    if (level !== this.level) {
      this.level = level;
      this.box(["LEVEL", String(level).padStart(2, "0")], "info");
      this.onEvent({ type: "level", level });
    }
    const top = this.top();
    if (!this.recordSaid && top > 0 && this.score > top) {
      this.recordSaid = true;
      this.box(["NEW RECORD!"], "win", true);
      this.onEvent({ type: "record" });
    }
    this.phase = "are";
    this.timer = ARE;
  }

  gameOver() {
    this.mode = "over";
    this.timer = 0;
    this.phase = "wait";
    this.next = null;
    this.boxes = [];
    this.rank = this.onEvent({ type: "over", score: this.score, lines: this.lines, level: this.level }) ?? null;
    this.box(["GAME OVER"], "lose", true);
    if (this.rank) this.box(["NEW HIGH SCORE!", `RANK ${this.rank}  ${String(this.score).padStart(6, "0")}`], "win", true);
  }

  /** Game over now (for trying the table out from the console). */
  end() {
    if (this.mode === "play") {
      this.piece = null;
      this.gameOver();
    }
  }

  /** How far down the curtain is, in rows. */
  get curtain() {
    return this.mode === "over" ? Math.min(H, Math.floor(this.timer / CURTAIN_ROW)) : this.mode === "scores" ? H : 0;
  }
}
