// Small, dependency-free plotting: responsive SVG line plots with hover readout,
// and a canvas heatmap. Colors are CSS variables, so plots follow the theme.

const SVG = "http://www.w3.org/2000/svg";

export interface Series {
  name: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string; // CSS color or var(--x)
  dash?: string;
  width?: number;
  hidden?: boolean;
}

export interface LinePlotOptions {
  xLog?: boolean;
  yLog?: boolean;
  xLabel: string;
  yLabel: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  height?: number;
  fmtX?: (v: number) => string;
  fmtY?: (v: number) => string;
  /** Text shown above the readout list on hover. */
  hoverTitle?: (x: number) => string;
  /** Vertical/horizontal reference lines. */
  marks?: { axis: "x" | "y"; value: number; label?: string }[];
  /** Let legend clicks toggle series. */
  toggle?: boolean;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

export function fmtSI(v: number, unit = "", digits = 3): string {
  if (v === 0 || !isFinite(v)) return `${v}${unit ? " " + unit : ""}`;
  const prefixes: [number, string][] = [
    [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"],
  ];
  const a = Math.abs(v);
  for (const [p, s] of prefixes) {
    if (a >= p * 0.9995) return `${+(v / p).toPrecision(digits)} ${s}${unit}`.trim();
  }
  return `${v.toExponential(2)} ${unit}`.trim();
}

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function linTicks(lo: number, hi: number, target: number): number[] {
  const step = niceStep(hi - lo, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

function logTicks(lo: number, hi: number, maxTicks: number): number[] {
  const a = Math.ceil(Math.log10(lo) - 1e-9);
  const b = Math.floor(Math.log10(hi) + 1e-9);
  const every = Math.max(1, Math.ceil((b - a + 1) / maxTicks));
  const out: number[] = [];
  for (let e = a; e <= b; e++) if ((e - a) % every === 0) out.push(10 ** e);
  return out;
}

function lowerBound(xs: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - x) < Math.abs(xs[lo] - x)) return lo - 1;
  return lo;
}

export class LinePlot {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private legend: HTMLDivElement;
  private tip: HTMLDivElement;
  private series: Series[] = [];
  private width = 600;
  private opts: LinePlotOptions;

  constructor(container: HTMLElement, opts: LinePlotOptions) {
    this.opts = opts;
    this.root = document.createElement("div");
    this.root.className = "plot";
    this.legend = document.createElement("div");
    this.legend.className = "plot-legend";
    this.svg = el("svg", { class: "plot-svg", role: "img" });
    this.tip = document.createElement("div");
    this.tip.className = "plot-tip";
    this.tip.hidden = true;
    this.root.append(this.legend, this.svg, this.tip);
    container.appendChild(this.root);

    new ResizeObserver(() => {
      const w = Math.round(this.root.clientWidth);
      if (w && w !== this.width) {
        this.width = w;
        this.render();
      }
    }).observe(this.root);
    this.width = Math.round(this.root.clientWidth) || 600;
  }

  setOptions(patch: Partial<LinePlotOptions>) {
    this.opts = { ...this.opts, ...patch };
    this.render();
  }

  update(series: Series[]) {
    // keep user-toggled visibility across updates
    const hidden = new Set(this.series.filter((s) => s.hidden).map((s) => s.name));
    this.series = series.map((s) => ({ ...s, hidden: s.hidden ?? hidden.has(s.name) }));
    this.renderLegend();
    this.render();
  }

  private renderLegend() {
    this.legend.replaceChildren();
    for (const s of this.series) {
      const item = document.createElement(this.opts.toggle ? "button" : "span");
      item.className = "legend-item";
      if (s.hidden) item.classList.add("off");
      const sw = document.createElement("i");
      sw.style.setProperty("--c", s.color);
      if (s.dash) sw.classList.add("dashed");
      item.append(sw, document.createTextNode(s.name));
      if (this.opts.toggle) {
        item.setAttribute("aria-pressed", String(!s.hidden));
        item.addEventListener("click", () => {
          s.hidden = !s.hidden;
          this.renderLegend();
          this.render();
        });
      }
      this.legend.appendChild(item);
    }
  }

  private domains() {
    const o = this.opts;
    const vis = this.series.filter((s) => !s.hidden);
    let [x0, x1] = o.xDomain ?? [Infinity, -Infinity];
    let [y0, y1] = o.yDomain ?? [Infinity, -Infinity];
    if (!o.xDomain || !o.yDomain) {
      for (const s of vis) {
        for (let i = 0; i < s.x.length; i++) {
          const x = s.x[i];
          const y = s.y[i];
          if (!isFinite(y) || (o.yLog && y <= 0)) continue;
          if (!o.xDomain) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
          if (!o.yDomain) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
      }
      if (!o.yDomain && isFinite(y0)) {
        if (o.yLog) { y0 /= 1.3; y1 *= 1.3; }
        else { const pad = (y1 - y0 || 1) * 0.06; y0 -= pad; y1 += pad; }
      }
    }
    if (!isFinite(x0)) [x0, x1] = [0, 1];
    if (!isFinite(y0)) [y0, y1] = [0, 1];
    return { x0, x1, y0, y1 };
  }

  private render() {
    const o = this.opts;
    const W = this.width;
    const H = o.height ?? Math.round(Math.min(360, Math.max(240, W * 0.5)));
    const m = { l: W < 480 ? 46 : 58, r: 14, t: 10, b: 44 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const { x0, x1, y0, y1 } = this.domains();

    const tx = o.xLog
      ? (v: number) => m.l + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * iw
      : (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw;
    const ty = o.yLog
      ? (v: number) => m.t + ih - ((Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * ih
      : (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const invx = o.xLog
      ? (px: number) => 10 ** (Math.log10(x0) + ((px - m.l) / iw) * (Math.log10(x1) - Math.log10(x0)))
      : (px: number) => x0 + ((px - m.l) / iw) * (x1 - x0);

    const svg = this.svg;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.setAttribute("aria-label", `${o.yLabel} versus ${o.xLabel}`);

    const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
    const defs = el("defs", {}, svg);
    el("rect", { x: m.l, y: m.t, width: iw, height: ih }, el("clipPath", { id: clipId }, defs));

    const grid = el("g", { class: "plot-grid" }, svg);
    const axes = el("g", { class: "plot-axis" }, svg);
    const fx = o.fmtX ?? ((v: number) => fmtSI(v));
    const fy = o.fmtY ?? ((v: number) => fmtSI(v));

    const xt = o.xLog ? logTicks(x0, x1, Math.max(3, Math.floor(iw / 70))) : linTicks(x0, x1, Math.max(3, Math.floor(iw / 90)));
    for (const v of xt) {
      const x = tx(v);
      el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih }, grid);
      el("text", { x, y: m.t + ih + 16, "text-anchor": "middle" }, axes).textContent = fx(v);
    }
    const yt = o.yLog ? logTicks(y0, y1, Math.max(3, Math.floor(ih / 40))) : linTicks(y0, y1, Math.max(3, Math.floor(ih / 50)));
    for (const v of yt) {
      const y = ty(v);
      el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y }, grid);
      el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, axes).textContent = fy(v);
    }
    el("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "plot-frame" }, svg);
    el("text", { x: m.l + iw / 2, y: H - 6, "text-anchor": "middle", class: "plot-label" }, axes).textContent = o.xLabel;
    el("text", {
      x: 0, y: 0, "text-anchor": "middle", class: "plot-label",
      transform: `translate(12 ${m.t + ih / 2}) rotate(-90)`,
    }, axes).textContent = o.yLabel;

    const marks = el("g", { "clip-path": `url(#${clipId})`, class: "plot-marks" }, svg);
    for (const mk of o.marks ?? []) {
      if (mk.axis === "x") {
        const x = tx(mk.value);
        el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih }, marks);
        if (mk.label) el("text", { x: x + 4, y: m.t + 14 }, marks).textContent = mk.label;
      } else {
        const y = ty(mk.value);
        el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y }, marks);
        if (mk.label) el("text", { x: m.l + iw - 4, y: y - 5, "text-anchor": "end" }, marks).textContent = mk.label;
      }
    }

    const lines = el("g", { "clip-path": `url(#${clipId})` }, svg);
    const vis = this.series.filter((s) => !s.hidden);
    for (const s of vis) {
      let d = "";
      let pen = false;
      // decimate to ~2 points per pixel, keeping min and max so peaks survive
      const n = s.x.length;
      const bucket = Math.max(1, Math.floor(n / (iw * 2)));
      for (let i = 0; i < n; i += bucket) {
        let lo = i;
        let hi = i;
        for (let j = i; j < Math.min(n, i + bucket); j++) {
          if (s.y[j] < s.y[lo]) lo = j;
          if (s.y[j] > s.y[hi]) hi = j;
        }
        for (const j of lo < hi ? [lo, hi] : [hi, lo]) {
          const y = s.y[j];
          if (!isFinite(y) || (o.yLog && y <= 0)) { pen = false; continue; }
          const px = tx(s.x[j]).toFixed(1);
          const py = Math.max(-1e4, Math.min(1e4, ty(y))).toFixed(1);
          d += `${pen ? "L" : "M"}${px} ${py}`;
          pen = true;
        }
      }
      el("path", {
        d, fill: "none", stroke: s.color, "stroke-width": s.width ?? 2,
        "stroke-dasharray": s.dash ?? "", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke",
      }, lines);
    }

    // hover readout
    const hover = el("g", { class: "plot-hover", visibility: "hidden" }, svg);
    const vline = el("line", { y1: m.t, y2: m.t + ih }, hover);
    const dots = vis.map((s) => el("circle", { r: 4, fill: s.color }, hover));
    const overlay = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
    const move = (ev: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      if (px < m.l || px > m.l + iw) return;
      const x = invx(px);
      hover.setAttribute("visibility", "visible");
      vline.setAttribute("x1", String(px));
      vline.setAttribute("x2", String(px));
      const rows: string[] = [];
      vis.forEach((s, k) => {
        const i = lowerBound(s.x, x);
        const y = s.y[i];
        if (!isFinite(y)) { dots[k].setAttribute("visibility", "hidden"); return; }
        dots[k].setAttribute("visibility", "visible");
        dots[k].setAttribute("cx", String(tx(s.x[i])));
        dots[k].setAttribute("cy", String(ty(y)));
        rows.push(`<div><i style="--c:${s.color}"></i>${s.name}<b>${fy(y)}</b></div>`);
      });
      this.tip.innerHTML = `<div class="tip-title">${o.hoverTitle ? o.hoverTitle(x) : fx(x)}</div>${rows.join("")}`;
      this.tip.hidden = false;
      const left = (px / W) * box.width;
      this.tip.style.left = `${left}px`;
      this.tip.classList.toggle("flip", left > box.width * 0.6);
    };
    overlay.addEventListener("pointermove", move);
    overlay.addEventListener("pointerdown", move);
    overlay.addEventListener("pointerleave", () => {
      hover.setAttribute("visibility", "hidden");
      this.tip.hidden = true;
    });
  }
}

