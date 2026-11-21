// Interactive "what if" explorer for the MCM smartphone battery model.

import { LinePlot } from "../lib/plot";
import { h, perFrame, segmented, slider } from "../lib/ui";
import {
  DAYS, DEFAULT_BRIGHTNESS, RADIO_PRESETS, SIM_MIN, battery, breakdown, simulate, timeToEmpty,
  type Clock, type Overrides,
} from "./batteryModel";

const HOURS = Float64Array.from({ length: SIM_MIN }, (_, i) => i / 60);
const fmtH = (h: number | null) => (h == null ? "> 40 h" : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} m`);

const COMPONENT_COLORS: Record<string, string> = {
  Display: "var(--s3)", CPU: "var(--s2)", Streaming: "var(--s4)", "Radios idle": "var(--s5)", Base: "var(--s1)",
};

export function mountBattery(root: HTMLElement) {
  let day = 1;
  let radio = "measured";
  let clock: "" | Clock = "";
  let grey = "";
  let brightness = DEFAULT_BRIGHTNESS;

  const overrides = (): Overrides => ({
    brightness,
    clock: clock || undefined,
    grey: grey ? +grey : undefined,
    radio: RADIO_PRESETS.find((r) => r.key === radio)?.radio,
  });

  const daySw = segmented("Sample day", DAYS.map((_, i) => ({ value: String(i), label: `Day ${i + 1}` })), String(day), (v) => { day = +v; schedule(); });
  const dayLabel = h("p", { class: "lab-hint" });
  const bri = slider({
    label: "Screen brightness", min: 0.05, max: 1, step: 0.01, value: brightness,
    format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { brightness = v; schedule(); },
  });
  const netSel = h("select", { "aria-label": "Radio configuration" },
    ...RADIO_PRESETS.map((r) => h("option", { value: r.key }, r.label)));
  netSel.addEventListener("change", () => { radio = netSel.value; schedule(); });
  const clkSw = segmented("CPU clock", [
    { value: "", label: "Measured" }, { value: "low", label: "Low" }, { value: "med", label: "Med" }, { value: "high", label: "High" },
  ], clock, (v) => { clock = v as typeof clock; schedule(); });
  const greySw = segmented("Screen content", [
    { value: "", label: "Measured" }, { value: "50", label: "Dark" }, { value: "125", label: "Mid" }, { value: "255", label: "White" },
  ], grey, (v) => { grey = v; schedule(); });

  const stats = h("div", { class: "readouts" });
  const bars = h("div", { class: "stackbar" });
  const barLegend = h("div", { class: "plot-legend" });

  const box = h("div", { class: "figure" });
  const plot = new LinePlot(box, {
    xLabel: "Hours since midnight", yLabel: "Battery remaining (%)",
    xDomain: [0, 40], yDomain: [0, 100],
    fmtX: (v) => `${v}`, fmtY: (v) => `${v.toFixed(0)}`,
    hoverTitle: (x) => `${Math.floor(x)}:${String(Math.floor((x % 1) * 60)).padStart(2, "0")} elapsed`,
  });

  function render() {
    dayLabel.textContent = DAYS[day].label + ". Each app's CPU load was back-solved from the real battery drain logged on an iPhone XR.";
    const base = battery(simulate(day));
    const mine = battery(simulate(day, overrides()));
    const clamp = (b: Float64Array) => b.map((v) => (v < 0 ? NaN : v));
    plot.update([
      { name: "Measured day", x: HOURS, y: clamp(base), color: "var(--s1)", dash: "6 4" },
      { name: "Your scenario", x: HOURS, y: clamp(mine), color: "var(--accent)", width: 2.5 },
    ]);
    const tb = timeToEmpty(base);
    const tm = timeToEmpty(mine);
    const delta = (tm ?? 40) - (tb ?? 40);
    stats.innerHTML = `
      <div><span>Time to empty, measured</span><b>${fmtH(tb)}</b></div>
      <div><span>Time to empty, your scenario</span><b class="${delta >= 0 ? "good" : "bad"}">${fmtH(tm)}</b></div>
      <div><span>Change</span><b class="${delta >= 0 ? "good" : "bad"}">${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} h</b></div>`;

    const parts = breakdown(day, overrides());
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    bars.replaceChildren(...Object.entries(parts).map(([k, v]) =>
      h("i", { style: `flex-grow:${v};--c:${COMPONENT_COLORS[k]}`, title: `${k}: ${v.toFixed(0)} mWh (${((100 * v) / total).toFixed(0)}%)` })));
    barLegend.replaceChildren(...Object.entries(parts).map(([k, v]) =>
      h("span", { class: "legend-item" }, h("i", { style: `--c:${COMPONENT_COLORS[k]}` }), `${k} ${((100 * v) / total).toFixed(0)}%`)));
  }
  const schedule = perFrame(render);

  root.append(h("div", { class: "lab-grid" },
    h("div", { class: "lab-side" },
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Sample day"), daySw),
      dayLabel,
      bri.el,
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Radios all day"), netSel),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "CPU clock tier"), clkSw),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Screen content"), greySw),
      stats,
    ),
    h("div", { class: "lab-main" },
      h("div", { class: "fig-head" }, h("h4", {}, "State of charge over a 40-hour window")),
      box,
      h("h4", { class: "sub" }, "Where the energy goes (first 24 h)"),
      bars, barLegend,
    ),
  ));
  render();
}
