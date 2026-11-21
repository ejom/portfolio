// Port of bode.py / duty_sweep.py / input_filter_design.py from the EE599
// current-mode-control-buck-converter repo (Röbenack & Gerbet, Electronics 2024).
// P(s) is the transfer function from duty ratio to switch (line input) current.

import { type C, add, addR, c, div, mul, scale, sinhcosh, sqrt } from "../lib/complex";

export const E = 12; // supply voltage [V]
export const R = 10; // load [Ω]
export const Cext = 1e-6; // external capacitor [F]
// RG 58 C/U coax, per metre
export const Lp = 241e-9;
export const Cp = 100e-12;
export const RLp = 40e-3;
export const GCp = 0.2e-12;
export const Z0 = Math.sqrt(Lp / Cp); // ≈ 49 Ω

export interface BuckParams {
  l: number; // line length [m]
  Lin: number; // series input inductor [H]
  Rp: number; // resistor across Lin [Ω]
}

export const DEFAULTS: BuckParams = { l: 6, Lin: 0.5e-6, Rp: 47 };

/** Standard (lumped) converter, paper Eq. (4) with Eq. (22) lumped values. */
export function P_lumped(s: C, p: BuckParams): C {
  const L = p.l * Lp;
  const Cc = p.l * Cp + Cext;
  const RL = p.l * RLp;
  const GC = p.l * GCp;
  const Y = addR(scale(s, Cc), GC + 1 / R);
  const zl = addR(scale(s, L), RL);
  return div(scale(Y, E), addR(mul(zl, Y), 1));
}

/** N and Δ of Eq. (20): P = E N / Δ, line input impedance = Δ / N. */
function lineNumDen(s: C, p: BuckParams): [C, C] {
  const zL = addR(scale(s, Lp), RLp);
  const yC = addR(scale(s, Cp), GCp);
  const g = sqrt(mul(zL, yC));
  const [sh, ch] = sinhcosh(scale(g, p.l));
  const load = addR(scale(s, R * Cext), 1); // 1 + sRCext
  const num = add(mul(scale(yC, R), sh), mul(mul(g, load), ch));
  const den = add(mul(mul(zL, load), sh), mul(scale(g, R), ch));
  return [num, den];
}

function P_series(s: C, Zin: C | null, p: BuckParams): C {
  const [num, den] = lineNumDen(s, p);
  const d = Zin ? add(mul(Zin, num), den) : den;
  return div(scale(num, E), d);
}

export const P_distributed = (s: C, p: BuckParams) => P_series(s, null, p);
export const P_distributed_L = (s: C, p: BuckParams) => P_series(s, scale(s, p.Lin), p);
export function P_distributed_LR(s: C, p: BuckParams): C {
  const sL = scale(s, p.Lin);
  const Z = div(scale(sL, p.Rp), addR(sL, p.Rp)); // Lin ∥ Rp
  return P_series(s, Z, p);
}

export type Plant = (s: C, p: BuckParams) => C;

export const PLANTS: { key: string; name: string; fn: Plant; color: string; dash?: string }[] = [
  { key: "std", name: "Standard (lumped)", fn: P_lumped, color: "var(--s1)", dash: "6 4" },
  { key: "dist", name: "Distributed line", fn: P_distributed, color: "var(--s2)" },
  { key: "L", name: "Distributed + Lin", fn: P_distributed_L, color: "var(--s3)" },
  { key: "LR", name: "Distributed + Lin ∥ Rp", fn: P_distributed_LR, color: "var(--s4)" },
];

/** Bode data over f (Hz). Returns magnitude in dB and phase in degrees. */
export function bode(fn: Plant, f: Float64Array, p: BuckParams) {
  const mag = new Float64Array(f.length);
  const ph = new Float64Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const P = fn(c(0, 2 * Math.PI * f[i]), p);
    mag[i] = 20 * Math.log10(Math.hypot(P.re, P.im));
    ph[i] = (Math.atan2(P.im, P.re) * 180) / Math.PI;
  }
  return { mag, ph };
}

export function logspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = 10 ** (a + ((b - a) * i) / (n - 1));
  return out;
}

export function linspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}

/** First antiresonance (local minimum of |P|) of a plant above fMin. */
export function firstNotch(fn: Plant, p: BuckParams, fMin = 1e6, fMax = 1e8): number | null {
  const f = logspace(Math.log10(fMin), Math.log10(fMax), 6000);
  const { mag } = bode(fn, f, p);
  for (let i = 1; i < f.length - 1; i++) {
    if (mag[i] < mag[i - 1] && mag[i] < mag[i + 1]) return f[i];
  }
  return null;
}

// ---------------------------------------------------------------- PWM ripple

export const K = 40; // PWM harmonics
export const D0 = 0.512; // paper operating point, v0 = 6 V

/**
 * RMS ripple of the line input current [A] on a (D, f_PWM) grid:
 *   I_rms(f, D) = sqrt( Σ_k (a_k(D) |P(j k 2π f)|)² / 2 ),  a_k = 2|sin(π k D)| / (π k)
 * Returned as rows indexed by D, columns by f.
 */
export function rippleMap(fn: Plant, p: BuckParams, fPwm: Float64Array, D: Float64Array): Float64Array[] {
  const P2 = new Float64Array(fPwm.length * K);
  for (let j = 0; j < fPwm.length; j++) {
    for (let k = 1; k <= K; k++) {
      const P = fn(c(0, 2 * Math.PI * fPwm[j] * k), p);
      P2[j * K + (k - 1)] = P.re * P.re + P.im * P.im;
    }
  }
  return Array.from(D, (d) => {
    const a2 = new Float64Array(K);
    for (let k = 1; k <= K; k++) a2[k - 1] = (2 * Math.sin(Math.PI * k * d) / (Math.PI * k)) ** 2;
    const row = new Float64Array(fPwm.length);
    for (let j = 0; j < fPwm.length; j++) {
      let sum = 0;
      for (let k = 0; k < K; k++) sum += a2[k] * P2[j * K + k];
      row[j] = Math.sqrt(sum / 2);
    }
    return row;
  });
}
