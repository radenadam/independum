/** Reproduces generated trace ranges without executing preceding traces. */
export function createSeededGenerator(seed: number, offset = 0): (limit: number) => number {
  let value = seed;
  function next(limit: number): number {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) % limit;
  }
  for (let step = 0; step < offset; step++) {
    next(1);
  }
  return next;
}
