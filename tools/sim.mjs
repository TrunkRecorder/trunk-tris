#!/usr/bin/env node
// Plays games without the clock, to tune how well the computer plays: how
// many lines a game lasts at each temperature (ai.js SKILLS). Pieces come
// from a 7-bag, as the radio's do.
//
//   node tools/sim.mjs [games=40] [temperatures=0.5,1,2,3] [rows=20]

import { emptyBoard, fits, dropDistance, place, fullRows, removeRows, PIECES, SPAWN_X, SPAWN_Y } from "../interface/js/tetris.js";
import { choose } from "../interface/js/ai.js";
import { rng } from "../interface/js/rng.js";

const games = Number(process.argv[2] ?? 40);
const temps = (process.argv[3] ?? "0.5,1,2,3").split(",").map(Number);
const ROWS = Number(process.argv[4] ?? 20); // the Game Boy's well: 18
const CAP = Number(process.env.CAP ?? 600); // lines: a game this long counts as never ending

export function play(temperature, seed) {
  const random = rng(seed);
  const board = emptyBoard(ROWS);
  let bag = [],
    lines = 0,
    pieces = 0;
  for (;;) {
    if (!bag.length) bag = random.shuffle([...PIECES]);
    const p = { type: bag.pop(), rot: 0, x: SPAWN_X, y: SPAWN_Y };
    if (!fits(board, p)) break;
    const o = choose(board, p, temperature, random);
    const q = { ...p, rot: o.rot, x: o.x };
    q.y += dropDistance(board, q);
    pieces++;
    if (!place(board, q)) break;
    const rows = fullRows(board);
    removeRows(board, rows);
    lines += rows.length;
    if (lines >= CAP) break;
  }
  return { lines, pieces };
}

for (const t of temps) {
  const r = Array.from({ length: games }, (_, i) => play(t, i + 1)).sort((a, b) => a.lines - b.lines);
  const q = (f) => r[Math.floor(f * (r.length - 1))].lines;
  const mean = r.reduce((a, b) => a + b.lines, 0) / r.length;
  console.log(`T=${t}: lines mean ${mean.toFixed(0)}, quartiles ${q(0.25)} / ${q(0.5)} / ${q(0.75)}, min ${q(0)}, max ${q(1)}; pieces mean ${(r.reduce((a, b) => a + b.pieces, 0) / r.length).toFixed(0)}`);
}
