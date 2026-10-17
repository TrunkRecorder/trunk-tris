import { test } from "node:test";
import assert from "node:assert/strict";
import { choose, features, SKILLS } from "../interface/js/ai.js";
import { emptyBoard, fits, dropDistance, place, fullRows, removeRows, PIECES, SPAWN_X, SPAWN_Y, W, H } from "../interface/js/tetris.js";
import { rng } from "../interface/js/rng.js";

function play(temperature, seed, cap) {
  const random = rng(seed);
  const board = emptyBoard();
  let bag = [],
    lines = 0;
  for (;;) {
    if (!bag.length) bag = random.shuffle([...PIECES]);
    const p = { type: bag.pop(), rot: 0, x: SPAWN_X, y: SPAWN_Y };
    if (!fits(board, p)) break;
    const o = choose(board, p, temperature, random);
    const q = { ...p, rot: o.rot, x: o.x };
    assert.ok(fits(board, q), "it only picks places it can reach");
    q.y += dropDistance(board, q);
    if (!place(board, q)) break;
    const rows = fullRows(board);
    removeRows(board, rows);
    lines += rows.length;
    if (lines >= cap) break;
  }
  return lines;
}

test("at its best, it doesn't lose", () => {
  assert.equal(play(0, 1, 300), 300);
});

test("the skills: games end, the better player's later", () => {
  const mean = (t) => [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, s) => a + play(t, s, 2000), 0) / 8;
  const beginner = mean(SKILLS.beginner),
    good = mean(SKILLS.good);
  assert.ok(beginner > 10 && beginner < 120, `beginner ${beginner}`);
  assert.ok(good > beginner && good < 400, `good ${good}`);
});

test("holes and wells are counted", () => {
  const b = emptyBoard();
  b[H - 1].fill(1);
  b[H - 1][0] = 0; // a well at the left
  b[H - 2][5] = 1; // over nothing: nothing under it is empty, so no hole
  b[H - 3][7] = 1;
  b[H - 2][7] = 0; // a hole under it
  const f = features(b);
  assert.equal(f.holes, 1);
  assert.ok(f.wells >= 1);
  assert.equal(W, 10);
});
