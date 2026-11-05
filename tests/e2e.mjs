// Two-partner end-to-end test: two tabs in one browser = two partners (Phase 1 local sync).
// Usage: node tests/e2e.mjs [baseUrl] [screenshotDir]
//   baseUrl defaults to http://localhost:8765/ (python3 -m http.server 8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // local or global (NODE_PATH) install
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3] || null;
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.clock.setFixedTime(new Date('2026-11-04T18:30:00')); // dinner time, so demo places are open
const errors = [];
const open = async () => {
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE);
  return p;
};
const shot = async (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });
const text = (p) => p.locator('main').innerText();
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('idc.v2.state')));

const A = await open();
await A.evaluate(() => localStorage.clear());
await A.reload();
await shot(A, '01-seat');
await A.getByRole('button', { name: /I’m You/ }).click();

await check('Vibes: up to 3 compatible, contradictory blocked', async () => {
  await A.getByRole('button', { name: /Dress to Impress/ }).click();
  await A.getByRole('button', { name: /Stay In, Babe/ }).click();
  assert.match(await A.locator('#toast').innerText(), /can’t both happen/);
  await A.getByRole('button', { name: /Dress to Impress/ }).click(); // deselect
  await A.getByRole('button', { name: /Just Us, No Fuss/ }).click();
  await A.getByRole('button', { name: /Stay In, Babe/ }).click();
  await A.getByRole('button', { name: /Hot & Healthy/ }).click();
  assert.equal(await A.locator('.choice[aria-pressed="true"]').count(), 3);
  await A.getByRole('button', { name: /Hot & Healthy/ }).click();
  await shot(A, '02-vibes');
});

await A.getByRole('button', { name: /Keep going/ }).click();

await check('Setup: no dine-in option for Stay In + Just Us (delivery only)', async () => {
  const t = await text(A);
  assert.ok(!/Dine in/.test(t.split('Budget per person')[0]), 'dine-in should not be offered');
  assert.match(t, /Delivery/);
});

await check('Back from setup → vibes preserves selection', async () => {
  await A.getByRole('button', { name: '← Back', exact: true }).click();
  assert.equal(await A.locator('.choice[aria-pressed="true"]').count(), 2);
  await A.getByRole('button', { name: /Next: ground rules/ }).click();
});
await A.getByRole('button', { name: '$25' }).click();
await shot(A, '03-setup');
await A.getByRole('button', { name: /Lock in the plan/ }).click();

// Partner opens a second tab.
const B = await open();
await B.getByRole('button', { name: /I’m Partner/ }).click();
await check('Partner tab joins the same session', async () => {
  assert.match(await text(B), /Make your move/);
  assert.match(await text(B), /Waiting for partner|Not started/);
});

await A.getByRole('button', { name: /Start swiping/ }).click();
await shot(A, '04-swipe');

await check('Test 7: Undo restores the exact card', async () => {
  const first = await A.locator('.card.top .name').innerText();
  await A.getByRole('button', { name: 'Nah' }).click();
  const second = await A.locator('.card.top .name').innerText();
  assert.notEqual(first, second);
  await A.getByRole('button', { name: /Undo/ }).click();
  assert.equal(await A.locator('.card.top .name').innerText(), first);
  const s = await state(A);
  assert.equal(s.session.rounds.A.answers[s.session.rounds.A.deck[0]], undefined);
});

await check('Partner sees progress, not picks', async () => {
  await A.getByRole('button', { name: 'Hell Yes' }).click();
  await B.waitForTimeout(150);
  assert.match(await text(B), /You is choosing/);
  const s = await state(A);
  const aYes = Object.keys(s.session.rounds.A.answers);
  const bText = await text(B);
  assert.ok(!/Hell Yes|Really Want This/.test(bText));
  assert.ok(aYes.length === 1);
});

await check('Swipe gesture (drag right) answers Yes', async () => {
  const box = await A.locator('.card.top').boundingBox();
  const before = (await state(A)).session.rounds.A.pos;
  await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await A.mouse.down();
  await A.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
  await A.mouse.up();
  await A.waitForTimeout(400);
  const s = await state(A);
  assert.equal(s.session.rounds.A.pos, before + 1);
  assert.equal(s.session.rounds.A.answers[s.session.rounds.A.deck[before]], 'yes');
});

await check('Test 6: after every card, no skip offer + completion copy', async () => {
  const pattern = ['yes', 'no', 'maybe', 'yes', 'no'];
  let i = 0;
  while (await A.locator('.card.top').count()) {
    const v = pattern[i++ % pattern.length];
    await A.locator(`[data-act="answer"][data-arg="${v}"]`).click();
  }
  const t = await text(A);
  assert.match(t, /Cravings locked in\. Your work here is done\./);
  assert.ok(!/idc\. You Know Me|Skip the rest|remaining/.test(t));
  await shot(A, '05-done');
});

await check('Review & edit own picks before submitting', async () => {
  await A.getByRole('button', { name: 'Review picks' }).click();
  const sel = A.locator('select[data-change="review"]').first();
  await sel.selectOption('really');
  const s = await state(A);
  assert.equal(s.session.rounds.A.answers[s.session.rounds.A.deck[0]], 'really');
  await A.getByRole('button', { name: /Back to swiping/ }).click();
});
await A.getByRole('button', { name: /Submit my cravings/ }).click();

