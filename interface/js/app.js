// Trunk-tris: a game of Tetris for each radio system, its pieces made by
// the messages on the system's control channel, played by the computer.
// This file is the page: the systems and their games, as many on the
// screen as fit (and the next ones in turn when they don't), the messages
// from the recorder to the games they belong to, the music and live audio,
// the high score table, settings, and full screen.
//
// The recorder serves its client library at /api/client.js. ?demo plays
// made-up systems instead (demo.js), and so does a page with no recorder
// behind it. ?speed=4 runs the games four times as fast.

import { Game } from "./game.js";
import { GROUP_NAMES, KINDS, about } from "./feed.js";
import { draw, SCREEN_W, SCREEN_H } from "./screen.js";
import { GameBoyScreen, LCD_W, LCD_H } from "./gameboy.js";
import { H, GB_H } from "./tetris.js";
import { text as pixelText } from "./font.js";
import { Music } from "./music.js";
import { DemoClient } from "./demo.js";
import * as Scores from "./scores.js";
import * as Store from "./settings.js";

let api = null;
try {
  api = await import("/api/client.js");
} catch {
  // Not served by a recorder: the demo is all there is.
}
const params = new URLSearchParams(location.search);
const demo = !api || params.has("demo");
const SPEED = Math.max(0.1, Math.min(50, Number(params.get("speed")) || 1));
const esc = api?.escapeHtml ?? ((s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]));
const $ = (id) => document.getElementById(id);

const rec = demo ? new DemoClient({ speed: SPEED }) : new api.TrunkClient();
const settings = Store.load();
const scores = Scores.load();
const music = new Music();
const player = !demo && api ? new api.LivePlayer({ onNowPlaying: (c) => nowPlaying(c) }) : null;
let playing = null; // the short name whose live audio is playing

// ── Systems and their games ─────────────────────────────────────────────────
//
// Every trunked system the recorder follows has a game, running whether
// it's on the screen or not. Conventional systems have no control channel,
// so no game.

let systems = []; // { short, name }
const games = new Map(); // short → { game, canvas, ctx, el, gb }

/** The Game Boy looks: its well is 18 deep, the NES's 20. */
const isGB = () => settings.look === "dmg" || settings.look === "pocket";
const rows = () => (isGB() ? GB_H : H);

function loadSystems() {
  const cfg = rec.config;
  if (!cfg) return;
  systems = (cfg.systems ?? []).filter((s) => s.enabled !== false && !settings.off.includes(s.shortName)).map((s) => ({ short: s.shortName, name: s.name || s.shortName }));
  for (const s of systems) if (!games.has(s.short)) games.set(s.short, makeGame(s.short));
}

function makeGame(short) {
  const canvas = document.createElement("canvas");
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const el = document.createElement("section");
  el.className = "game";
  el.append(canvas);
  const game = new Game({
    seed: Date.now() ^ hashOf(short),
    rows: rows(),
    options: () => ({ pace: settings.pace, skill: settings.skill }),
    top: () => scores[0]?.score ?? 0,
    onEvent: (e) => event(short, e),
  });
  return { game, canvas, ctx: canvas.getContext("2d"), el };
}

/**
 * A game as a Game Boy: its LCD in the bezel (the stripe along the top
 * says what made the latest piece; the red light is on while the system
 * has calls on the air), made the first time it's wanted.
 */
function gameBoy(g) {
  if (g.gb) return g.gb;
  const screen = new GameBoyScreen();
  const el = document.createElement("section");
  el.className = "game gameboy";
  el.innerHTML = `<div class="gb-bezel">
      <div class="gb-stripe"><i></i><span class="gb-label"></span><i></i></div>
      <div class="gb-led"><b></b><small>ON AIR</small></div>
      <div class="gb-lcd"></div>
    </div>
    <div class="gb-brand">Trunk-tris</div>`;
  el.querySelector(".gb-lcd").append(screen.canvas);
  return (g.gb = { screen, el, label: el.querySelector(".gb-label"), led: el.querySelector(".gb-led"), text: null });
}

