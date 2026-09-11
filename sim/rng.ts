/** Mulberry32 seeded PRNG. State is a plain number so it lives in World. */
export function next(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let x = Math.imul(t ^ (t >>> 15), 1 | t);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return { value: ((x ^ (x >>> 14)) >>> 0) / 4294967296, state: t };
}

/** A tiny stateful cursor for generation code. Always read `.state` back into World. */
export class Rng {
  constructor(public state: number) {}
  float(): number { const r = next(this.state); this.state = r.state; return r.value; }
  int(min: number, max: number): number { return min + Math.floor(this.float() * (max - min + 1)); }
  chance(p: number): boolean { return this.float() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.float() * arr.length)]; }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  weighted<T>(items: readonly { item: T; w: number }[]): T {
    const total = items.reduce((s, i) => s + i.w, 0);
    let x = this.float() * total;
    for (const i of items) { x -= i.w; if (x <= 0) return i.item; }
    return items[items.length - 1].item;
  }
  gauss(mean: number, sd: number): number {
    const u = 1 - this.float(); const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