await check('Results hidden until both are ready', async () => {
  assert.equal(await A.getByRole('button', { name: 'Where Are We Going?!' }).count(), 0);
  assert.match(await text(A), /Your better half is still deciding/);
});

await check('Partner-aware: B’s deck adapted after A finished', async () => {
  await B.getByRole('button', { name: /Start swiping/ }).click();
  const s = await state(B);
  assert.equal(s.session.rounds.B.adapted, true);
  const partnerCards = Object.values(s.session.rounds.B.buckets).filter((x) => x === 'partner').length;
  assert.ok(partnerCards >= 1 && partnerCards <= Math.ceil(s.session.rounds.B.deck.length * 0.3) + 1, `partner cards ${partnerCards}`);
});

await check('Test 5: skip midway preserves answers', async () => {
  await B.getByRole('button', { name: 'Maybe' }).click();
  await B.getByRole('button', { name: 'idc. You Know Me.' }).click();
  const s = await state(B);
  assert.equal(s.session.rounds.B.status, 'ready');
  assert.equal(s.session.rounds.B.mode, 'skip');
  assert.equal(Object.keys(s.session.rounds.B.answers).length, 1);
});

let names;
await check('Test 14 (two tabs): both see the same Final Three', async () => {
  await A.waitForTimeout(200);
  await A.getByRole('button', { name: 'Where Are We Going?!' }).click();
  await B.getByRole('button', { name: 'Where Are We Going?!' }).click();
  const nA = await A.locator('.venue h3').allInnerTexts();
  const nB = await B.locator('.venue h3').allInnerTexts();
  assert.equal(nA.length, 3);
  assert.deepEqual(nA, nB);
  names = nA;
  await shot(A, '06-final-three');
});

await check('Back to details and back to The Final Three', async () => {
  await A.getByRole('button', { name: 'Details' }).first().click();
  assert.match(await text(A), /Menu \(demo\)/);
  await shot(A, '07-details');
  await A.getByRole('button', { name: '← Back', exact: true }).click();
  assert.match(await text(A), /The Final Three/);
});

await check('Votes private + Test 9: different vetoes → third wins', async () => {
  await A.getByRole('button', { name: `Eliminate ${names[0]}` }).click();
  assert.match(await text(A), /Once you submit, it’s locked/);
  await A.getByRole('button', { name: 'Yes, veto it' }).click();
  await B.waitForTimeout(150);
  const bT = await text(B);
  assert.ok(!/veto is locked/.test(bT), 'B must not see A’s veto');
  assert.equal(await B.locator('.venue.vetoed').count(), 0);
  await B.getByRole('button', { name: `Eliminate ${names[1]}` }).click();
  await B.getByRole('button', { name: 'Yes, veto it' }).click();
  await A.waitForTimeout(300);
  assert.equal(await A.locator('.winner h1').innerText(), names[2]);
  assert.equal(await B.locator('.winner h1').innerText(), names[2]);
  const s = await state(A);
  assert.equal(s.history.decisions.length, 1, 'decision recorded exactly once');
  await shot(A, '08-result');
});

await check('Votes are exactly-once (no re-vote after submit)', async () => {
  const s = await state(A);
  assert.equal(s.session.eliminations.A, s.session.candidates[0]);
  assert.equal(await A.locator('[data-act="veto"]').count(), 0);
});

await check('Test 12: replacement needs both approvals and avoids rejected places', async () => {
  await A.locator('#why').selectOption('closed');
  await A.getByRole('button', { name: 'Offer a Replacement' }).click();
  assert.match(await text(A), /Waiting for Partner to approve/);
  await B.waitForTimeout(150);
  await B.getByRole('button', { name: 'Approve' }).click();
  await A.waitForTimeout(200);
  const w = await A.locator('.winner h1').innerText();
  assert.ok(!names.includes(w), `replacement ${w} should not be a rejected/previous pick`);
});

await check('Test 15 (local): profile changes and session persist after reload', async () => {
  await A.getByRole('button', { name: 'My profile' }).click();
  await A.locator('details.group').first().evaluate((d) => (d.open = true));
  await A.locator('select[aria-label="Burgers preference"]').selectOption('never');
  await A.reload();
  const s = await state(A);
  assert.equal(s.profiles.A.prefs.burger, 'never');
  assert.equal(await A.locator('select[aria-label="Burgers preference"]').inputValue(), 'never');
});

await check('Shared block requires both partners', async () => {
  await A.locator('#propose').selectOption({ label: names[0] });
  let s = await state(A);
  assert.ok(!s.group.sharedExclusions.length);
  await B.getByRole('button', { name: 'My profile' }).click();
  await B.getByRole('button', { name: 'Agree' }).click();
  s = await state(A);
  assert.equal(s.group.sharedExclusions.length, 1);
});

await check('Pass-the-phone handoff hides the screen', async () => {
  await A.getByRole('button', { name: /Switch/ }).click();
  assert.equal(await A.locator('main').count(), 0);
  assert.match(await A.innerText('body'), /Pass it to Partner/);
});

await check('No uncaught page errors', async () => assert.deepEqual(errors, []));

await browser.close();
for (const r of results) console.log(r.join(' | '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
