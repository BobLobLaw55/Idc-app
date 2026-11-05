// Session actions: everything that changes shared state goes through here (UI stays dumb).
import { update, load } from './store.js';
import { RESTAURANTS, DEMO_REGION } from './data/restaurants.js';
import { buildDeck, partnerFoods, adaptRemaining } from './engine/deck.js';
import { finalThree, PEOPLE } from './engine/match.js';
import { resolveEliminations, findReplacement } from './engine/decide.js';
import { hashSeed } from './engine/rng.js';

export const other = (p) => (p === 'A' ? 'B' : 'A');

const emptyRound = () => ({ status: 'idle', mode: null, deck: [], buckets: {}, pos: 0, answers: {}, undo: [], adapted: false });

/** Engine context built from state. */
export function ctxOf(s, extra = {}) {
  return {
    restaurants: RESTAURANTS,
    profiles: s.profiles,
    rounds: s.session?.rounds || {},
    // Drinks rule applies if EITHER of you asked for it ("with lube").
    settings: s.session ? { ...s.session.settings, drinks: !!(s.session.lube?.A || s.session.lube?.B) } : undefined,
    vibes: s.session?.vibes || {},
    group: s.group,
    history: s.history,
    sessionRejected: s.session?.rejected || [],
    now: new Date(),
    ...extra,
  };
}

/** Context for building ONE person's card deck: only their own drinks choice applies. */
const deckCtx = (s, p) => ctxOf(s, { settings: { ...s.session.settings, drinks: !!s.session.lube?.[p] } });

export function startSession(me, vibes, lube = false) {
  return update((s) => {
    const prof = s.profiles[me];
    s.session = {
      id: `s${Date.now().toString(36)}`,
      seed: Math.floor(Math.random() * 2 ** 31),
      startedBy: me,
      createdAt: new Date().toISOString(),
      vibes: { A: [], B: [], [me]: [...vibes] }, // private per person: what each of you is up for
      lube: { A: false, B: false, [me]: !!lube }, // private per person: "with lube" = drinks are a must
      settings: {
        budget: prof.budget ?? 25,
        time: { kind: 'asap', at: '19:00' },
        radius: prof.radius ?? DEMO_REGION.radius,
        location: { name: prof.home || DEMO_REGION.name, lat: DEMO_REGION.lat, lng: DEMO_REGION.lng },
        deliveryAddress: null,
      },
      settingsRequest: null,
      rounds: { A: emptyRound(), B: emptyRound() },
      candidates: null, pool: [], total: 0,
      eliminations: { A: null, B: null },
      result: null,
      rejected: [],
      replacement: null,
      replacementLog: [],
      feedback: {},
    };
  });
}

/** Re-deal unanswered cards so they respect new rules; answered cards stay. */
function resettle(s, people = PEOPLE) {
  const st = s.session.settings;
  for (const p of people) {
    const r = s.session.rounds[p];
    if (!r.deck.length || r.status === 'ready') continue;
    const keep = r.deck.slice(0, r.pos);
    const { deck, buckets } = buildDeck(deckCtx(s, p), p, { seed: hashSeed(s.session.seed, p, 'resettle', JSON.stringify(st), String(s.session.vibes[p])) });
    const fresh = deck.filter((id) => !keep.includes(id)).slice(0, r.deck.length - keep.length);
    r.deck = [...keep, ...fresh];
    r.buckets = { ...buckets, ...r.buckets };
  }
}

function applySettings(s, patch) {
  Object.assign(s.session.settings, patch);
  s.session.candidates = null;
  resettle(s);
}

export function setSettings(me, patch) {
  return update((s) => {
    if (!s.session || s.session.candidates) return;
    if (s.session.startedBy === me) applySettings(s, patch);
  });
}

/** "With lube": I want drinks. Sit-down places then need a bar. */
export function setLube(me, on) {
  return update((s) => {
    const ses = s.session;
    if (!ses || ses.result) return;
    ses.lube[me] = !!on;
    if (ses.candidates) { ses.candidates = null; ses.eliminations = { A: null, B: null }; }
  });
}

/** Each person sets their OWN styles. Editable until a decision is made. */
export function setVibes(me, vibes) {
  return update((s) => {
    const ses = s.session;
    if (!ses || ses.result || !vibes.length) return;
    ses.vibes[me] = [...vibes];
    if (ses.candidates) { ses.candidates = null; ses.eliminations = { A: null, B: null }; }
    resettle(s, [me]);
  });
}

export function requestSettings(me, changes, note) {
  return update((s) => { if (s.session) s.session.settingsRequest = { from: me, changes, note }; });
}

