// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { RESTAURANTS, DEMO_REGION } from '../js/data/restaurants.js';
import { FOODS, FOOD_BY_ID, UPSCALE } from '../js/data/foods.js';
import { canAddVibe, allowedMethods, methodChoices } from '../js/data/vibes.js';
import { buildDeck, partnerFoods, adaptRemaining } from '../js/engine/deck.js';
import { rankRestaurants, finalThree, scoreRestaurant } from '../js/engine/match.js';
import { resolveEliminations, findReplacement } from '../js/engine/decide.js';

const SEAFOOD = new Set(FOODS.filter((f) => f.group === 'Seafood').map((f) => f.id));
const at7pm = new Date('2026-11-04T19:00:00');

function ctx(over = {}) {
  return {
    restaurants: RESTAURANTS,
    profiles: {
      A: { name: 'A', prefs: {}, allergies: [], excludedRestaurants: [], favoriteRestaurants: [] },
      B: { name: 'B', prefs: {}, allergies: [], excludedRestaurants: [], favoriteRestaurants: [] },
      ...over.profiles,
    },
    rounds: over.rounds || {},
    settings: { vibes: ['casual'], method: 'dinein', budget: null, time: { kind: 'asap' }, radius: 25, location: DEMO_REGION, ...over.settings },
    group: { sharedExclusions: [], ...over.group },
    history: over.history || {},
    sessionRejected: over.sessionRejected || [],
    now: at7pm,
  };
}
const swipe = (answers) => ({ mode: 'swipe', answers });

test('Test 1: Never sushi is never dealt to A; sushi restaurants can still qualify via another dish', () => {
  const c = ctx({ profiles: { A: { prefs: { sushi: 'never', steak: 'love' }, allergies: [] }, B: { prefs: { sushi: 'love' }, allergies: [] } }, settings: { vibes: ['date'] } });
  for (let seed = 1; seed < 60; seed++) {
    const { deck } = buildDeck(c, 'A', { seed });
    assert.ok(!deck.includes('sushi'), `seed ${seed} dealt sushi`);
  }
  const ranked = rankRestaurants({ ...c, rounds: { A: swipe({ steak: 'yes' }), B: swipe({ sushi: 'yes' }) } });
  const koi = ranked.find((x) => x.id === 'r13');
  assert.ok(koi, 'Koi & Ember (sushi + hibachi steak) should still qualify');
  assert.ok(!koi.picks[0].item.foods.includes('sushi'), 'A’s dish must not be sushi');
});

