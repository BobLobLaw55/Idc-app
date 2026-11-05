import { load, subscribe, getSeat, setSeat, reset } from './store.js';
import * as S from './session.js';
import { other, ctxOf } from './session.js';
import { VIBES, METHOD_LABEL, vibeNames } from './data/vibes.js';
import { FOODS, FOOD_BY_ID, GROUPS, ALLERGENS, photoUrl, foodName } from './data/foods.js';
import { RESTAURANTS, RESTAURANT_BY_ID } from './data/restaurants.js';
import { scoreRestaurant, pickLabel, distanceMiles, DRINKS, personalMatches, appetizerOptions, drinkMatch } from './engine/match.js';
import { LEVELS, prefOf } from './engine/prefs.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
let state = load();
let me = getSeat();
const ui = { vibeDraft: [], lubeDraft: false, vote: null, handoff: false, reqDraft: null, lastRoute: null, reason: 'busy' };

// ───────────────────────── helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nameOf = (p) => esc(state.profiles[p].name || (p === 'A' ? 'Person A' : 'Person B'));
const btn = (label, act, { cls = '', arg = '', dis = false, aria = '' } = {}) =>
  `<button type="button" class="btn ${cls}" data-act="${act}" data-arg="${esc(arg)}" ${dis ? 'disabled' : ''} ${aria ? `aria-label="${esc(aria)}"` : ''}>${label}</button>`;
const chip = (label, act, arg, on) => `<button type="button" class="chip" data-act="${act}" data-arg="${esc(arg)}" aria-pressed="${!!on}">${label}</button>`;
const ses = () => state.session;
const myRound = () => ses()?.rounds?.[me];
const myVibes = () => (ses() ? ses().vibes[me] || [] : ui.vibeDraft);
const myLube = () => (ses() ? !!ses().lube?.[me] : ui.lubeDraft);
const money = (n) => (n ? `$${n}` : 'No limit');
const fmtHour = (h) => { const hh = Math.floor(h % 24), mm = Math.round((h % 1) * 60); const ap = hh >= 12 ? 'pm' : 'am'; return `${((hh + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ap}`; };

export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ───────────────────────── routing
let route = (() => { try { return sessionStorage.getItem('idc.v2.route'); } catch { return null; } })() || null;

function defaultRoute() {
  if (!me) return 'seat';
  const s = ses();
  if (!s) return 'vibes';
  if (s.result) return 'result';
  if (!myVibes().length) return 'vibes';
  if (s.candidates) return 'final';
  if (myRound()?.status === 'swiping') return 'swipe';
  return 'lobby';
}

function validRoute(r) {
  if (!r) return false;
  if (!me) return r === 'seat';
  const s = ses();
  const name = r.split(':')[0];
  if (['seat', 'vibes', 'profile'].includes(name)) return true;
  if (!s) return false;
  if (['setup', 'lobby'].includes(name)) return true;
  if (name === 'swipe' || name === 'review') return myRound()?.status !== 'idle';
  if (name === 'final' || name === 'details') return !!s.candidates;
  if (name === 'result') return !!s.result;
  return false;
}

function go(r, { focus = true } = {}) {
  if (r !== 'profile' && route !== 'profile') ui.lastRoute = route;
  if (r === 'profile') ui.lastRoute = route;
  route = r;
  try { sessionStorage.setItem('idc.v2.route', r); } catch { /* ignore */ }
  render();
  window.scrollTo(0, 0);
  if (focus) app.querySelector('h1')?.focus();
}

/** Logical Back targets (predictable, not browser history). */
function backTarget() {
  const name = route.split(':')[0];
  return {
    vibes: 'seat',
    setup: 'vibes',
    lobby: 'setup',
    swipe: 'lobby',
    review: myRound()?.status === 'ready' ? 'lobby' : 'swipe',
    final: 'lobby',
    details: 'final',
    result: 'final',
    profile: ui.lastRoute && ui.lastRoute !== 'profile' ? ui.lastRoute : defaultRoute(),
  }[name];
}

// ───────────────────────── chrome
function header() {
  const back = route !== 'seat' ? `<button type="button" class="iconbtn" data-act="back">← Back</button>` : '';
  const right = me
    ? `<button type="button" class="iconbtn" data-act="handoff" aria-label="Switch person (hand off the phone)">⇄ Switch</button>
       <button type="button" class="iconbtn" data-act="go" data-arg="profile" aria-label="My profile">${nameOf(me)}</button>`
    : '';
  return `<header class="top"><div class="left">${back}<div class="logo" aria-hidden="true">idc<span>.</span></div></div><div class="right">${right}</div></header>
  <div class="demo-banner" role="note">Demo mode · every restaurant, menu, price and hour shown is <b>fictional</b>.</div>`;
}

function title(eyebrow, h, sub) {
  return `<div class="eyebrow">${eyebrow}</div><h1 tabindex="-1">${h}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}`;
}

function settingsSummary(st) {
  const time = st.time.kind === 'asap' ? 'ASAP' : st.time.kind === 'later' ? 'Later tonight' : `At ${esc(st.time.at)}`;
  return `${money(st.budget)}${st.budget ? '/person' : ''} · ${time} · ${st.radius} mi of ${esc(st.location.name)}`;
}

// ───────────────────────── screens
const screens = {};

screens.seat = () => {
  const s = ses();
  return `<div class="hero-logo">idc<span>.</span></div>
  <p class="tagline">You pick the food. We pick the place.</p>
  ${title('Step zero', 'Who’s holding the phone?', 'Each person keeps their own food profile and picks in private.')}
  <div class="choices">
    ${['A', 'B'].map((p) => `<button type="button" class="choice" data-act="seat" data-arg="${p}"><strong>I’m ${nameOf(p)}</strong><span>${s ? (s.startedBy === p ? 'Started tonight’s session' : 'Join tonight’s session') : p === 'A' ? 'Usually the one who asks first' : 'Usually the one who says “idc”'}</span></button>`).join('')}
  </div>
  <div class="panel small muted stack">
    <p><b>Same phone?</b> Use <b>⇄ Switch</b> to hand it over — we hide everything first.</p>
    <p><b>Two windows?</b> Open this page in a second tab or window on this device and pick the other person. They sync live.</p>
    <p><b>Two separate phones?</b> Not yet — that needs accounts and a backend (Phase 2). We’re not going to pretend otherwise.</p>
  </div>`;
};

screens.vibes = () => {
  const s = ses();
  const sel = myVibes();
  const partnerPicked = s && (s.vibes[other(me)] || []).length;
  return `<div class="hero-logo">idc<span>.</span></div><p class="tagline">You pick the food. We pick the place.</p>
  ${title('Tonight', 'What are you up for?', 'Pick everything you’d be happy with — dressed up, sweatpants, in-and-out. They don’t have to make sense together.')}
  <div class="choices" role="group" aria-label="What you’re up for">
    ${VIBES.map((v) => `<button type="button" class="choice" data-act="vibe" data-arg="${v.id}" aria-pressed="${sel.includes(v.id)}"><strong>${esc(v.name)}</strong><span>${esc(v.line)}</span></button>`).join('')}
  </div>
  <button type="button" class="choice lube" data-act="lube" aria-pressed="${myLube()}"><strong>With lube 🍸</strong><span>The liquid kind, you animal. If we sit down somewhere, it has to have a bar.</span></button>
  <p class="small muted" style="margin-top:12px">🔒 ${s ? `${nameOf(other(me))} ${partnerPicked ? 'already picked' : 'picks'} their own` : 'Your partner picks their own'} — privately. We only choose places that fit something you <i>both</i> picked.</p>
  <div style="margin-top:12px">${btn(sel.length ? 'Keep going →' : 'Pick at least one', 'vibes-next', { cls: 'wide big', dis: !sel.length })}</div>`;
};

