// Restaurant eligibility + ranking. Fully deterministic: no AI, no randomness.
import { CONFIG } from '../config.js';
import { UPSCALE, SHAREABLE, FOOD_BY_ID, foodName } from '../data/foods.js';
import { METHODS, styleFits } from '../data/vibes.js';
import { valueFn, itemValue, itemAllowed } from './prefs.js';

export const PEOPLE = ['A', 'B'];

export function distanceMiles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Hour of day (decimal) the meal happens. */
export function mealHour(time, now = new Date()) {
  const nowH = now.getHours() + now.getMinutes() / 60;
  if (!time || time.kind === 'asap') return nowH;
  if (time.kind === 'later') return Math.min(Math.max(nowH + 1.5, 19.5), 23.5);
  const [h, m] = String(time.at || '19:00').split(':').map(Number);
  return h + (m || 0) / 60;
}

export function openAt(r, hour, method) {
  if (!r.hours) return false; // unknown hours are not confirmed hours
  const [open, close] = r.hours;
  const buffer = method === 'dinein' ? 0.75 : 0.25;
  const h = hour < 5 ? hour + 24 : hour;
  return h >= open && h <= close - buffer;
}

/** Can we eat at `r` via `method` tonight (service, delivery range, hours, bar if drinking)? */
function methodOk(r, method, ctx) {
  const s = ctx.settings;
  if (method === 'dinein' && !r.services.dinein) return false;
  if (method === 'pickup' && !r.services.pickup) return false;
  if (method === 'delivery' && !(r.services.delivery && distanceMiles(s.deliveryAddress || s.location, r) <= r.deliveryRadius)) return false;
  if (!openAt(r, mealHour(s.time, ctx.now), method)) return false;
  if (method === 'dinein' && s.drinks && !r.bar?.length) return false; // "Cocktails too?" → sit-down places need a bar
  return true;
}

/**
 * The plan for restaurant `r`: one method that satisfies at least one style from EACH person in
 * `people`. A person who hasn't picked styles yet is unconstrained. Prefers plans that hit styles
 * you share. Returns { method, fits: {A:[...],B:[...]}, shared:[...] } or null.
 */
export function planFor(r, ctx, people = PEOPLE) {
  let best = null;
  for (const method of METHODS) {
    if (!methodOk(r, method, ctx)) continue;
    const fits = {};
    let ok = true;
    let score = 0;
    for (const p of people) {
      const picks = ctx.vibes?.[p] || [];
      if (!picks.length) { fits[p] = []; continue; }
      fits[p] = picks.filter((id) => styleFits(r, id, method, FOOD_BY_ID));
      if (!fits[p].length) { ok = false; break; }
      score += fits[p].length;
    }
    if (!ok) continue;
    const shared = people.length === 2 ? (fits.A || []).filter((id) => (fits.B || []).includes(id)) : [];
    score += shared.length * 3 + (method === 'dinein' && ctx.settings.drinks ? 2 : 0);
    if (!best || score > best.score) best = { method, fits, shared, score };
  }
  return best;
}
export function excludedFor(ctx, rid) {
  const { profiles, group } = ctx;
  return (
    (group?.sharedExclusions || []).includes(rid) ||
    PEOPLE.some((p) => (profiles[p].excludedRestaurants || []).includes(rid))
  );
}

export const DRINKS = ['beer', 'wine', 'cocktails'];
/** "Cocktails too?" only matters when the plan is to sit down somewhere. */
export const drinksOn = (s, plan) => !!s?.drinks && plan?.method === 'dinein';

/** What each person would drink here, and what you both like that they pour. */
export function drinkMatch(r, ctx) {
  const per = PEOPLE.map((p) => {
    const likes = ctx.profiles[p].drinks || [];
    return { likes, served: likes.filter((d) => r.bar?.includes(d)) };
  });
  const together = per[0].served.filter((d) => per[1].served.includes(d));
  return { bar: r.bar || [], per, together };
}

function drinkBonus(ctx, r, plan) {
  if (!drinksOn(ctx.settings, plan)) return 0;
  const m = drinkMatch(r, ctx);
  let b = 0.02; // you asked for drinks and you're getting them
  for (const p of m.per) if (p.likes.length) b += p.served.length ? 0.04 : -0.04;
  if (m.together.length) b += 0.02;
  return b;
}