test('Test 2: steak + burger matches non-steakhouse places with both', () => {
  const c = ctx({ rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
  const top = rankRestaurants(c);
  assert.ok(top.length >= 3);
  for (const x of top.slice(0, 3)) {
    assert.ok(x.picks[0].item.foods.some((f) => f === 'steak' || f === 'ribeye' || f === 'filet'), `${x.r.name} A pick`);
    assert.ok(x.picks[1].item.foods.some((f) => f === 'burger' || f === 'cheeseburger'), `${x.r.name} B pick`);
  }
  assert.ok(top.some((x) => !/steak/i.test(x.r.cuisine)), 'a non-steakhouse should qualify');
});

test('Test 3: partner-aware cards for B include verified non-seafood from A’s seafood places (≈30%)', () => {
  const c = ctx({
    profiles: { A: { prefs: {}, allergies: [] }, B: { prefs: { burger: 'love', steak: 'love', sushi: 'dislike' }, allergies: [] } },
    rounds: { A: swipe({ sushi: 'yes', shrimp: 'yes', salmon: 'really' }) },
    settings: { vibes: ['casual'], method: 'dinein' },
  });
  const map = partnerFoods(c, 'A', 'B');
  assert.ok(!map.has('sushi'), 'disliked sushi is never pushed via partner influence');
  const { deck, buckets } = buildDeck(c, 'B', { seed: 7, partnerMap: map });
  const partnerCards = deck.filter((id) => buckets[id] === 'partner');
  assert.equal(partnerCards.length, Math.round(16 * 0.3));
  assert.ok(partnerCards.some((id) => !SEAFOOD.has(id)), 'should include non-seafood options');
  // every partner card is really on a menu at a restaurant serving A's cravings
  const seafoodPlaces = RESTAURANTS.filter((r) => r.menu.some((m) => m.foods.some((f) => ['sushi', 'shrimp', 'salmon'].includes(f))));
  for (const id of partnerCards) assert.ok(seafoodPlaces.some((r) => r.menu.some((m) => m.verification !== 'unverified' && m.foods.includes(id))), id);
  assert.ok(!deck.includes('sushi'));
});

test('Test 3b: mid-deck adaptation never changes answered cards', () => {
  const c = ctx({ rounds: { A: swipe({ salmon: 'yes' }) }, profiles: { B: { prefs: { burger: 'love' }, allergies: [] } } });
  const { deck, buckets } = buildDeck(c, 'B', { seed: 3 });
  const round = { deck, buckets, pos: 5, answers: Object.fromEntries(deck.slice(0, 5).map((id) => [id, 'maybe'])) };
  const out = adaptRemaining(round, c, 'B', partnerFoods(c, 'A', 'B'), 9);
  assert.deepEqual(out.deck.slice(0, 5), deck.slice(0, 5));
  assert.equal(new Set(out.deck).size, out.deck.length);
});

test('Test 4: both skip → three restaurants from saved profiles', () => {
  const c = ctx({
    profiles: { A: { prefs: { pizza: 'love', wings: 'like' }, allergies: [] }, B: { prefs: { pasta: 'love', alfredo: 'love', salad: 'like' }, allergies: [] } },
    rounds: { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } },
    settings: { vibes: ['couch'], method: 'delivery' },
  });
  const f = finalThree(c);
  assert.equal(f.candidates.length, 3);
  for (const id of f.candidates) assert.ok(RESTAURANTS.find((r) => r.id === id).services.delivery);
});

test('Test 5: one swipes, one skips → current cravings + saved profile', () => {
  const c = ctx({
    profiles: { B: { prefs: { burger: 'love', wings: 'love', alfredo: 'love' }, allergies: [] } },
    rounds: { A: swipe({ steak: 'yes', burger: 'no' }), B: { mode: 'skip', answers: {} } },
  });
  const top = rankRestaurants(c).slice(0, 3);
  assert.equal(top.length, 3);
  for (const x of top) {
    assert.ok(['steak', 'ribeye', 'filet'].some((f) => x.picks[0].item.foods.includes(f)));
    assert.ok(['burger', 'wings', 'alfredo', 'cheeseburger'].some((f) => x.picks[1].item.foods.includes(f)));
  }
});

test('Tonight’s “no” beats a permanent favorite', () => {
  const c = ctx({ profiles: { A: { prefs: { burger: 'love' }, allergies: [] } }, rounds: { A: { mode: 'skip', answers: { burger: 'no', cheeseburger: 'no' } }, B: { mode: 'skip', answers: {} } } });
  for (const x of rankRestaurants(c)) assert.ok(!x.picks[0].item.foods.includes('burger'));
});

test('Allergies: a shellfish allergy keeps shellfish dishes from being that person’s match', () => {
  const c = ctx({ profiles: { A: { prefs: { shrimp: 'love' }, allergies: ['shellfish'] } }, rounds: { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } } });
  for (const x of rankRestaurants(c)) assert.ok(!x.picks[0].item.foods.some((f) => FOOD_BY_ID[f].allergens.includes('shellfish')));
  for (let s = 1; s < 20; s++) assert.ok(!buildDeck(c, 'A', { seed: s }).deck.some((f) => FOOD_BY_ID[f].allergens.includes('shellfish')));
});

test('Test 8: Fancy AF favors upscale dishes and places; Couch Goblins only takeout-capable places', () => {
  const fancy = ctx({ settings: { vibes: ['fancy'], method: 'dinein' } });
  const couch = ctx({ settings: { vibes: ['couch'], method: 'either' } });
  let up = 0, upC = 0;
  for (let s = 1; s <= 30; s++) {
    up += buildDeck(fancy, 'A', { seed: s }).deck.filter((f) => UPSCALE.has(f)).length;
    upC += buildDeck(couch, 'A', { seed: s }).deck.filter((f) => UPSCALE.has(f)).length;
  }
  assert.ok(up > upC * 2, `fancy upscale cards ${up} vs couch ${upC}`);
  const r = { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } };
  const p = { A: { prefs: { steak: 'love', salmon: 'like' }, allergies: [] }, B: { prefs: { steak: 'like', risotto: 'love' }, allergies: [] } };
  const topFancy = rankRestaurants({ ...fancy, rounds: r, profiles: p })[0];
  assert.ok(topFancy.r.atmosphere.includes('upscale'), topFancy.r.name);
  for (const x of rankRestaurants({ ...couch, rounds: r, profiles: p })) assert.ok(x.r.services.pickup || x.r.services.delivery);
  // travel-friendly foods dominate couch decks
  let travel = 0, total = 0;
  for (let s = 1; s <= 30; s++) { const d = buildDeck(couch, 'A', { seed: s }).deck; total += d.length; travel += d.filter((f) => FOOD_BY_ID[f].vibes.includes('couch')).length; }
  assert.ok(travel / total > 0.6, `couch-friendly ratio ${travel / total}`);
});

test('Deck variety: randomized order, no duplicates, repeat-reduction across sessions', () => {
  const c = ctx({ profiles: { A: { prefs: { burger: 'love', pizza: 'love', wings: 'like' }, allergies: [] } } });
  const d1 = buildDeck(c, 'A', { seed: 11 }).deck;
  const d2 = buildDeck(c, 'A', { seed: 12 }).deck;
  assert.equal(new Set(d1).size, d1.length);
  assert.notDeepEqual(d1, d2);
  const withHistory = { ...c, history: { impressions: { A: [d1, d1, d1] } } };
  let overlapFresh = 0, overlapHist = 0;
  for (let s = 100; s < 130; s++) {
    overlapFresh += buildDeck(c, 'A', { seed: s }).deck.filter((x) => d1.includes(x)).length;
    overlapHist += buildDeck(withHistory, 'A', { seed: s }).deck.filter((x) => d1.includes(x)).length;
  }
  assert.ok(overlapHist < overlapFresh, `history should reduce repeats (${overlapHist} vs ${overlapFresh})`);
  // loved foods still eligible despite history
  let burgerSeen = 0;
  for (let s = 100; s < 130; s++) if (buildDeck(withHistory, 'A', { seed: s }).deck.includes('burger')) burgerSeen++;
  assert.ok(burgerSeen > 0);
});

