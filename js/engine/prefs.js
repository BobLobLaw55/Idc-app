// Person-level food logic: hard food exclusions and how much someone wants a food tonight.
import { FOOD_BY_ID } from '../data/foods.js';
import { CONFIG } from '../config.js';

export const LEVELS = ['love', 'like', 'neutral', 'dislike', 'never'];

export const prefOf = (profile, foodId) => profile.prefs?.[foodId] || 'neutral';

/** Hard food rules for one person: Never, allergies, vegetarian. */
export function foodAllowed(profile, foodId) {
  const food = FOOD_BY_ID[foodId];
  if (!food) return false;
  if (prefOf(profile, foodId) === 'never') return false;
  if ((profile.allergies || []).some((a) => food.allergens.includes(a))) return false;
  if (profile.diet === 'vegetarian' && !food.veg) return false;
  return true;
}

/** Can this specific menu item be one person's dish? All of its food components must be allowed. */
export function itemAllowed(profile, item) {
  if (item.verification === 'unverified') return false;
  if (profile.diet === 'vegetarian' && !item.veg) return false;
  return item.foods.every((f) => foodAllowed(profile, f));
}

/**
 * Returns value(foodId) → number for tonight.
 *  - Tonight's explicit answer always wins (a "no" tonight beats a permanent favorite).
 *  - Unanswered foods fall back to the saved profile; they are NOT treated as rejections.
 */
export function valueFn(profile, round) {
  const answers = round?.answers || {};
  const table = round?.mode === 'swipe' ? CONFIG.profileValueAfterSwipe : CONFIG.profileValue;
  return (foodId) => {
    if (!foodAllowed(profile, foodId)) return -Infinity;
    const a = answers[foodId];
    if (a) return CONFIG.answerValue[a];
    return table[prefOf(profile, foodId)];
  };
}

/** Value of a menu item for a person (0 if not allowed / nothing they want). */
export function itemValue(profile, value, item) {
  if (!itemAllowed(profile, item)) return -Infinity;
  const vals = item.foods.map(value);
  if (vals.some((v) => v === -Infinity)) return -Infinity; // e.g. said "no" to shrimp tonight → no shrimp lo mein
  return Math.max(...vals) * CONFIG.verificationFactor[item.verification];
}

/** Foods this person is clearly craving tonight (private; used only for partner-aware cards). */
export function cravings(profile, round) {
  const answers = round?.answers || {};
  const strong = Object.entries(answers).filter(([, a]) => a === 'yes' || a === 'really').map(([id]) => id);
  if (strong.length) return strong;
  // Skipped (or said no to everything): use permanent favorites.
  return Object.entries(profile.prefs || {})
    .filter(([id, lvl]) => (lvl === 'love' || lvl === 'like') && answers[id] !== 'no' && foodAllowed(profile, id))
    .map(([id]) => id);
}