/** Non-food hard constraints. Returns { blocked: reason } or { plan }. */
export function placeCheck(r, ctx, people = PEOPLE) {
  const s = ctx.settings;
  if (excludedFor(ctx, r.id)) return { blocked: 'permanently excluded' };
  if ((ctx.sessionRejected || []).includes(r.id)) return { blocked: 'already rejected tonight' };
  if (distanceMiles(s.location, r) > s.radius) return { blocked: 'outside search radius' };
  if (s.budget && r.price > s.budget * CONFIG.budgetSlack) return { blocked: 'over budget' };
  const plan = planFor(r, ctx, people);
  if (!plan) return { blocked: 'no plan fits both of your styles (or it’s closed)' };
  return { plan };
}

export const placeBlocker = (r, ctx, people) => placeCheck(r, ctx, people).blocked || null;

/** Best menu item at restaurant `r` for one person. */
export function bestFor(profile, value, r) {
  let best = null;
  for (const item of r.menu) {
    const v = itemValue(profile, value, item);
    if (v === -Infinity || v <= 0) continue;
    if (!best || v > best.value || (v === best.value && item.verification === 'dish' && best.item.verification !== 'dish')) {
      const foodId = item.foods.reduce((a, f) => (value(f) > value(a) ? f : a), item.foods[0]);
      best = { item, value: v, foodId };
    }
  }
  return best;
}

function historyBonus(ctx, rid) {
  const h = ctx.history || {};
  let bonus = 0;
  const visits = (h.visits || []).filter((v) => v.restaurantId === rid && v.went && v.rating);
  if (visits.length) bonus += ((visits.reduce((s, v) => s + v.rating, 0) / visits.length - 3) / 2) * 0.04;
  const recent = (h.decisions || []).slice(-2).some((d) => d.restaurantId === rid);
  if (recent) bonus -= 0.06; // keep favorites from appearing every single night
  if (PEOPLE.some((p) => (ctx.profiles[p].favoriteRestaurants || []).includes(rid))) bonus += 0.03;
  return bonus;
}

function vibeBonus(ctx, r, picks, plan) {
  const all = [...(plan.fits.A || []), ...(plan.fits.B || [])];
  let b = 0;
  if (plan.shared.length) b += 0.05; // a style you're BOTH up for beats a compromise
  if (all.includes('fancy')) b += (picks.filter((p) => UPSCALE.has(p.foodId)).length / 2) * 0.05;
  if (all.includes('healthy')) b += (picks.filter((p) => FOOD_BY_ID[p.foodId]?.vibes.includes('healthy')).length / 2) * 0.08;
  if (all.includes('quick') && r.atmosphere.includes('quick')) b += 0.02;
  return b;
}

const BOTH_WANT = 60; // "yes"/"really" tonight, or a saved Love/Like when skipping

function optionsFor(profile, value, r) {
  const out = [];
  for (const item of r.menu) {
    const v = itemValue(profile, value, item);
    if (v === -Infinity || v < CONFIG.qualifyThreshold) continue;
    const foodId = item.foods.reduce((a, f) => (value(f) > value(a) ? f : a), item.foods[0]);
    out.push({ item, value: v, foodId });
  }
  return out;
}

/**
 * Pick one dish per person, preferring DIFFERENT dishes when you want similar things
 * (you said wings + steak, she said steak + wings → wings for one, steak for the other).
 * Also flags dishes you both wanted, and suggests a shareable starter both saved profiles like.
 * The starter is display-only: it never affects which restaurant ranks higher.
 */