function setupControls(st, editable) {
  const dis = editable ? '' : 'disabled';
  const budgetPreset = [15, 25, 40, null];
  const custom = st.budget && !budgetPreset.includes(st.budget);
  return `
  ${myVibes().some((v) => ['delivery', 'casual', 'healthy'].includes(v)) ? `<label class="field" for="addr">Delivery address <span class="muted">(if delivery wins)</span></label><input id="addr" type="text" data-change="addr" ${dis} value="${esc(st.deliveryAddress?.name || '')}" placeholder="Home (demo uses the Alachua area)"><p class="hint">Real delivery eligibility depends on the actual address and the provider. Demo restaurants use a pretend delivery radius.</p>` : ''}
  <label class="field">Budget per person</label>
  <div class="chips" role="group" aria-label="Budget">${budgetPreset.map((b) => chip(b ? `$${b}` : 'No set limit', 'set-budget', String(b ?? ''), st.budget === b)).join('')}${chip('Custom', 'set-budget', 'custom', custom)}</div>
  ${custom || ui.customBudget ? `<input type="number" min="5" max="300" inputmode="numeric" aria-label="Custom budget per person" data-change="budget" ${dis} value="${st.budget || ''}" style="margin-top:8px">` : ''}
  <label class="field">When?</label>
  <div class="chips" role="group" aria-label="Meal time">${[['asap', 'ASAP'], ['later', 'Later tonight'], ['at', 'Specific time']].map(([k, l]) => chip(l, 'set-time', k, st.time.kind === k)).join('')}</div>
  ${st.time.kind === 'at' ? `<input type="time" aria-label="Meal time" data-change="time" ${dis} value="${esc(st.time.at)}" style="margin-top:8px">` : ''}
  <label class="field" for="radius">Search radius</label>
  <select id="radius" data-change="radius" ${dis}>${[5, 10, 15, 25, 40].map((r) => `<option value="${r}" ${st.radius === r ? 'selected' : ''}>${r} miles</option>`).join('')}</select>
  <label class="field" for="loc">Area</label>
  <input id="loc" type="text" data-change="loc" ${dis} value="${esc(st.location.name)}">
  <p class="hint">Demo restaurants cover ~25 miles around Alachua, FL. Real location search and “on my way home” pickup routing are planned, not built.</p>`;
}

screens.setup = () => {
  const s = ses();
  const mine = s.startedBy === me;
  if (mine) {
    return `${title('Ground rules', 'How are we doing this?', 'One set of rules for both of you. Food preferences stay personal.')}
    <div class="panel">${setupControls(s.settings, true)}</div>
    ${btn('Lock in the plan →', 'go', { cls: 'wide big', arg: 'lobby' })}`;
  }
  const draft = ui.reqDraft || (ui.reqDraft = structuredClone(s.settings));
  return `${title('Ground rules', `${nameOf(s.startedBy)} set the plan.`, 'You can’t silently override it — but you can ask nicely.')}
  <div class="panel"><p class="small muted">Current: ${settingsSummary(s.settings)}</p></div>
  <div class="panel"><h2>Request a change</h2>${setupControls(draft, true)}</div>
  ${btn(`Send to ${nameOf(s.startedBy)} →`, 'send-request', { cls: 'wide' })}
  <div style="margin-top:10px">${btn('Looks fine, continue', 'go', { cls: 'wide secondary', arg: 'lobby' })}</div>`;
};

function statusFor(p) {
  const r = ses().rounds[p];
  if (r.status === 'ready') return `<span class="status ready">${p === me ? 'Cravings locked in' : 'Ready'}</span>`;
  if (r.status === 'swiping') return `<span class="status going">${p === me ? 'Choosing…' : `${nameOf(p)} is choosing`}</span>`;
  return `<span class="status">${p === me ? 'Not started' : 'Waiting for partner'}</span>`;
}

function requestPanel() {
  const rq = ses().settingsRequest;
  if (!rq) return '';
  const c = rq.changes;
  const diff = [];
  const cur = ses().settings;
  if (c.budget !== undefined && c.budget !== cur.budget) diff.push(`Budget → ${money(c.budget)}`);
  if (c.radius !== undefined && c.radius !== cur.radius) diff.push(`Radius → ${c.radius} mi`);
  if (c.time && JSON.stringify(c.time) !== JSON.stringify(cur.time)) diff.push(`Time → ${c.time.kind === 'at' ? c.time.at : c.time.kind === 'asap' ? 'ASAP' : 'Later tonight'}`);
  if (c.location && c.location.name !== cur.location.name) diff.push(`Area → ${esc(c.location.name)}`);
  if (rq.from === me) return `<div class="notice">Change request sent. Waiting for ${nameOf(other(me))} to approve.</div>`;
  return `<div class="notice warn" role="alert"><b>${nameOf(rq.from)} wants to change the plan${rq.note ? ` (${esc(rq.note)})` : ''}:</b><br>${diff.join(' · ') || 'No actual changes. Bold move.'}
    <div class="row" style="margin-top:10px">${btn('Approve', 'req-answer', { arg: 'yes', cls: 'small' })}${btn('Nope', 'req-answer', { arg: 'no', cls: 'small secondary' })}</div></div>`;
}

