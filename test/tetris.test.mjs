import { test } from "node:test";
import assert from "node:assert/strict";
import { W, H, PIECES, SHAPES, emptyBoard, fits, dropDistance, place, fullRows, removeRows, points, levelFor } from "../interface/js/tetris.js";

test("every piece is four cells in every rotation, with NES's number of rotations", () => {
  const turns = { T: 4, J: 4, L: 4, S: 2, Z: 2, I: 2, O: 1 };
  for (const p of PIECES) {
    assert.equal(SHAPES[p].length, turns[p], p);
    for (const cells of SHAPES[p]) assert.equal(new Set(cells.map(String)).size, 4, p);
  }
});

test("pieces stop at the walls and the floor, and may stick out above the top", () => {
  const b = emptyBoard();
  assert.ok(fits(b, { type: "I", rot: 0, x: 2, y: 0 }));
  assert.ok(!fits(b, { type: "I", rot: 0, x: 1, y: 0 }));
  assert.ok(!fits(b, { type: "I", rot: 0, x: 9, y: 0 }));
  assert.ok(fits(b, { type: "I", rot: 1, x: 0, y: 0 }), "vertical I at spawn pokes above the top");
  assert.equal(dropDistance(b, { type: "O", rot: 0, x: 5, y: 0 }), H - 2);
});

test("a full row goes, and what's above drops", () => {
  const b = emptyBoard();
  for (let x = 0; x < W; x++) b[H - 1][x] = 1;
  b[H - 2][3] = 2;
  assert.deepEqual(fullRows(b), [H - 1]);
  removeRows(b, [H - 1]);
  assert.equal(b[H - 1][3], 2);
  assert.equal(b.length, H);
  assert.deepEqual(fullRows(b), []);
});

test("a piece landing above the top is game over", () => {
  const b = emptyBoard();
  assert.equal(place(b, { type: "I", rot: 1, x: 0, y: 0 }), false);
});

test("NES scoring and levels", () => {
  assert.equal(points(1, 0), 40);
  assert.equal(points(4, 0), 1200);
  assert.equal(points(4, 9), 12000);
  assert.equal(levelFor(9), 0);
  assert.equal(levelFor(10), 1);
});
