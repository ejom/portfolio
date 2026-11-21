// Interactive Bode plot and PWM ripple map for the distributed buck converter.

import { LinePlot, colorbarGradient, drawHeatmap, fmtSI } from "../lib/plot";
import { h, perFrame, segmented, slider } from "../lib/ui";
import {
  D0, DEFAULTS, PLANTS, Z0, bode, firstNotch, linspace, logspace, refinePeak, rippleMap,
  type BuckParams, type Plant,
} from "./buckModel";

const F_BODE = logspace(2, 8.3, 5000); // 100 Hz – 200 MHz
const F_PWM = linspace(2e6, 10e6, 401);
const DF = F_PWM[1] - F_PWM[0];

/** Index of the largest value in a grid, without spreading big arrays. */
function argmax(rows: Float64Array[]) {
  let v = -Infinity, i = 0, j = 0;
  rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] > v) { v = row[c]; i = r; j = c; } });
  return { v, i, j };
}

/** Worst-case ripple at duty d over the PWM band, refined past the grid. */
function worstAt(fn: Plant, p: BuckParams, d: number) {
  const row = rippleMap(fn, p, F_PWM, new Float64Array([d]));
  const { j } = argmax(row);
  return refinePeak(fn, p, F_PWM[j], DF, d);
}
const DUTY = linspace(0.02, 0.98, 97);
const VMIN = 0.01; // 10 mA floor for the log color scale

