// The Final Three elimination + replacement rules. Deterministic and evidence-based.
import { rankRestaurants, scoreRestaurant, distanceMiles, PEOPLE } from './match.js';
import { valueFn } from './prefs.js';
import { CONFIG } from '../config.js';

/** Tie-break between the two survivors when both partners eliminated the same restaurant. */
export function tiebreak(ids, ctx) {
  const scored = ids.map((id) => scoreRestaurant(ctx.restaurants.find((r) => r.id === id), { ...ctx, sessionRejected: [] }));
  const valid = scored.filter(Boolean);
  if (valid.length < 2) return { order: valid.length ? [valid[0].id, ...ids.filter((i) => i !== valid[0].id)] : ids, reasons: ['Only one survivor still qualifies.'] };
  const [x, y] = [...valid].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const reasons = [];
  const diff = (k, label, better) => {
    if (Math.abs(x.parts[k] - y.parts[k]) > 0.01) reasons.push(x.parts[k] > y.parts[k] ? better : `${label} favored ${y.r.name}, but not enough to flip it`);
  };
  diff('food', 'Food fit', 'Better food fit for both of you (the weaker match counts most)');
  diff('distance', 'Distance', `Closer (${x.miles.toFixed(1)} vs ${y.miles.toFixed(1)} mi)`);
  diff('budget', 'Budget', 'Easier on the budget');
  diff('hours', 'Hours', 'More time before closing');
  diff('verification', 'Menu evidence', 'Stronger menu verification');
  if (!reasons.length) reasons.push('Dead heat on every factor — alphabetical order broke the tie. Riveting.');
  return { order: [x.id, y.id], reasons };
}

/**
 * Resolve both private eliminations.
 *  - Different eliminations → the one remaining restaurant wins automatically.
 *  - Same elimination → deterministic ranking picks primary + backup from the two survivors.
 * The backup never resurrects something eliminated tonight.
 */
export function resolveEliminations(session, ctx) {
  const { candidates, pool = [] } = session;
  const votes = PEOPLE.map((p) => session.eliminations?.[p]);
  if (votes.some((v) => !v)) return null;
  const survivors = candidates.filter((id) => !votes.includes(id));
  const eliminated = [...new Set(votes)];
  if (eliminated.length === 2) {
    const winner = survivors[0];
    const backup = rankRestaurants({ ...ctx, sessionRejected: [...eliminated, winner] }).find((x) => pool.includes(x.id))?.id || null;
    return { winner, backup, sameVote: false, eliminated, reasons: ['You each vetoed a different place, so the last one standing wins. No tiebreaker needed.'] };
  }
  const { order, reasons } = tiebreak(survivors, ctx);
  return { winner: order[0], backup: order[1] || null, sameVote: true, eliminated, reasons };
}

/**
 * Find a replacement after both partners approve.
 * Order: original backup → nearby the current pick → anything eligible → saved favorites → none.
 */
export function findReplacement(ctx, { current, backup, rejected }) {
  const rejectedAll = [...new Set([...rejected, current])];
  const c = { ...ctx, sessionRejected: rejectedAll };
  const ranked = rankRestaurants(c);
  if (backup && ranked.some((x) => x.id === backup)) return { id: backup, stage: 'backup' };
  const here = ctx.restaurants.find((r) => r.id === current);
  if (ranked.length) {
    // You may already be standing at the old place — prefer good options close to it.
    const near = [...ranked].sort((a, b) => (b.score - distanceMiles(here, b.r) * 0.02) - (a.score - distanceMiles(here, a.r) * 0.02));
    return { id: near[0].id, stage: 'nearby' };
  }
  // Expand to saved favorites (ignore tonight's swipes, but still honor tonight's "no"s and all hard rules).
  const values = Object.fromEntries(PEOPLE.map((p) => [p, valueFn(ctx.profiles[p], { mode: 'skip', answers: Object.fromEntries(Object.entries(ctx.rounds?.[p]?.answers || {}).filter(([, a]) => a === 'no')) })]));
  const fav = rankRestaurants(c, { values });
  if (fav.length) return { id: fav[0].id, stage: 'favorites' };
  return { id: null, stage: 'none' };
}

export { CONFIG };
