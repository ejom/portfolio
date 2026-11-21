// Interactive via-fenced stripline explorer (package substrate signal routing).

import { LinePlot, fmtSI } from "../lib/plot";
import { h, perFrame, segmented, slider } from "../lib/ui";
import {
  DEFAULTS, alphaC, alphaD, channelCutoff, delay, pitchLimit, widthFor, z0Stripline,
  type StripParams,
} from "./hfssModel";

const um = (v: number) => `${Math.round(v * 1e6)} µm`;

export function mountHfss(root: HTMLElement) {
  const p: StripParams = { ...DEFAULTS };
  let view: "z" | "loss" = "loss";

  const S = [
    slider({ label: "Dielectric εr", min: 2, max: 12, step: 0.1, value: p.er, format: (v) => v.toFixed(1), onInput: (v) => { p.er = v; go(); } }),
    slider({ label: "Loss tangent tan δ", min: 0.001, max: 0.03, log: true, value: p.tand, format: (v) => v.toFixed(4), onInput: (v) => { p.tand = v; go(); } }),
    slider({ label: "Plane separation b", min: 20e-6, max: 300e-6, step: 1e-6, value: p.b, format: um, onInput: (v) => { p.b = v; go(); } }),
    slider({ label: "Trace width w", min: 5e-6, max: 200e-6, step: 1e-6, value: p.w, format: um, onInput: (v) => { p.w = v; go(); } }),
    slider({ label: "Via fence separation", min: 100e-6, max: 1500e-6, step: 5e-6, value: p.W, format: um, onInput: (v) => { p.W = v; go(); } }),
    slider({ label: "Via pitch", min: 50e-6, max: 600e-6, step: 5e-6, value: p.s, format: um, onInput: (v) => { p.s = v; go(); } }),
    slider({ label: "Via diameter", min: 15e-6, max: 120e-6, step: 1e-6, value: p.d, format: um, onInput: (v) => { p.d = v; go(); } }),
  ];
  const keys: (keyof StripParams)[] = ["er", "tand", "b", "w", "W", "s", "d"];
  const reset = h("button", { type: "button", class: "btn ghost small" }, "Reset");
  const match = h("button", { type: "button", class: "btn small" }, "Size trace for 50 Ω");
  reset.addEventListener("click", () => { Object.assign(p, DEFAULTS); S.forEach((s, i) => s.set(p[keys[i]])); go(); });
  match.addEventListener("click", () => { p.w = widthFor(50, p.b, p.er); S[3].set(p.w); go(); });

  const xsec = h("div", { class: "xsec" });
  const readouts = h("div", { class: "readouts" });
  const warn = h("p", { class: "warn", "aria-live": "polite" });

  const plotBox = h("div", { class: "figure" });
  const plot = new LinePlot(plotBox, {
    xLog: true, xLabel: "Frequency (Hz)", yLabel: "Loss (dB/mm)", yLog: true,
    fmtX: (v) => fmtSI(v, "Hz", 3), fmtY: (v) => (v >= 0.01 ? v.toFixed(v < 0.1 ? 3 : 2) : v.toExponential(1)),
    hoverTitle: (x) => fmtSI(x, "Hz", 3), xDomain: [1e8, 4e11],
  });
  const viewSw = segmented("Plot", [{ value: "loss", label: "Loss vs frequency" }, { value: "z", label: "Z₀ vs trace width" }], view, (v) => { view = v; go(); });

  const F = Float64Array.from({ length: 400 }, (_, i) => 10 ** (8 + (i * (Math.log10(4e11) - 8)) / 399));
  const Wsweep = Float64Array.from({ length: 300 }, (_, i) => 10 ** (Math.log10(3e-6) + (i * (Math.log10(300e-6) - Math.log10(3e-6))) / 299));

  function drawXsec() {
    // cross-section (left) and top view (right), both scaled to fit
    const span = Math.max(p.W + p.d * 2, p.w * 1.5) * 1.15;
    const X = 300 / span; // px per metre, cross-section width 300
    const Y = Math.min(110 / p.b, X * 2.5);
    const hb = p.b * Y;
    const cx = 160;
    const top = 26;
    const tTrace = Math.max(3, 5e-6 * Y);
    const via = (xc: number) =>
      `<rect x="${xc - (p.d * X) / 2}" y="${top}" width="${Math.max(2, p.d * X)}" height="${hb}" class="xs-via"/>`;
    // top view: rows of vias along the line
    const L = 260;
    const pitchPx = Math.max(6, (p.s / span) * 300);
    const rowGap = Math.max(20, Math.min(110, (p.W / span) * 300 * 0.6));
    const tvTop = 40;
    let dots = "";
    for (let x = 340 + 10; x < 340 + L; x += pitchPx) {
      const r = Math.max(2, Math.min(pitchPx * 0.45, ((p.d / span) * 300) / 2));
      dots += `<circle cx="${x}" cy="${tvTop}" r="${r}" class="xs-viac"/><circle cx="${x}" cy="${tvTop + rowGap}" r="${r}" class="xs-viac"/>`;
    }
    const tw = Math.max(2, Math.min(rowGap * 0.5, (p.w / span) * 300 * 0.6));
    xsec.innerHTML = `
      <svg viewBox="0 0 620 ${Math.max(top + hb + 40, tvTop + rowGap + 40)}" role="img" aria-label="Cross-section and top view of the via-fenced stripline">
        <text x="10" y="14" class="xs-cap">Cross-section</text>
        <rect x="${cx - 150}" y="${top - 6}" width="300" height="6" class="xs-gnd"/>
        <rect x="${cx - 150}" y="${top}" width="300" height="${hb}" class="xs-diel"/>
        <rect x="${cx - 150}" y="${top + hb}" width="300" height="6" class="xs-gnd"/>
        ${via(cx - (p.W * X) / 2)}${via(cx + (p.W * X) / 2)}
        <rect x="${cx - (p.w * X) / 2}" y="${top + hb / 2 - tTrace / 2}" width="${Math.max(2, p.w * X)}" height="${tTrace}" class="xs-sig"/>
        <text x="${cx}" y="${top + hb + 24}" text-anchor="middle" class="xs-dim">fence ${um(p.W)} · b ${um(p.b)} · w ${um(p.w)}</text>
        <text x="340" y="14" class="xs-cap">Top view</text>
        <rect x="340" y="${tvTop + rowGap / 2 - tw / 2}" width="${L}" height="${tw}" class="xs-sig"/>
        ${dots}
        <text x="${340 + L / 2}" y="${tvTop + rowGap + 26}" text-anchor="middle" class="xs-dim">via pitch ${um(p.s)} · ⌀ ${um(p.d)}</text>
      </svg>`;
  }

  function render() {
    if (p.d >= p.s) { p.d = p.s * 0.9; S[6].set(p.d); }
    drawXsec();
    const z = z0Stripline(p.w, p.b, p.er);
    const fc = channelCutoff(p);
    const fp = pitchLimit(p);
    const fmax = Math.min(fc, fp);
    const w50 = widthFor(50, p.b, p.er);
    const at = 50e9;
    readouts.innerHTML = `
      <div><span>Characteristic impedance Z₀</span><b class="${Math.abs(z - 50) < 2.5 ? "good" : ""}">${z.toFixed(1)} Ω</b></div>
      <div><span>Return loss into 50 Ω</span><b>${(() => { const g = Math.abs((z - 50) / (z + 50)); return g < 1e-4 ? "> 80 dB" : `${(-20 * Math.log10(g)).toFixed(1)} dB`; })()}</b></div>
      <div><span>Width for 50 Ω</span><b>${um(w50)}</b></div>
      <div><span>Delay</span><b>${delay(p).toFixed(2)} ps/mm</b></div>
      <div><span>Loss @ 50 GHz</span><b>${((alphaD(at, p) + alphaC(at, p)) / 1000).toFixed(3)} dB/mm</b></div>
      <div><span>Parasitic channel mode onset</span><b>${fmtSI(fc, "Hz", 3)}</b></div>
      <div><span>Via pitch ≤ λ/10 up to</span><b>${fmtSI(fp, "Hz", 3)}</b></div>
      <div><span>Clean bandwidth</span><b class="good">${fmtSI(fmax, "Hz", 3)}</b></div>`;
    warn.textContent = fc < fp
      ? "The fence rows are far enough apart that the channel supports a waveguide mode first. Move them closer to the trace."
      : "Via pitch is the limit. Gaps between vias start to leak energy into the plane pair, so stitch more densely.";

    if (view === "loss") {
      const ad = F.map((f) => alphaD(f, p) / 1000);
      const ac = F.map((f) => alphaC(f, p) / 1000);
      plot.set({ xLog: true, yLog: true, xLabel: "Frequency (Hz)", yLabel: "Loss (dB/mm)", xDomain: [1e8, 4e11], yDomain: undefined,
        fmtX: (v) => fmtSI(v, "Hz", 3), hoverTitle: (x) => fmtSI(x, "Hz", 3),
        marks: [{ axis: "x", value: fc, label: "channel mode" }, { axis: "x", value: fp, label: "λ/10 pitch" }] }, [
        { name: "Total", x: F, y: ad.map((v, i) => v + ac[i]), color: "var(--accent)", width: 2.5 },
        { name: "Conductor (skin effect)", x: F, y: ac, color: "var(--s3)", dash: "6 4" },
        { name: "Dielectric (tan δ)", x: F, y: ad, color: "var(--s4)", dash: "2 4" },
      ]);
    } else {
      plot.set({ xLog: true, yLog: false, xLabel: "Trace width", yLabel: "Z₀ (Ω)", xDomain: [3e-6, 300e-6], yDomain: [0, 160],
        fmtX: (v) => um(v), hoverTitle: (x) => `w = ${um(x)}`,
        marks: [{ axis: "y", value: 50, label: "50 Ω" }, { axis: "x", value: p.w, label: "current w" }] }, [
        { name: `b = ${um(p.b)}, εr = ${p.er.toFixed(1)}`, x: Wsweep, y: Wsweep.map((w) => z0Stripline(w, p.b, p.er)), color: "var(--accent)", width: 2.5 },
      ]);
    }
  }
  const go = perFrame(render);

  root.append(h("div", { class: "lab-grid" },
    h("div", { class: "lab-side" },
      h("p", { class: "lab-hint" }, "Signal trace centered between two ground planes, fenced by stitching vias. Change the stack-up and watch impedance, loss and usable bandwidth update."),
      ...S.map((s) => s.el),
      h("div", { class: "btn-row" }, match, reset),
    ),
    h("div", { class: "lab-main" },
      xsec,
      readouts,
      warn,
      h("div", { class: "fig-head" }, h("h4", {}, "Line performance"), viewSw),
      plotBox,
      h("p", { class: "fig-note" }, "Closed-form models: exact Z₀ for a centered zero-thickness strip (Cohn), Pozar's stripline conductor loss with 5 µm copper, dielectric loss from tan δ, and the SIW TE₁₀ cutoff for the via-fenced channel. These are the standard first-order checks for this geometry. Full-wave HFSS captures what they miss: via inductance, coupling and discontinuities. My HFSS models stay with the ASU lab."),
    ),
  ));
  render();
}
