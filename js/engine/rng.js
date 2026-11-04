// Small seeded PRNG (mulberry32) so decks are reproducible in tests and identical across tabs.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted sample without replacement. items: [{id, w}] */
export function weightedSample(items, n, rand) {
  const pool = items.filter((x) => x.w > 0).map((x) => ({ ...x }));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = rand() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].w;
      if (r <= 0) break;
    }
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}
