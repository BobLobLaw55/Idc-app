// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { RESTAURANTS, DEMO_REGION } from '../js/data/restaurants.js';
import { FOODS, FOOD_BY_ID, UPSCALE } from '../js/data/foods.js';

import { buildDeck, partnerFoods, adaptRemaining } from '../js/engine/deck.js';
import { rankRestaurants, finalThree, scoreRestaurant, personalMatches, appetizerOptions } from '../js/engine/match.js';
import { resolveEliminations, resolveVotes, findReplacement } from '../js/engine/decide.js';

const SEAFOOD = new Set(FOODS.filter((f) => f.group === 'Seafood').map((f) => f.id));
const at7pm = new Date('2026-11-04T19:00:00');

function ctx(over = {}) {
  const sv = over.settings?.vibes;
  const vibes = over.vibes || (Array.isArray(sv) ? { A: sv, B: sv } : sv || { A: ['casual'], B: ['casual'] });
  return {
    vibes,
    restaurants: RESTAURANTS,
    profiles: {
      A: { name: 'A', prefs: {}, allergies: [], excludedRestaurants: [], favoriteRestaurants: [] },
      B: { name: 'B', prefs: {}, allergies: [], excludedRestaurants: [], favoriteRestaurants: [] },
      ...over.profiles,
    },
    rounds: over.rounds || {},
    settings: { budget: null, time: { kind: 'asap' }, radius: 25, location: DEMO_REGION, ...over.settings },
    group: { sharedExclusions: [], ...over.group },
    history: over.history || {},
    sessionRejected: over.sessionRejected || [],
    now: at7pm,
  };
}
const swipe = (answers) => ({ mode: 'swipe', answers });