// ---------------------------------------------------------------- heatmap

/** Sequential map from near-black through Laplacient blue to gold. */
const STOPS: [number, [number, number, number]][] = [
  [0, [11, 15, 23]],
  [0.3, [30, 62, 118]],
  [0.6, [125, 180, 255]],
  [0.82, [217, 182, 90]],
  [1, [255, 244, 205]],
];

export function colormap(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const u = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + u * (c1[k] - c0[k]))) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function colorbarGradient(): string {
  return `linear-gradient(90deg, ${STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${t * 100}%`).join(", ")})`;
}

/**
 * Draws z[row][col] (row 0 = bottom) on a canvas, values mapped log-scaled into [vmin, vmax].
 */
export function drawHeatmap(
  canvas: HTMLCanvasElement,
  z: Float64Array[],
  vmin: number,
  vmax: number,
) {
  const rows = z.length;
  const cols = z[0].length;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  const l0 = Math.log10(vmin);
  const l1 = Math.log10(vmax);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const t = (Math.log10(Math.max(vmin, z[r][col])) - l0) / (l1 - l0);
      const [R, G, B] = colormap(t);
      const p = ((rows - 1 - r) * cols + col) * 4;
      img.data[p] = R;
      img.data[p + 1] = G;
      img.data[p + 2] = B;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
