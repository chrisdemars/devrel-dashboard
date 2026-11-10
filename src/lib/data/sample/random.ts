// A small seeded random number generator (mulberry32). The same seed always
// gives the same sequence, which keeps the sample data identical across runs.

export interface Random {
  /** A number from 0 (inclusive) to 1 (exclusive). */
  next(): number;
  /** A whole number from min to max, both inclusive. */
  int(min: number, max: number): number;
  /** A number from min to max. */
  float(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
