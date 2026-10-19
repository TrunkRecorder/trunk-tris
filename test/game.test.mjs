import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, SCORES_FOR } from "../interface/js/game.js";
import { PIECES } from "../interface/js/tetris.js";

/** Runs `g` for `seconds`, with `perMin` messages of each kind a minute, evenly spaced. */
function run(g, seconds, perMin, dt = 1 / 30) {
  const due = {};
  let n = 0;
  for (let t = 0; t < seconds; t += dt) {
    for (const [kind, rate] of Object.entries(perMin)) {
      for (due[kind] = (due[kind] ?? 0) + (rate / 60) * dt; due[kind] >= 1; due[kind]--) g.offer({ kind, text: `${kind} ${n++}` });
    }
    g.update(dt);
  }
}

test("no messages, no pieces", () => {
  const g = new Game({ seed: 1 });
  run(g, 120, {});
  assert.equal(g.piece, null);
  assert.equal(g.phase, "wait");
  assert.equal(Object.values(g.stats).reduce((a, b) => a + b, 0), 0);
});

test("messages make pieces, at the game's own pace", () => {
  const g = new Game({ seed: 2 });
  run(g, 120, { grant: 600, affiliation: 300, registration: 300 });
  const pieces = Object.values(g.stats).reduce((a, b) => a + b, 0);
  // Hundreds of messages a minute; a relaxed game takes a piece every several seconds.
  assert.ok(pieces >= 6 && pieces <= 24, `${pieces} pieces in 2 minutes`);
});

test("a game ends, goes in the table, and the next one starts", () => {
  const events = [];
  const g = new Game({
    seed: 3,
    options: () => ({ pace: "lively", skill: "beginner" }),
    onEvent: (e) => (events.push(e), e.type === "over" ? 4 : null),
  });
  for (let i = 0; i < 12000 && g.games === 1; i++) run(g, 1, { grant: 120, affiliation: 60, deregistration: 60 });
  const end = events.findIndex((e) => e.type === "over");
  assert.ok(end >= 0, "the game ended");
  // The lines it cleared (the next game may have cleared some since).
  const lines = events.slice(0, end).filter((e) => e.type === "lines").reduce((a, e) => a + e.n, 0);
  assert.equal(events[end].lines, lines);
  assert.equal(g.games, 2, "a new game started");
  assert.equal(g.score, 0);
  for (const p of PIECES) assert.ok(g.stats[p] >= 0);
});

test("game over: the curtain, the boxes, then the table for a while", () => {
  const g = new Game({ seed: 4, onEvent: (e) => (e.type === "over" ? 1 : null) });
  g.score = 500;
  g.end();
  assert.equal(g.mode, "over");
  assert.deepEqual(g.boxes.map((b) => b.lines[0]), ["GAME OVER", "NEW HIGH SCORE!"]);
  run(g, 9, {});
  assert.equal(g.mode, "scores");
  run(g, SCORES_FOR, {});
  assert.equal(g.mode, "play");
  assert.equal(g.games, 2);
});

test("the Game Boy's well is 18 deep; changing the depth starts a new game", () => {
  const g = new Game({ seed: 5, rows: 18 });
  assert.equal(g.board.length, 18);
  run(g, 60, { grant: 120, affiliation: 60, registration: 60 });
  assert.ok(Object.values(g.stats).some((n) => n > 0));
  g.setRows(18);
  assert.equal(g.games, 1, "the same depth: the same game");
  g.setRows(20);
  assert.equal(g.board.length, 20);
  assert.equal(g.games, 2);
  assert.equal(Object.values(g.stats).reduce((a, b) => a + b, 0), 0);
});

test("as the radio sends them: the first message after a piece appears makes the next, and the rest are let go", () => {
  const g = new Game({ seed: 6, options: () => ({ pace: "relaxed", skill: "good", pieces: "radio" }) });
  assert.equal(g.offer({ kind: "update", text: "Update TG 1" }), false, "updates make nothing");
  assert.equal(g.offer({ kind: "grant", text: "grant 1" }), true);
  const next = g.next.type;
  assert.ok(["T", "O", "I"].includes(next));
  assert.equal(g.offer({ kind: "registration", text: "registration 1" }), false, "NEXT is taken: let go");
  assert.equal(g.next.type, next);
  g.update(1 / 30);
  assert.equal(g.piece.type, next, "it's in the well");
  assert.equal(g.next, null);
  assert.equal(g.offer({ kind: "registration", text: "registration 2" }), true, "no wait before the one after it");
  assert.ok(["S", "Z"].includes(g.next.type));
});

test("as the radio sends them: nothing evened out, a system of grants plays T, O and I", () => {
  const g = new Game({ seed: 7, options: () => ({ pace: "lively", skill: "expert", pieces: "radio" }) });
  run(g, 120, { grant: 600, affiliation: 6 });
  const s = g.stats;
  const grants = s.T + s.O + s.I;
  assert.ok(grants > 4 * (s.J + s.L), JSON.stringify(s));
  assert.equal(s.S + s.Z, 0, "no registrations, no S or Z, however long the wait");
});