/** A game's size on the screen, in its own pixels: the NES's screen, or the Game Boy with its bezel. */
const GB_SIZE = [216, 212];
const unit = () => (isGB() ? GB_SIZE : [SCREEN_W, SCREEN_H]);

const hashOf = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** What a game says happened: sounds for the games on the screen, and the high score table. */
function event(short, e) {
  const seen = shown.includes(short);
  if (e.type === "over") {
    const rank = Scores.add(scores, { score: e.score, lines: e.lines, level: e.level, system: short });
    if (seen) music.effect(rank ? "record" : "over");
    if ($("scores").open) drawScoresDialog();
    return rank;
  }
  if (!seen) return null;
  if (e.type === "lines") music.effect(e.n === 4 ? "tetris" : "line", e.n);
  else if (e.type === "level") music.effect("level");
  else if (e.type === "record") music.effect("record");
  return null;
}

// ── Control channel messages → games ────────────────────────────────────────

rec.on("log", (m) => {
  if (paused()) return;
  for (const line of m.lines ?? []) {
    if (line.system && systems.some((s) => s.short === line.system)) games.get(line.system).game.offer(line);
  }
});

/** What the bottom line says of the message that made the latest piece. */
function label(short, feed) {
  const { tg, unit } = about(feed.line.text ?? "");
  const tgName = tg != null ? rec.talkgroups?.(short)?.get(tg)?.alphaTag || `TG ${tg}` : "";
  const unitName = unit != null ? rec.unitName?.(short, unit) || `RADIO ${unit}` : "";
  const kind = feed.line.kind;
  if (!KINDS[kind]) return `${kind.replace(/_/g, " ")} ${tgName || unitName}`;
  if (kind === "affiliation") return `AFFIL ${unitName}${tgName ? ` > ${tgName}` : ""}`;
  if (kind === "registration") return `REG ${unitName}`;
  if (kind === "deregistration") return `DEREG ${unitName}`;
  return `${GROUP_NAMES[KINDS[kind]]} ${tgName}${unitName && !tgName ? unitName : ""}`;
}

const paused = () => !demo && (!rec.connected || rec.phase?.phase !== "running");

// ── The screen: as many games as fit, a page at a time ──────────────────────

let shown = []; // the short names on the screen, in order
let perPage = 1;
let scale = 1;
const GAP = 12;
/** A game's smallest size, in its own pixels' size, before fewer are shown. */
const MIN_SCALE = 2;

/** The grid that shows `n` games largest in w × h: { cols, rows, scale }. */
function grid(n, w, h) {
  let best = { cols: 1, rows: 1, scale: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const [uw, uh] = unit();
    const s = Math.min((w - GAP * (cols - 1)) / (cols * uw), (h - GAP * (rows - 1)) / (rows * uh));
    if (s > best.scale) best = { cols, rows, scale: s };
  }
  // Whole pixels when they're big enough to see, so every pixel is the same size.
  if (best.scale >= MIN_SCALE) best.scale = Math.floor(best.scale);
  return best;
}

