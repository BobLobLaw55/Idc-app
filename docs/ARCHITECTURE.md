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

Ranking weights: food 60, distance 15, budget 10, hours 10, verification 5. No ranking boost for having appetizers or a bar; drink preferences only count when someone asked for drinks (“With lube”). Small adjustments for styles (shared style bonus, upscale dishes when fancy is in play, healthy dishes when Hot & Healthy is), past ratings, favorites, and a penalty for very recent picks.

### Dish pairing (`pairDishes`)
Ranking uses each person's best dish. The dishes **shown** are then paired so you each get something different when you want similar things. The pairing maximizes the same weaker-match-first score, minus a penalty for the same exact item (−22) or the same food category (−12). Example: you both say wings + steak → wings for one, steak for the other. A dish whose food you both wanted (yes/really tonight, or a saved Love/Like when skipping) is tagged “You both wanted this”. A shareable starter is suggested as “Split this” when **both saved profiles** have it as Love/Like and nobody said “Nah” to it tonight. Tonight's swipes don't add starters, and the suggestion never affects the ranking. If a place has only one dish that works for both of you, it's shown once as “For both of you”. These overlaps appear only after both of you submit.

## What you're up for (styles)
Each partner privately picks **every** style they'd be happy with tonight: Dress to Impress, Just Us No Fuss, A Quickie, Hot & Healthy, I'll Pick You Up, Stay In Babe. Picks don't need to fit together.

A restaurant qualifies only with a **plan**: one method (dine-in / pickup / delivery) under which it satisfies at least one style from **each** person (`planFor`). The method is decided by the styles, so setup doesn't ask for it. Plans that hit a style you share rank higher than compromises. Style rules: fancy = upscale dine-in; casual = casual atmosphere (any method); quick = quick-service (dine-in or pickup); healthy = 2+ healthy dishes (any method); pickup/delivery = offers it. Each person's food cards follow only their own styles, so the partner's picks stay private until results.

**With lube 🍸** (first screen, private per person): if either of you picks it, sit-down plans must be at a place with a bar, ranked by each person's beer/wine/cocktail preference. Pickup and delivery plans ignore it. Each person's own cards only follow their own choice.

## What each person sees
- **The Final Three and details (private):** “What you picked that they have”, meaning only your own matches, plus your drinks and the styles you fit. The only shared signal shown is “♥ You’re both up for <style>”. No partner dishes, drinks, “both wanted” tags or split-this suggestions, because those could sway your veto.
- **Final screen (full reveal):** both dishes, “You both wanted this”, and “While you’re there”: appetizers you'll **both** like (both saved profiles Love/Like; a “Nah” tonight vetoes) and drinks, each shown **only if the place has them**.

## Tonight first, then favorites
- **Tonight tier:** if you swiped, a place qualifies only through something you answered Maybe, Hell Yes or Really Want. If you skipped, your saved profile *is* tonight.
- **Favorites tier:** if tonight finds fewer than three places, the remaining slots are filled from both saved profiles (Love/Like). Styles, blocks, allergies, budget and hours still apply, and tonight's "Nah"s still veto. Those tiles say “From your favorites”. Only if both tiers together find fewer than three do we show “Slim pickings”.

## Decisions (`js/engine/decide.js`)
Each person makes **one** private move on The Final Three: **Eliminate** one place *or* **Really want this!** on one place. Never both, and the confirm happens on the tile itself.
- **Vetoes always win:** nobody gets sent somewhere they eliminated, even if the other person really wanted it.
- **A surviving “really want” wins.** If you both really want the same place, it wins. Two different ones go to a deterministic tiebreak between just those two.
- **Two vetoes on different places:** the last one standing wins. **The same veto:** the two survivors are re-scored, and the stronger becomes primary, the other the backup.
- **Backup:** the best remaining non-vetoed candidate, else the best of the wider pool.
- **Replacement** (both approve): original backup → best match near the current pick → saved-favorites fallback → offer to widen the radius. Tonight's rejects are never repeated, and "closed/busy" is session-only.

## Phase plan
1. **Functional prototype (this version):** full two-person flow on one device or two tabs, with fictional data.
2. **Real two-user:** Supabase Auth + Postgres + Realtime. `supabase/schema.sql` drafts the tables and RLS: own-swipes-only, candidates hidden until everyone is ready, votes hidden until everyone has voted, and partner influence through a `SECURITY DEFINER` function that returns only aggregated food weights. Only the anon key ever ships to the browser. The engine modules are already pure, so they can run in the browser or move into an Edge Function unchanged. **Not deployed or tested yet.**
3. **Real restaurant data:** licensed directory (e.g. Foursquare Open Source Places / OSM), menu category mapping with verification levels and source records. No scraping or storing of restricted Google Places content.
4. **Production:** owner submissions, specials, photo licensing, broader regions.

## Photos
Food cards use Unsplash photos (Unsplash License) as generic, representative images of the category, and they're labeled that way. The card falls back to a designed gradient if an image can't load. `tests/check-photos.mjs` (in CI) verifies every URL.
