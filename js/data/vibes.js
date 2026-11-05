// "What are you up for tonight?" — each partner privately picks EVERY style they'd be happy with.
// Picks don't have to fit together. The restaurant must satisfy at least one style from EACH
// person, using one fulfillment method (see planFor in engine/match.js).
//
// Each style defines:
//   fulfillment — methods that style allows (dinein, pickup, delivery)
//   fits(r)     — which restaurants count for that style
//   foodTags    — which food-card tags it pulls toward (see data/foods.js `vibes`)

export const VIBES = [
  { id: 'fancy', name: 'Dress to Impress', line: 'Wear the thing I like. I’ll pretend I’m not staring.', fulfillment: ['dinein'], foodTags: ['fancy'], upscale: true },
  { id: 'casual', name: 'Just Us, No Fuss', line: 'Real pants optional. Holding hands mandatory.', fulfillment: ['dinein', 'pickup', 'delivery'], foodTags: ['casual'] },
  { id: 'quick', name: 'A Quickie', line: 'In, out, satisfied. We’re talking about food. Mostly.', fulfillment: ['dinein', 'pickup'], foodTags: ['grab'] },
  { id: 'healthy', name: 'Hot & Healthy', line: 'Clean eating. We have plans later.', fulfillment: ['dinein', 'pickup', 'delivery'], foodTags: ['healthy'] },
  { id: 'pickup', name: 'I’ll Pick You Up', line: 'Text me your order, gorgeous. I’m on my way.', fulfillment: ['pickup'], foodTags: ['grab', 'couch'] },
  { id: 'delivery', name: 'Stay In, Babe', line: 'Sweatpants on. The doorbell is the only thing interrupting us tonight.', fulfillment: ['delivery'], foodTags: ['deliver', 'couch'] },
];

export const VIBE_BY_ID = Object.fromEntries(VIBES.map((v) => [v.id, v]));

const LEGACY = { date: 'fancy', couch: 'delivery', grab: 'pickup', deliver: 'delivery' };
export const normalizeVibes = (ids = []) => [...new Set(ids.map((id) => LEGACY[id] || id).filter((id) => VIBE_BY_ID[id]))];

export const METHOD_LABEL = { dinein: 'Dine in', pickup: 'Pickup', delivery: 'Delivery' };
export const METHODS = ['dinein', 'pickup', 'delivery'];

const healthyItems = (r, FOOD_BY_ID) =>
  r.menu.filter((m) => m.verification !== 'unverified' && m.foods.some((f) => FOOD_BY_ID[f]?.vibes.includes('healthy'))).length;

/** Does restaurant `r` satisfy style `id` when eating via `method`? */
export function styleFits(r, id, method, FOOD_BY_ID) {
  const v = VIBE_BY_ID[id];
  if (!v || !v.fulfillment.includes(method)) return false;
  switch (id) {
    case 'fancy': return r.atmosphere.includes('upscale');
    case 'casual': return r.atmosphere.includes('casual');
    case 'quick': return r.atmosphere.includes('quick');
    case 'healthy': return healthyItems(r, FOOD_BY_ID) >= 2;
    default: return true; // pickup / delivery: any place that offers it
  }
}

/** Methods any of these styles could lead to (empty selection = anything). */
export function methodsFor(ids = []) {
  if (!ids.length) return [...METHODS];
  return METHODS.filter((m) => ids.some((id) => VIBE_BY_ID[id]?.fulfillment.includes(m)));
}

export function vibeFoodTags(vibeIds) {
  return vibeIds.map((id) => VIBE_BY_ID[id]?.foodTags || []);
}

export const vibeNames = (ids = []) => ids.map((id) => VIBE_BY_ID[id]?.name).filter(Boolean);
