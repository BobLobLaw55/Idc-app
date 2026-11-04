// Phase 1 storage: one shared state in localStorage + per-tab identity in sessionStorage.
// Two browser tabs/windows on the same device each act as one partner and stay in sync via the
// `storage` event. Real cross-device sync + server-enforced privacy is Phase 2 (see supabase/).
//
// Privacy note: in this local demo everything lives in one browser's storage, so a determined person
// with dev tools could read it. The UI never renders a partner's answers or votes; real enforcement
// requires the backend row-level security in supabase/schema.sql.

const KEY = 'idc.v2.state';
const SEAT = 'idc.v2.seat';
const listeners = new Set();

export const DEFAULT_PROFILES = {
  A: {
    name: 'You', prefs: { wings: 'love', steak: 'like', burger: 'like', sushi: 'never' },
    allergies: [], diet: 'none', excludedRestaurants: [], favoriteRestaurants: [],
    home: 'Alachua, FL', radius: 25, budget: 25,
  },
  B: {
    name: 'Partner', prefs: { pizza: 'love', alfredo: 'love', burger: 'like', sushi: 'dislike' },
    allergies: [], diet: 'none', excludedRestaurants: [], favoriteRestaurants: [],
    home: 'Alachua, FL', radius: 25, budget: 25,
  },
};

export function freshState() {
  return {
    version: 2,
    profiles: structuredClone(DEFAULT_PROFILES),
    group: { sharedExclusions: [], pendingExclusions: {} },
    history: { impressions: { A: [], B: [] }, decisions: [], visits: [] },
    session: null,
  };
}

let memory = null; // fallback when storage is blocked (private mode etc.)

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.version === 2) return s;
    }
  } catch { /* fall through */ }
  return memory ? structuredClone(memory) : freshState();
}

function write(s) {
  memory = structuredClone(s);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* memory only */ }
}

/** Read-modify-write against the latest stored state so two tabs don't clobber each other. */
export function update(fn) {
  const s = load();
  fn(s);
  write(s);
  listeners.forEach((l) => l(s, 'local'));
  return s;
}

export function reset() {
  write(freshState());
  listeners.forEach((l) => l(load(), 'local'));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) listeners.forEach((l) => l(load(), 'remote'));
  });
}

export function getSeat() {
  try { return sessionStorage.getItem(SEAT); } catch { return null; }
}
export function setSeat(p) {
  try { p ? sessionStorage.setItem(SEAT, p) : sessionStorage.removeItem(SEAT); } catch { /* ignore */ }
}
