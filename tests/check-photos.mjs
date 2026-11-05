// Verifies every food photo URL resolves to an image. Needs open internet (runs in CI).
import { existsSync } from 'node:fs';
import { FOODS, photoUrl } from '../js/data/foods.js';

const bad = [];
const pending = FOODS.filter((f) => !f.photo).map((f) => f.id);
await Promise.all(FOODS.filter((f) => f.photo).map(async (f) => {
  if (f.photo.startsWith('local:')) {
    if (!existsSync(new URL(`../${photoUrl(f)}`, import.meta.url))) bad.push(`${f.id} → missing local file ${photoUrl(f)}`);
    return;
  }
  try {
    const res = await fetch(photoUrl(f, 200), { method: 'GET' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) bad.push(`${f.id} → HTTP ${res.status} ${type}`);
  } catch (e) { bad.push(`${f.id} → ${e.message}`); }
}));
console.log(`${FOODS.length - pending.length - bad.length}/${FOODS.length - pending.length} food photos OK`);
if (pending.length) console.log(`No verified photo yet (text card shown): ${pending.join(', ')}`);
if (bad.length) { console.log('BROKEN:\n' + bad.join('\n')); process.exit(1); }