screens.lobby = () => {
  const s = ses();
  const r = myRound();
  const both = ['A', 'B'].every((p) => s.rounds[p].status === 'ready');
  const left = r.deck.length - Object.keys(r.answers).filter((id) => r.deck.includes(id)).length;
  let mine;
  if (r.status === 'ready') {
    mine = `<p><b>Cravings locked in.</b> Your work here is done.</p><div class="row">${btn('Review my picks', 'go', { arg: 'review', cls: 'small secondary' })}${!s.candidates ? btn('Unlock & edit', 'unlock', { cls: 'small ghost' }) : ''}</div>`;
  } else {
    mine = `${btn(r.status === 'swiping' ? `Keep swiping (${left} left) →` : 'Start swiping →', 'start', { cls: 'wide big' })}
    <div class="skip">${btn('idc. You Know Me.', 'skip', { cls: 'secondary' })}<p>Skip the swipes. We’ve got your cravings covered.</p></div>`;
  }
  return `${title('Two people, one dinner', 'Make your move.', 'Swipe what sounds good, or let your saved profile do the talking. Nobody sees anybody’s picks.')}
  <div class="panel small muted"><div style="margin-bottom:6px">You’re up for: <b>${esc(vibeNames(myVibes()).join(', '))}${myLube() ? ' + with lube 🍸' : ''}</b> ${!s.result ? `<button class="iconbtn" data-act="go" data-arg="vibes" style="margin-left:6px">Change</button>` : ''}</div>${settingsSummary(s.settings)} ${s.startedBy === me && !s.candidates ? `<button class="iconbtn" data-act="go" data-arg="setup" style="margin-left:6px">Edit</button>` : !s.candidates ? `<button class="iconbtn" data-act="go" data-arg="setup" style="margin-left:6px">Request change</button>` : ''}</div>
  ${requestPanel()}
  <div class="panel" aria-live="polite">
    ${['A', 'B'].map((p) => `<div class="person"><div class="avatar ${p === me ? 'me' : ''}" aria-hidden="true">${nameOf(p)[0] || p}</div><div><b>${nameOf(p)}</b>${p === me ? ' <span class="small muted">(you)</span>' : ''}</div>${statusFor(p)}</div>`).join('')}
  </div>
  <div class="panel">${mine}</div>
  ${s.candidates ? btn(s.result ? 'See where we’re going →' : 'Where Are We Going?!', 'go', { arg: s.result ? 'result' : 'final', cls: 'wide big' })
    : both ? btn('Where Are We Going?!', 'generate', { cls: 'wide big' })
      : `<p class="muted" style="text-align:center">${r.status === 'ready' ? 'Your better half is still deciding.' : 'Results unlock when you’re both done.'}</p>
         <p class="small muted" style="text-align:center">Partner on this phone? Tap <b>⇄ Switch</b>.</p>`}`;
};

function cardHtml(id, top) {
  const f = FOOD_BY_ID[id];
  const lvl = prefOf(state.profiles[me], id);
  return `<div class="card ${top ? 'top' : 'under'}" ${top ? 'tabindex="0" aria-label="' + esc(f.name) + '. Swipe right for yes, left for nah, up for really want this."' : 'aria-hidden="true"'}>
    <img src="${photoUrl(f)}" alt="Representative photo of ${esc(f.name)}" data-fallback ${top ? 'fetchpriority="high"' : 'loading="lazy"'}>
    <div class="fallback" aria-hidden="true">${esc(f.group)}</div>
    ${lvl === 'love' ? '<span class="pill badge">Saved favorite</span>' : ''}
    <div class="stamp yes">YES</div><div class="stamp no">NAH</div><div class="stamp really">REALLY WANT</div>
    <div class="shade"><div class="name">${esc(f.name)}</div><div class="meta">${esc(f.group)} · representative photo, not a specific restaurant’s dish</div></div>
  </div>`;
}

screens.swipe = () => {
  const r = myRound();
  if (r.status === 'ready') return screens.review();
  const answered = r.deck.filter((id) => r.answers[id]).length;
  const done = r.pos >= r.deck.length;
  const pct = r.deck.length ? (answered / r.deck.length) * 100 : 100;
  const head = `${title('Tonight’s cravings', `What sounds good, ${nameOf(me)}?`)}
    <div class="row spread small muted"><span>${Math.min(answered + (done ? 0 : 1), r.deck.length)} of ${r.deck.length}</span><span>Private to you</span></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${r.deck.length}" aria-valuenow="${answered}" aria-label="Cards answered"><div style="width:${pct}%"></div></div>`;
  const tools = `<div class="swipe-tools">${btn('↶ Undo', 'undo', { cls: 'small secondary', dis: !r.undo.length })}${btn('Review picks', 'go', { arg: 'review', cls: 'small ghost', dis: !answered })}</div>`;
  if (!r.deck.length) {
    const mine = ses().startedBy === me;
    return `${title('Tonight’s cravings', 'Nothing to swipe. Yet.', 'No demo restaurant fits tonight’s rules — at this hour most of them are closed, or the budget/radius is tight.')}
    <div class="panel stack">${mine
      ? `${btn('Plan for later tonight', 'empty-fix', { arg: JSON.stringify({ time: { kind: 'later', at: '19:00' } }), cls: 'wide' })}${btn('Plan for 7:00pm', 'empty-fix', { arg: JSON.stringify({ time: { kind: 'at', at: '19:00' } }), cls: 'wide secondary' })}${btn('Edit the ground rules', 'go', { arg: 'setup', cls: 'wide ghost' })}`
      : `<p class="muted">${nameOf(ses().startedBy)} set the rules. Ask them to change the time or budget.</p>${btn('Request a change', 'go', { arg: 'setup', cls: 'wide secondary' })}`}</div>`;
  }
  if (done) {
    return `${head}<div class="panel done-card"><div class="big-emoji" aria-hidden="true">✓</div><h2>Cravings locked in. Your work here is done.</h2>
      <p class="muted">Want to double-check? Review or undo before you submit.</p>
      ${btn('Submit my cravings →', 'submit', { cls: 'wide big' })}</div>${tools}`;
  }
  const id = r.deck[r.pos];
  const nextId = r.deck.slice(r.pos + 1).find((x) => !r.answers[x]);
  return `${head}
  <div class="deck" id="deck">${nextId ? cardHtml(nextId, false) : ''}${cardHtml(id, true)}</div>
  <div class="answers" role="group" aria-label="Answer">
    <button type="button" class="btn ans-no" data-act="answer" data-arg="no">Nah</button>
    <button type="button" class="btn ans-maybe" data-act="answer" data-arg="maybe">Maybe</button>
    <button type="button" class="btn ans-yes" data-act="answer" data-arg="yes">Hell Yes</button>
    <button type="button" class="btn ans-really" data-act="answer" data-arg="really">Really Want This</button>
  </div>
  ${tools}
  <div class="skip">${btn('idc. You Know Me.', 'skip', { cls: 'secondary' })}<p>Skip the rest — we’ll keep the ${answered} you answered and fill in from your profile.</p></div>
  <p class="small muted" style="text-align:center">Keys: ← nah · ↓ maybe · → yes · ↑ really · Z undo</p>`;
};

