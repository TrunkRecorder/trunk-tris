import { test } from "node:test";
import assert from "node:assert/strict";
import { Bag, GROUPS, KINDS, LOOSE_AFTER, ANY_AFTER, UNIT_KINDS, about, fromUnit, groupOf, pieceOf } from "../interface/js/feed.js";
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
  assert.deepEqual(about({ text: "Grant TG 716 860.98750 MHz src 1100422 ENC" }), { tg: 716, unit: 1100422 });
  assert.deepEqual(about({ text: "Affiliation 1105402 → TG 11035" }), { tg: 11035, unit: 1105402 });
  assert.deepEqual(about({ text: "affiliation src 39980 tg 34928" }), { tg: 34928, unit: 39980 });
  assert.deepEqual(about({ text: "Registration 1105402" }), { tg: null, unit: 1105402 });
  assert.deepEqual(about({ text: "Deregistration 1104298" }), { tg: null, unit: 1104298 });
  assert.deepEqual(about({ text: "deaffiliation src 46310" }), { tg: null, unit: 46310 });
  assert.deepEqual(about({ text: "grant tg 32816 496.58750 MHz src 65520 digital" }), { tg: 32816, unit: 65520 });
  assert.equal(groupOf("I"), "grant");
});

test("a unit event is a control message with its radio and talkgroup as they are", () => {
  const e = { system: 0, system_id: 3, short_name: "dcfd", site: "north", kind: "affiliation", unit: 1105402, tag: "E1", talkgroup: 11035, alpha_tag: "Fire Dispatch", emergency: false, time: 1.75e9 };
  const line = fromUnit(e);
  assert.equal(line.system, "dcfd");
  assert.deepEqual(about(line), { tg: 11035, unit: 1105402 });
  assert.deepEqual([line.unitName, line.tgName], ["E1", "Fire Dispatch"]);
  assert.ok(GROUPS.affil.includes(pieceOf(line)), "the same pieces as its log line's");
  const reg = fromUnit({ ...e, kind: "registration", talkgroup: null, tag: undefined, alpha_tag: undefined });
  assert.deepEqual([about(reg), reg.unitName], [{ tg: null, unit: 1105402 }, ""]);
  assert.ok(GROUPS.reg.includes(pieceOf(reg)));
  for (const kind of ["affiliation", "registration", "deregistration"]) assert.ok(UNIT_KINDS.has(kind), kind);
  assert.ok(!UNIT_KINDS.has("grant"), "grants come in the log");
});

test("a message's own piece, with no bag", () => {
  for (const [kind, group] of Object.entries(KINDS)) for (let i = 0; i < 10; i++) assert.ok(GROUPS[group].includes(pieceOf({ kind, text: `${kind} ${i}` })));
  assert.equal(pieceOf({ kind: "update", text: "Update TG 1" }), null);
});
