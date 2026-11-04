# idc. architecture

## Principles
- **Deterministic code decides.** Eligibility, ranking, eliminations, tiebreaks, backups and replacements are pure functions in `js/engine/`. No AI calls happen at decision time.
- **Never invent data.** Unverified menu items never qualify. Category-level evidence is labeled as such. If fewer than three places qualify, we show the real number.
- **Tonight beats forever.** Tonight's explicit "Nah" overrides a saved Love. Unanswered cards fall back to the profile; they never count as rejections.
- **Weaker match dominates.** Food score = 0.7 × min(A, B) + 0.3 × avg(A, B), so one person's great match can't hide the other having nothing.

## Card deck (`js/engine/deck.js`)
1. Pool = foods allowed for the person (not Never, no allergen conflict, diet OK) **and** on a verified menu at a place that passes tonight's non-food rules (method, radius, hours, budget, blocks).
2. If the partner has already submitted, ~30% of slots go to foods available at restaurants that satisfy the partner's cravings. They are filtered and weighted by *my* preferences, and dislikes are excluded.
3. The remaining slots split 50% personal / 30% vibe / 20% discovery, using weighted sampling with a seeded RNG.
4. Recency: impressions from the last 3 sessions reduce weight. Loves decay more slowly so favorites stay eligible. A disliked food can come back at most once per deck, and only if it hasn't been seen recently.
5. If the partner finishes mid-deck, only **unanswered** cards are re-dealt (`adaptRemaining`).

## Matching (`js/engine/match.js`)
Hard constraints: shared or personal blocks, rejected tonight, service method (delivery uses the delivery radius from the address), search radius, open at meal time (with a buffer before closing), budget × 1.25, and each person needs a qualifying dish (≥ 30).

Ranking weights: food 60, distance 15, budget 10, hours 10, verification 5. Small adjustments for vibe/atmosphere (Fancy AF boosts upscale places and dishes), past ratings, favorites, and a penalty for very recent picks.

## Decisions (`js/engine/decide.js`)
- **Different vetoes:** the remaining restaurant wins. The backup comes from the larger pool and never resurrects a veto.
- **Same veto:** the two survivors are re-scored and the stronger becomes primary, the other the backup. The factor differences are shown as the explanation.
- **Replacement** (both approve): original backup → best match near the current pick → saved-favorites fallback → offer to widen the radius. Tonight's rejects are never repeated, and "closed/busy" is session-only.

## Phase plan
1. **Functional prototype (this version):** full two-person flow on one device or two tabs, with fictional data.
2. **Real two-user:** Supabase Auth + Postgres + Realtime. `supabase/schema.sql` drafts the tables and RLS: own-swipes-only, candidates hidden until everyone is ready, votes hidden until everyone has voted, and partner influence through a `SECURITY DEFINER` function that returns only aggregated food weights. Only the anon key ever ships to the browser. The engine modules are already pure, so they can run in the browser or move into an Edge Function unchanged. **Not deployed or tested yet.**
3. **Real restaurant data:** licensed directory (e.g. Foursquare Open Source Places / OSM), menu category mapping with verification levels and source records. No scraping or storing of restricted Google Places content.
4. **Production:** owner submissions, specials, photo licensing, broader regions.

## Photos
Food cards use Unsplash photos (Unsplash License) as generic, representative images of the category, and they're labeled that way. The card falls back to a designed gradient if an image can't load. `tests/check-photos.mjs` (in CI) verifies every URL.
