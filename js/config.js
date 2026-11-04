// Tunable parameters. These are starting values from the spec, not proven-optimal weights.
export const CONFIG = {
  deckSize: 16,
  deckMix: { personal: 0.5, vibe: 0.3, discovery: 0.2 },
  partnerInfluence: 0.3, // share of a deck reserved for foods available at partner-compatible restaurants
  recentSessions: 3, // impression memory used to reduce repeats
  rankWeights: { food: 0.6, distance: 0.15, budget: 0.1, hours: 0.1, verification: 0.05 },
  // Tonight's answers
  answerValue: { really: 100, yes: 85, maybe: 55, no: -Infinity },
  // Saved profile when the person skipped (or left cards unanswered)
  profileValue: { love: 80, like: 60, neutral: 25, dislike: 4, never: -Infinity },
  // Saved profile for cards a person never saw after completing their swipes:
  // tonight's explicit answers should dominate, but unseen foods are not rejections.
  profileValueAfterSwipe: { love: 45, like: 32, neutral: 12, dislike: 2, never: -Infinity },
  qualifyThreshold: 30, // a person must have at least one dish scoring this high
  budgetSlack: 1.25, // restaurants above budget × slack are excluded
  verificationFactor: { dish: 1, category: 0.85, unverified: 0 },
};
