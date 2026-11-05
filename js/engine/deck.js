// Food card generation: personal / vibe / discovery mix + private partner-aware influence.
import { CONFIG } from '../config.js';
import { FOODS, FOOD_BY_ID, UPSCALE } from '../data/foods.js';
import { foodAllowed, prefOf, cravings, valueFn, itemAllowed } from './prefs.js';
import { placeBlocker, bestFor } from './match.js';
import { rng, shuffle, weightedSample } from './rng.js';
import { vibeFoodTags } from '../data/vibes.js';

const PREF_W = { love: 5, like: 3, neutral: 0.6, dislike: 0, never: 0 };
const PREF_MULT = { love: 1.5, like: 1.2, neutral: 1, dislike: 0.15, never: 0 };

/** Foods that appear on a verified menu at a place passing tonight's non-food constraints. */
export function localFoods(ctx, people) {
  const set = new Set();
  for (const r of ctx.restaurants) {
    if (placeBlocker(r, ctx, people)) continue;
    for (const item of r.menu) if (item.verification !== 'unverified') item.foods.forEach((f) => set.add(f));
  }
  return set;
}

export function recentCount(history, person, foodId) {
  const imps = (history?.impressions?.[person] || []).slice(-CONFIG.recentSessions);
  return imps.filter((s) => s.includes(foodId)).length;
}

/**
 * Private partner signal: foods (other than the partner's) available at restaurants that already
 * satisfy the partner's cravings tonight. Returns Map(foodId → weight) filtered for `me`.
 * Only foods with real menu evidence count. Never exposes which foods the partner chose.
 */
export function partnerFoods(ctx, partner, me) {
  const pProfile = ctx.profiles[partner];
  const pRound = ctx.rounds?.[partner];
  const crave = new Set(cravings(pProfile, pRound));
  if (!crave.size) return new Map();
  const pValue = valueFn(pProfile, pRound);
  const mine = ctx.profiles[me];
  const map = new Map();
  for (const r of ctx.restaurants) {
    if (placeBlocker(r, ctx)) continue;
    const pBest = bestFor(pProfile, pValue, r);
    if (!pBest || !pBest.item.foods.some((f) => crave.has(f))) continue;
    for (const item of r.menu) {
      if (!itemAllowed(mine, item)) continue;
      for (const f of item.foods) {
        const lvl = prefOf(mine, f);
        if (!foodAllowed(mine, f) || lvl === 'dislike') continue;
        map.set(f, (map.get(f) || 0) + PREF_MULT[lvl]);
      }
    }
  }
  return map;
}

function vibeAffinity(food, vibes) {
  let a = vibeFoodTags(vibes).filter((tags) => tags.some((t) => food.vibes.includes(t))).length;
  if (a && vibes.includes('fancy') && UPSCALE.has(food.id)) a += 1.5;
  return a;
}

/**
 * Build a deck for one person.
 * @returns {{deck:string[], buckets:Object<string,string>}}
 */
