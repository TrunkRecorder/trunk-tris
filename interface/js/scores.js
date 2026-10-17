// The high score table: every system's games in one, best first, kept in
// this browser. Each row: the score, its lines and level, the system's
// short name, and when.

const KEY = "trunk-tris-scores";
export const KEEP = 10;

export function load() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(rows) ? rows.filter((r) => r && Number.isFinite(r.score)) : [];
  } catch {
    return [];
  }
}

function save(rows) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // Private windows and full storage: the table lasts until the page closes.
  }
}

/** Adds a game's result ({ score, lines, level, system }); → its place (1…), or null when it didn't make the table. */
export function add(rows, result, at = Date.now()) {
  if (!(result.score > 0)) return null;
  const row = { score: result.score, lines: result.lines, level: result.level, system: result.system, at };
  // Ties go to the earlier game.
  const i = rows.findIndex((r) => result.score > r.score);
  const place = i < 0 ? rows.length : i;
  if (place >= KEEP) return null;
  rows.splice(place, 0, row);
  rows.length = Math.min(rows.length, KEEP);
  save(rows);
  return place + 1;
}

export function clear(rows) {
  rows.length = 0;
  save(rows);
}