export function mountBuck(root: HTMLElement) {
  const p: BuckParams = { ...DEFAULTS };
  let view: "mag" | "ph" = "mag";
  let plantKey = "dist";

  // ---------- controls
  const sl = slider({
    label: "Line length l", min: 1, max: 12, step: 0.1, value: p.l,
    format: (v) => `${v.toFixed(1)} m`, onInput: (v) => { p.l = v; schedule(); },
  });
  const sLin = slider({
    label: "Input inductor Lin", min: 0.1e-6, max: 2e-6, log: true, value: p.Lin,
    format: (v) => fmtSI(v, "H", 2), onInput: (v) => { p.Lin = v; schedule(); },
  });
  const sRp = slider({
    label: "Damping resistor Rp", min: 3, max: 1000, log: true, value: p.Rp,
    format: (v) => `${v.toFixed(v < 10 ? 1 : 0)} Ω`, onInput: (v) => { p.Rp = v; schedule(); },
  });
  const reset = h("button", { type: "button", class: "btn ghost small" }, "Reset to paper values");
  const zbtn = h("button", { type: "button", class: "btn ghost small" }, "Set Rp = Z₀");
  reset.addEventListener("click", () => {
    Object.assign(p, DEFAULTS);
    sl.set(p.l); sLin.set(p.Lin); sRp.set(p.Rp);
    schedule();
  });
  zbtn.addEventListener("click", () => { p.Rp = Z0; sRp.set(Z0); schedule(); });

  const readouts = h("div", { class: "readouts" });

  // ---------- bode
  const bodeBox = h("div", { class: "figure" });
  const bodePlot = new LinePlot(bodeBox, {
    xLog: true, xLabel: "Frequency (Hz)", yLabel: "|P(jω)| (dB)", toggle: true,
    fmtX: (v) => fmtSI(v, "Hz", 3), fmtY: (v) => `${v.toFixed(1)}`,
    hoverTitle: (x) => fmtSI(x, "Hz", 4),
    marks: [{ axis: "x", value: 2e6, label: "PWM band" }, { axis: "x", value: 10e6 }],
  });
  const viewSwitch = segmented("Bode view", [
    { value: "mag", label: "Magnitude" }, { value: "ph", label: "Phase" },
  ], view, (v) => {
    view = v;
    bodePlot.setOptions({ yLabel: v === "mag" ? "|P(jω)| (dB)" : "∠P(jω) (°)", yDomain: v === "ph" ? [-180, 180] : undefined });
    renderBode();
  });

  // ---------- ripple map
  const canvas = h("canvas", { class: "heat-canvas", "aria-label": "Ripple heatmap" });
  const marker = h("div", { class: "heat-marker" });
  const d0line = h("div", { class: "heat-d0" }, h("span", {}, `D₀ = ${D0}`));
  const heatTip = h("div", { class: "plot-tip" });
  heatTip.hidden = true;
  const area = h("div", { class: "heat-area" }, canvas, d0line, marker, heatTip);
  const xt = h("div", { class: "heat-xt" }, ...[2, 4, 6, 8, 10].map((v) => h("span", { style: `left:${((v - 2) / 8) * 100}%` }, `${v}`)));
  const yt = h("div", { class: "heat-yt" }, ...[0.1, 0.25, 0.5, 0.75, 0.9].map((v) => h("span", { style: `bottom:${((v - 0.02) / 0.96) * 100}%` }, `${v}`)));
  const cbar = h("div", { class: "colorbar" },
    h("span", {}, "10 mA"), h("i", { style: `background:${colorbarGradient()}` }), h("span", { class: "cbar-max" }, ""));
  const heatTitle = h("p", { class: "heat-title" });
  const plantSwitch = segmented("Plant", PLANTS.map((pl) => ({ value: pl.key, label: pl.name })), plantKey, (v) => {
    plantKey = v;
    renderHeat();
  });

  let maps: Record<string, Float64Array[]> = {};
  let vmax = 1;

  function renderBode() {
    bodePlot.update(PLANTS.map((pl) => {
      const { mag, ph } = bode(pl.fn, F_BODE, p);
      return { name: pl.name, x: F_BODE, y: view === "mag" ? mag : ph, color: pl.color, dash: pl.dash };
    }));
  }

  function renderHeat() {
    const z = maps[plantKey];
    drawHeatmap(canvas, z, VMIN, vmax);
    const { i: bi, j: bj } = argmax(z);
    const plant = PLANTS.find((x) => x.key === plantKey)!;
    const peak = refinePeak(plant.fn, p, F_PWM[bj], DF, DUTY[bi]);
    marker.style.left = `${((peak.f - 2e6) / 8e6) * 100}%`;
    marker.style.bottom = `${(bi / (DUTY.length - 1)) * 100}%`;
    d0line.style.bottom = `${((D0 - 0.02) / 0.96) * 100}%`;
    heatTitle.innerHTML = `<b>${plant.name}</b>: worst case <b class="num">${fmtSI(peak.v, "A")}</b> RMS at f<sub>PWM</sub> = ${(peak.f / 1e6).toFixed(3)} MHz, D = ${DUTY[bi].toFixed(2)}`;
    (cbar.querySelector(".cbar-max") as HTMLElement).textContent = fmtSI(vmax, "A");
  }

  area.addEventListener("pointermove", (ev) => {
    const r = area.getBoundingClientRect();
    const u = (ev.clientX - r.left) / r.width;
    const v = 1 - (ev.clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const j = Math.round(u * (F_PWM.length - 1));
    const i = Math.round(v * (DUTY.length - 1));
    heatTip.hidden = false;
    heatTip.style.left = `${u * r.width}px`;
    heatTip.style.top = `${(1 - v) * r.height}px`;
    heatTip.classList.toggle("flip", u > 0.6);
    heatTip.innerHTML = `<div class="tip-title">f = ${(F_PWM[j] / 1e6).toFixed(2)} MHz · D = ${DUTY[i].toFixed(2)}</div><div>ripple<b>${fmtSI(maps[plantKey][i][j], "A")}</b></div>`;
  });
  area.addEventListener("pointerleave", () => { heatTip.hidden = true; });

  function renderReadouts() {
    const notch = firstNotch(PLANTS[1].fn, p);
    const bare = worstAt(PLANTS[1].fn, p, D0);
    const damped = worstAt(PLANTS[3].fn, p, D0);
    readouts.innerHTML = `
      <div><span>Z₀ = √(L′/C′)</span><b>${Z0.toFixed(1)} Ω</b></div>
      <div><span>1st line antiresonance</span><b>${notch ? fmtSI(notch, "Hz", 3) : "—"}</b></div>
      <div><span>Worst ripple @ D₀, bare line</span><b class="bad">${fmtSI(bare.v, "A")}</b></div>
      <div><span>Worst ripple @ D₀, with Lin ∥ Rp</span><b class="${damped.v < bare.v / 5 ? "good" : ""}">${fmtSI(damped.v, "A")}</b></div>`;
  }

  const recompute = () => {
    renderBode();
    maps = Object.fromEntries(PLANTS.map((pl) => [pl.key, rippleMap(pl.fn, p, F_PWM, DUTY)]));
    vmax = Math.max(...Object.values(maps).map((m) => argmax(m).v));
    renderHeat();
    // Refined readouts cost about as much as everything else combined, so
    // update them once the slider settles instead of every frame.
    clearTimeout(readoutTimer);
    readoutTimer = window.setTimeout(renderReadouts, 120);
  };
  let readoutTimer = 0;
  const schedule = perFrame(recompute);

  root.append(
    h("div", { class: "lab-grid" },
      h("div", { class: "lab-side" },
        h("p", { class: "lab-hint" }, "Drag the sliders. The model is the exact telegrapher's-equation solution from my derivation, evaluated in your browser."),
        sl.el, sLin.el, sRp.el,
        h("div", { class: "btn-row" }, zbtn, reset),
        readouts,
      ),
      h("div", { class: "lab-main" },
        h("div", { class: "fig-head" }, h("h4", {}, "Duty ratio → input current, P(jω)"), viewSwitch),
        bodeBox,
        h("p", { class: "fig-note" }, "Tap legend entries to hide curves. Hover for values."),
      ),
    ),
    h("div", { class: "lab-heat" },
      h("div", { class: "fig-head" }, h("h4", {}, "RMS input-current ripple over PWM frequency and duty ratio"), plantSwitch),
      heatTitle,
      h("div", { class: "heat-wrap" },
        h("div", { class: "heat-ylabel" }, "duty ratio D"), yt, area, h("div", {}), xt),
      h("div", { class: "heat-foot" }, h("span", {}, "f", h("sub", {}, "PWM"), " (MHz)"), cbar),
    ),
  );
  recompute();
}