test('Test 9: different eliminations → remaining restaurant wins automatically', () => {
  const c = ctx({ rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
  const f = finalThree(c);
  const s = { ...f, eliminations: { A: f.candidates[0], B: f.candidates[1] } };
  const res = resolveEliminations(s, c);
  assert.equal(res.winner, f.candidates[2]);
  assert.equal(res.sameVote, false);
  assert.ok(!f.candidates.slice(0, 2).includes(res.backup));
});

test('Test 10: same elimination → deterministic primary + backup among survivors', () => {
  const c = ctx({ rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
  const f = finalThree(c);
  const s = { ...f, eliminations: { A: f.candidates[0], B: f.candidates[0] } };
  const r1 = resolveEliminations(s, c), r2 = resolveEliminations(s, c);
  assert.deepEqual(r1, r2);
  assert.equal(r1.sameVote, true);
  assert.deepEqual(new Set([r1.winner, r1.backup]), new Set(f.candidates.slice(1)));
  assert.ok(r1.reasons.length);
});

test('Test 11: shared and individual exclusions never appear', () => {
  const base = ctx({ rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
  const first = finalThree(base).candidates[0];
  assert.ok(!finalThree({ ...base, group: { sharedExclusions: [first] } }).candidates.includes(first));
  const indiv = { ...base, profiles: { ...base.profiles, B: { ...base.profiles.B, excludedRestaurants: [first] } } };
  assert.ok(!rankRestaurants(indiv).some((x) => x.id === first));
});

test('Test 12: replacement never repeats rejected options; backup first', () => {
  const c = ctx({ rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
  const f = finalThree(c);
  const res = resolveEliminations({ ...f, eliminations: { A: f.candidates[0], B: f.candidates[1] } }, c);
  const rejected = [...res.eliminated];
  const r1 = findReplacement(c, { current: res.winner, backup: res.backup, rejected });
  assert.equal(r1.id, res.backup);
  assert.equal(r1.stage, 'backup');
  rejected.push(res.winner);
  const r2 = findReplacement(c, { current: r1.id, backup: null, rejected });
  assert.ok(r2.id && ![...rejected, r1.id].includes(r2.id));
});

test('Fewer than three: never fabricates matches', () => {
  const c = ctx({ rounds: { A: swipe({ lamb: 'yes' }), B: swipe({ oysters: 'yes' }) }, settings: { vibes: ['fancy'], method: 'dinein' } });
  // only places with both lamb and oysters qualify for the "yes" picks; others may qualify via profile fallback values
  const f = finalThree({ ...c, profiles: { A: { prefs: Object.fromEntries(FOODS.map((x) => [x.id, x.id === 'lamb' ? 'love' : 'dislike'])), allergies: [] }, B: { prefs: Object.fromEntries(FOODS.map((x) => [x.id, x.id === 'oysters' ? 'love' : 'dislike'])), allergies: [] } } });
  assert.ok(f.candidates.length < 3);
  assert.equal(f.candidates.length, f.total);
});

test('Unverified menu items never qualify', () => {
  // r06 lists "Steak" as unverified only
  const c = ctx({ profiles: { A: { prefs: Object.fromEntries(FOODS.map((x) => [x.id, x.id === 'steak' ? 'love' : 'never'])), allergies: [] } }, rounds: { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } } });
  assert.equal(scoreRestaurant(RESTAURANTS.find((r) => r.id === 'r06'), c), null);
});

test('Vibes: contradictory combos blocked, compatible ones allowed', () => {
  assert.equal(canAddVibe(['fancy'], 'date').ok, true);
  assert.equal(canAddVibe(['fancy'], 'couch').ok, false);
  assert.equal(canAddVibe(['grab'], 'deliver').ok, false);
  assert.deepEqual(allowedMethods(['couch']), ['pickup', 'delivery']);
  assert.ok(!methodChoices(['couch']).includes('dinein'));
  assert.deepEqual(methodChoices(['date', 'fancy']), ['dinein']);
  assert.equal(canAddVibe(['date', 'fancy', 'casual'], 'casual').ok, true);
});

test('Data hygiene: every menu food id exists; all restaurants flagged demo', () => {
  for (const r of RESTAURANTS) {
    assert.equal(r.demo, true);
    for (const m of r.menu) for (const f of m.foods) assert.ok(FOOD_BY_ID[f], `${r.id} ${f}`);
  }
});