export function buildDeck(ctx, me, { seed, size = CONFIG.deckSize, partnerMap = null } = {}) {
  const rand = rng(seed);
  const profile = ctx.profiles[me];
  const vibes = ctx.vibes?.[me] || [];
  const local = localFoods(ctx, [me]); // my deck reflects MY styles; partner's stay private
  const pool = FOODS.filter((f) => foodAllowed(profile, f.id) && local.has(f.id));
  const rec = (id) => recentCount(ctx.history, me, id);
  const chosen = [];
  const buckets = {};
  const take = (ids, bucket) => ids.forEach((id) => { if (!buckets[id]) { chosen.push(id); buckets[id] = bucket; } });
  const avail = (list) => list.filter((x) => !buckets[x.id]);

  // 1) Partner-aware slots (≈30%), only when the partner has finished.
  if (partnerMap && partnerMap.size) {
    const n = Math.round(size * CONFIG.partnerInfluence);
    const items = avail(pool.filter((f) => partnerMap.has(f.id)).map((f) => ({ id: f.id, w: partnerMap.get(f.id) * 0.6 ** rec(f.id) })));
    take(weightedSample(items, n, rand), 'partner');
  }
  const rest = size - chosen.length;
  const nPersonal = Math.round(rest * CONFIG.deckMix.personal);
  const nVibe = Math.round(rest * CONFIG.deckMix.vibe);

  // 2) Personal favorites (loves keep some weight even if recently seen).
  take(weightedSample(avail(pool.map((f) => {
    const lvl = prefOf(profile, f.id);
    return { id: f.id, w: PREF_W[lvl] * (lvl === 'love' ? 0.7 : 0.45) ** rec(f.id) };
  })), nPersonal, rand), 'personal');

  // 3) Vibe-driven.
  take(weightedSample(avail(pool.map((f) => {
    const a = vibeAffinity(f, vibes);
    return { id: f.id, w: a ? a * PREF_MULT[prefOf(profile, f.id)] * 0.5 ** rec(f.id) : 0 };
  })), nVibe, rand), 'vibe');

  // 4) Discovery: unrated/neutral, least recently seen; at most one occasional "dislike" revisit.
  const disc = avail(pool.map((f) => {
    const lvl = prefOf(profile, f.id);
    const unrated = !profile.prefs?.[f.id];
    let w = lvl === 'neutral' ? (unrated ? 2 : 1) : lvl === 'dislike' ? 0.15 : 0.3;
    if (lvl === 'dislike' && rec(f.id) > 0) w = 0;
    return { id: f.id, w: w * 0.35 ** rec(f.id) };
  }));
  let discPicks = weightedSample(disc, size - chosen.length, rand);
  let dislikes = 0;
  discPicks = discPicks.filter((id) => prefOf(profile, id) !== 'dislike' || dislikes++ < 1);
  take(discPicks, 'discovery');

  // 5) Top up if any bucket ran dry (small local pools), never with dislikes.
  if (chosen.length < size) {
    take(weightedSample(avail(pool.map((f) => ({ id: f.id, w: prefOf(profile, f.id) === 'dislike' ? 0 : 1 }))), size - chosen.length, rand), 'fill');
  }
  return { deck: shuffle(chosen, rand), buckets };
}

/**
 * Partner finished while I'm mid-deck: blend partner-aware foods into my UNANSWERED cards only.
 * Cards already shown/answered are never changed.
 */
export function adaptRemaining(round, ctx, me, partnerMap, seed) {
  const rand = rng(seed);
  const kept = round.deck.slice(0, round.pos);
  const remaining = round.deck.slice(round.pos).filter((id) => !round.answers[id]);
  const answeredLater = round.deck.slice(round.pos).filter((id) => round.answers[id]);
  const profile = ctx.profiles[me];
  const local = localFoods(ctx, [me]);
  const inDeck = new Set(round.deck);
  const n = Math.min(remaining.length, Math.round(remaining.length * CONFIG.partnerInfluence));
  const items = [...partnerMap.entries()]
    .filter(([id]) => !inDeck.has(id) && foodAllowed(profile, id) && local.has(id))
    .map(([id, w]) => ({ id, w }));
  const add = weightedSample(items, n, rand);
  // Replace the least personal remaining cards (discovery/fill first).
  const order = { fill: 0, discovery: 1, vibe: 2, personal: 3, partner: 4 };
  const removable = [...remaining].sort((x, y) => (order[round.buckets?.[x]] ?? 1) - (order[round.buckets?.[y]] ?? 1));
  const drop = new Set(removable.slice(0, add.length));
  const buckets = { ...round.buckets };
  add.forEach((id) => (buckets[id] = 'partner'));
  const newRemaining = shuffle([...remaining.filter((id) => !drop.has(id)), ...add], rand);
  return { ...round, deck: [...kept, ...answeredLater, ...newRemaining], pos: kept.length + answeredLater.length, buckets, adapted: true };
}

export { FOOD_BY_ID };