export function answerSettingsRequest(me, approve) {
  return update((s) => {
    const req = s.session?.settingsRequest;
    if (!req || req.from === me) return;
    if (approve) {
      const wasGenerated = !!s.session.candidates;
      applySettings(s, req.changes);
      if (wasGenerated) { s.session.eliminations = { A: null, B: null }; s.session.result = null; }
    }
    s.session.settingsRequest = null;
  });
}

/** Broaden after too few matches: starter applies directly; partner sends a request. */
export function broaden(me, changes) {
  const s = load();
  if (s.session.startedBy === me) return update((st) => { applySettings(st, changes); st.session.eliminations = { A: null, B: null }; st.session.result = null; });
  return requestSettings(me, changes, 'Broaden the search');
}

/** Build my deck (once). Uses partner-aware influence if the partner already submitted. */
export function beginSwiping(me) {
  return update((s) => {
    const r = s.session.rounds[me];
    if (r.status === 'ready') return;
    if (!r.deck.length) {
      const ctx = ctxOf(s);
      const partnerReady = s.session.rounds[other(me)].status === 'ready';
      const partnerMap = partnerReady ? partnerFoods(ctx, other(me), me) : null;
      const out = buildDeck(deckCtx(s, me), me, { seed: hashSeed(s.session.seed, me), partnerMap });
      Object.assign(r, out, { adapted: !!partnerMap });
    }
    if (r.status === 'idle') r.status = 'swiping';
  });
}

/** Partner finished while I'm mid-deck → adapt my unanswered cards once. */
export function maybeAdapt(me) {
  const s = load();
  const r = s.session?.rounds?.[me];
  if (!r || r.status !== 'swiping' || r.adapted || s.session.rounds[other(me)].status !== 'ready') return false;
  update((st) => {
    const ctx = ctxOf(st);
    const rr = st.session.rounds[me];
    st.session.rounds[me] = adaptRemaining(rr, ctx, me, partnerFoods(ctx, other(me), me), hashSeed(st.session.seed, me, 'adapt'));
  });
  return true;
}

const nextUnanswered = (r, from) => {
  for (let i = from; i < r.deck.length; i++) if (!r.answers[r.deck[i]]) return i;
  return r.deck.length;
};

export function answer(me, value) {
  return update((s) => {
    const r = s.session.rounds[me];
    if (r.status === 'ready' || r.pos >= r.deck.length) return;
    const id = r.deck[r.pos];
    r.undo.push({ id, prev: r.answers[id] ?? null, pos: r.pos });
    r.answers[id] = value;
    r.pos = nextUnanswered(r, r.pos + 1);
  });
}

/** Change an answer from the review list (also undoable). */
export function setAnswer(me, id, value) {
  return update((s) => {
    const r = s.session.rounds[me];
    if (r.status === 'ready') return;
    r.undo.push({ id, prev: r.answers[id] ?? null, pos: r.pos });
    r.answers[id] = value;
  });
}

export function undo(me) {
  return update((s) => {
    const r = s.session.rounds[me];
    if (r.status === 'ready') return;
    const last = r.undo.pop();
    if (!last) return;
    if (last.prev == null) delete r.answers[last.id];
    else r.answers[last.id] = last.prev;
    r.pos = last.pos;
  });
}

/** Submit. skip=true is "idc. You Know Me." — answers so far are preserved. */
export function submit(me, skip) {
  return update((s) => {
    const r = s.session.rounds[me];
    r.mode = skip || r.pos < r.deck.length ? 'skip' : 'swipe';
    r.status = 'ready';
    const shown = r.deck.filter((id) => r.answers[id]);
    if (shown.length) {
      s.history.impressions[me] = [...(s.history.impressions[me] || []), shown].slice(-10);
    }
  });
}

/** Re-open my picks for editing (only before the Final Three is generated). */
export function unlock(me) {
  return update((s) => {
    if (s.session.candidates) return;
    const r = s.session.rounds[me];
    r.status = r.deck.length ? 'swiping' : 'idle';
    r.mode = null;
  });
}

export function generate() {
  return update((s) => {
    const ses = s.session;
    if (!ses || ses.candidates || !PEOPLE.every((p) => ses.rounds[p].status === 'ready')) return;
    const f = finalThree(ctxOf(s));
    ses.candidates = f.candidates;
    ses.pool = f.pool;
    ses.total = f.total;
    if (f.total > 0 && f.total < 3) ses.short = true;
  });
}

/** With fewer than three real matches, the couple can accept what exists. */
export function acceptShortList() {
  return update((s) => {
    const ses = s.session;
    if (!ses.candidates?.length || ses.result) return;
    const [winner, backup = null] = ses.candidates;
    ses.result = { winner, backup, sameVote: false, eliminated: [], short: true, reasons: [ses.candidates.length === 1 ? 'Only one place fits everything tonight. Easiest decision you’ll make all week.' : 'Only two places fit. We took the stronger match and kept the other as backup.'] };
    s.history.decisions.push({ restaurantId: winner, at: new Date().toISOString() });
  });
}