function layout() {
  const stage = $("stage");
  const full = document.body.classList.contains("full");
  const pad = full ? 0 : window.innerWidth <= 640 ? 0 : 32;
  const w = stage.clientWidth - pad,
    h = (full ? window.innerHeight : stage.clientHeight) - (full ? 0 : 24);
  const n = systems.length;
  $("empty").hidden = n > 0;
  stage.hidden = !n;
  if (!n) {
    shown = [];
    stage.replaceChildren();
    return;
  }
  // How many: as many as fit at a readable size (at least one), or the chosen number.
  let k = settings.fit === "auto" ? 1 : Math.min(n, Number(settings.fit) || 1);
  if (settings.fit === "auto") while (k < n && grid(k + 1, w, h).scale >= MIN_SCALE) k++;
  perPage = k;
  const g = grid(k, w, h);
  scale = g.scale;
  const pages = Math.ceil(n / k);
  settings.page = ((settings.page % pages) + pages) % pages;
  // A page of k, the last one topped up from the start so it's as full as the rest.
  const start = settings.page * k;
  const next = Array.from({ length: Math.min(k, n) }, (_, i) => systems[(start + i) % n].short);
  stage.style.gridTemplateColumns = `repeat(${Math.min(g.cols, next.length)}, auto)`;
  stage.style.setProperty("--gap", `${GAP}px`);
  // A new look with a well of another depth starts every game again.
  for (const s of systems) games.get(s.short).game.setRows(rows());
  shown = next;
  const els = shown.map((s) => (isGB() ? gameBoy(games.get(s)).el : games.get(s).el));
  if (els.length !== stage.children.length || els.some((e, i) => stage.children[i] !== e)) stage.replaceChildren(...els);
  for (const s of shown) {
    const g = games.get(s);
    const title = systems.find((x) => x.short === s)?.name ?? s;
    if (isGB()) {
      const { screen, el } = gameBoy(g);
      el.style.setProperty("--s", String(scale));
      screen.canvas.style.width = `${LCD_W * scale}px`;
      screen.canvas.style.height = `${LCD_H * scale}px`;
      el.classList.toggle("pocket", settings.look === "pocket");
      // Whole device pixels a Game Boy pixel, for an even grid.
      screen.setup(Math.max(1, Math.round(scale * (window.devicePixelRatio || 1))), settings.look);
      el.title = title;
    } else {
      g.canvas.style.width = `${SCREEN_W * scale}px`;
      g.canvas.style.height = `${SCREEN_H * scale}px`;
      g.el.title = title;
    }
  }
  $("pager").hidden = pages < 2;
  $("page").textContent = `${settings.page + 1}/${pages}`;
  relisten();
}

function page(step) {
  settings.page += step;
  Store.save(settings);
  cycleAt = performance.now() + settings.cycle * 1000;
  layout();
}

$("prev").addEventListener("click", () => page(-1));
$("next").addEventListener("click", () => page(1));
window.addEventListener("resize", () => layout());

// The next page by itself, now and then; not while a game on this one is
// over and showing its scores.
let cycleAt = performance.now() + settings.cycle * 1000;
function cycle(now) {
  if (!settings.cycle || systems.length <= perPage) return;
  if (now < cycleAt) return;
  if (shown.some((s) => games.get(s)?.game.mode !== "play")) return;
  page(1);
}

// ── Drawing and running ─────────────────────────────────────────────────────

const dateFmt = new Intl.DateTimeFormat([], { year: "2-digit", month: "2-digit", day: "2-digit" });

function view(short, g, now) {
  return {
    name: short.toUpperCase(),
    colors: settings.look === "modern" ? "modern" : "nes",
    paused: paused(),
    calls: (rec.calls ?? []).filter((c) => c.systemName === short).length,
    playing: playing === short,
    label: g.feed ? label(short, g.feed) : "",
    now: now / 1000,
    scores,
    dates: g.mode === "scores" ? scores.map((s) => dateFmt.format(new Date(s.at))) : [],
    top: scores[0]?.score ?? 0,
  };
}

const FRAME_MS = 1000 / 30 - 2;
let last = performance.now(),
  lastFrame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (now - lastFrame < FRAME_MS) return;
  lastFrame = now;
  // A hidden tab has no frames: the games wait for it, rather than jump.
  const real = Math.min(0.1, (now - last) / 1000),
    dt = real * SPEED;
  last = now;
  // Every system's game, on the screen or not; not those turned off.
  if (!paused()) for (const s of systems) games.get(s.short).game.update(dt);
  for (const s of shown) {
    const g = games.get(s);
    const v = view(s, g.game, now);
    if (isGB()) {
      const gb = gameBoy(g);
      gb.screen.draw(g.game, v, real);
      const text = v.label || (v.paused ? "THE RECORDER IS STOPPED" : "LISTENING TO THE RADIO");
      if (gb.text !== text) gb.label.textContent = gb.text = text;
      gb.led.classList.toggle("on", v.calls > 0);
      gb.el.classList.toggle("on-air", playing === s);
    } else {
      draw(g.ctx, g.game, v);
      g.el.classList.toggle("on-air", playing === s);
    }
  }
  cycle(now);
}
requestAnimationFrame(loop);