test('Test 1: Never sushi is never dealt to A; sushi restaurants can still qualify via another dish', () => {
  const c = ctx({ profiles: { A: { prefs: { sushi: 'never', steak: 'love' }, allergies: [] }, B: { prefs: { sushi: 'love' }, allergies: [] } }, settings: { vibes: ['fancy'] } });
  for (let seed = 1; seed < 60; seed++) {
    const { deck } = buildDeck(c, 'A', { seed });
    assert.ok(!deck.includes('sushi'), `seed ${seed} dealt sushi`);
  }
  const ranked = rankRestaurants({ ...c, vibes: { A: ['casual'], B: ['casual'] }, rounds: { A: swipe({ steak: 'yes' }), B: swipe({ sushi: 'yes' }) } });
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
    settings: { vibes: ['delivery'], method: 'delivery' },
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

test('Test 8: Dress to Impress favors upscale dishes and places; Stay In only delivery-capable places', () => {
  const fancy = ctx({ settings: { vibes: ['fancy'] } });
  const couch = ctx({ settings: { vibes: ['delivery'], method: 'delivery' } });
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
  for (const x of rankRestaurants({ ...couch, rounds: r, profiles: p })) assert.ok(x.r.services.delivery);
  // travel-friendly foods dominate couch decks
  let travel = 0, total = 0;
  for (let s = 1; s <= 30; s++) { const d = buildDeck(couch, 'A', { seed: s }).deck; total += d.length; travel += d.filter((f) => ['couch', 'deliver'].some((t) => FOOD_BY_ID[f].vibes.includes(t))).length; }
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
  const c = ctx({ vibes: { A: ['casual', 'fancy'], B: ['casual', 'fancy'] }, rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
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

test('Pairing: similar cravings → different dishes, flagged as both wanted', () => {
  const c = ctx({ rounds: { A: swipe({ wings: 'yes', steak: 'yes' }), B: swipe({ steak: 'yes', wings: 'yes' }) } });
  const grill = scoreRestaurant(RESTAURANTS.find((r) => r.id === 'r01'), c); // Corner Grill: wings + sirloin
  assert.ok(grill);
  const [a, b] = grill.picks;
  assert.notEqual(a.item.id, b.item.id, 'should not give you both the same dish');
  assert.deepEqual(new Set([a.foodId, b.foodId]), new Set(['wings', 'steak']));
  assert.ok(a.bothWanted && b.bothWanted);
  // across the whole shortlist, nobody gets an identical dish when alternatives exist
  // wherever the menu has both a steak and a wings dish, you each get a different one
  for (const x of rankRestaurants(c)) {
    const has = (f) => x.r.menu.some((m) => m.verification !== 'unverified' && m.foods.includes(f));
    if (has('wings') && has('steak')) assert.notEqual(x.picks[0].item.id, x.picks[1].item.id, x.r.name);
  }
});

test('Pairing: same dish only when nothing else works', () => {
  const only = (id) => Object.fromEntries(FOODS.map((f) => [f.id, f.id === id ? 'love' : 'dislike']));
  const c = ctx({ profiles: { A: { prefs: only('ribeye'), allergies: [] }, B: { prefs: only('ribeye'), allergies: [] } }, rounds: { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } }, settings: { vibes: ['fancy'] } });
  const top = rankRestaurants(c)[0];
  assert.equal(top.picks[0].foodId, 'ribeye');
  assert.equal(top.picks[1].foodId, 'ribeye');
});

test('Split-this starter comes from saved profiles, not tonight’s swipes', () => {
  const r01 = RESTAURANTS.find((r) => r.id === 'r01');
  const saved = (extra) => ({ prefs: { steak: 'love', burger: 'love', ...extra }, allergies: [] });
  const swipes = { A: swipe({ steak: 'really' }), B: swipe({ burger: 'really' }) };
  // both profiles like loaded fries → suggested even though nobody swiped on fries tonight
  let x = scoreRestaurant(r01, ctx({ rounds: swipes, profiles: { A: saved({ loadedfries: 'like' }), B: saved({ loadedfries: 'love' }) } }));
  assert.ok(x.share?.foods.includes('loadedfries'));
  // both swiped YES on fries tonight but profiles don't like them → not suggested
  x = scoreRestaurant(r01, ctx({ rounds: { A: swipe({ steak: 'really', loadedfries: 'yes' }), B: swipe({ burger: 'really', loadedfries: 'yes' }) }, profiles: { A: saved({}), B: saved({}) } }));
  assert.equal(x.share, null);
  // a "Nah" tonight still vetoes it
  x = scoreRestaurant(r01, ctx({ rounds: { A: swipe({ steak: 'really', loadedfries: 'no' }), B: swipe({ burger: 'really' }) }, profiles: { A: saved({ loadedfries: 'love' }), B: saved({ loadedfries: 'love' }) } }));
  assert.equal(x.share, null);
  // and it never changes the restaurant's score
  const base = ctx({ rounds: swipes, profiles: { A: saved({}), B: saved({}) } });
  const withApp = ctx({ rounds: swipes, profiles: { A: saved({ loadedfries: 'like' }), B: saved({ loadedfries: 'like' }) } });
  assert.equal(scoreRestaurant(r01, withApp).score, scoreRestaurant(r01, base).score);
});

test('Quick and Healthy vibes steer cards and places', () => {
  const quick = ctx({ settings: { vibes: ['quick'], method: 'pickup' } });
  const r = { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } };
  const p = { A: { prefs: { burger: 'love', tacos: 'like', pizza: 'like' }, allergies: [] }, B: { prefs: { wings: 'love', burrito: 'like', sandwich: 'like' }, allergies: [] } };
  const top = rankRestaurants({ ...quick, rounds: r, profiles: p }).slice(0, 3);
  assert.ok(top.filter((x) => x.r.atmosphere.includes('quick')).length >= 2, top.map((x) => x.r.name).join());
  const healthy = ctx({ settings: { vibes: ['healthy'], method: 'dinein' } });
  let h = 0, base = 0;
  for (let s = 1; s <= 30; s++) {
    h += buildDeck(healthy, 'A', { seed: s }).deck.filter((f) => FOOD_BY_ID[f].vibes.includes('healthy')).length;
    base += buildDeck(ctx(), 'A', { seed: s }).deck.filter((f) => FOOD_BY_ID[f].vibes.includes('healthy')).length;
  }
  assert.ok(h > base * 1.3, `healthy ${h} vs casual ${base}`);
});

test('Cocktails too: sit-down plans need a bar; pickup/delivery plans unaffected', () => {
  const r = { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } };
  const prefs = { steak: 'love', burger: 'love', wings: 'like', pizza: 'like' };
  const mk = (drinks, vibes) => ctx({ rounds: r, vibes, settings: { drinks },
    profiles: { A: { prefs, allergies: [], drinks: ['cocktails'] }, B: { prefs, allergies: [], drinks: ['cocktails'] } } });
  const fancy = { A: ['fancy'], B: ['fancy'] };
  const on = rankRestaurants(mk(true, fancy));
  assert.ok(on.length >= 3);
  for (const x of on) { assert.equal(x.plan.method, 'dinein'); assert.ok(x.r.bar.length, x.r.name); }
  assert.deepEqual(on[0].drinks.together, ['cocktails']);
  const off = rankRestaurants(mk(false, { A: ['casual'], B: ['casual'] }));
  assert.equal(off[0].drinks, null);
  // drinks on, but you're both only up for delivery → bars don't matter
  const del = rankRestaurants(mk(true, { A: ['delivery'], B: ['delivery'] }));
  assert.ok(del.length && del.every((x) => x.plan.method === 'delivery' && x.drinks === null));
  assert.ok(del.some((x) => !x.r.bar.length));
});

test('Up for: picks don’t have to agree, but every place fits a style from EACH of you', () => {
  const r = { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } };
  const prefs = { steak: 'love', burger: 'love', wings: 'like', pizza: 'like', tacos: 'like', salad: 'like' };
  const mk = (vibes) => ctx({ rounds: r, vibes, profiles: { A: { prefs, allergies: [] }, B: { prefs, allergies: [] } } });
  // fancy vs sweatpants-only → impossible together: nothing qualifies
  assert.equal(rankRestaurants(mk({ A: ['fancy'], B: ['delivery'] })).length, 0);
  // overlapping on casual → casual plans, and the shared style is called out
  const mid = rankRestaurants(mk({ A: ['fancy', 'casual'], B: ['casual', 'delivery'] }));
  assert.ok(mid.length >= 3);
  for (const x of mid) {
    assert.ok(x.plan.fits.A.length && x.plan.fits.B.length, x.r.name);
    assert.ok(x.plan.fits.A.every((v) => ['fancy', 'casual'].includes(v)));
  }
  assert.ok(mid.slice(0, 3).every((x) => x.plan.shared.includes('casual')));
  // no shared style but a bridge exists: you want fancy or delivery, she wants casual or delivery → delivery
  const bridge = rankRestaurants(mk({ A: ['fancy', 'delivery'], B: ['casual', 'delivery'] }));
  assert.ok(bridge.length && bridge.every((x) => x.plan.method === 'delivery' || x.r.atmosphere.includes('upscale')));
  // A Quickie for both → only quick-service places
  for (const x of rankRestaurants(mk({ A: ['quick'], B: ['quick', 'fancy'] }))) assert.ok(x.r.atmosphere.includes('quick'));
});

test('Up for: my card deck follows MY styles only (partner’s stay private)', () => {
  const c = ctx({ vibes: { A: ['fancy'], B: ['delivery'] } });
  let up = 0;
  for (let s = 1; s <= 20; s++) up += buildDeck(c, 'A', { seed: s }).deck.filter((f) => UPSCALE.has(f)).length;
  assert.ok(up > 40, `fancy deck upscale cards ${up}`);
});

test('Private view: “what you picked that they have” uses only your own picks', () => {
  const r01 = RESTAURANTS.find((r) => r.id === 'r01');
  const c = ctx({ rounds: { A: swipe({ wings: 'yes', steak: 'really' }), B: swipe({ burger: 'really', salad: 'yes' }) } });
  const mine = personalMatches(r01, c, 'A').map((o) => o.foodId);
  assert.deepEqual(mine, ['steak', 'wings']);
  // partner's answers can change completely without changing my view
  const c2 = ctx({ rounds: { A: swipe({ wings: 'yes', steak: 'really' }), B: swipe({ tenders: 'yes' }) } });
  assert.deepEqual(personalMatches(r01, c2, 'A').map((o) => o.foodId), mine);
});

test('Final screen: appetizer options respect both people’s hard rules', () => {
  const r01 = RESTAURANTS.find((r) => r.id === 'r01');
  const c = ctx({ profiles: { A: { prefs: { wings: 'love', loadedfries: 'like' }, allergies: [] }, B: { prefs: { loadedfries: 'love', wings: 'never' }, allergies: [] } } });
  const apps = appetizerOptions(r01, c);
  assert.ok(apps.length >= 1);
  assert.ok(!apps.some((a) => a.item.foods.includes('wings')), 'B said Never to wings');
  assert.equal(apps[0].item.foods[0], 'loadedfries');
  assert.equal(apps[0].bothLove, true);
});

test('No ranking boost for having appetizers or a bar; final list = appetizers you both like', () => {
  const r = { A: { mode: 'skip', answers: {} }, B: { mode: 'skip', answers: {} } };
  const base = { steak: 'love', burger: 'love' };
  const mk = (extra, drinks) => ctx({ rounds: r, profiles: { A: { prefs: { ...base, ...extra }, allergies: [], drinks }, B: { prefs: { ...base, ...extra }, allergies: [], drinks } } });
  const plain = rankRestaurants(mk({}, []));
  const fancyExtras = rankRestaurants(mk({ nachos: 'like' }, ['beer', 'wine', 'cocktails']));
  // liking a starter or drinking doesn't move anyone up: same order, same scores (drinks not requested)
  assert.deepEqual(fancyExtras.map((x) => [x.id, x.score.toFixed(6)]), plain.map((x) => [x.id, x.score.toFixed(6)]));
  const r05 = RESTAURANTS.find((x) => x.id === 'r05'); // has nachos + quesadilla
  const c = mk({ nachos: 'like' }, []);
  const both = appetizerOptions(r05, c, 3, { onlyBothLike: true });
  assert.deepEqual(both.map((a) => a.item.foods[0]), ['nachos']);
  assert.ok(appetizerOptions(r05, c).length > both.length);
});

test('Favorites fallback: fills The Final Three when tonight’s cravings come up short', () => {
  const r = { A: swipe({ lamb: 'yes' }), B: swipe({ oysters: 'yes' }) }; // only one place has both
  const p = { A: { prefs: { steak: 'love', burger: 'like', lamb: 'like' }, allergies: [] }, B: { prefs: { burger: 'love', salmon: 'like', oysters: 'like' }, allergies: [] } };
  const c = ctx({ rounds: r, profiles: p, vibes: { A: ['fancy', 'casual'], B: ['fancy', 'casual'] } });
  const f = finalThree(c);
  assert.ok(f.tonight < 3, `tonight found ${f.tonight}`);
  assert.equal(f.candidates.length, 3);
  const fb = f.candidates.filter((id) => f.fallback.includes(id));
  assert.equal(fb.length, 3 - f.tonight);
  // fallback places still obey hard rules and are scored by saved favorites
  for (const id of fb) {
    const x = scoreRestaurant(RESTAURANTS.find((rr) => rr.id === id), { ...c, fallback: f.fallback });
    assert.ok(x && x.fromFavorites, id);
    assert.ok(x.plan.fits.A.length && x.plan.fits.B.length);
  }
  // tonight's "Nah" still beats a saved favorite in the fallback
  const c2 = ctx({ rounds: { A: swipe({ lamb: 'yes', steak: 'no', burger: 'no' }), B: swipe({ oysters: 'yes' }) }, profiles: p, vibes: c.vibes });
  const f2 = finalThree(c2);
  for (const id of f2.fallback) {
    const x = scoreRestaurant(RESTAURANTS.find((rr) => rr.id === id), { ...c2, fallback: f2.fallback });
    assert.ok(!x.picks[0].item.foods.some((fd) => ['steak', 'burger'].includes(fd)), id);
  }
});

test('Votes: veto OR really-want, resolved deterministically', () => {
  const c = ctx({ vibes: { A: ['casual', 'fancy'], B: ['casual', 'fancy'] }, rounds: { A: swipe({ steak: 'yes' }), B: swipe({ burger: 'yes' }) } });
  const f = finalThree(c);
  const [x, y, z] = f.candidates;
  const run = (A, B) => resolveVotes({ ...f, votes: { A, B } }, c);
  const veto = (id) => ({ type: 'veto', id });
  const want = (id) => ({ type: 'want', id });
  // a really-want nobody vetoed wins
  let res = run(want(x), veto(y));
  assert.equal(res.winner, x);
  assert.equal(res.backup, z);
  // both really want the same → it wins
  res = run(want(z), want(z));
  assert.equal(res.winner, z);
  assert.ok(res.reasons[0].includes('BOTH'));
  // vetoes beat wants: B vetoes what A really wants → winner from the other two
  res = run(want(x), veto(x));
  assert.ok([y, z].includes(res.winner));
  assert.notEqual(res.backup, x);
  assert.ok(res.reasons.some((t) => t.includes('Vetoes win')));
  // different wants → tiebreak between them; the third is never the winner
  res = run(want(x), want(y));
  assert.ok([x, y].includes(res.winner));
  // plain vetoes still work as before
  assert.equal(run(veto(x), veto(y)).winner, z);
  assert.equal(run(veto(x), veto(x)).sameVote, true);
  // deterministic
  assert.deepEqual(run(want(x), want(y)), run(want(x), want(y)));
});

test('Data hygiene: every menu food id exists; all restaurants flagged demo', () => {
  for (const r of RESTAURANTS) {
    assert.equal(r.demo, true);
    for (const m of r.menu) for (const f of m.foods) assert.ok(FOOD_BY_ID[f], `${r.id} ${f}`);
  }
});
