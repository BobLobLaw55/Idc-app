// Vibes mix separate things that the engine keeps apart internally:
//   atmosphere  — what kind of place (upscale, casual, quick) — a ranking signal
//   fulfillment — how the food reaches you (dinein, pickup, delivery) — a hard constraint
//   foodTags    — which food-card tags this vibe pulls toward (see data/foods.js `vibes`)
// A combination is allowed only if fulfillment overlaps and it isn't on the clash list.

export const VIBES = [
  { id: 'fancy', name: 'Dress to Impress', line: 'Wear the thing I like. I’ll pretend I’m not staring.', atmosphere: 'upscale', fulfillment: ['dinein'], foodTags: ['fancy'] },
  { id: 'casual', name: 'Just Us, No Fuss', line: 'Real pants optional. Holding hands mandatory.', atmosphere: 'casual', fulfillment: ['dinein', 'pickup', 'delivery'], foodTags: ['casual'] },
  { id: 'quick', name: 'A Quickie', line: 'In, out, satisfied. We’re talking about food. Mostly.', atmosphere: 'quick', fulfillment: ['dinein', 'pickup'], foodTags: ['grab'] },
  { id: 'healthy', name: 'Hot & Healthy', line: 'Clean eating. We have plans later.', atmosphere: null, fulfillment: ['dinein', 'pickup', 'delivery'], foodTags: ['healthy'] },
  { id: 'pickup', name: 'I’ll Pick You Up', line: 'Text me your order, gorgeous. I’m on my way.', atmosphere: null, fulfillment: ['pickup'], foodTags: ['grab', 'couch'] },
  { id: 'delivery', name: 'Stay In, Babe', line: 'The doorbell is the only thing interrupting us tonight.', atmosphere: 'home', fulfillment: ['delivery'], foodTags: ['deliver', 'couch'] },
];

// Combos whose fulfillment overlaps but whose meaning doesn't.
const CLASHES = [['fancy', 'quick']];

export const VIBE_BY_ID = Object.fromEntries(VIBES.map((v) => [v.id, v]));

// Older saved sessions used different vibe ids.
const LEGACY = { date: 'fancy', couch: 'delivery', grab: 'pickup', deliver: 'delivery' };
export const normalizeVibes = (ids = []) => [...new Set(ids.map((id) => LEGACY[id] || id).filter((id) => VIBE_BY_ID[id]))];

export const METHOD_LABEL = {
  dinein: 'Dine in',
  pickup: 'Pickup',
  delivery: 'Delivery',
  either: 'Pickup or delivery',
};

/** Fulfillment methods allowed by every selected vibe (intersection). */
export function allowedMethods(vibeIds) {
  if (!vibeIds.length) return ['dinein', 'pickup', 'delivery'];
  return vibeIds
    .map((id) => VIBE_BY_ID[id].fulfillment)
    .reduce((acc, f) => acc.filter((m) => f.includes(m)));
}

const clashes = (a, b) => CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) || allowedMethods([a, b]).length === 0;

/** Can `id` be added to the current selection without contradicting it? */
export function canAddVibe(selected, id) {
  if (selected.includes(id)) return { ok: true };
  if (selected.length >= 3) return { ok: false, why: 'Three vibes max. Don’t be greedy, babe.' };
  const clash = selected.find((s) => clashes(s, id));
  if (clash || allowedMethods([...selected, id]).length === 0) {
    const other = VIBE_BY_ID[clash || selected[0]];
    return { ok: false, why: `${VIBE_BY_ID[id].name} and ${other.name} can’t both happen tonight. Pick a lane.` };
  }
  return { ok: true };
}

/** Method choices to show in setup. 'either' is offered when both pickup and delivery remain without dine-in. */
export function methodChoices(vibeIds) {
  const m = allowedMethods(vibeIds);
  const out = [...m];
  if (m.includes('pickup') && m.includes('delivery') && !m.includes('dinein')) out.push('either');
  return out;
}

/** Default method for a vibe selection. */
export function defaultMethod(vibeIds) {
  const m = allowedMethods(vibeIds);
  if (m.length === 1) return m[0];
  if (!m.includes('dinein') && m.includes('pickup') && m.includes('delivery')) return 'either';
  return m[0];
}

export function atmospheres(vibeIds) {
  return [...new Set(vibeIds.map((id) => VIBE_BY_ID[id]?.atmosphere).filter(Boolean))];
}

export function vibeFoodTags(vibeIds) {
  return vibeIds.map((id) => VIBE_BY_ID[id]?.foodTags || []);
}
