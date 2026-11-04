// Verifies every food photo URL resolves to an image. Needs open internet (runs in CI).
import { FOODS, photoUrl } from '../js/data/foods.js';

const bad = [];
await Promise.all(FOODS.map(async (f) => {
  try {
    const res = await fetch(photoUrl(f, 200), { method: 'GET' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) bad.push(`${f.id} → HTTP ${res.status} ${type}`);
  } catch (e) { bad.push(`${f.id} → ${e.message}`); }
}));
console.log(`${FOODS.length - bad.length}/${FOODS.length} food photos OK`);
if (bad.length) { console.log('BROKEN:\n' + bad.join('\n')); process.exit(1); }
