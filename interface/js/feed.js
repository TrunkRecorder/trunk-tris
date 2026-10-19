// Control channel messages → pieces. Each kind of message has its pieces:
//
//   a channel grant (someone keyed up)          T, O, I
//   an affiliation (a radio joined a talkgroup)  J, L
//   a registration or deregistration
//   (a radio came onto the system, or left)     S, Z
//
// A busy system sends hundreds of these a minute, far more than a game can
// use, so most don't make a piece: the game takes one only when it has room
// for the next. And so that every piece comes as often as any other, as in
// a fair game, they come out of a bag of the seven: a message only makes a
// piece that's still in the bag, and the bag is filled again when it's
// empty. A system that never sends a kind (SmartNet has no registrations)
// would leave its pieces in the bag for good, so after a while of waiting
// any of the three kinds will do, and after longer, any message at all.
//
// Or, as the radio sends them (pieceOf): no bag, nothing evened out, no
// stand-ins. The first message of the three kinds makes the next piece,
// whichever kind it is, so a system that's all grants plays T, O and I.

import { PIECES } from "./tetris.js";
import { hash } from "./rng.js";

/** The message kinds that make pieces (a log line's `kind`), and what each is called on screen. */
export const KINDS = {
  grant: "grant",
  uu_v_grant: "grant",
  affiliation: "affil",
  registration: "reg",
  deregistration: "reg",
};

export const GROUPS = {
  grant: ["T", "O", "I"],
  affil: ["J", "L"],
  reg: ["S", "Z"],
};

export const GROUP_NAMES = { grant: "GRANT", affil: "AFFIL", reg: "REG" };

export const groupOf = (type) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(type));

/** Waiting this long (s) for a kind the bag has, any of the three kinds will do… */
export const LOOSE_AFTER = 8;
/** …and this long, any control message. */
export const ANY_AFTER = 20;

/** Which of `types` control message `line` makes: by the message itself, so it isn't the same one each time. */
const pick = (types, line) => types[hash(line.text ?? "") % types.length];

/** The piece control message `line` makes as the radio sends it, with no bag: its kind's, or null. */
export function pieceOf(line) {
  const group = KINDS[line.kind];
  return group ? pick(GROUPS[group], line) : null;
}

export class Bag {
  constructor() {
    this.left = [...PIECES];
  }

  /**
   * The piece control message `line` ({ kind, text }) makes, taken out of the
   * bag, after waiting `waited` s for one; or null when it makes none.
   */
  take(line, waited = 0) {
    const group = KINDS[line.kind];
    if (!group && waited < ANY_AFTER) return null;
    let can = group ? this.left.filter((p) => GROUPS[group].includes(p)) : [];
    if (!can.length && (waited >= LOOSE_AFTER && group || waited >= ANY_AFTER)) can = this.left;
    if (!can.length) return null;
    const type = pick(can, line);
    this.left.splice(this.left.indexOf(type), 1);
    if (!this.left.length) this.left = [...PIECES];
    return type;
  }
}

/**
 * What a control message is about, from its text: { tg, unit }. The texts
 * are the recorder's log lines, e.g. "Grant TG 716 860.98750 MHz src
 * 1100422", "Affiliation 1105402 → TG 11035", "affiliation src 39980 tg
 * 34928", "Registration 1105402", "deaffiliation src 46310".
 */
export function about(text) {
  const tg = /\btg\s+(\d+)/i.exec(text)?.[1];
  const unit = /\b(?:src|unit)\s+(\d+)/i.exec(text)?.[1] ?? /^\s*(?:de)?(?:registration|affiliation)\s+(\d+)/i.exec(text)?.[1];
  return { tg: tg ? Number(tg) : null, unit: unit ? Number(unit) : null };
}
