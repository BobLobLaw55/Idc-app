// The Final Three elimination + replacement rules. Deterministic and evidence-based.
import { rankRestaurants, scoreRestaurant, distanceMiles, favoriteValues, PEOPLE } from './match.js';
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

/** Order restaurant ids best-first by tonight's score (fallback places judged by favorites). */
function rankIds(ids, ctx) {
  const c = { ...ctx, sessionRejected: [] };
  const sc = (id) => scoreRestaurant(ctx.restaurants.find((r) => r.id === id), c)?.score ?? -1;
  return [...ids].sort((a, b) => sc(b) - sc(a) || a.localeCompare(b));
}

const vote = (session, p) => {
  const v = session.votes?.[p];
  if (v) return v;
  const e = session.eliminations?.[p]; // older sessions
  return e ? { type: 'veto', id: e } : null;
};

/**
 * Resolve both private Final Three votes. Each person casts exactly ONE: a veto or a "really want".
 *  - Vetoes always win: nobody is sent somewhere they eliminated.
 *  - A surviving "really want" wins (two different ones → deterministic tiebreak between them).
 *  - Two vetoes on different places → the last one standing wins.
 *  - Same veto → deterministic tiebreak between the two survivors.
 * The backup is the best remaining non-vetoed candidate, else the best of the wider pool.
 */
export function resolveVotes(session, ctx, names = { A: 'A', B: 'B' }) {
  const { candidates, pool = [] } = session;
  const vs = PEOPLE.map((p) => vote(session, p));
  if (vs.some((v) => !v)) return null;
  const vetoed = [...new Set(vs.filter((v) => v.type === 'veto').map((v) => v.id))];
  const wantedAll = vs.filter((v) => v.type === 'want').map((v) => v.id);
  const wanted = [...new Set(wantedAll.filter((id) => !vetoed.includes(id)))];
  const alive = candidates.filter((id) => !vetoed.includes(id));
  const nm = (id) => ctx.restaurants.find((r) => r.id === id)?.name || id;
  const reasons = [];
  let winner;
  let tb = null;

  PEOPLE.forEach((p, i) => {
    const v = vs[i];
    if (v.type === 'want' && vetoed.includes(v.id)) reasons.push(`${names[p]} really wanted ${nm(v.id)}, but it got vetoed. Vetoes win. Sorry, babe.`);
  });

  if (wanted.length === 1) {
    winner = wanted[0];
    reasons.push(wantedAll.length === 2 && wantedAll[0] === wantedAll[1]
      ? `You BOTH really wanted ${nm(winner)}. Look at you two.`
      : `Somebody really wanted ${nm(winner)} and nobody vetoed it. Done.`);
  } else if (wanted.length === 2) {
    tb = tiebreak(rankIds(wanted, ctx), ctx);
    winner = tb.order[0];
    reasons.push(`You each really wanted a different place, so we broke the tie between ${nm(wanted[0])} and ${nm(wanted[1])}.`, ...tb.reasons);
  } else if (alive.length === 1) {
    winner = alive[0];
    reasons.push('You each vetoed a different place, so the last one standing wins. No tiebreaker needed.');
  } else {
    tb = tiebreak(rankIds(alive, ctx).slice(0, 2), ctx);
    winner = tb.order[0];
    reasons.push(...tb.reasons);
  }

  const rest = rankIds(alive.filter((id) => id !== winner), ctx);
  const backup = rest[0]
    || rankRestaurants({ ...ctx, sessionRejected: [...vetoed, winner] }).find((x) => pool.includes(x.id))?.id
    || null;
  const sameVote = vs.every((v) => v.type === 'veto') && vetoed.length === 1;
  return { winner, backup, sameVote, eliminated: vetoed, wanted: wantedAll, reasons };
}

/** Back-compat name. */
export const resolveEliminations = resolveVotes;

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
  const fav = rankRestaurants(c, { values: favoriteValues(ctx) });
  if (fav.length) return { id: fav[0].id, stage: 'favorites' };
  return { id: null, stage: 'none' };
}

export { CONFIG };