// ── The bar ─────────────────────────────────────────────────────────────────

function drawState() {
  const s = $("state");
  if (demo) {
    s.textContent = "Demo";
    s.dataset.state = "on";
  } else if (!rec.connected) {
    s.textContent = rec.exited ? "Recorder stopped" : "Connecting…";
    s.dataset.state = "off";
  } else if (rec.phase?.phase === "running") {
    s.textContent = "On the air";
    s.dataset.state = "on";
  } else {
    s.textContent = rec.phase?.phase === "starting" ? "Starting…" : "Not recording";
    s.dataset.state = "idle";
  }
}

function drawLogo() {
  // TRUNK-TRIS in the pieces' colors, a letter each, with a shadow.
  const word = "TRUNK-TRIS";
  const colors = ["#f00000", "#f0a000", "#f0f000", "#00f000", "#00f0f0", "#fcfcfc", "#0058f8", "#a000f0", "#f878f8", "#f0a000"];
  const c = $("logo");
  c.width = word.length * 8 + 1;
  c.height = 9;
  const ctx = c.getContext("2d");
  [...word].forEach((ch, i) => pixelText(ctx, ch, i * 8 + 1, 1, "#303030"));
  [...word].forEach((ch, i) => pixelText(ctx, ch, i * 8, 0, colors[i]));
  c.style.width = `${c.width * 3}px`;
  c.style.height = `${c.height * 3}px`;
}
drawLogo();

// ── Music and live audio ────────────────────────────────────────────────────

async function setMusic(on) {
  settings.music = on;
  await music.setMusic(on);
  $("music").setAttribute("aria-pressed", String(on));
}
$("music").addEventListener("click", () => setMusic(!settings.music));
music.setEffects(false);

$("live").hidden = !player;
$("live").addEventListener("click", () => setLive(!settings.live));

async function setLive(on) {
  if (!player) return;
  settings.live = on;
  if (on) await player.resume();
  else {
    player.stop();
    nowPlaying(null);
  }
  $("live").setAttribute("aria-pressed", String(on));
  relisten();
}

function relisten() {
  if (!player) return;
  if (!settings.live) return rec.listen(false);
  // One system's when one is on the screen; else all, and the ones not shown are skipped.
  if (shown.length === 1) rec.listen({ system: shown[0] });
  else rec.listen();
}

rec.on?.("audio", (chunk) => {
  if (!settings.live || !player) return;
  if (!shown.includes(shortOf(chunk.system))) return;
  player.play(chunk);
});

function nowPlaying(call) {
  playing = call ? shortOf(call.system) : null;
  music.duck(!!call);
}

function shortOf(system) {
  return rec.status?.systems?.find((s) => s.index === system)?.shortName;
}

// ── High scores ─────────────────────────────────────────────────────────────

const longDate = new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" });

