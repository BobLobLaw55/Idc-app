// Edge cases end-to-end: all-"Nah" deck → bonus favorites; 7am "zero matches" → stretch picks.
// Usage: node tests/e2e-edge.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3] || null;
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.clock.setFixedTime(new Date('2026-11-06T07:19:00')); // breakfast time: demo places are closed
const errors = [];
const A = await context.newPage();
A.on('pageerror', (e) => errors.push(e.message));
await A.goto(BASE);
await A.evaluate(() => localStorage.clear());
await A.reload();
const text = () => A.locator('main').innerText();
const state = () => A.evaluate(() => JSON.parse(localStorage.getItem('idc.v2.state')));
const shot = (n) => SHOTS && A.screenshot({ path: `${SHOTS}/${n}.png` });

await A.getByRole('button', { name: /I’m You/ }).click();
await A.getByRole('button', { name: /Dress to Impress/ }).click();
await A.getByRole('button', { name: /Keep going/ }).click();
await A.getByRole('button', { name: /Lock in the plan/ }).click();

// Plan for 7pm with no budget cap so the fancy deck has plenty to deal; switch back to 7am ASAP later.
await A.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('idc.v2.state'));
  s.session.settings.time = { kind: 'at', at: '19:00' };
  s.session.settings.budget = null;
  // favorites include foods the fancy deck won't deal (pizza, tacos, wings), so the bonus has something to offer
  s.profiles.A.prefs = { steak: 'love', pizza: 'love', tacos: 'love', wings: 'like', ramen: 'like', burger: 'like', sushi: 'never' };
  s.profiles.A.favoriteRestaurants = ['r13'];
  localStorage.setItem('idc.v2.state', JSON.stringify(s));
});
await A.reload();
await A.getByRole('button', { name: /Start swiping/ }).click();

await check('Nah to every card → up to 5 more cards from my favorites', async () => {
  const before = (await state()).session.rounds.A.deck.length;
  while ((await state()).session.rounds.A.bonus !== 1) {
    await A.locator('[data-act="answer"][data-arg="no"]').click();
  }
  const r = (await state()).session.rounds.A;
  const extra = r.deck.slice(before);
  assert.ok(extra.length >= 1 && extra.length <= 5, `extra ${extra.length}`);
  for (const id of extra) assert.notEqual(r.answers[id], 'no');
  assert.match(await text(), /Tough crowd/);
  await shot('edge-bonus');
  // the first bonus card is a saved Love I haven't turned down
  const loves = ['steak', 'pizza', 'tacos'].filter((f) => !r.answers[f]);
  if (loves.length) assert.ok(loves.includes(extra[0]), `first bonus ${extra[0]}`);
});

await A.locator('[data-act="answer"][data-arg="yes"]').click();
while (await A.locator('.card.top').count()) await A.locator('[data-act="answer"][data-arg="maybe"]').click();
await A.getByRole('button', { name: /Submit my cravings/ }).click();

// Partner: only up for delivery (impossible with Dress to Impress), skips. Back to ASAP at 7am.
await A.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('idc.v2.state'));
  s.session.settings.time = { kind: 'asap', at: '19:00' };
  s.session.vibes.B = ['delivery'];
  s.profiles.B.prefs = { burger: 'love', pizza: 'love', wings: 'like' };
  Object.assign(s.session.rounds.B, { status: 'ready', mode: 'skip' });
  localStorage.setItem('idc.v2.state', JSON.stringify(s));
});
await A.reload();

await check('Nothing matches → still three options: two stretch picks + a saved restaurant', async () => {
  await A.getByRole('button', { name: 'Where Are We Going?!' }).click();
  const t = await text();
  assert.ok(!/Zero matches/i.test(t));
  assert.equal(await A.locator('.venue').count(), 3);
  assert.match(t, /we stretched/i);
  assert.match(t, /Your saved spot/i);
  assert.match(t, /Closed at your time/i);
  await shot('edge-stretch');
});

await check('Final screen: what you picked that they have + Open in Maps', async () => {
  await A.locator('.venue').first().getByRole('button', { name: /^Really want / }).click();
  await A.locator('.venue').first().getByRole('button', { name: 'Yes, I really want it' }).click();
  await A.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('idc.v2.state'));
    s.session.votes.B = null;
    localStorage.setItem('idc.v2.state', JSON.stringify(s));
  });
  // partner votes from "their" phone
  await A.getByRole('button', { name: /Switch/ }).click();
  await A.getByRole('button', { name: /I’m Partner/ }).click();
  await A.locator('.venue').nth(1).getByRole('button', { name: /^Eliminate / }).click();
  await A.locator('.venue').nth(1).getByRole('button', { name: 'Yes, eliminate it' }).click();
  const t = await text();
  assert.match(t, /What you picked that they have/i);
  assert.ok(!/Why this one/i.test(t));
  const href = await A.locator('a.maps').getAttribute('href');
  assert.match(href, /maps\.apple\.com|google\.com\/maps/);
  await shot('edge-result');
});

await check('No uncaught page errors', async () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join(' | '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
