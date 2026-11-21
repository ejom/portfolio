// Hero visuals: an oscilloscope (Electrical mode) and a terminal (Software mode).

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Buck converter at D = 0.512: gate PWM (CH1) and inductor current ripple (CH2). */
export function mountScope(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const D = 0.512;
  let t0 = performance.now();
  let raf = 0;

  function frame(now: number) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const hh = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hh * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const grid = cssVar("--scope-grid");
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const x = Math.round((w * i) / 10) + 0.5;
      ctx.globalAlpha = i === 5 ? 0.9 : 0.45;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hh); ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const y = Math.round((hh * i) / 8) + 0.5;
      ctx.globalAlpha = i === 4 ? 0.9 : 0.45;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const period = w / 3.5;
    const shift = reduced.matches ? 0 : ((now - t0) / 1000) * period * 0.35;
    const phase = (x: number) => (((x + shift) % period) + period) % period / period;

    // CH1: gate signal
    const hi = hh * 0.12;
    const lo = hh * 0.38;
    trace(cssVar("--s3"), (x) => (phase(x) < D ? hi : lo));
    // CH2: inductor current, rising during on-time and falling during off-time
    const mid = hh * 0.68;
    const amp = hh * 0.13;
    trace(cssVar("--glow"), (x) => {
      const p = phase(x);
      const u = p < D ? -1 + (2 * p) / D : 1 - (2 * (p - D)) / (1 - D);
      return mid - amp * u;
    });

    ctx.font = "600 11px var(--mono, monospace)";
    ctx.fillStyle = cssVar("--s3");
    ctx.fillText("CH1  gate  D = 0.512", 10, 18);
    ctx.fillStyle = cssVar("--glow");
    ctx.fillText("CH2  i_L  ripple", 10, hh * 0.5 + 6);

    if (!reduced.matches && document.documentElement.dataset.mode === "ee") raf = requestAnimationFrame(frame);
  }

  function trace(color: string, y: (x: number) => number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = document.documentElement.dataset.mode === "ee" ? 8 : 0;
    ctx.beginPath();
    for (let x = 0; x <= canvas.clientWidth; x += 1) {
      const v = y(x);
      if (x === 0) ctx.moveTo(x, v);
      else ctx.lineTo(x, v);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  const start = () => { cancelAnimationFrame(raf); t0 = performance.now(); raf = requestAnimationFrame(frame); };
  window.addEventListener("modechange", start);
  new ResizeObserver(start).observe(canvas);
  start();
}

const SCRIPT: [string, string[]][] = [
  ["docker compose up -d --build", ["✔ Container ame  Started"]],
  ["docker exec ame ame scan corpus-small", ["# catalogs ~1,100 files, queues one extraction job each"]],
  ["python fcn_ir_drop.py --eval_only", ["Loaded checkpoint — epoch 92, best val RMSE 0.69962"]],
  ["python plot_predictions.py", ["Precision = 0.72934", "Recall    = 0.57305", "F1 Score  = 0.50974"]],
  ["uv run duty_sweep.py", ["distributed converter   worst 22292 mA @ 8.490 MHz", "distributed + Lin‖Rp    worst   219 mA @ 2.000 MHz"]],
];

export function mountTerminal(pre: HTMLElement) {
  let timer = 0;
  const sleep = (ms: number) => new Promise<void>((r) => { timer = window.setTimeout(r, ms); });
  let run = 0;

  async function play() {
    const id = ++run;
    pre.textContent = "";
    if (reduced.matches) {
      pre.textContent = SCRIPT.map(([c, out]) => `$ ${c}\n${out.join("\n")}`).join("\n");
      return;
    }
    while (id === run) {
      pre.textContent = "";
      for (const [cmd, out] of SCRIPT) {
        if (id !== run) return;
        pre.textContent += "$ ";
        for (const ch of cmd) {
          if (id !== run) return;
          pre.textContent += ch;
          await sleep(28);
        }
        await sleep(350);
        pre.textContent += "\n" + out.join("\n") + "\n";
        pre.scrollTop = pre.scrollHeight;
        await sleep(900);
      }
      await sleep(2500);
    }
  }
  const restart = () => {
    clearTimeout(timer);
    if (document.documentElement.dataset.mode === "sw") play();
    else run++;
  };
  window.addEventListener("modechange", restart);
  restart();
}
