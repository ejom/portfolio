// Explorer for the U-Net IR-drop model's results on the 10 hidden real circuits.
// Numbers are from plot_results.txt / terminal_results.txt (checkpoint epoch 92).

import { h, segmented } from "../lib/ui";

interface Case { id: number; r2: number; nrmse: number; p: number; r: number; f1: number }

const CASES: Case[] = [
  { id: 7, r2: 0.8237, nrmse: 0.0706, p: 0.8948, r: 0.8637, f1: 0.879 },
  { id: 8, r2: 0.8132, nrmse: 0.0814, p: 0.9274, r: 0.7682, f1: 0.8403 },
  { id: 9, r2: 0.8592, nrmse: 0.0555, p: 0.7878, r: 0.7819, f1: 0.7849 },
  { id: 10, r2: 0.7756, nrmse: 0.0827, p: 0.7308, r: 0.3292, f1: 0.4539 },
  { id: 13, r2: 0.7919, nrmse: 0.0395, p: 0.9357, r: 0.6812, f1: 0.7884 },
  { id: 14, r2: 0.3938, nrmse: 0.0887, p: 1.0, r: 0.1646, f1: 0.2826 },
  { id: 15, r2: 0.6673, nrmse: 0.088, p: 0.8009, r: 0.1385, f1: 0.2361 },
  { id: 16, r2: -0.9925, nrmse: 0.2171, p: 0.7105, r: 0.0133, f1: 0.0262 },
  { id: 19, r2: -0.73, nrmse: 0.2121, p: 0.2561, r: 0.9957, f1: 0.4074 },
  { id: 20, r2: -1.1064, nrmse: 0.2437, p: 0.2493, r: 0.9943, f1: 0.3986 },
];

type Metric = "r2" | "f1" | "p" | "r" | "nrmse";
const METRICS: { value: Metric; label: string; lo: number; hi: number; better: "high" | "low" }[] = [
  { value: "r2", label: "R²", lo: -1.2, hi: 1, better: "high" },
  { value: "f1", label: "Hotspot F1", lo: 0, hi: 1, better: "high" },
  { value: "p", label: "Precision", lo: 0, hi: 1, better: "high" },
  { value: "r", label: "Recall", lo: 0, hi: 1, better: "high" },
  { value: "nrmse", label: "NRMSE", lo: 0, hi: 0.25, better: "low" },
];

export function mountIrDrop(root: HTMLElement) {
  let metric: Metric = "r2";
  let selected = 7;

  const chart = h("div", { class: "bars", role: "listbox", "aria-label": "Hidden test circuits" });
  const img = h("img", { alt: "", loading: "lazy", width: "1800", height: "502" });
  const caption = h("figcaption", {});

  function select(id: number) {
    selected = id;
    const c = CASES.find((x) => x.id === id)!;
    img.src = `${import.meta.env.BASE_URL}img/irdrop/tc${id}.jpg`;
    img.alt = `Hidden test case ${id}: ground-truth IR-drop map, U-Net prediction, error map, and scatter of predicted vs true values`;
    caption.innerHTML = `<b>hidden/testcase${id}</b> · R² ${c.r2.toFixed(3)} · NRMSE ${c.nrmse.toFixed(3)} · hotspot P/R/F1 ${c.p.toFixed(2)} / ${c.r.toFixed(2)} / ${c.f1.toFixed(2)}`;
    renderBars();
  }

  function renderBars() {
    const m = METRICS.find((x) => x.value === metric)!;
    const span = m.hi - m.lo;
    const zero = ((0 - m.lo) / span) * 100;
    chart.replaceChildren(...CASES.map((c) => {
      const v = c[metric];
      const a = ((Math.min(v, 0) - m.lo) / span) * 100;
      const b = ((Math.max(v, 0) - m.lo) / span) * 100;
      const good = m.better === "high" ? v >= 0.6 : v <= 0.1;
      const row = h("button", {
        type: "button", class: `bar-row${c.id === selected ? " sel" : ""}`, role: "option",
        "aria-selected": String(c.id === selected),
      },
        h("span", { class: "bar-label" }, `tc${c.id}`),
        h("span", { class: "bar-track" },
          h("i", { class: "bar-zero", style: `left:${zero}%` }),
          h("i", { class: `bar-fill ${good ? "good" : "weak"}`, style: `left:${a}%;width:${Math.max(0.6, b - a)}%` })),
        h("span", { class: "bar-val num" }, v.toFixed(3)));
      row.addEventListener("click", () => select(c.id));
      return row;
    }));
  }

  root.append(h("div", { class: "lab-grid ir" },
    h("div", { class: "lab-side" },
      h("div", { class: "fig-head" }, h("h4", {}, "Per-circuit score on unseen designs")),
      segmented("Metric", METRICS.map(({ value, label }) => ({ value, label })), metric, (v) => { metric = v; renderBars(); }),
      chart,
      h("p", { class: "fig-note" }, "Pick a circuit to see its prediction. The weak cases are shown as they are: tc16 misses its hotspots, and tc19 and tc20 catch every hotspot (recall ≈ 0.99) but flag far too much area around them."),
    ),
    h("figure", { class: "lab-main figure light-figure" }, img, caption),
  ));
  select(selected);
}
