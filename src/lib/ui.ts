// Tiny DOM helpers shared by the interactive sections.

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  log?: boolean; // slider moves in log10 space
  format: (v: number) => string;
  onInput: (v: number) => void;
}

export function slider(o: SliderOpts) {
  const toPos = (v: number) => (o.log ? Math.log10(v) : v);
  const fromPos = (p: number) => (o.log ? 10 ** p : p);
  const id = `s${Math.random().toString(36).slice(2, 8)}`;
  const out = h("output", { for: id }, o.format(o.value));
  const input = h("input", {
    id,
    type: "range",
    min: String(toPos(o.min)),
    max: String(toPos(o.max)),
    step: String(o.step ?? (toPos(o.max) - toPos(o.min)) / 200),
    value: String(toPos(o.value)),
  });
  input.addEventListener("input", () => {
    const v = fromPos(+input.value);
    out.textContent = o.format(v);
    o.onInput(v);
  });
  const wrap = h("label", { class: "slider", for: id }, h("span", { class: "slider-top" }, h("span", {}, o.label), out), input);
  return {
    el: wrap,
    set(v: number) {
      input.value = String(toPos(v));
      out.textContent = o.format(v);
    },
  };
}

/** Segmented single-choice control. */
export function segmented<T extends string>(
  name: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
) {
  const wrap = h("div", { class: "segmented", role: "radiogroup", "aria-label": name });
  const buttons = options.map((o) => {
    const b = h("button", { type: "button", role: "radio", "aria-checked": String(o.value === value) }, o.label);
    b.addEventListener("click", () => {
      buttons.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      onChange(o.value);
    });
    wrap.append(b);
    return b;
  });
  return wrap;
}

/** Coalesce bursts of slider input into one recompute per frame. */
export function perFrame(fn: () => void) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
}
