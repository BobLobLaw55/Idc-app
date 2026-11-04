# idc.

**You pick the food. We pick the place.**

A two-person dinner decider. Each person swipes on foods (or taps **idc. You Know Me.** to use their saved profile), the app finds restaurants with something for *both* of you, shows **The Final Three**, you each veto one in private, and the app picks where you’re eating.

**Live:** https://bobloblaw55.github.io/Idc-app/

> ⚠️ **Demo data.** Every restaurant, menu, price and hour in this version is fictional (around Alachua, FL). Nothing here describes a real business.

## Try the two-person flow

- **One phone:** pick who you are, play your turn, then tap **⇄ Switch** to hand it over. The screen is hidden during the hand-off.
- **Two windows on one device:** open the site in two tabs or windows and pick a different person in each. They sync live.
- **Two separate phones:** not supported yet. That needs accounts and a backend (Phase 2).

## Status: what's built vs. planned

| Area | Status |
|---|---|
| 1–3 compatible vibes; atmosphere kept separate from pickup/delivery | ✅ Built |
| No pickup/delivery prompts for dine-in-only vibes | ✅ Built |
| Session setup: method, budget presets + custom, time, radius, area | ✅ Built |
| Partner requests settings changes instead of silently overriding them | ✅ Built |
| 72 food categories with photo cards (Unsplash), randomized decks | ✅ Built |
| Deck mix 50% personal / 30% vibe / 20% discovery, with fewer repeats across sessions | ✅ Built |
| Partner-aware cards (~30%), applied privately | ✅ Built |
| Swipe gestures, tap buttons, keyboard; Undo; Back on every screen | ✅ Built |
| Skip ("idc. You Know Me.") at the start and midway; hidden once every card is answered | ✅ Built |
| Love/Like/Neutral/Dislike/Never; allergies stored separately; vegetarian | ✅ Built |
| Personal and shared restaurant blocks (shared needs both partners) | ✅ Built |
| Matching: hard constraints, 60/15/10/10/5 ranking, weaker match counts most | ✅ Built |
| The Final Three, private vetoes, deterministic tiebreak, backup | ✅ Built |
| Replacement (both approve, never repeats tonight's rejects) | ✅ Built |
| Visit feedback and history-aware ranking | ✅ Built (basic) |
| Sync between two tabs on one device | ✅ Built (localStorage) |
| Accounts, partner linking, cross-device realtime sync | 🟡 Planned. Schema drafted in `supabase/schema.sql`, not deployed |
| Server-enforced privacy (RLS) | 🟡 Drafted, not deployed or tested |
| Real restaurant/menu data (licensed sources) | ⏳ Phase 3 |
| Location search, "on my way home" pickup routing, live delivery coverage | ⏳ Planned |

**Privacy, honestly:** the UI never shows your partner's swipes or veto before the reveal. In Phase 1, though, all data lives in one browser's local storage, so anyone with developer tools could read it. Real enforcement needs the Phase 2 backend.

## Project layout

```
index.html            app shell (GitHub Pages serves main/ directly, no build step)
css/app.css           mobile-first dark UI
js/app.js             screens, routing, gestures
js/session.js         every state-changing action
js/store.js           localStorage + cross-tab sync
js/config.js          tunable weights (deck mix, ranking weights, thresholds)
js/data/              foods, vibes, fictional demo restaurants
js/engine/            deterministic logic: deck.js, match.js, decide.js, prefs.js, rng.js
tests/                unit acceptance tests + two-tab Playwright e2e + photo URL check
supabase/schema.sql   Phase 2 database + row-level security (draft)
docs/ARCHITECTURE.md  design notes and roadmap
```

## Tests

```bash
node --test tests/*.test.mjs                   # engine acceptance tests
python3 -m http.server 8765 &                  # serve locally
node tests/e2e.mjs http://localhost:8765/      # two-tab end-to-end (needs playwright)
node tests/check-photos.mjs                    # every food photo URL resolves (needs internet)
```

CI (`.github/workflows/verify.yml`) runs all three on every push, then runs the e2e suite again against the live GitHub Pages site after each deploy.
