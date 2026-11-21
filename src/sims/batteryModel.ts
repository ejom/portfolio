// Port of the MCM 2026 smartphone power model (config.py, model.py, main.py).
// P(t) = P_display + P_cpu + P_idle + P_stream + P0, minute resolution.

export const MAX_BATTERY_MWH = 13_819;
export const SCREEN_AREA_MM2 = 10_568.16;
export const ALPHA_DISP = 552e-9;
export const DEFAULT_BRIGHTNESS = 0.5;
export const NUM_CORES = 6;
export const P0 = 20;
export const SIM_MIN = 40 * 60;

export type Clock = "low" | "med" | "high";
export type Cell = "" | "5G" | "LTE";
export type Wifi = "" | "searching" | "connected";
export type Net = "" | "wifi" | "5G" | "LTE";

const CLOCK: Record<Clock, [number, number]> = {
  // [baseline mW, slope mW]
  high: [125, 1000 * NUM_CORES - 125],
  med: [100, 500 * NUM_CORES - 100],
  low: [75, 200 * NUM_CORES - 75],
};
const CELL_POWER: Record<Cell, number> = { "5G": 260, LTE: 160, "": 0 };
const WIFI_POWER: Record<Wifi, number> = { searching: 72, connected: 32, "": 0 };
const BT_POWER = 88;
const STREAM_POWER: Record<Net, number> = { wifi: 566, LTE: 749, "5G": 859, "": 0 };

export const pDisplay = (grey: number, brightness: number) =>
  grey ** 2.2 * SCREEN_AREA_MM2 * brightness * ALPHA_DISP;
export const pCpu = (u: number, clock: Clock) => CLOCK[clock][1] * u + CLOCK[clock][0];
const usageFromPower = (p: number, clock: Clock) => (p - CLOCK[clock][0]) / CLOCK[clock][1];

export interface Radio {
  cell?: Cell;
  wifi?: Wifi;
  bt?: boolean;
}
const pIdle = (r: Radio) => CELL_POWER[r.cell ?? ""] + WIFI_POWER[r.wifi ?? ""] + (r.bt ? BT_POWER : 0);

export interface AppEvent {
  start: number;
  duration: number;
  name: string;
  drain: number; // fraction of battery
  display: boolean;
  stream: Net;
  grey: number;
  clock: Clock;
}

const ev = (
  start: number, duration: number, name: string, drain: number,
  display: string, stream: Net, grey: number, clock: Clock,
): AppEvent => ({ start, duration, name, drain, display: display === "d", stream, grey, clock });

type Segment = [number, number, Radio];

export const DAYS: { label: string; schedule: Segment[]; events: AppEvent[] }[] = [
  {
    label: "Day 1 — run, errands, light screen time",
    schedule: [
      [0, 5 * 60, { wifi: "connected", bt: true }],
      [5 * 60, 14 * 60, { cell: "5G", wifi: "searching", bt: true }],
      [14 * 60, SIM_MIN, { wifi: "connected", bt: true }],
    ],
    events: [
      ev(6 * 60, 48, "coros", 0.32, "", "5G", 50, "high"),
      ev(8 * 60, 121, "life360", 0.09, "", "", 200, "low"),
      ev(15 * 60, 10, "gmail", 0.02, "d", "wifi", 70, "med"),
      ev(17 * 60, 18, "polytopia", 0.04, "d", "", 130, "high"),
      ev(19 * 60, 26, "chrome", 0.04, "d", "wifi", 100, "low"),
    ],
  },
  {
    label: "Day 2 — heavy streaming and navigation",
    schedule: [
      [0, 11 * 60, { wifi: "connected" }],
      [11 * 60, 16 * 60, { cell: "5G", wifi: "searching" }],
      [16 * 60, SIM_MIN, { wifi: "connected" }],
    ],
    events: [
      ev(5 * 60, 180, "tiktok", 0.27, "d", "wifi", 125, "med"),
      ev(8 * 60, 180, "pandora", 0.08, "", "", 125, "med"),
      ev(11 * 60, 28, "maps", 0.07, "d", "5G", 200, "med"),
      ev(12 * 60, 16, "chrome", 0.04, "d", "5G", 200, "low"),
      ev(15 * 60 + 5, 28, "maps", 0.07, "d", "5G", 200, "med"),
      ev(16 * 60, 114, "tiktok", 0.18, "d", "wifi", 125, "med"),
      ev(18 * 60, 17, "phone", 0.02, "", "wifi", 200, "low"),
      ev(18 * 60 + 30, 19, "messages", 0.03, "d", "wifi", 200, "low"),
      ev(19 * 60, 120, "tiktok", 0.18, "d", "wifi", 125, "med"),
    ],
  },
];

