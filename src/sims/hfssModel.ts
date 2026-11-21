// First-order models for a via-fenced stripline in a package substrate:
// a signal trace centered between two ground planes, with rows of stitching
// vias on both sides. These are the closed-form checks used before and after
// full-wave HFSS runs, not HFSS output.

export const C0 = 299_792_458;
const MU0 = 4e-7 * Math.PI;
const SIGMA_CU = 5.8e7;
export const T_CU = 5e-6; // trace thickness used for conductor loss [m]

export interface StripParams {
  er: number; // dielectric constant
  tand: number; // loss tangent
  b: number; // ground-plane separation [m]
  w: number; // trace width [m]
  W: number; // via-fence row separation, center to center [m]
  s: number; // via pitch along a row [m]
  d: number; // via diameter [m]
}

export const DEFAULTS: StripParams = {
  er: 3.4, tand: 0.006, b: 60e-6, w: 35e-6, W: 400e-6, s: 120e-6, d: 40e-6,
};

/** Complete elliptic integral of the first kind K(k) via the AGM. */
export function ellipK(k: number): number {
  let a = 1;
  let g = Math.sqrt(1 - k * k);
  for (let i = 0; i < 30 && Math.abs(a - g) > 1e-15; i++) {
    [a, g] = [(a + g) / 2, Math.sqrt(a * g)];
  }
  return Math.PI / (2 * a);
}

/** Exact Z0 of a zero-thickness centered stripline (Cohn, 1954). */
export function z0Stripline(w: number, b: number, er: number): number {
  const x = (Math.PI * w) / (2 * b);
  const k = 1 / Math.cosh(x);
  const kp = Math.tanh(x);
  return ((30 * Math.PI) / Math.sqrt(er)) * (ellipK(k) / ellipK(kp));
}

/** Trace width that gives the target impedance (bisection on w). */
export function widthFor(z: number, b: number, er: number): number {
  let lo = b * 1e-3;
  let hi = b * 20;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (z0Stripline(mid, b, er) > z) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** Dielectric attenuation in dB/m. TEM line, so εeff = εr. */
export const alphaD = (f: number, p: StripParams) =>
  8.686 * ((Math.PI * f * Math.sqrt(p.er) * p.tand) / C0);

/** Conductor attenuation in dB/m (Pozar 3.198, Wheeler incremental inductance). */
export function alphaC(f: number, p: StripParams): number {
  const Rs = Math.sqrt((2 * Math.PI * f * MU0) / (2 * SIGMA_CU));
  const { b, w, er } = p;
  const t = T_CU;
  const Z0 = z0Stripline(w, b, er);
  let np: number;
  if (Math.sqrt(er) * Z0 < 120) {
    const A = 1 + (2 * w) / (b - t) + (1 / Math.PI) * ((b + t) / (b - t)) * Math.log((2 * b - t) / t);
    np = ((2.7e-3 * Rs * er * Z0) / (30 * Math.PI * (b - t))) * A;
  } else {
    const B = 1 + (b / (0.5 * w + 0.7 * t)) * (0.5 + (0.414 * t) / w + (1 / (2 * Math.PI)) * Math.log((4 * Math.PI * w) / t));
    np = ((0.16 * Rs) / (Z0 * b)) * B;
  }
  return 8.686 * np;
}

/** Cutoff of the lowest parasitic mode in the via-fenced channel (SIW TE10). */
export function channelCutoff(p: StripParams): number {
  const Weff = p.W - (p.d * p.d) / (0.95 * p.s);
  return C0 / (2 * Weff * Math.sqrt(p.er));
}

/** Highest frequency where via pitch is still ≤ λ/10 in the dielectric. */
export const pitchLimit = (p: StripParams) => C0 / (10 * p.s * Math.sqrt(p.er));

/** Propagation delay in ps/mm. */
export const delay = (p: StripParams) => (Math.sqrt(p.er) / C0) * 1e9;
