// Vibes mix two separate things that the engine keeps apart internally:
//   atmosphere  — what kind of place (romantic, upscale, casual, home)
//   fulfillment — how the food reaches you (dinein, pickup, delivery)
// A combination of vibes is allowed only if their fulfillment options overlap.

export const VIBES = [
  { id: 'date', name: 'Make It a Date', line: 'Put on real clothes. We’re going out.', atmosphere: 'romantic', fulfillment: ['dinein'] },
  { id: 'fancy', name: 'Fancy AF', line: 'We’re pretending money isn’t real.', atmosphere: 'upscale', fulfillment: ['dinein'] },
  { id: 'casual', name: 'No Big Production', line: 'Good food. Low effort. Real pants optional.', atmosphere: 'casual', fulfillment: ['dinein', 'pickup'] },
  { id: 'couch', name: 'Couch Goblins', line: 'Sweatpants. TV. Zero human interaction.', atmosphere: 'home', fulfillment: ['pickup', 'delivery'] },
  { id: 'grab', name: 'I’ll Grab It', line: 'I’m already out. Just tell me what to get.', atmosphere: null, fulfillment: ['pickup'] },
  { id: 'deliver', name: 'Bring It to Me', line: 'Leave the food. Don’t make it weird.', atmosphere: 'home', fulfillment: ['delivery'] },
];

export const VIBE_BY_ID = Object.fromEntries(VIBES.map((v) => [v.id, v]));

export const METHOD_LABEL = {
  dinein: 'Dine in',
  pickup: 'Pickup',
  delivery: 'Delivery',
  either: 'Pickup or delivery',
};

/** Fulfillment methods allowed by every selected vibe (intersection). */
export function allowedMethods(vibeIds) {
  if (!vibeIds.length) return ['dinein', 'pickup', 'delivery'];
  return vibeIds
    .map((id) => VIBE_BY_ID[id].fulfillment)
    .reduce((acc, f) => acc.filter((m) => f.includes(m)));
}

/** Can `id` be added to the current selection without contradicting it? */
export function canAddVibe(selected, id) {
  if (selected.includes(id)) return { ok: true };
  if (selected.length >= 3) return { ok: false, why: 'Three vibes max. We’re picking dinner, not a personality.' };
  if (allowedMethods([...selected, id]).length === 0) {
    const clash = selected.find((s) => allowedMethods([s, id]).length === 0);
    return { ok: false, why: `${VIBE_BY_ID[id].name} and ${VIBE_BY_ID[clash].name} can’t both happen. Pick a lane.` };
  }
  return { ok: true };
}

/** Method choices to show in setup. 'either' is offered when both pickup and delivery remain. */
export function methodChoices(vibeIds) {
  const m = allowedMethods(vibeIds);
  const out = [...m];
  if (m.includes('pickup') && m.includes('delivery') && !m.includes('dinein')) out.push('either');
  return out;
}

/** Default method for a vibe selection. */
export function defaultMethod(vibeIds) {
  const m = allowedMethods(vibeIds);
  if (m.length === 1) return m[0];
  if (!m.includes('dinein') && m.includes('pickup') && m.includes('delivery')) return 'either';
  return m[0];
}

export function atmospheres(vibeIds) {
  return [...new Set(vibeIds.map((id) => VIBE_BY_ID[id].atmosphere).filter(Boolean))];
}
