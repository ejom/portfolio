// Minimal complex arithmetic for evaluating transfer functions at s = jω.

export interface C {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): C => ({ re, im });
export const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const mul = (a: C, b: C): C => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const scale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k });
export const addR = (a: C, k: number): C => ({ re: a.re + k, im: a.im });

export function div(a: C, b: C): C {
  const d = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}

export function sqrt(a: C): C {
  const r = Math.hypot(a.re, a.im);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2));
  return { re, im };
}

/** Returns [sinh(z), cosh(z)]. */
export function sinhcosh(z: C): [C, C] {
  const sh = Math.sinh(z.re);
  const ch = Math.cosh(z.re);
  const s = Math.sin(z.im);
  const co = Math.cos(z.im);
  return [
    { re: sh * co, im: ch * s },
    { re: ch * co, im: sh * s },
  ];
}

export const abs = (a: C): number => Math.hypot(a.re, a.im);
export const arg = (a: C): number => Math.atan2(a.im, a.re);
