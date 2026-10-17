// What this viewer has chosen, kept in this browser (localStorage): an
// interface with listen access can't, and shouldn't, change the recorder's
// config.

const KEY = "trunk-tris";

const DEFAULTS = {
  /** Systems with no game (short names); every trunked system has one otherwise. */
  off: [],
  /** Games on the screen at once: "auto" (as many as fit) or a number. */
  fit: "auto",
  /** Seconds between pages of games when they don't all fit; 0: only by hand. */
  cycle: 60,
  /** game.js PACES. */
  pace: "relaxed",
  /** ai.js SKILLS. */
  skill: "good",
  /** "nes" (by level, as NES Tetris) or "modern". */
  colors: "nes",
  music: false,
  effects: false,
  live: false,
  /** The first game on the page, when they don't all fit. */
  page: 0,
};

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // Sound needs a click to start, every time: these come back off.
    return { ...structuredClone(DEFAULTS), ...s, music: false, effects: false, live: false };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private windows and full storage: the choices last until the page closes.
  }
}
