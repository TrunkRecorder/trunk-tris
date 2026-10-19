import { test } from "node:test";
import assert from "node:assert/strict";
import { Bag, GROUPS, KINDS, LOOSE_AFTER, ANY_AFTER, about, groupOf, pieceOf } from "../interface/js/feed.js";
import { PIECES } from "../interface/js/tetris.js";
import { rng } from "../interface/js/rng.js";

test("each kind makes only its own pieces", () => {
  for (const [kind, group] of Object.entries(KINDS)) {
    const bag = new Bag();
    for (let i = 0; i < 20; i++) {
      const p = bag.take({ kind, text: `${kind} ${i}` });
      if (p) assert.ok(GROUPS[group].includes(p), `${kind} made ${p}`);
    }
  }
});

test("the pieces come evenly, however lopsided the messages", () => {
  // DCFD's mix in a minute: lots of grants, few registrations, and updates that make nothing.
  const r = rng(1);
  const mix = [["grant", 84], ["affiliation", 40], ["registration", 28], ["deregistration", 12], ["update", 600]];
  const total = mix.reduce((a, [, n]) => a + n, 0);
  const bag = new Bag();
  const count = Object.fromEntries(PIECES.map((p) => [p, 0]));
  let made = 0;
  for (let i = 0; made < 7 * 200; i++) {
    let x = r() * total,
      kind = mix[0][0];
    for (const [k, n] of mix) if ((x -= n) < 0) {
      kind = k;
      break;
    }
    const p = bag.take({ kind, text: `${kind} ${i}` });
    if (p) {
      count[p]++;
      made++;
    }
  }
  for (const p of PIECES) assert.equal(count[p], 200, `${p}: ${JSON.stringify(count)}`);
});

test("a kind the system never sends: the others stand in after a while", () => {
  // SmartNet: no registrations at all.
  const bag = new Bag();
  bag.left = ["S", "Z"];
  assert.equal(bag.take({ kind: "grant", text: "grant 1" }, 0), null);
  const p = bag.take({ kind: "grant", text: "grant 1" }, LOOSE_AFTER);
  assert.ok(p === "S" || p === "Z");
});

test("any message at all, after waiting long", () => {
  const bag = new Bag();
  assert.equal(bag.take({ kind: "update", text: "Update TG 1" }, LOOSE_AFTER), null);
  assert.ok(bag.take({ kind: "update", text: "Update TG 1" }, ANY_AFTER));
});

test("the recorder's message texts: talkgroup and radio", () => {
  assert.deepEqual(about("Grant TG 716 860.98750 MHz src 1100422 ENC"), { tg: 716, unit: 1100422 });
  assert.deepEqual(about("Affiliation 1105402 → TG 11035"), { tg: 11035, unit: 1105402 });
  assert.deepEqual(about("affiliation src 39980 tg 34928"), { tg: 34928, unit: 39980 });
  assert.deepEqual(about("Registration 1105402"), { tg: null, unit: 1105402 });
  assert.deepEqual(about("Deregistration 1104298"), { tg: null, unit: 1104298 });
  assert.deepEqual(about("deaffiliation src 46310"), { tg: null, unit: 46310 });
  assert.deepEqual(about("grant tg 32816 496.58750 MHz src 65520 digital"), { tg: 32816, unit: 65520 });
  assert.equal(groupOf("I"), "grant");
});

test("a message's own piece, with no bag", () => {
  for (const [kind, group] of Object.entries(KINDS)) for (let i = 0; i < 10; i++) assert.ok(GROUPS[group].includes(pieceOf({ kind, text: `${kind} ${i}` })));
  assert.equal(pieceOf({ kind: "update", text: "Update TG 1" }), null);
});