export function baseline(schedule: Segment[]): Float64Array {
  const P = new Float64Array(SIM_MIN).fill(P0);
  for (const [s, e, r] of schedule) for (let t = s; t < e; t++) P[t] += pIdle(r);
  return P;
}

/** Back-solve each app's CPU utilization from its measured battery drain (both days). */
export function calibrate(): Record<string, number> {
  const all: Record<string, number[]> = {};
  for (const day of DAYS) {
    const bl = baseline(day.schedule);
    for (const e of day.events) {
      let p = (e.drain * MAX_BATTERY_MWH) / (e.duration / 60);
      p -= bl[e.start];
      if (e.display) p -= pDisplay(e.grey, DEFAULT_BRIGHTNESS);
      if (e.stream) p -= STREAM_POWER[e.stream];
      (all[e.name] ??= []).push(usageFromPower(p, e.clock));
    }
  }
  return Object.fromEntries(
    Object.entries(all).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]),
  );
}

export const USAGE = calibrate();

export interface Overrides {
  brightness?: number;
  grey?: number;
  clock?: Clock;
  radio?: Radio; // replaces the whole idle schedule
}

export function simulate(dayIdx: number, o: Overrides = {}): Float64Array {
  const day = DAYS[dayIdx];
  const P = baseline(o.radio ? [[0, SIM_MIN, o.radio]] : day.schedule);
  const bri = o.brightness ?? DEFAULT_BRIGHTNESS;
  for (const e of day.events) {
    let pw = 0;
    if (e.display) pw += pDisplay(o.grey ?? e.grey, bri);
    if (e.stream) pw += STREAM_POWER[e.stream];
    pw += pCpu(USAGE[e.name] ?? 0, o.clock ?? e.clock);
    for (let t = e.start; t < Math.min(SIM_MIN, e.start + e.duration); t++) P[t] += pw;
  }
  return P;
}

/** Energy (mWh) per component over the first `minutes` of the day. */
export function breakdown(dayIdx: number, o: Overrides = {}, minutes = 24 * 60) {
  const day = DAYS[dayIdx];
  const bl = baseline(o.radio ? [[0, SIM_MIN, o.radio]] : day.schedule);
  const bri = o.brightness ?? DEFAULT_BRIGHTNESS;
  const out = { Display: 0, CPU: 0, Streaming: 0, "Radios idle": 0, Base: (P0 * minutes) / 60 };
  for (let t = 0; t < minutes; t++) out["Radios idle"] += (bl[t] - P0) / 60;
  for (const e of day.events) {
    const mins = Math.max(0, Math.min(minutes, e.start + e.duration) - e.start) / 60;
    if (e.display) out.Display += pDisplay(o.grey ?? e.grey, bri) * mins;
    if (e.stream) out.Streaming += STREAM_POWER[e.stream] * mins;
    out.CPU += pCpu(USAGE[e.name] ?? 0, o.clock ?? e.clock) * mins;
  }
  return out;
}

/** Remaining charge (%) per minute. */
export function battery(P: Float64Array): Float64Array {
  const out = new Float64Array(P.length);
  let used = 0;
  for (let i = 0; i < P.length; i++) {
    used += P[i] / 60;
    out[i] = (100 * (MAX_BATTERY_MWH - used)) / MAX_BATTERY_MWH;
  }
  return out;
}

/** Hours until the battery reaches 0%, or null if it lasts the whole window. */
export function timeToEmpty(bat: Float64Array): number | null {
  for (let i = 0; i < bat.length; i++) if (bat[i] <= 0) return i / 60;
  return null;
}

export const RADIO_PRESETS: { key: string; label: string; radio?: Radio }[] = [
  { key: "measured", label: "As measured" },
  { key: "wifi", label: "Wi-Fi only", radio: { wifi: "connected" } },
  { key: "5g", label: "5G only", radio: { cell: "5G" } },
  { key: "lte", label: "LTE only", radio: { cell: "LTE" } },
  { key: "5gws", label: "5G + Wi-Fi searching", radio: { cell: "5G", wifi: "searching" } },
  { key: "5gwsbt", label: "5G + Wi-Fi searching + BT", radio: { cell: "5G", wifi: "searching", bt: true } },
];