function drawScoresDialog() {
  $("scores-rows").innerHTML = scores.length
    ? scores
        .map(
          (s, i) =>
            `<tr><td>${i + 1}</td><td>${esc(s.system)}</td><td class="num">${s.score.toLocaleString()}</td><td class="num">${s.lines}</td><td class="num">${s.level}</td><td>${esc(longDate.format(new Date(s.at)))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="empty-row">No games over yet. A game ends when the stack reaches the top; its score goes here if it's in the best ten.</td></tr>`;
  $("scores-clear").disabled = !scores.length;
}

function openDialog(d) {
  for (const other of document.querySelectorAll("dialog[open]")) other.close();
  d.showModal();
}

$("scores-btn").addEventListener("click", () => {
  drawScoresDialog();
  openDialog($("scores"));
});
$("scores-close").addEventListener("click", () => $("scores").close());
$("scores-clear").addEventListener("click", () => {
  if (!confirm("Clear the high score table?")) return;
  Scores.clear(scores);
  drawScoresDialog();
});

// ── Settings ────────────────────────────────────────────────────────────────

const form = $("settings-form");

$("settings-btn").addEventListener("click", () => {
  const all = (rec.config?.systems ?? []).filter((s) => s.enabled !== false);
  $("set-systems").innerHTML = all.length
    ? all.map((s) => `<label><input type="checkbox" value="${esc(s.shortName)}" ${settings.off.includes(s.shortName) ? "" : "checked"}> ${esc(s.name || s.shortName)}</label>`).join("")
    : `<span class="hint">No trunked systems are turned on in the recorder.</span>`;
  for (const name of ["fit", "cycle", "pace", "skill", "look"]) form.elements[name].value = String(settings[name]);
  form.elements.effects.checked = settings.effects;
  openDialog($("settings"));
});
$("settings-close").addEventListener("click", () => $("settings").close());

form.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.closest("#set-systems")) {
    settings.off = [...$("set-systems").querySelectorAll("input")].filter((i) => !i.checked).map((i) => i.value);
    loadSystems();
  } else if (t.name === "effects") {
    settings.effects = t.checked;
    await music.setEffects(t.checked);
  } else if (t.name === "cycle") {
    settings.cycle = Number(t.value);
    cycleAt = performance.now() + settings.cycle * 1000;
  } else settings[t.name] = t.value;
  Store.save(settings);
  layout();
});

// ── Full screen ─────────────────────────────────────────────────────────────
//
// The whole page, for a wall or a spare monitor. In full screen the bar
// floats over the games and goes away, with the pointer, after a few
// seconds without a move.

const IDLE_MS = 3000;
const canFull = document.fullscreenEnabled || document.webkitFullscreenEnabled;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
let idleTimer = null;

$("full").hidden = !canFull;
$("full").addEventListener("click", toggleFull);

function toggleFull() {
  if (isFull()) (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
  else {
    const el = document.documentElement;
    (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el)?.catch?.(() => {});
  }
}

function onFull() {
  const full = isFull();
  document.body.classList.toggle("full", full);
  $("full").setAttribute("aria-pressed", String(full));
  $("full").textContent = full ? "⛶ Exit" : "⛶ Full screen";
  wake();
  layout();
}
document.addEventListener("fullscreenchange", onFull);
document.addEventListener("webkitfullscreenchange", onFull);

function wake() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  if (!isFull()) return;
  idleTimer = setTimeout(() => {
    if (document.querySelector("dialog[open]")) return wake();
    document.body.classList.add("idle");
  }, IDLE_MS);
}
for (const type of ["pointermove", "pointerdown", "keydown"]) document.addEventListener(type, wake, { passive: true });

// ── Keys ────────────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select, textarea") || document.querySelector("dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.key === "ArrowLeft") page(-1);
  else if (e.key === "ArrowRight") page(1);
  else if (k === "m") $("music").click();
  else if (k === "l" && player) $("live").click();
  else if (k === "h") $("scores-btn").click();
  else if (k === "g") {
    settings.look = isGB() ? "nes" : "dmg";
    Store.save(settings);
    layout();
  }
  else if (k === "f" && canFull) toggleFull();
  else return;
  e.preventDefault();
});

// ── Running ─────────────────────────────────────────────────────────────────

let configSeen = null;
rec.on("change", () => {
  if (rec.config && rec.config !== configSeen) {
    configSeen = rec.config;
    loadSystems();
    layout();
  }
  drawState();
});
// The messages the games are made of: the recorder sends them only to those who ask.
rec.subscribe?.(["log"]);

drawState();
if (demo) $("demo-note").hidden = false;
// For poking at from the console: trunkTris.games.get("short").game.end().
window.trunkTris = { games, systems: () => systems, settings, scores, music };