const ANS_LABEL = { no: 'Nah', maybe: 'Maybe', yes: 'Hell Yes', really: 'Really Want This' };
screens.review = () => {
  const r = myRound();
  const locked = r.status === 'ready';
  const seen = r.deck.filter((id) => r.answers[id]);
  return `${title('Your picks', 'Your cravings, reviewed.', locked ? 'Only you can see these. They’re locked in — unlock from the lobby to edit (until results are generated).' : 'Only you can see these. Change anything before you submit.')}
  <div class="panel">${seen.length ? seen.map((id) => `<div class="review-item"><img src="${photoUrl(FOOD_BY_ID[id], 120)}" alt="" data-fallback><span class="nm">${esc(foodName(id))}</span>
    <select aria-label="Answer for ${esc(foodName(id))}" data-change="review" data-arg="${id}" ${locked ? 'disabled' : ''}>${Object.entries(ANS_LABEL).map(([k, l]) => `<option value="${k}" ${r.answers[id] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')
    : `<p class="muted">${r.mode === 'skip' ? 'You skipped the swipes — we’re using your saved profile.' : 'Nothing answered yet.'}</p>`}</div>
  ${locked ? btn('Back to the lobby', 'go', { arg: 'lobby', cls: 'wide secondary' }) : btn('Back to swiping', 'go', { arg: 'swipe', cls: 'wide secondary' })}`;
};

function venueFacts(r, scored) {
  const st = ses().settings;
  const miles = scored ? scored.miles : distanceMiles(st.location, r);
  const plan = scored?.plan ? `<span class="pill plan">Plan: ${METHOD_LABEL[scored.plan.method]}</span>` : '';
  return `<div class="facts">${plan}<span class="pill">${esc(r.cuisine)}</span><span class="pill">${miles.toFixed(1)} mi</span><span class="pill">~$${r.price}/person</span><span class="pill">${fmtHour(r.hours[0])}–${fmtHour(r.hours[1])}</span><span class="pill">${['dinein', 'pickup', 'delivery'].filter((k) => r.services[k]).map((k) => METHOD_LABEL[k]).join(' · ')}</span></div>`;
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);
const DRINK_FOR_TWO = { beer: 'Beers for two', wine: 'Wine for two', cocktails: 'Cocktails for two' };

/** Final screen: appetizers you'll BOTH like (if any) + drinks (if they serve any). Hidden when neither. */
function extrasHtml(r, sc) {
  const c = { ...ctxOf(state), sessionRejected: [] };
  const apps = appetizerOptions(r, c, 3, { onlyBothLike: true });
  const d = drinkMatch(r, c);
  const dineIn = sc?.plan?.method === 'dinein';
  const per = d.per.map((p, i) => (p.likes.length ? `${nameOf(i ? 'B' : 'A')}: ${p.served.length ? p.served.map(cap).join(' or ') : `no ${p.likes.join(' or ')} here`}` : null)).filter(Boolean);
  const blocks = [];
  if (apps.length) {
    blocks.push(`<div class="share"><b>Appetizers you’ll both like</b><ul class="plain">${apps.map((a) => `<li>${esc(pickLabel({ item: a.item, foodId: a.item.foods[0] }))}${a.item.price ? ` · $${a.item.price}` : ''}</li>`).join('')}</ul></div>`);
  }
  if (d.bar.length) {
    blocks.push(`<div class="drinks"><b>🍸 Drinks here</b>${d.bar.map(cap).join(' · ')}${per.length ? `<span class="small muted" style="display:block">${per.join(' · ')}</span>` : ''}${d.together.length ? `<span class="both">♥ ${DRINK_FOR_TWO[d.together.includes('cocktails') ? 'cocktails' : d.together[0]]}</span>` : ''}${dineIn ? '' : '<span class="hint" style="display:block">Alcohol to go depends on local law and the restaurant — check before you count on it.</span>'}</div>`);
  }
  return blocks.length ? `<div class="panel"><h2>While you’re there</h2>${blocks.join('')}</div>` : '';
}

/** Which of each person's styles this plan satisfies (shown only after both submitted). */
function fitsHtml(scored) {
  const pl = scored?.plan;
  if (!pl) return '';
  if (pl.shared.length) return `<p class="fits">♥ You’re both up for <b>${esc(vibeNames(pl.shared).join(' & '))}</b></p>`;
  const part = (p) => (pl.fits[p] || []).length ? `${nameOf(p)}: ${esc(vibeNames(pl.fits[p]).join(' / '))}` : null;
  const parts = ['A', 'B'].map(part).filter(Boolean);
  return parts.length ? `<p class="fits">Meets you in the middle — ${parts.join(' · ')}</p>` : '';
}

// ── PRIVATE views (Final Three + details): only YOUR side. Nothing about your partner's picks,
//    except a style you're both up for.
function fitsPrivate(scored) {
  const pl = scored?.plan;
  if (!pl) return '';
  if (pl.shared.length) return `<p class="fits">♥ You’re both up for <b>${esc(vibeNames(pl.shared).join(' & '))}</b></p>`;
  const mine = pl.fits[me] || [];
  return mine.length ? `<p class="fits">Fits what you’re up for: <b>${esc(vibeNames(mine).join(' / '))}</b></p>` : '';
}

function mineHtml(rid, scored) {
  if (!scored) return '<p class="small muted">This place no longer meets tonight’s rules.</p>';
  const list = personalMatches(RESTAURANT_BY_ID[rid], { ...ctxOf(state), sessionRejected: [] }, me);
  const skipped = scored.fromFavorites || (myRound()?.mode === 'skip' && !Object.keys(myRound()?.answers || {}).length);
  return `<div class="mine"><b>${skipped ? 'Your favorites they have' : 'What you picked that they have'}</b>
    ${list.length ? `<ul>${list.map((o) => `<li>${esc(pickLabel(o))}</li>`).join('')}</ul>` : '<p class="small muted">Nothing you’d love — but something you can live with.</p>'}</div>`;
}

function drinksPrivate(scored) {
  const d = scored?.drinks;
  if (!d || !myLube()) return '';
  const mine = d.per[me === 'A' ? 0 : 1];
  const line = !mine.likes.length ? '' : mine.served.length ? `${mine.served.map(cap).join(' or ')} for you` : `None of your picks (${mine.likes.join(', ')})`;
  return `<div class="drinks"><b>🍸 At the bar</b>${d.bar.map(cap).join(' · ')}${line ? `<span class="small muted" style="display:block">${esc(line)}</span>` : ''}</div>`;
}

// ── FULL reveal (final screen only)
function pairHtml(scored, { share = true } = {}) {
  if (!scored) return '<p class="small muted">This place no longer meets tonight’s rules.</p>';
  const sh = share ? scored.share : null;
  const [a, b] = scored.picks;
  if (a.item.id === b.item.id) {
    return `<div class="pair one"><div><b>For both of you</b>${esc(pickLabel(a))}<span class="both">${a.bothWanted ? '♥ You both wanted this — the only match you share here' : 'The one dish here that works for both of you'}</span></div></div>
  ${sh ? `<div class="share"><b>Split this</b>${esc(sh.name || foodName(sh.foods[0]))} <span class="both">♥ You both love these</span></div>` : ''}`;
  }
  return `<div class="pair">${scored.picks.map((p, i) => `<div><b>For ${nameOf(i ? 'B' : 'A')}</b>${esc(pickLabel(p))}${p.bothWanted ? '<span class="both">♥ You both wanted this</span>' : ''}</div>`).join('')}</div>
  ${sh ? `<div class="share"><b>Split this</b>${esc(sh.name || foodName(sh.foods[0]))} <span class="both">♥ You both love these</span></div>` : ''}`;
}

const scoreOf = (rid) => scoreRestaurant(RESTAURANT_BY_ID[rid], { ...ctxOf(state), sessionRejected: [] });

function broadenPanel() {
  const st = ses().settings;
  const opts = [];
  if (st.budget) opts.push([`Budget → ${money(st.budget + 15)}`, JSON.stringify({ budget: st.budget + 15 })], ['No budget limit', JSON.stringify({ budget: null })]);
  if (st.radius < 40) opts.push([`Radius → ${Math.min(40, st.radius + 10)} mi`, JSON.stringify({ radius: Math.min(40, st.radius + 10) })]);
  if (st.time.kind !== 'later') opts.push(['Eat later tonight', JSON.stringify({ time: { kind: 'later', at: st.time.at } })]);
  const mine = ses().startedBy === me;
  return `<div class="panel"><h2>Broaden the search</h2><p class="small muted">${mine ? 'Pick one and we’ll rerun the match.' : `${nameOf(ses().startedBy)} has to approve changes.`}</p>
    <div class="wrap-row">${opts.map(([l, v]) => btn(l, 'broaden', { arg: v, cls: 'small secondary' })).join('')}</div>
    <p class="small muted" style="margin-top:12px">Or open yourself up a little:</p>${btn('Change what I’m up for', 'go', { arg: 'vibes', cls: 'small ghost' })}</div>`;
}

screens.final = () => {
  const s = ses();
  const c = s.candidates;
  if (!c.length) {
    return `${title('Well, this is awkward', 'Zero matches.', 'Nothing nearby satisfies both of you under tonight’s rules. We won’t make one up.')}${requestPanel()}${broadenPanel()}`;
  }
  if (c.length < 3) {
    return `${title('Slim pickings', `Only ${c.length} place${c.length > 1 ? 's' : ''} fit${c.length > 1 ? '' : 's'}.`, 'We only show real matches. You can broaden the search or go with what exists.')}
    ${c.map((id) => venueCard(id, false)).join('')}${requestPanel()}${broadenPanel()}
    ${btn(c.length === 1 ? 'Fine. Take me there →' : 'Pick the stronger one →', 'accept-short', { cls: 'wide big' })}`;
  }
  const myVote = s.votes?.[me];
  const partnerVoted = !!s.votes?.[other(me)];
  let action;
  if (s.result) action = btn('See where we’re going →', 'go', { arg: 'result', cls: 'wide big' });
  else if (myVote) action = `<p class="muted" style="text-align:center" aria-live="polite">${partnerVoted ? 'Both in. Calculating…' : `Waiting on ${nameOf(other(me))}. Votes stay hidden until you both submit.`}</p>`;
  else action = `<p class="small muted" style="text-align:center">One move each: <b>eliminate</b> one place <i>or</i> say you <b>really want</b> one. Not both.</p>`;
  return `${title('Results', 'The Final Three', 'Three restaurants. One move each. One dinner.')}
    ${!myVote && !s.result ? action : ''}
    ${(() => { const fb = c.filter((id) => s.fallback?.includes(id)).length; const n = c.length - fb; return fb ? `<div class="notice">Tonight’s cravings only found ${n || 'zero'} match${n === 1 ? '' : 'es'}, so we filled in from your saved favorites.</div>` : ''; })()}
    ${c.map((id) => venueCard(id, !myVote && !s.result)).join('')}
    ${myVote || s.result ? action : ''}`;
}

/** One Final Three tile. Voting + confirming happens right here — no scrolling. */
function venueCard(id, canVote) {
  const r = RESTAURANT_BY_ID[id];
  const sc = scoreOf(id);
  const myVote = ses().votes?.[me];
  const pending = ui.vote && ui.vote.id === id ? ui.vote : null;
  const mineHere = myVote && myVote.id === id ? myVote : null;
  const state = (pending || mineHere)?.type;
  const cls = state === 'veto' ? 'vetoed' : state === 'want' ? 'wanted' : '';
  let actions;
  if (pending) {
    const isVeto = pending.type === 'veto';
    actions = `<div class="confirm" role="alertdialog" aria-label="Confirm">
      <p><b>${isVeto ? `Eliminate ${esc(r.name)}?` : `Really want ${esc(r.name)}?`}</b><br><span class="small muted">Locked once you submit, and you ${isVeto ? 'can’t also pick a “really want”' : 'can’t also eliminate one'}. ${nameOf(other(me))} won’t see it until you’ve both voted.</span></p>
      <div class="row">${btn(isVeto ? 'Yes, eliminate it' : 'Yes, I really want it', 'vote-confirm', { cls: isVeto ? 'small danger' : 'small' })}${btn('Never mind', 'vote-cancel', { cls: 'small secondary' })}</div></div>`;
  } else if (mineHere) {
    actions = `<div class="row">${btn('Details', 'go', { arg: `details:${id}`, cls: 'small secondary' })}<span class="pill ${mineHere.type === 'veto' ? 'veto' : 'want'}">${mineHere.type === 'veto' ? '✕ You eliminated this' : '♥ You really want this'}</span></div>`;
  } else {
    actions = `<div class="row">${btn('Details', 'go', { arg: `details:${id}`, cls: 'small secondary' })}${canVote && !ui.vote
      ? btn('Eliminate', 'vote', { arg: `veto:${id}`, cls: 'small danger', aria: `Eliminate ${r.name}` }) + btn('Really want this!', 'vote', { arg: `want:${id}`, cls: 'small want', aria: `Really want ${r.name}` })
      : ''}</div>`;
  }
  return `<article class="venue ${cls}" id="venue-${id}"><div class="row spread"><h3>${esc(r.name)}</h3><span class="pill">${sc?.fromFavorites ? 'From your favorites' : 'Demo'}</span></div>
    ${venueFacts(r, sc)}${fitsPrivate(sc)}${mineHtml(id, sc)}${drinksPrivate(sc)}
    ${actions}</article>`;
}

screens.details = (rid) => {
  const r = RESTAURANT_BY_ID[rid];
  const sc = scoreOf(rid);
  const prof = state.profiles[me];
  const pend = state.group.pendingExclusions[rid];
  const vb = { dish: 'Verified dish', category: 'Category only', unverified: 'Unverified — not used' };
  return `${title(esc(r.cuisine), esc(r.name), `${r.atmosphere.join(' · ')} · fictional demo restaurant`)}
  ${venueFacts(r, sc)}${fitsPrivate(sc)}${mineHtml(rid, sc)}${drinksPrivate(sc)}
  <div class="panel"><h2>Menu (demo)</h2>${r.menu.map((m) => `<div class="pref-row"><span>${esc(m.name || foodName(m.foods[0]))}${m.price ? ` · $${m.price}` : ''}</span><span class="pill">${vb[m.verification]}</span></div>`).join('')}
    <p class="hint">Source: ${esc(r.source)} · verified ${esc(r.verifiedOn)} · Menu link: none (not a real restaurant).</p></div>
  <div class="panel small"><b>Drinks (demo):</b> ${r.bar.length ? r.bar.map(cap).join(' · ') : 'No alcohol served'}</div>
  <div class="notice warn">Allergies? Menu matches are not allergy guarantees. Always confirm with the restaurant.</div>
  <div class="panel stack"><h2>Your relationship with this place</h2>
    <label class="check"><input type="checkbox" data-change="fav" data-arg="${rid}" ${prof.favoriteRestaurants.includes(rid) ? 'checked' : ''}> Favorite</label>
    <label class="check"><input type="checkbox" data-change="exclude" data-arg="${rid}" ${prof.excludedRestaurants.includes(rid) ? 'checked' : ''}> Never recommend to me (personal block)</label>
    ${state.group.sharedExclusions.includes(rid) ? '<p class="small">Blocked for both of you.</p>'
      : pend?.[me] ? `<p class="small muted">You proposed a shared block. Waiting on ${nameOf(other(me))}.</p>`
        : btn(pend ? `Agree to block it for both of us` : 'Propose a shared block', 'shared-block', { arg: rid, cls: 'small secondary' })}
    <p class="hint">Vetoing tonight doesn’t block a place forever. These do (and you can undo them in your profile).</p>
  </div>
  ${btn('← Back to The Final Three', 'go', { arg: 'final', cls: 'wide secondary' })}`;
};

screens.result = () => {
  const s = ses();
  const res = s.result;
  const r = RESTAURANT_BY_ID[res.winner];
  const sc = scoreOf(res.winner);
  const b = res.backup && RESTAURANT_BY_ID[res.backup];
  const m = sc?.plan?.method;
  const verb = m === 'dinein' ? 'Tonight you’re going to' : m === 'delivery' ? 'Tonight’s delivery is from' : m === 'pickup' ? 'Tonight’s pickup is from' : 'Tonight’s pick';
  const vt = (p) => { const v = s.votes?.[p]; return v ? `${nameOf(p)} ${v.type === 'veto' ? 'cut' : 'really wanted'} ${esc(RESTAURANT_BY_ID[v.id]?.name || '—')}` : null; };
  const votes = ['A', 'B'].some((p) => s.votes?.[p]) ? `<p class="small muted">Votes: ${['A', 'B'].map(vt).filter(Boolean).join(' · ')}</p>` : '';
  const rq = s.replacement;
  const fb = s.feedback[me] || {};
  let repl;
  if (rq && rq.from === me) repl = `<div class="notice">Replacement requested. Waiting for ${nameOf(other(me))} to approve.</div>`;
  else if (rq) repl = `<div class="notice warn" role="alert"><b>${nameOf(rq.from)} wants a replacement</b> (${esc({ busy: 'too busy', closed: 'it’s closed', changed: 'changed our minds', other: 'other' }[rq.reason])}).<div class="row" style="margin-top:8px">${btn('Approve', 'repl-answer', { arg: 'yes', cls: 'small' })}${btn('No, we’re going', 'repl-answer', { arg: 'no', cls: 'small secondary' })}</div></div>`;
  else repl = `<label class="field" for="why">Why?</label><select id="why" data-change="reason">${[['busy', 'Too busy'], ['closed', 'It’s closed'], ['changed', 'Changed our minds'], ['other', 'Other']].map(([k, l]) => `<option value="${k}" ${ui.reason === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div style="margin-top:10px">${btn('Offer a Replacement', 'repl-request', { cls: 'wide secondary' })}</div><p class="hint">Both of you have to approve. Tonight’s vetoes stay vetoed. A “closed” or “busy” report only applies to tonight.</p>`;
  return `<div class="panel winner"><div class="eyebrow">${verb}</div><h1 tabindex="-1">${esc(r.name)}</h1>${venueFacts(r, sc)}${fitsHtml(sc)}${pairHtml(sc, { share: false })}</div>
  ${extrasHtml(r, sc)}
  ${res.sameVote ? `<div class="notice">You both vetoed the same place. A shocking development in the ‘I don’t care’ household.</div>` : ''}
  <div class="panel"><h2>Why this one</h2><ul class="why">${res.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}${sc ? `<li>${esc(pickLabel(sc.picks[0]))} for ${nameOf('A')}; ${esc(pickLabel(sc.picks[1]))} for ${nameOf('B')}</li>` : ''}${sc && (sc.share || sc.picks.some((p) => p.bothWanted)) ? '<li>You two actually agreed on something. Mark the calendar.</li>' : ''}</ul>${votes}</div>
  ${b ? `<div class="panel"><div class="eyebrow">Backup</div><h3>${esc(b.name)}</h3><p class="small muted">${esc(b.cuisine)} · ~$${b.price}/person</p></div>` : '<div class="panel small muted">No backup available under tonight’s rules.</div>'}
  ${res.noReplacement ? `<div class="notice warn">No eligible replacement left nearby. ${btn('Widen the search', 'widen', { cls: 'small' })}</div>` : ''}
  <div class="panel"><h2>Plans changed?</h2>${repl}</div>
  <div class="panel"><h2>Afterwards</h2><p class="small muted">Picking a place isn’t the same as eating there. Tell us and future picks get smarter.</p>
    <div class="chips" role="group" aria-label="Did you go?">${chip('We went / ordered', 'fb-went', '1', fb.went === true)}${chip('Didn’t happen', 'fb-went', '0', fb.went === false)}</div>
    ${fb.went ? `<div class="chips" role="group" aria-label="How was it?" style="margin-top:8px">${[[1, 'Never again'], [2, 'Meh'], [3, 'Fine'], [4, 'Good'], [5, 'Loved it']].map(([n, l]) => chip(l, 'fb-rate', String(n), fb.rating === n)).join('')}</div>` : ''}
    <label class="check" style="margin-top:8px"><input type="checkbox" data-change="fav" data-arg="${res.winner}" ${state.profiles[me].favoriteRestaurants.includes(res.winner) ? 'checked' : ''}> Save as a favorite</label>
  </div>
  ${btn('New dinner session', 'new-session', { cls: 'wide' })}`;
};

screens.profile = () => {
  const p = state.profiles[me];
  const g = state.group;
  const pending = Object.entries(g.pendingExclusions);
  return `${title('Your food profile', `${nameOf(me)}’s profile`, 'Private to you. Your partner never sees it — only the restaurants you both match on.')}
  <div class="panel">
    <label class="field" for="pname">Display name</label><input id="pname" type="text" maxlength="24" data-change="pname" value="${esc(p.name)}">
    <label class="field" for="home">Home area</label><input id="home" type="text" data-change="home" value="${esc(p.home)}">
    <div class="row"><div style="flex:1"><label class="field" for="prad">Default radius</label><select id="prad" data-change="pradius">${[5, 10, 15, 25, 40].map((r) => `<option ${p.radius === r ? 'selected' : ''} value="${r}">${r} mi</option>`).join('')}</select></div>
    <div style="flex:1"><label class="field" for="pbud">Default budget</label><select id="pbud" data-change="pbudget">${[15, 25, 40, 0].map((b) => `<option ${(p.budget || 0) === b ? 'selected' : ''} value="${b}">${b ? '$' + b : 'No limit'}</option>`).join('')}</select></div></div>
    <label class="field" for="diet">Dietary requirement</label><select id="diet" data-change="diet"><option value="none" ${p.diet !== 'vegetarian' ? 'selected' : ''}>None</option><option value="vegetarian" ${p.diet === 'vegetarian' ? 'selected' : ''}>Vegetarian</option></select>
  </div>
  <div class="panel"><h2>Drinks you like</h2><p class="small muted">Used when you pick “With lube 🍸”, and shown on the final screen. Leave all unchecked if you’re not drinking.</p>
    <div class="wrap-row">${DRINKS.map((d) => `<label class="check" style="margin-right:14px"><input type="checkbox" data-change="drink" data-arg="${d}" ${(p.drinks || []).includes(d) ? 'checked' : ''}> ${cap(d)}</label>`).join('')}</div></div>
  <div class="panel"><h2>Allergies</h2><p class="small muted">Stored separately from dislikes. We keep matching dishes away from these categories, but <b>a menu match is never an allergy guarantee</b> — confirm with the restaurant.</p>
    <div class="wrap-row">${ALLERGENS.map((a) => `<label class="check" style="margin-right:12px"><input type="checkbox" data-change="allergy" data-arg="${a}" ${p.allergies.includes(a) ? 'checked' : ''}> ${a}</label>`).join('')}</div></div>
  <div class="panel"><h2>Food preferences</h2><p class="small muted">Love · Like · Neutral · Dislike · Never. “Never” means we never suggest it <i>for you</i> — a place that serves it can still win if it has something else you like.</p>
    ${GROUPS.map((grp) => `<details class="group"><summary>${esc(grp)}</summary>${FOODS.filter((f) => f.group === grp).map((f) => `<div class="pref-row"><span>${esc(f.name)}</span><select aria-label="${esc(f.name)} preference" data-change="pref" data-arg="${f.id}">${LEVELS.map((l) => `<option value="${l}" ${prefOf(p, f.id) === l ? 'selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`).join('')}</select></div>`).join('')}</details>`).join('')}
  </div>
  <div class="panel"><h2>Restaurants (demo list)</h2>
    <details class="group"><summary>Favorites & personal blocks</summary>${RESTAURANTS.map((r) => `<div class="pref-row"><span>${esc(r.name)}</span><span class="row"><label class="check small"><input type="checkbox" data-change="fav" data-arg="${r.id}" ${p.favoriteRestaurants.includes(r.id) ? 'checked' : ''}> Fav</label><label class="check small"><input type="checkbox" data-change="exclude" data-arg="${r.id}" ${p.excludedRestaurants.includes(r.id) ? 'checked' : ''}> Block</label></span></div>`).join('')}</details>
    <h3 style="margin-top:14px">Shared blocks (both of you agreed)</h3>
    ${g.sharedExclusions.length ? g.sharedExclusions.map((id) => `<div class="pref-row"><span>${esc(RESTAURANT_BY_ID[id].name)}</span>${btn('Unblock', 'unblock', { arg: id, cls: 'small secondary' })}</div>`).join('') : '<p class="small muted">None yet.</p>'}
    ${pending.map(([id, ap]) => `<div class="pref-row"><span>${esc(RESTAURANT_BY_ID[id].name)} <span class="small muted">· proposed</span></span>${ap[me] ? '<span class="small muted">Waiting on partner</span>' : `<span class="row">${btn('Agree', 'shared-block', { arg: id, cls: 'small' })}${btn('Decline', 'decline-block', { arg: id, cls: 'small secondary' })}</span>`}</div>`).join('')}
    <label class="field" for="propose">Propose a shared block</label>
    <select id="propose" data-change="propose"><option value="">Choose a restaurant…</option>${RESTAURANTS.filter((r) => !g.sharedExclusions.includes(r.id) && !g.pendingExclusions[r.id]).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>
  </div>
  <div class="panel"><h2>Danger zone</h2>${btn('Reset all demo data', 'reset', { cls: 'small danger' })}</div>`;
};

// ───────────────────────── render
function render() {
  if (!validRoute(route)) route = defaultRoute();
  const [name, arg] = route.split(':');
  let body = (screens[name] || screens.seat)(arg);
  if (ui.handoff) {
    const o = other(me);
    body = `<div class="handoff" role="dialog" aria-modal="true" aria-label="Hand off"><div><div class="hero-logo">idc<span>.</span></div>
      <h1 tabindex="-1">Pass it to ${nameOf(o)}.</h1><p class="muted">No peeking. We’ll know. (We won’t, but still.)</p>
      <div class="stack" style="margin-top:20px">${btn(`I’m ${nameOf(o)}`, 'handoff-confirm', { cls: 'wide big' })}${btn('Never mind', 'handoff-cancel', { cls: 'wide ghost' })}</div></div></div>`;
    app.innerHTML = body;
    app.querySelector('h1')?.focus();
    return;
  }
  app.innerHTML = `<div class="wrap">${header()}<main>${body}</main><div class="footer">idc. v2 prototype · fictional demo data · no real menus, hours, delivery or ordering</div></div>`;
  app.querySelectorAll('img[data-fallback]').forEach((img) => {
    const fail = () => { img.closest('.card')?.classList.add('noimg'); if (!img.closest('.card')) img.style.visibility = 'hidden'; };
    if (img.complete && img.naturalWidth === 0 && img.src) fail();
    img.addEventListener('error', fail, { once: true });
  });
  if (name === 'swipe') bindSwipe();
}

// ───────────────────────── swipe gestures
function bindSwipe() {
  const card = app.querySelector('.card.top');
  if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
  const stamp = (cls, v) => { const el = card.querySelector(`.stamp.${cls}`); if (el) el.style.opacity = v; };
  card.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.classList.add('dragging'); });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    stamp('yes', Math.max(0, dx / 120)); stamp('no', Math.max(0, -dx / 120)); stamp('really', Math.max(0, -dy / 120) * (Math.abs(dx) < 60 ? 1 : 0));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    let v = null;
    if (dy < -110 && Math.abs(dx) < 90) v = 'really';
    else if (dx > 110) v = 'yes';
    else if (dx < -110) v = 'no';
    if (v) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.style.transform = v === 'really' ? 'translateY(-130%)' : `translateX(${v === 'yes' ? 140 : -140}%) rotate(${v === 'yes' ? 18 : -18}deg)`;
      setTimeout(() => act('answer', v), reduce ? 0 : 180);
    } else {
      card.style.transform = '';
      ['yes', 'no', 'really'].forEach((c) => stamp(c, 0));
    }
    dx = dy = 0;
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

document.addEventListener('keydown', (e) => {
  if (route !== 'swipe' || ui.handoff || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const map = { ArrowLeft: 'no', ArrowRight: 'yes', ArrowDown: 'maybe', ArrowUp: 'really' };
  if (map[e.key] && myRound()?.pos < myRound()?.deck.length) { e.preventDefault(); act('answer', map[e.key]); }
  else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && myRound()?.undo.length) { e.preventDefault(); act('undo'); }
});

// ───────────────────────── actions
function act(name, arg) {
  switch (name) {
    case 'back': return go(backTarget() || defaultRoute());
    case 'go': return go(arg);
    case 'seat': me = arg; setSeat(arg); return go(defaultRoute());
    case 'handoff': ui.handoff = true; return render();
    case 'handoff-cancel': ui.handoff = false; return render();
    case 'handoff-confirm': ui.handoff = false; ui.vote = null; ui.reqDraft = null; me = other(me); setSeat(me); route = null; return go(defaultRoute());
    case 'vibe': {
      const sel = [...myVibes()];
      const i = sel.indexOf(arg);
      if (i >= 0) { if (sel.length === 1 && ses()) return toast('Pick at least one. You’re up for something.'); sel.splice(i, 1); } else sel.push(arg);
      if (ses()) state = S.setVibes(me, sel); else ui.vibeDraft = sel;
      return render();
    }
    case 'lube':
      if (ses()) state = S.setLube(me, !myLube()); else ui.lubeDraft = !ui.lubeDraft;
      return render();
    case 'vibes-next':
      if (!ses()) { state = S.startSession(me, ui.vibeDraft, ui.lubeDraft); ui.vibeDraft = []; ui.lubeDraft = false; return go('setup'); }
      return go(ses().startedBy === me && !ses().candidates ? 'setup' : ses().candidates ? 'final' : 'lobby');
    case 'set-budget':
      if (arg === 'custom') { ui.customBudget = true; return render(); }
      ui.customBudget = false;
      return patchSettings({ budget: arg ? Number(arg) : null });
    case 'set-time': return patchSettings({ time: { ...(draftSettings().time), kind: arg } });
    case 'send-request': state = S.requestSettings(me, ui.reqDraft); ui.reqDraft = null; toast('Request sent. Diplomacy!'); return go('lobby');
    case 'req-answer': state = S.answerSettingsRequest(me, arg === 'yes'); return render();
    case 'start': if (!myVibes().length) return go('vibes'); state = S.beginSwiping(me); return go('swipe');
    case 'empty-fix': state = S.setSettings(me, JSON.parse(arg)); state = S.beginSwiping(me); return render();
    case 'skip':
      if (!myRound().deck.length) state = S.beginSwiping(me);
      state = S.submit(me, true);
      toast('idc. You know me. Using your saved favorites.');
      return go('lobby');
    case 'answer': state = S.answer(me, arg); return render();
    case 'undo': state = S.undo(me); return render();
    case 'submit': state = S.submit(me, false); return go('lobby');
    case 'unlock': state = S.unlock(me); return render();
    case 'generate': state = S.generate(); return go('final');
    case 'vote': { const [type, id] = arg.split(':'); ui.vote = { type, id }; render(); document.getElementById(`venue-${id}`)?.querySelector('.confirm .btn')?.focus(); return undefined; }
    case 'vote-cancel': ui.vote = null; return render();
    case 'vote-confirm': state = S.castVote(me, ui.vote.type, ui.vote.id); ui.vote = null; return state.session.result ? go('result') : render();
    case 'accept-short': state = S.acceptShortList(); return go('result');
    case 'broaden': {
      state = S.broaden(me, JSON.parse(arg));
      if (ses().startedBy === me) { state = S.generate(); toast('Search broadened.'); } else toast('Request sent.');
      return render();
    }
    case 'widen': state = S.widenAfterNoReplacement(me); toast(ses().startedBy === me ? 'Radius widened. Request a replacement again.' : 'Request sent.'); return render();
    case 'repl-request': state = S.requestReplacement(me, ui.reason); return render();
    case 'repl-answer': state = S.respondReplacement(me, arg === 'yes'); if (arg === 'yes' && !state.session.replacement) toast('New pick is in.'); return render();
    case 'fb-went': state = S.feedback(me, { went: arg === '1' }); return render();
    case 'fb-rate': state = S.feedback(me, { rating: Number(arg) }); return render();
    case 'new-session': state = S.endSession(); ui.vibeDraft = []; return go('vibes');
    case 'shared-block': state = S.proposeSharedBlock(me, arg); toast(state.group.sharedExclusions.includes(arg) ? 'Blocked for both of you.' : 'Proposed. Your partner has to agree.'); return render();
    case 'decline-block': state = S.declineSharedBlock(arg); return render();
    case 'unblock': state = S.removeSharedBlock(arg); return render();
    case 'reset': if (confirm('Reset all demo profiles, history and sessions?')) { reset(); state = load(); me = null; setSeat(null); return go('seat'); } return;
    default: return undefined;
  }
}

function draftSettings() {
  const s = ses();
  return s.startedBy === me ? s.settings : (ui.reqDraft || (ui.reqDraft = structuredClone(s.settings)));
}
function patchSettings(patch) {
  const s = ses();
  if (s.startedBy === me) state = S.setSettings(me, patch);
  else Object.assign(draftSettings(), patch);
  render();
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  act(el.dataset.act, el.dataset.arg);
});

app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const v = el.value;
  const arg = el.dataset.arg;
  switch (el.dataset.change) {
    case 'addr': return patchSettings({ deliveryAddress: v ? { name: v, lat: draftSettings().location.lat, lng: draftSettings().location.lng } : null });
    case 'budget': return patchSettings({ budget: Number(v) || null });
    case 'time': return patchSettings({ time: { kind: 'at', at: v } });
    case 'radius': return patchSettings({ radius: Number(v) });
    case 'loc': return patchSettings({ location: { ...draftSettings().location, name: v || 'Alachua, FL' } });
    case 'review': state = S.setAnswer(me, arg, v); return render();
    case 'reason': ui.reason = v; return undefined;
    case 'pname': state = S.setProfile(me, { name: v.trim() || (me === 'A' ? 'You' : 'Partner') }); return render();
    case 'home': state = S.setProfile(me, { home: v.trim() }); return undefined;
    case 'pradius': state = S.setProfile(me, { radius: Number(v) }); return undefined;
    case 'pbudget': state = S.setProfile(me, { budget: Number(v) || null }); return undefined;
    case 'diet': state = S.setProfile(me, { diet: v }); return undefined;
    case 'drink': {
      const list = new Set(state.profiles[me].drinks || []);
      el.checked ? list.add(arg) : list.delete(arg);
      state = S.setProfile(me, { drinks: DRINKS.filter((d) => list.has(d)) });
      return undefined;
    }
    case 'allergy': {
      const list = new Set(state.profiles[me].allergies);
      el.checked ? list.add(arg) : list.delete(arg);
      state = S.setProfile(me, { allergies: [...list] });
      return undefined;
    }
    case 'pref': state = S.setPref(me, arg, v); return undefined;
    case 'fav': state = S.toggleList(me, 'favoriteRestaurants', arg); return undefined;
    case 'exclude': state = S.toggleList(me, 'excludedRestaurants', arg); return undefined;
    case 'propose': if (v) { state = S.proposeSharedBlock(me, v); toast('Proposed. Your partner has to agree.'); render(); } return undefined;
    default: return undefined;
  }
});

// Live updates from the other tab / partner.
subscribe((s, origin) => {
  if (origin !== 'remote') return;
  const prevResult = !!state.session?.result;
  state = s;
  if (me && S.maybeAdapt(me)) state = load();
  if (route === 'final' && !prevResult && s.session?.result) return go('result', { focus: false });
  if (ui.handoff) return;
  const active = document.activeElement;
  const typing = active && /INPUT|SELECT|TEXTAREA/.test(active.tagName) && app.contains(active);
  if (!typing) render();
});

// Partner may have finished while this tab was closed.
if (me && S.maybeAdapt(me)) state = load();
render();
window.__idc = { get me() { return me; }, get route() { return route; } }; // test hook: identity + route only