export function eliminate(me, rid) {
  return update((s) => {
    const ses = s.session;
    if (!ses.candidates?.includes(rid) || ses.eliminations[me] || ses.result) return; // exactly once
    ses.eliminations[me] = rid;
    if (PEOPLE.every((p) => ses.eliminations[p])) {
      ses.result = resolveEliminations(ses, ctxOf(s));
      ses.rejected = [...new Set([...ses.rejected, ...ses.result.eliminated])];
      s.history.decisions.push({ restaurantId: ses.result.winner, at: new Date().toISOString() });
    }
  });
}

export function requestReplacement(me, reason) {
  return update((s) => {
    if (!s.session.result) return;
    s.session.replacement = { from: me, reason, approvals: { [me]: true, [other(me)]: false } };
  });
}

export function respondReplacement(me, approve) {
  return update((s) => {
    const ses = s.session;
    const rq = ses.replacement;
    if (!rq) return;
    if (!approve) { ses.replacement = null; return; }
    rq.approvals[me] = true;
    if (!PEOPLE.every((p) => rq.approvals[p])) return;
    const current = ses.result.winner;
    const found = findReplacement(ctxOf(s), { current, backup: ses.result.backup, rejected: ses.rejected });
    ses.replacementLog.push({ from: current, reason: rq.reason, to: found.id, stage: found.stage });
    ses.replacement = null;
    if (!found.id) { ses.result.noReplacement = true; return; }
    ses.rejected = [...new Set([...ses.rejected, current])]; // tonight only — not a permanent exclusion
    const nextBackup = findReplacement({ ...ctxOf(s), sessionRejected: ses.rejected }, { current: found.id, backup: null, rejected: ses.rejected });
    ses.result = { ...ses.result, winner: found.id, backup: nextBackup.id, replaced: found.stage, noReplacement: false, reasons: [replacementReason(found.stage, rq.reason)] };
    s.history.decisions.push({ restaurantId: found.id, at: new Date().toISOString(), replacement: true });
  });
}

function replacementReason(stage, reason) {
  const why = { busy: 'too busy', closed: 'closed', changed: 'a change of heart', other: 'reasons' }[reason] || 'reasons';
  return {
    backup: `Swapped to tonight’s backup after the first pick was ${why === 'reasons' ? 'vetoed' : why}.`,
    nearby: `Backup was gone too, so we picked the best remaining match close to where you were headed.`,
    favorites: `Nothing matched tonight’s cravings, so we leaned on your saved favorites.`,
  }[stage];
}

export function widenAfterNoReplacement(me) {
  const s = load();
  return broaden(me, { radius: Math.min(60, s.session.settings.radius + 15) });
}

export function feedback(me, data) {
  return update((s) => {
    const ses = s.session;
    ses.feedback[me] = { ...(ses.feedback[me] || {}), ...data };
    const rid = ses.result?.winner;
    if (!rid) return;
    s.history.visits = s.history.visits.filter((v) => !(v.sessionId === ses.id && v.by === me));
    s.history.visits.push({ sessionId: ses.id, by: me, restaurantId: rid, went: !!ses.feedback[me].went, rating: ses.feedback[me].rating || null });
  });
}

export function endSession() {
  return update((s) => { s.session = null; });
}

// ── Profile + exclusions
export function setProfile(me, patch) {
  return update((s) => Object.assign(s.profiles[me], patch));
}
export function setPref(me, foodId, level) {
  return update((s) => {
    if (level === 'neutral') delete s.profiles[me].prefs[foodId];
    else s.profiles[me].prefs[foodId] = level;
  });
}
export function toggleList(me, key, rid) {
  return update((s) => {
    const list = s.profiles[me][key] || (s.profiles[me][key] = []);
    const i = list.indexOf(rid);
    i >= 0 ? list.splice(i, 1) : list.push(rid);
  });
}
/** Shared exclusions need separate approval from both partners. */
export function proposeSharedBlock(me, rid) {
  return update((s) => {
    if (s.group.sharedExclusions.includes(rid)) return;
    const p = s.group.pendingExclusions[rid] || { A: false, B: false };
    p[me] = true;
    if (p.A && p.B) {
      s.group.sharedExclusions.push(rid);
      delete s.group.pendingExclusions[rid];
    } else s.group.pendingExclusions[rid] = p;
  });
}
export function declineSharedBlock(rid) {
  return update((s) => { delete s.group.pendingExclusions[rid]; });
}
export function removeSharedBlock(rid) {
  return update((s) => { s.group.sharedExclusions = s.group.sharedExclusions.filter((x) => x !== rid); });
}
