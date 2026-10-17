// The music: Korobeiniki, the Russian folk song Tetris made famous (it's
// public domain; this arrangement is our own), on a 25% pulse and a
// triangle, the way the NES's sound chip would play it. And a few sound
// effects. All made here with Web Audio: nothing to download.
//
// It gets quieter while live audio plays, so the radio comes through.

const BPM = 132;
const EIGHTH = 60 / BPM / 2;

// The tune, in eighth notes: [note, length]. "-" is a rest.
const A = [
  ["E5", 2], ["B4", 1], ["C5", 1], ["D5", 2], ["C5", 1], ["B4", 1],
  ["A4", 2], ["A4", 1], ["C5", 1], ["E5", 2], ["D5", 1], ["C5", 1],
  ["B4", 3], ["C5", 1], ["D5", 2], ["E5", 2],
  ["C5", 2], ["A4", 2], ["A4", 2], ["-", 2],
  ["-", 1], ["D5", 2], ["F5", 1], ["A5", 2], ["G5", 1], ["F5", 1],
  ["E5", 3], ["C5", 1], ["E5", 2], ["D5", 1], ["C5", 1],
  ["B4", 2], ["B4", 1], ["C5", 1], ["D5", 2], ["E5", 2],
  ["C5", 2], ["A4", 2], ["A4", 2], ["-", 2],
];
const B = [
  ["E5", 4], ["C5", 4],
  ["D5", 4], ["B4", 4],
  ["C5", 4], ["A4", 4],
  ["G#4", 4], ["B4", 2], ["-", 2],
  ["E5", 4], ["C5", 4],
  ["D5", 4], ["B4", 4],
  ["C5", 2], ["E5", 2], ["A5", 4],
  ["G#5", 6], ["-", 2],
];
// The bass: a root for each bar, played low-high in eighths.
const BASS_A = ["E2", "A2", "E2", "A2", "D2", "C2", "E2", "A2"];
const BASS_B = ["A2", "E2", "A2", "E2", "A2", "E2", "A2", "E2"];

const melody = [...A, ...A, ...B];
const bass = [...BASS_A, ...BASS_A, ...BASS_B].flatMap((root) => {
  const up = transpose(root, 12);
  return [root, up, root, up, root, up, root, up].map((n) => [n, 1]);
});

function midi(note) {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  return 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
}
function transpose(note, semis) {
  const n = midi(note) + semis;
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Notes at times: [[start (eighths), midi, length (eighths)]] and the loop's length. */
function timeline(notes) {
  const out = [];
  let at = 0;
  for (const [n, len] of notes) {
    if (n !== "-") out.push([at, midi(n), len]);
    at += len;
  }
  return { notes: out, length: at };
}
const LEAD = timeline(melody);
const BASS = timeline(bass);

export class Music {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.effects = false;
    this.ducked = false;
  }

  /** Make the audio (call from a click: browsers start sound only then). */
  async start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      // A 25% pulse, the NES's favorite.
      const n = 32,
        re = new Float32Array(n),
        im = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        re[k] = Math.sin(2 * Math.PI * k * 0.25) / (Math.PI * k);
        im[k] = (2 * Math.sin(Math.PI * k * 0.25) ** 2) / (Math.PI * k);
      }
      this.pulse = this.ctx.createPeriodicWave(re, im);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  async setMusic(on) {
    this.on = on;
    if (on) {
      await this.start();
      if (!this.timer) {
        this.pos = 0; // eighths into the tune
        this.at = this.ctx.currentTime + 0.1; // when pos plays
        this.timer = setInterval(() => this.schedule(), 50);
        this.schedule();
      }
    } else if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.level();
  }

  async setEffects(on) {
    this.effects = on;
    if (on) await this.start();
  }

  /** Quieter while the radio talks. */
  duck(on) {
    this.ducked = on;
    this.level();
  }

  level() {
    if (!this.ctx) return;
    const g = this.on ? (this.ducked ? 0.18 : 1) : 0;
    this.musicGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.15);
  }

  /** Puts the notes of the next half second on the clock. */
  schedule() {
    const ctx = this.ctx;
    // Back from a hidden tab: start again from now, not from the backlog.
    if (this.at < ctx.currentTime) this.at = ctx.currentTime + 0.05;
    const ahead = ctx.currentTime + 0.5;
    while (this.at < ahead) {
      const step = this.pos % LEAD.length;
      for (const [start, m, len] of LEAD.notes) if (start === step) this.note(this.pulse, hz(m), this.at, len * EIGHTH * 0.9, 0.11);
      for (const [start, m, len] of BASS.notes) if (start === step % BASS.length) this.note("triangle", hz(m), this.at, len * EIGHTH * 0.8, 0.22);
      this.pos++;
      this.at += EIGHTH;
    }
  }

  note(wave, freq, at, dur, vol, out = this.musicGain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    if (typeof wave === "string") o.type = wave;
    else o.setPeriodicWave(wave);
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.setTargetAtTime(vol * 0.6, at + 0.01, dur / 3);
    g.gain.setTargetAtTime(0, at + dur, 0.015);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.1);
  }

  /** A sound effect: "line", "tetris", "level", "over", "record". */
  effect(kind, n = 1) {
    if (!this.effects || !this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime + 0.02;
    const play = (notes, len, vol = 0.09, wave = "square") => notes.forEach((m, i) => this.note(wave, hz(m), t + i * len, len * 0.9, vol, this.master));
    if (kind === "line") play(n > 1 ? [84, 79, 84, 79].slice(0, n + 1) : [84, 79], 0.05);
    else if (kind === "tetris") play([72, 76, 79, 84, 88, 91, 96], 0.05);
    else if (kind === "level") play([76, 79, 83, 88], 0.08);
    else if (kind === "record") play([79, 84, 88, 91, 88, 91, 96], 0.09);
    else if (kind === "over") play([67, 64, 60, 55, 52, 48], 0.16, 0.08, "triangle");
  }
}
