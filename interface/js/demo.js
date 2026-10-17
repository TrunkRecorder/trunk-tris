// A pretend recorder, for ?demo: four made-up systems sending control
// channel messages at the rates real ones do (a busy P25 county system, a
// SmartNet transit system, a quiet DMR site), worded as the recorder's log
// lines are, and calls coming and going. It has the parts of TrunkClient
// this interface uses.

const SYSTEMS = [
  {
    shortName: "county",
    name: "Springfield County P25",
    type: "p25",
    rates: { grant: 84, affiliation: 40, registration: 28, deregistration: 12, update: 300, status: 60 },
    tgs: { 101: "SFD DISP", 102: "SFD FG 1", 103: "SFD FG 2", 110: "EMS OPS 1", 201: "SPD NORTH", 202: "SPD SOUTH", 203: "SPD TAC 1", 501: "DPW STREETS", 601: "SCHOOL BUS" },
    units: { 1001: "ENGINE 7", 1002: "LADDER 3", 1003: "MEDIC 12", 1004: "CAR 214", 1005: "CAR 107", 1006: "DISPATCH 2" },
  },
  {
    shortName: "metro",
    name: "Metro Transit SmartNet",
    type: "smartnet",
    rates: { grant: 102, affiliation: 72, deregistration: 76, update: 200 },
    tgs: { 32784: "RAIL OPS 1", 32816: "RAIL OPS 2", 33008: "BUS DISP", 33040: "BUS NORTH", 34928: "TRACK MAINT" },
    units: {},
  },
  {
    shortName: "harbor",
    name: "Harbor Ports P25",
    type: "p25",
    rates: { grant: 40, affiliation: 18, registration: 14, deregistration: 8, update: 120 },
    tgs: { 701: "PORT OPS", 702: "CRANES", 703: "SECURITY", 704: "PILOTS", 705: "FIREBOAT" },
    units: { 7001: "PILOT 1", 7002: "CRANE 4", 7003: "FIREBOAT" },
  },
  {
    shortName: "campus",
    name: "University DMR",
    type: "dmr",
    rates: { grant: 20, registration: 6, affiliation: 3 },
    tgs: { 1: "CAMPUS PD", 2: "FACILITIES", 3: "PARKING", 4: "EVENTS" },
    units: { 101: "UNIT 1", 102: "UNIT 2" },
  },
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class DemoClient {
  constructor({ speed = 1 } = {}) {
    this.speed = speed;
    this.connected = true;
    this.exited = false;
    this.phase = { phase: "running", error: null, ended: false };
    this.config = { systems: SYSTEMS.map(({ shortName, name, type }) => ({ shortName, name, type, enabled: true, controlChannelsHz: [851e6] })), conventional: [] };
    this.status = { systems: SYSTEMS.map((s, index) => ({ index, shortName: s.shortName })) };
    this.calls = [];
    this.handlers = new Map();
    this.nextCall = 1;
    this.last = performance.now();
    setTimeout(() => this.emit("hello", {}), 0);
    setInterval(() => this.tick(), 100);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) ?? []) fn(msg);
    if (type !== "change") for (const fn of this.handlers.get("change") ?? []) fn(this);
  }

  listen() {}
  subscribe() {}

  talkgroups(short) {
    const s = SYSTEMS.find((x) => x.shortName === short);
    return new Map(Object.entries(s?.tgs ?? {}).map(([k, alphaTag]) => [Number(k), { talkgroup: Number(k), alphaTag }]));
  }

  unitName(short, unit) {
    return SYSTEMS.find((x) => x.shortName === short)?.units[unit] ?? "";
  }

  tick() {
    const now = performance.now();
    const dt = ((now - this.last) / 1000) * this.speed;
    this.last = now;
    const lines = [];
    for (const s of SYSTEMS) {
      for (const [kind, perMin] of Object.entries(s.rates)) {
        // Poisson arrivals, a few at most a tick.
        let n = 0;
        for (let p = (perMin / 60) * dt; Math.random() < p && n < 5; p -= 1) n++;
        for (let i = 0; i < n; i++) lines.push({ timeS: now / 1000, kind, text: this.text(s, kind), system: s.shortName });
      }
    }
    if (lines.length) this.emit("log", { type: "log", lines });
    // Calls on the air: a grant now and then starts one; each lasts a few seconds.
    this.calls = this.calls.filter((c) => c.until > now);
    if (Math.random() < 0.15 * dt * 10) {
      const s = pick(SYSTEMS);
      const tg = Number(pick(Object.keys(s.tgs)));
      this.calls.push({ id: this.nextCall++, systemName: s.shortName, talkgroup: tg, until: now + (2000 + Math.random() * 8000) / this.speed });
    }
    this.emit("change", this);
  }

  text(s, kind) {
    const tg = pick(Object.keys(s.tgs));
    const unit = Number(pick(Object.keys(s.units).length ? Object.keys(s.units) : [String(39000 + Math.floor(Math.random() * 999))]));
    const mhz = (851 + Math.random() * 9).toFixed(5);
    if (s.type === "smartnet") {
      if (kind === "grant") return `grant tg ${tg} ${mhz} MHz src ${unit} digital`;
      if (kind === "affiliation") return `affiliation src ${unit} tg ${tg}`;
      if (kind === "deregistration") return `deaffiliation src ${unit}`;
      return `update tg ${tg} ${mhz} MHz digital`;
    }
    if (kind === "grant") return `Grant TG ${tg} ${mhz} MHz src ${unit}`;
    if (kind === "affiliation") return `Affiliation ${unit} → TG ${tg}`;
    if (kind === "registration") return `Registration ${unit}`;
    if (kind === "deregistration") return `Deregistration ${unit}`;
    if (kind === "update") return `Update TG ${tg} ${mhz} MHz slot 0`;
    return "Network status wacn bee00 sysid 445";
  }
}