export function pairDishes(r, ctx, values) {
  const [oa, ob] = PEOPLE.map((p) => optionsFor(ctx.profiles[p], values[p], r));
  if (!oa.length || !ob.length) return null;
  let best = null;
  for (const a of oa) {
    for (const b of ob) {
      let s = 0.7 * Math.min(a.value, b.value) + 0.3 * ((a.value + b.value) / 2);
      if (a.item.id === b.item.id) s -= 22; // same exact dish: only if nothing else is close
      else if (a.foodId === b.foodId) s -= 12; // two versions of the same thing
      if (!best || s > best.s + 1e-9) best = { s, a, b };
    }
  }
  const both = (f) => values.A(f) >= BOTH_WANT && values.B(f) >= BOTH_WANT;
  const picks = [best.a, best.b].map((p) => ({ ...p, bothWanted: p.item.foods.some(both) }));
  const used = new Set(picks.map((p) => p.item.id));
  // Appetizers to split come from your SAVED profiles (both Love/Like), not tonight's swipes.
  // The only thing tonight can do is veto it: an explicit "Nah" tonight still wins.
  const bothLikeSaved = (f) => PEOPLE.every((p) => ['love', 'like'].includes(ctx.profiles[p].prefs?.[f])
    && ctx.rounds?.[p]?.answers?.[f] !== 'no');
  const share = r.menu
    .filter((item) => !used.has(item.id) && item.verification !== 'unverified'
      && PEOPLE.every((p) => itemAllowed(ctx.profiles[p], item))
      && item.foods.some((f) => SHAREABLE.has(f) && bothLikeSaved(f)))
    .sort((x, y) => (y.verification === 'dish') - (x.verification === 'dish') || (x.price ?? 99) - (y.price ?? 99))[0] || null;
  return { picks, share };
}

/** Score one restaurant. Returns null if it fails a hard constraint. */
export function scoreRestaurant(r, ctx, opts = {}) {
  const { plan } = placeCheck(r, ctx);
  if (!plan) return null;
  const s = ctx.settings;
  const values = Object.fromEntries(PEOPLE.map((p) => [p, opts.values?.[p] || valueFn(ctx.profiles[p], ctx.rounds?.[p])]));
  const bests = PEOPLE.map((p) => bestFor(ctx.profiles[p], values[p], r));
  if (bests.some((p) => !p || p.value < CONFIG.qualifyThreshold)) return null;
  // Ranking uses each person's best dish; the dishes we SHOW are paired to differ where possible.
  const { picks, share } = pairDishes(r, ctx, values);

  const [a, b] = bests.map((p) => p.value);
  const W = CONFIG.rankWeights;
  const miles = distanceMiles(s.location, r);
  const parts = {
    // weaker match dominates so one person's great match can't hide the other having nothing
    food: (0.7 * Math.min(a, b) + 0.3 * ((a + b) / 2)) / 100,
    distance: Math.max(0, 1 - miles / s.radius),
    budget: !s.budget || r.price <= s.budget ? 1 : Math.max(0, 1 - (r.price / s.budget - 1) / (CONFIG.budgetSlack - 1)),
    hours: (() => {
      const h = mealHour(s.time, ctx.now);
      return r.hours[1] - (h < 5 ? h + 24 : h) < 1.5 ? 0.6 : 1;
    })(),
    verification: picks.reduce((t, p) => t + (p.item.verification === 'dish' ? 1 : 0.6), 0) / 2,
  };
  const base = Object.entries(W).reduce((t, [k, w]) => t + w * parts[k], 0);
  const score = base + vibeBonus(ctx, r, picks, plan) + historyBonus(ctx, r.id) + drinkBonus(ctx, r, plan);
  return { r, id: r.id, score, parts, picks, share, miles, plan, drinks: drinksOn(s, plan) ? drinkMatch(r, ctx) : null };
}

export function rankRestaurants(ctx, opts) {
  return ctx.restaurants
    .map((r) => scoreRestaurant(r, ctx, opts))
    .filter(Boolean)
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
}

/** The Final Three + the rest of the pool (for backups). Never pads with fake matches. */
export function finalThree(ctx) {
  const ranked = rankRestaurants(ctx);
  return { candidates: ranked.slice(0, 3).map((x) => x.id), pool: ranked.slice(3).map((x) => x.id), total: ranked.length };
}

/** Human-readable reasons a restaurant matched. */
export function whyMatched(scored, names) {
  const out = [];
  scored.picks.forEach((p, i) => {
    const label = p.item.verification === 'dish' ? p.item.name : `${foodName(p.foodId)} (category listed; specific dish not verified)`;
    out.push(`${names[i]}: ${label}`);
  });
  out.push(`${scored.miles.toFixed(1)} mi away`);
  if (scored.parts.budget === 1) out.push('Within budget');
  return out;
}

/** Menu line to show for a pick, without inventing a specific entrée for category-level evidence. */
export function pickLabel(pick) {
  if (!pick) return 'Nothing verified';
  return pick.item.verification === 'dish' ? pick.item.name : `${foodName(pick.foodId)} — category verified, dish not listed`;
}
