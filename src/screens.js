// The five main screens: Home, History, Settle, Recap, Settings.
import { html, useEffect, useMemo, useRef, useState } from './ui.js';
import { Icon, categoryIcon } from './icons.js';
import { Avatar, Chip, Empty, ExpenseRow, Jar, MonthNav, Segmented, Sheet, SheetHeader, TextBox, avatarFor, closeSheet, partyTone, tight } from './components.js';
import { HPBar, Scene, Sprite, moodFor } from './sprites.js';
import { CharacterSheet } from './character.js';
import { CharArt } from './avatar.js';
import {
  CATEGORIES, MODE, createInvite, dateFundBalance, defaultSettleMonth, leaveCouple, liveExpenses, me, memberName,
  monthSpent, partner, reopenMonth, setPref, settleMonth, settlementRow, signOut, toast, updateCouple,
  updateMemberName, useStore, switchDemoUser, flush, friendlyError, onlySamples, changeHomeCurrency, removeSamples,
  activeTrip, endTrip, tripById, tripExpenses,
} from './store.js';
import {
  addMonths, budgetExpenses, currentMonthKey, dayLabel, fmt, monthExpenses, monthKey, monthLabel, pace,
  roundTo, settlementFor, shortDate, sum, todayISO, currencyDecimals, placeFor,
} from './money.js';
import { CurrencyPicker } from './add.js';
import { TripSheet, tripDay, tripRange } from './trips.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

async function shareOrCopy({ title, text, url }) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText([text, url].filter(Boolean).join(' '));
    return 'copied';
  } catch {
    return 'failed';
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Fraction of a month's budget still left in the jar. */
function leftFrac(spent, budget) {
  return budget > 0 ? Math.max(0, (budget - spent) / budget) : 0;
}

/** What a character says when tapped, by how the month is going. */
const LINES = {
  happy: ['Hi there!', "We're on track!", 'Date night soon?', 'Lots of honey left!', 'Yay, teamwork!', 'Hehe, hi!'],
  alert: ['Slow down a bit?', 'Maybe a picnic date?', "Hmm, it's going fast", 'A cheap date next?'],
  sweat: ['Uh oh…', 'Cook at home tonight?', 'The jar is almost empty!', 'Try a free date!'],
  idle: ['Hi!', 'Hehe'],
};
const pick = (list, last) => {
  const options = list.filter((l) => l !== last);
  return options[Math.floor(Math.random() * options.length)] ?? list[0];
};
const tapFeel = () => { try { navigator.vibrate?.(12); } catch { /* not supported */ } };

/** The two partners standing beside the jar. Tap a character to make it jump and talk; tap the jar to slosh it. */
function Party({ s, mood, jarProps, leftLabel }) {
  const mine = me(s);
  const other = partner(s);
  const [talk, setTalk] = useState({ who: null, text: '', key: 0, action: '' });
  const timer = useRef(null);
  const react = (who, text, action) => {
    tapFeel();
    clearTimeout(timer.current);
    setTalk((t) => ({ who, text, key: t.key + 1, action }));
    timer.current = setTimeout(() => setTalk((t) => ({ ...t, who: null, text: '' })), 2400);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const tapChar = (m) => react(m.user_id, pick(LINES[mood] ?? LINES.idle, talk.text), talk.key % 3 === 2 ? 'spin' : 'jump');
  const char = (m, delay) => html`
    <button class="tap-char" onClick=${() => tapChar(m)} aria-label=${m.user_id === mine?.user_id ? 'Talk to your character' : `Talk to ${m.display_name}`}>
      <${Sprite} avatar=${avatarFor(m.user_id, s)} mood=${mood} name=${m.display_name} delay=${delay}
        say=${talk.who === m.user_id ? talk.text : ''} action=${talk.who === m.user_id ? talk.action : ''} actionKey=${talk.key}/>
    </button>`;
  return html`
    <div class="party-stage">
      ${mine && char(mine, 0)}
      <button class="tap-jar" onClick=${() => react('jar', leftLabel, 'wobble')} aria-label=${`Jar: ${leftLabel}`}>
        <${Jar} ...${jarProps} say=${talk.who === 'jar' ? talk.text : ''} actionKey=${talk.who === 'jar' ? talk.key : 0}/>
      </button>
      ${other ? char(other, 400) : html`<div class="sprite sprite-ghost"><span class="sprite-name">Player 2?</span></div>`}
    </div>`;
}

/** What the jar, the bar and settling mean, in four steps plus two words people ask about. */
function HowItWorks() {
  return html`
    <ol class="group padded how">
      <li><span><b>Add</b> what you spend on dates. Say who paid.</span></li>
      <li><span><b>The jar</b> and the Budget bar show what is left this month. The ▼ <i>today</i> mark is where it should be today.</span></li>
      <li><span><b>Settle up</b> at month end: each of you gets paid back from the joint account.</span></li>
      <li><span><b>Money left over</b> goes to the date fund, for a special date.</span></li>
      <li><span><b>Going away?</b> Start a trip. It has its own jar and does not use the monthly budget.</span></li>
    </ol>
    <p class="hint how-note"><b>Estimate:</b> a foreign amount at today's rate. Add what your card charged to make it exact.</p>`;
}

function HowSheet({ onClose }) {
  return html`
    <${Sheet} title="How Date Jar works" onClose=${onClose}>
      <${SheetHeader} title="How it works" onClose=${onClose}/>
      <div class="sheet-scroll"><${HowItWorks}/></div>
    <//>`;
}

// ================================================================= HOME

/** Offline, syncing or sync trouble: one calm line, with a retry when it helps. */
function SyncPill({ s }) {
  const waiting = s.outbox.length;
  if (s.online && !waiting && !s.syncError) return null;
  return html`
    <p class=${`status-pill ${!s.online ? 'offline' : ''}`} role="status">
      <${Icon} name=${!s.online ? 'offline' : 'sync'} size=${12}/>
      ${!s.online ? (waiting ? `Offline. ${plural(waiting, 'change', 'changes')} will sync later.` : 'Offline. You can still add expenses.')
        : waiting && !s.syncError ? `Syncing ${plural(waiting, 'change', 'changes')}…` : 'Could not sync. Your changes are saved on this phone.'}
      ${s.online && (waiting > 0 || s.syncError) && html`<button class="link" onClick=${flush}>Try again</button>`}
    </p>`;
}

/** While a trip is on, Home shows the trip or the month. */
function ViewSwitch({ trip, view, onView }) {
  return html`<${Segmented} class="view-switch" label="Show on Home" value=${view} onChange=${onView}
    options=${[{ value: 'trip', label: trip.name, icon: 'travel' }, { value: 'month', label: monthLabel(currentMonthKey(), { withYear: false }), icon: 'calendar' }]}/>`;
}

/** Home during a trip: the trip's own jar, who paid on the trip and its expenses. */
function TripHome({ s, trip, nav, onView }) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const home = s.couple.home_currency;
  const list = tripExpenses(trip.id, s);
  const spent = sum(list);
  const budget = Number(trip.budget) || 0;
  const day = tripDay(trip);
  const mine = me(s);
  const other = partner(s);
  const status = spent <= 0 ? 'empty' : budget && spent > budget ? 'over' : budget && spent / budget > 0.85 ? 'hot' : 'on-track';
  const left = budget ? leftFrac(spent, budget) : 1;
  const leftLabel = budget ? (spent > budget ? `${fmt(spent - budget, home)} over!` : `${fmt(budget - spent, home)} left!`) : `${fmt(spent, home)} spent`;
  const justSaved = s.justSaved && Date.now() - s.justSaved.at < 4000 ? s.justSaved.at : null;
  const paidBy = (uid) => sum(list.filter((e) => e.paid_by === uid));
  const jointTotal = sum(list.filter((e) => !e.paid_by));
  const recent = list.slice().sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5);
  const perDay = Math.round(spent / day);
  const summary = `${trip.name}, day ${day}. ${fmt(spent, home)} spent${budget ? ` of a ${fmt(budget, home)} trip budget` : ''}.`;

  const pages = [
    { id: 'trip', tone: `st-${status}`,
      head: status === 'over' ? 'Over the trip budget' : status === 'hot' ? 'Trip budget almost used' : `Day ${day}. Have fun!`,
      // The amount under the jar is the trip total (no budget) or what is left (budget): say the other number here.
      big: spent <= 0 ? null : budget ? `${fmt(spent, home)} spent` : `About ${fmt(perDay, home)} a day`,
      body: spent <= 0 ? 'Add what you spend. It goes in this trip.'
        : budget ? `About ${fmt(perDay, home)} a day so far.` : `So far, over ${plural(day, 'day', 'days')}. Your monthly date budget is not touched.` },
    { id: 'note', head: 'Not in the monthly budget', body: 'The trip has its own jar. At month end you still pay each other back as usual.' },
    { id: 'end', head: 'Back home?', body: 'End the trip. New expenses use the monthly budget again.', action: { label: 'End trip', run: endTrip } },
  ];
  const msg = pages[Math.min(page, pages.length - 1)];

  return html`
    <section class="screen home trip-home">
      <header class="topbar slim">
        <h1 class="bar-title">${trip.name} · Day ${day}</h1>
        <button class="people" onClick=${() => nav.go('settings')} aria-label="You and your partner. Open settings">
          ${mine && html`<${Avatar} name=${mine.display_name} userId=${mine.user_id} size=${30}/>`}
          ${other && html`<${Avatar} name=${other.display_name} userId=${other.user_id} size=${30}/>`}
        </button>
      </header>
      <${ViewSwitch} trip=${trip} view="trip" onView=${onView}/>
      <${SyncPill} s=${s}/>

      <p class="sr-only">${summary}</p>
      <${Scene}>
        <${Party} s=${s} mood=${moodFor(status)} leftLabel=${leftLabel} jarProps=${{ left, pace: null, dayLabel: '', dropKey: justSaved, summary }}/>
      <//>

      <div class="hp-row">
        ${budget > 0 ? html`
          <${HPBar} left=${left} budgetLeftLabel=${fmt(Math.max(0, budget - spent), home)}/>
          <div class="hp-foot"><button class="link what-link" onClick=${() => setEditing(true)}>Edit trip</button>
            <p class="hp-nums"><b data-over=${spent > budget}>${tight(spent > budget ? fmt(spent - budget, home) : fmt(budget - spent, home))}</b> <span>${spent > budget ? html`over the ${tight(fmt(budget, home))} trip budget` : html`/ ${tight(fmt(budget, home))} left`}</span></p></div>` : html`
          <div class="hp-foot"><button class="link what-link" onClick=${() => setEditing(true)}>Add a trip budget</button>
            <p class="hp-nums"><b>${tight(fmt(spent, home))}</b> <span>spent on this trip</span></p></div>`}
      </div>

      <div class=${`textbox paged ${msg.tone ?? ''}`} aria-live="polite">
        <p class="tb-head">${msg.head}</p>
        ${msg.big && html`<p class="tb-big">${tight(msg.big)}</p>`}
        <p>${msg.body}</p>
        ${msg.action && html`<button class="tb-action" onClick=${msg.action.run}><i class="cursor" aria-hidden="true"></i>${msg.action.label}</button>`}
        <button class="tb-next" onClick=${() => setPage((page + 1) % pages.length)} aria-label=${`Next message, ${(page % pages.length) + 1} of ${pages.length}`}>
          <span>Next</span><span class="tb-count">${(page % pages.length) + 1}/${pages.length}</span><i class="more" aria-hidden="true"></i>
        </button>
      </div>

      ${list.length > 0 && html`<h2 class="list-label">Who paid on this trip</h2>
      <div class="payers" role="list" aria-label="Who paid on this trip">
        ${[mine, other].filter(Boolean).map((m) => html`
          <div key=${m.user_id} role="listitem">
            <${Avatar} name=${m.display_name} userId=${m.user_id} size=${22}/>
            <span>${m.user_id === mine?.user_id ? 'You' : m.display_name}</span><b>${tight(fmt(paidBy(m.user_id), home))}</b>
          </div>`)}
        <div role="listitem">
          <span class="avatar avatar-joint" style="--size:22px"><${Icon} name="joint" size=${12}/></span>
          <span>Joint account</span><b>${tight(fmt(jointTotal, home))}</b>
        </div>
      </div>`}

      <div class="list-head"><h2 class="list-label">Trip expenses</h2>${recent.length > 0 && html`<button class="link" onClick=${() => nav.go('history', `trip:${trip.id}`)}>See all</button>`}</div>
      ${recent.length === 0 ? html`
        <${Empty} icon="travel" title="No trip expenses yet" action=${html`<button class="btn btn-secondary" onClick=${nav.add}><${Icon} name="plus" size=${12}/> Add expense</button>`}>
          Everything you add now goes in ${trip.name}.
        <//>` : html`
        <div class="rows">${recent.map((e) => html`<${ExpenseRow} key=${e.id} e=${e} home=${home} onOpen=${nav.open} showTrip=${false}/>`)}</div>`}
      ${editing && html`<${TripSheet} trip=${trip} onClose=${() => closeSheet(() => setEditing(false))}/>`}
    </section>`;
}

export function Home({ nav }) {
  const s = useStore();
  const [page, setPage] = useState(0);
  const [how, setHow] = useState(false);
  const [view, setView] = useState('trip');
  const [starting, setStarting] = useState(false);
  const trip = activeTrip(s);
  if (trip && view === 'trip') return html`<${TripHome} s=${s} trip=${trip} nav=${nav} onView=${setView}/>`;
  const home = s.couple.home_currency;
  const key = currentMonthKey();
  const budget = Number(s.couple.monthly_budget);
  const spent = monthSpent(key, s);
  const p = pace({ spent, budget, key });
  const mine = me(s);
  const other = partner(s);
  const fund = dateFundBalance(s);
  const monthList = budgetExpenses(liveExpenses(s), key);
  const recent = monthExpenses(liveExpenses(s), key).filter((e) => !e.trip_id).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5);

  const prevKey = addMonths(key, -1);
  const prevHas = monthExpenses(liveExpenses(s), prevKey).length > 0;
  const prevOpen = prevHas && !settlementRow(prevKey, s);

  const justSaved = s.justSaved && Date.now() - s.justSaved.at < 4000 ? s.justSaved.at : null;
  const paidBy = (uid) => sum(monthList.filter((e) => e.paid_by === uid));
  const jointTotal = sum(monthList.filter((e) => !e.paid_by));
  const left = leftFrac(spent, budget);

  const headline = {
    empty: 'A full jar!',
    'on-track': "We're on track!",
    ahead: 'Spending a bit fast',
    hot: 'Spending too fast',
    over: 'Over budget',
  }[p.status];

  // The one number to act on today. The budget left is already on the bar above, so it is not repeated here.
  let big = null;
  let detail;
  if (p.status === 'empty') detail = 'Nothing spent yet. Add your first date.';
  else if (p.status === 'over') detail = `${fmt(spent - budget, home)} over our ${fmt(budget, home)} budget. That's okay.`;
  else if (p.daysLeft > 0) { big = `About ${fmt(Math.floor(p.perDay), home)} a day`; detail = `for us, for the rest of ${monthLabel(key, { withYear: false })}.`; }
  else detail = `${fmt(p.remaining, home)} left this month.`;

  const summary = `${fmt(Math.max(0, budget - spent), home)} of ${fmt(budget, home)} budget left. ${headline.replace(/[!.]$/, '')}. ${big ? `${big} ${detail}` : detail}`;
  const showInstall = isIOS && !standalone && !s.prefs.installDismissed;
  const waiting = s.outbox.length;

  // A first visit without a character of your own: a welcome (for the partner who joined) or a nudge to make one.
  const joined = s.members.findIndex((m) => m.user_id === mine?.user_id) > 0;
  const welcome = mine && !mine.avatar && !s.prefs.welcomed && (joined
    ? { head: `Welcome, ${mine.display_name}!`, body: `You share this jar with ${other?.display_name ?? 'your partner'}. Add what you spend on dates. The jar shows what is left this month. At month end, the joint account pays each of you back.` }
    : { head: 'Make your character', body: 'Pick hair, clothes and a hat. Your partner sees it here.' });
  // Every message on Home pages through the one RPG text box (▼ = next message).
  const pages = [
    { id: 'status', tone: `st-${p.status}`, head: headline, big, body: detail },
    welcome && { id: 'welcome', head: welcome.head, body: welcome.body, action: { label: 'Make my character', run: () => { setPref('welcomed', true); nav.go('settings', 'character'); } } },
    prevOpen && { id: 'settle', head: `Time to settle ${monthLabel(prevKey, { withYear: false })}`, body: 'Pay each other back from the joint account.', action: { label: 'Settle up', run: () => nav.go('settle', prevKey) } },
    !other && MODE === 'cloud' && { id: 'invite', head: 'Invite your partner', body: 'They see each expense right away.', action: { label: 'Invite', run: () => nav.go('settings') } },
    showInstall && { id: 'install', head: 'Add to your Home Screen', body: html`Tap <${Icon} name="share" size=${12} class="inline-icon"/>, then “Add to Home Screen”. Date Jar opens like an app.`, action: { label: 'Got it', run: () => setPref('installDismissed', true) } },
    MODE === 'demo' && { id: 'demo', head: 'Demo mode', body: `Your data stays on this phone only. Sharing with your partner comes later.${monthList.some((e) => e.sample) ? ' Items marked “sample” are examples.' : ''}` },
  ].filter(Boolean);
  // Most urgent first: a warning about spending, then money waiting to be settled, then everything else.
  const urgent = p.status === 'over' || p.status === 'hot';
  const rank = { status: urgent ? 0 : 2, settle: 1, welcome: joined ? 1.5 : 3, invite: 4, install: 5, demo: 6 };
  pages.sort((a, b) => rank[a.id] - rank[b.id]);
  const pageIdx = Math.min(page, pages.length - 1);
  const msg = pages[pageIdx];

  return html`
    <section class="screen home">
      <header class="topbar slim">
        <h1 class="bar-title">${monthLabel(key, { withYear: false })} · Day ${p.day}</h1>
        <button class="people" onClick=${() => nav.go('settings')} aria-label="You and your partner. Open settings">
          ${mine && html`<${Avatar} name=${mine.display_name} userId=${mine.user_id} size=${30}/>`}
          ${other ? html`<${Avatar} name=${other.display_name} userId=${other.user_id} size=${30}/>` : html`<span class="avatar avatar-ghost" style="--size:30px"><${Icon} name="plus" size=${12}/></span>`}
        </button>
      </header>

      ${trip && html`<${ViewSwitch} trip=${trip} view="month" onView=${setView}/>`}
      <${SyncPill} s=${s}/>

      <p class="sr-only">${summary}</p>
      <${Scene}>
        <${Party} s=${s} mood=${moodFor(p.status)} leftLabel=${p.status === 'over' ? `${fmt(spent - budget, home)} over!` : `${fmt(Math.max(0, budget - spent), home)} left!`}
          jarProps=${{ left, pace: p.isCurrent ? 1 - p.timePct : null, dayLabel: 'today', dropKey: justSaved, summary }}/>
      <//>

      <div class="hp-row">
        <${HPBar} left=${left} budgetLeftLabel=${fmt(Math.max(0, budget - spent), home)} pace=${1 - p.timePct} paceLabel="Where we should be today"/>
        <div class="hp-foot"><button class="link what-link" onClick=${() => setHow(true)}>What is this?</button>
        <p class="hp-nums"><b data-over=${p.status === 'over'}>${tight(p.status === 'over' ? fmt(spent - budget, home) : fmt(Math.max(0, budget - spent), home))}</b> <span>${p.status === 'over' ? html`over our ${tight(fmt(budget, home))} budget` : html`/ ${tight(fmt(budget, home))} left`}</span></p></div>
      </div>

      <div class=${`textbox paged ${msg.tone ?? ''}`} aria-live="polite">
        <p class="tb-head">${msg.head}</p>
        ${msg.big && html`<p class="tb-big">${tight(msg.big)}</p>`}
        <p>${msg.body}</p>
        ${msg.action && html`<button class="tb-action" onClick=${msg.action.run}><i class="cursor" aria-hidden="true"></i>${msg.action.label}</button>`}
        ${pages.length > 1 && html`
          <button class="tb-next" onClick=${() => setPage((pageIdx + 1) % pages.length)} aria-label=${`Next message, ${pageIdx + 1} of ${pages.length}`}>
            <span>Next</span><span class="tb-count">${pageIdx + 1}/${pages.length}</span><i class="more" aria-hidden="true"></i>
          </button>`}
      </div>

      ${monthList.length > 0 && html`<h2 class="list-label">Who paid this month</h2>
      <div class="payers" role="list" aria-label="Who paid this month">
        ${[mine, other].filter(Boolean).map((m) => html`
          <div key=${m.user_id} role="listitem">
            <${Avatar} name=${m.display_name} userId=${m.user_id} size=${22}/>
            <span>${m.user_id === mine?.user_id ? 'You' : m.display_name}</span><b>${tight(fmt(paidBy(m.user_id), home))}</b>
          </div>`)}
        <div role="listitem">
          <span class="avatar avatar-joint" style="--size:22px"><${Icon} name="joint" size=${12}/></span>
          <span>Joint account</span><b>${tight(fmt(jointTotal, home))}</b>
        </div>
      </div>`}

      ${fund > 0 && html`
        <p class="fund-line"><span class="fund-icon"><${Icon} name="chest" size=${24}/></span><span>Date fund <b>${tight(fmt(fund, home))}</b><small>Saved from past months. For a special date!</small></span></p>`}

      <div class="list-head"><h2 class="list-label">Recent expenses</h2>${recent.length > 0 && html`<button class="link" onClick=${() => nav.go('history')}>See all</button>`}</div>
      ${recent.length === 0 ? html`
        <${Empty} icon="jar" title="No expenses yet this month" action=${html`<button class="btn btn-secondary" onClick=${nav.add}><${Icon} name="plus" size=${12}/> Add first expense</button>`}>
          Add what you spend on dates: dinner, coffee, movies. At month end, each of you gets paid back.
        <//>` : html`
        <div class="rows">${recent.map((e) => html`<${ExpenseRow} key=${e.id} e=${e} home=${home} onOpen=${nav.open}/>`)}</div>`}

      ${spent > 0 && html`<button class="link recap-link" onClick=${() => nav.recap(key)}>See this month's recap</button>`}
      ${!trip && html`<button class="link trip-link" onClick=${() => setStarting(true)}><${Icon} name="travel" size=${12}/> Going away? Start a trip</button>`}
      ${how && html`<${HowSheet} onClose=${() => closeSheet(() => setHow(false))}/>`}
      ${starting && html`<${TripSheet} onClose=${() => closeSheet(() => setStarting(false))}/>`}
    </section>`;
}

// ================================================================= HISTORY

const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
const catOf = (e) => (e.category && CATEGORIES.some((c) => c.id === e.category) ? e.category : 'other');

/** Spending by category, biggest first. Tap a row to show only that category; tap again to show all. */
function WhereItWent({ list, home, selected, onPick }) {
  const [more, setMore] = useState(false);
  const total = sum(list);
  const by = {};
  list.forEach((e) => { by[catOf(e)] = (by[catOf(e)] ?? 0) + (Number(e.home_amount) || 0); });
  const rows = Object.entries(by).map(([id, amt]) => ({ id, amt: roundTo(amt) })).filter((r) => r.amt > 0).sort((a, b) => b.amt - a.amt);
  if (total <= 0 || (rows.length < 2 && !selected)) return null;
  const top = rows[0].amt;
  const shown = more || rows.length <= 5 ? rows : rows.slice(0, 4).concat(rows.slice(4).filter((r) => r.id === selected));
  return html`
    <section class="where" aria-label="Where it went">
      <h2 class="where-head"><span>Where it went</span><span>${selected ? 'Tap again to show all' : 'Tap to filter'}</span></h2>
      ${shown.map((r) => html`
        <button key=${r.id} class=${`where-row ${selected === r.id ? 'on' : ''}`} aria-pressed=${selected === r.id} onClick=${() => onPick(selected === r.id ? null : r.id)}
          aria-label=${`${catLabel(r.id)}: ${fmt(r.amt, home)}, ${Math.round((r.amt / total) * 100)} percent`}>
          <span class=${`row-icon cat-${r.id}`} aria-hidden="true"><${Icon} name=${categoryIcon(r.id)} size=${12}/></span>
          <span class="where-label">${catLabel(r.id)}</span>
          <span class=${`where-bar cat-${r.id}`} aria-hidden="true"><i style=${`--w:${r.amt / top}`}></i></span>
          <span class="where-amt"><span>${tight(fmt(r.amt, home))}</span><small>${Math.round((r.amt / total) * 100)}%</small></span>
        </button>`)}
      ${rows.length > 5 && html`<button class="link where-more" onClick=${() => setMore(!more)}>${more ? 'Show less' : `Show all ${rows.length}`}</button>`}
    </section>`;
}

export function History({ nav, arg }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [key, setKey] = useState(currentMonthKey());
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [kind, setKind] = useState('all');
  const [cat, setCat] = useState(null);
  const [editTrip, setEditTrip] = useState(false);
  const mine = me(s);
  const other = partner(s);
  // #/history/trip:<id> shows one whole trip, across months.
  const trip = arg?.startsWith('trip:') ? tripById(arg.slice(5), s) : null;
  useEffect(() => { setQ(''); setWho('all'); setKind('all'); setCat(null); }, [arg]);

  const all = trip ? tripExpenses(trip.id, s) : monthExpenses(liveExpenses(s), key);
  const monthTrips = trip ? [] : [...new Set(all.map((e) => e.trip_id).filter(Boolean))].map((id) => tripById(id, s)).filter(Boolean);
  // Every filter but the category: "Where it went" shows the split of what you are looking at.
  const base = all
    .filter((e) => !q.trim() || `${e.description} ${e.original_currency}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((e) => who === 'all' || (who === 'joint' ? !e.paid_by : e.paid_by === who))
    .filter((e) => kind === 'all' || (kind === 'foreign' ? e.original_currency !== home : !e.amount_confirmed));
  const list = base
    .filter((e) => !cat || catOf(e) === cat)
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || '').localeCompare(a.created_at || ''));

  const days = [];
  list.forEach((e) => {
    const last = days[days.length - 1];
    if (last && last.date === e.spent_on) last.items.push(e);
    else days.push({ date: e.spent_on, items: [e] });
  });

  const total = sum(list);
  const settled = settlementRow(key, s);
  const filtered = who !== 'all' || kind !== 'all' || cat || q.trim();
  const hasForeign = all.some((e) => e.original_currency !== home);
  const hasEstimated = all.some((e) => !e.amount_confirmed);
  const budget = Number(s.couple.monthly_budget);
  const monthTotal = monthSpent(key, s);

  return html`
    <section class="screen history">
      ${trip ? html`
        <div class="month-nav trip-nav">
          <button class="icon-btn" onClick=${() => nav.go('history')} aria-label="Back to months"><${Icon} name="back"/></button>
          <div class="month-nav-label">
            ${trip.budget > 0 && html`<${Jar} size="sm" left=${leftFrac(sum(all), Number(trip.budget))} summary=${`${fmt(Math.max(0, trip.budget - sum(all)), home)} left in the trip budget`}/>`}
            <div><h1>${trip.name}</h1><p>${`${tripRange(trip)} · ${fmt(total, home)} · ${plural(list.length, 'expense', 'expenses')}`}</p></div>
          </div>
          <button class="icon-btn" onClick=${() => setEditTrip(true)} aria-label=${`Edit ${trip.name}`}><${Icon} name="edit"/></button>
        </div>` : html`<${MonthNav} label=${monthLabel(key)} onPrev=${() => { setKey(addMonths(key, -1)); setCat(null); }} onNext=${() => { setKey(addMonths(key, 1)); setCat(null); }}
        canNext=${key < currentMonthKey()} sub=${`${fmt(total, home)} · ${list.length} ${list.length === 1 ? 'expense' : 'expenses'}${settled ? ' · settled' : ''}`}
        art=${html`<${Jar} size="sm" left=${leftFrac(monthTotal, budget)} summary=${`${fmt(Math.max(0, budget - monthTotal), home)} left in budget`}/>`}/>`}
      <${WhereItWent} list=${base} home=${home} selected=${cat} onPick=${setCat}/>
      <div class="search-wrap">
        <${Icon} name="search" size=${12}/>
        <input type="search" placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search expenses" autocomplete="off"/>
      </div>
      <div class="chip-row scroll" role="group" aria-label="Filter">
        <${Chip} on=${who === 'all' && kind === 'all' && !cat} onClick=${() => { setWho('all'); setKind('all'); setCat(null); }}>All<//>
        ${monthTrips.map((t) => html`<${Chip} key=${t.id} class="content" onClick=${() => nav.go('history', `trip:${t.id}`)} aria-label=${`Show all of ${t.name}`}><${Icon} name="travel" size=${12}/> ${t.name}<//>`)}
        ${cat && html`<${Chip} on=${true} onClick=${() => setCat(null)} aria-label=${`${catLabel(cat)}. Tap to show all categories`}>${catLabel(cat)} <${Icon} name="close" size=${12}/><//>`}
        ${mine && html`<${Chip} on=${who === mine.user_id} onClick=${() => setWho(who === mine.user_id ? 'all' : mine.user_id)}>Paid by me<//>`}
        ${other && html`<${Chip} on=${who === other.user_id} onClick=${() => setWho(who === other.user_id ? 'all' : other.user_id)}>Paid by ${other.display_name}<//>`}
        <${Chip} on=${who === 'joint'} onClick=${() => setWho(who === 'joint' ? 'all' : 'joint')}>Joint account<//>
        ${hasForeign && html`<${Chip} on=${kind === 'foreign'} onClick=${() => setKind(kind === 'foreign' ? 'all' : 'foreign')}>Foreign<//>`}
        ${hasEstimated && html`<${Chip} on=${kind === 'estimated'} onClick=${() => setKind(kind === 'estimated' ? 'all' : 'estimated')}>Estimates<//>`}
      </div>

      ${days.length === 0 ? html`
        <${Empty} icon=${filtered ? 'search' : 'history'} title=${filtered ? 'No matches' : trip ? `No expenses in ${trip.name}` : `No expenses in ${monthLabel(key, { withYear: false })}`}
          action=${!filtered && !trip && key === currentMonthKey() ? html`<button class="btn btn-secondary" onClick=${nav.add}><${Icon} name="plus" size=${18}/> Add expense</button>` : null}>
          ${filtered ? 'Clear a filter or try another word.' : 'New expenses show here. Newest first.'}
        <//>` : days.map((d) => html`
        <section key=${d.date} class="day">
          <h2 class="day-head"><span>${dayLabel(d.date)}</span><span>${tight(fmt(sum(d.items), home))}</span></h2>
          <div class="rows">${d.items.map((e) => html`<${ExpenseRow} key=${e.id} e=${e} home=${home} onOpen=${nav.open} showTrip=${!trip}/>`)}</div>
        </section>`)}
      ${editTrip && trip && html`<${TripSheet} trip=${trip} onClose=${() => closeSheet(() => setEditTrip(false))}/>`}
    </section>`;
}

// ================================================================= SETTLE

/** Before money is marked as moved: list each transfer so both of you can check it in your bank app. */
function SettleReview({ monthName, early, transfers, estimated, home, onCopy, onFix, onConfirm, onClose }) {
  const s = useStore();
  const mine = me(s);
  const estimates = estimated.length;
  return html`
    <${Sheet} title=${`Settle ${monthName}`} onClose=${onClose}>
      <${SheetHeader} title=${`Settle ${monthName}`} onClose=${onClose}/>
      <div class="sheet-scroll review">
        ${estimates > 0 && html`
          <div class="notice warn">
            <${Icon} name="globe" size=${18}/>
            <div>
              <b>${estimates === 1 ? 'Check 1 amount first' : `Check ${estimates} amounts first`}</b>
              <p>${estimates === 1 ? 'It is still an estimate. The transfer may be wrong.' : 'They are still estimates. The transfers may be wrong.'} Add what your card really charged.</p>
              <div class="est-list">
                ${estimated.map((e) => html`
                  <button key=${e.id} class="link est-link" onClick=${() => onFix(e.id)}><span class="content">${e.description}</span> · ${tight(fmt(e.original_amount, e.original_currency))}</button>`)}
              </div>
            </div>
          </div>`}
        ${early && html`<p class="notice"><${Icon} name="info" size=${16}/> ${monthName} is not over yet. A new expense will reopen it.</p>`}
        <p class="review-step"><b>1</b> Move the money in your bank app, from the joint account:</p>
        ${transfers.length ? html`
          <div class="review-list">
            ${transfers.map((t) => html`
              <div key=${t.user_id} class="review-row">
                <i class="pip" style=${partyTone(t.user_id, s).style} aria-hidden="true"></i>
                <span>${tight(`${fmt(t.amount, home)} to ${t.user_id === mine?.user_id ? 'you' : t.name}`)}</span>
                <button class="btn btn-secondary small" onClick=${() => onCopy(t.amount)}><${Icon} name="copy" size=${12}/> Copy</button>
              </div>`)}
          </div>` : html`<p class="hint">Nobody needs to be paid back this month.</p>`}
        <p class="review-step"><b>2</b> When the money has moved, mark the month as settled.</p>
        <p class="hint">Date Jar does not move money.</p>
      </div>
      <div class="add-foot btn-col">
        <button class="btn btn-primary btn-block" onClick=${onConfirm}><${Icon} name="check" size=${12}/> ${estimates ? 'Settle with estimates' : 'Money moved. Mark as settled'}</button>
        <button class="btn btn-quiet btn-block" onClick=${onClose}>Not yet</button>
      </div>
    <//>`;
}

export function Settle({ nav, arg }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [key, setKey] = useState(arg || defaultSettleMonth(s));
  useEffect(() => { if (arg) setKey(arg); }, [arg]);
  // The month just settled on this screen: both characters cheer and the quest card plays its moment once.
  const [fresh, setFresh] = useState(null);
  useEffect(() => { if (!fresh) return undefined; const t = setTimeout(() => setFresh(null), 2800); return () => clearTimeout(t); }, [fresh]);
  const [reviewing, setReviewing] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  useEffect(() => setConfirmReopen(false), [key]);
  const cheering = fresh === key;

  const st = useMemo(() => settlementFor(liveExpenses(s), s.members, key), [s.expenses, s.members, key]);
  const settled = settlementRow(key, s);
  const snap = settled?.snapshot;
  const budget = Number(snap?.budget ?? s.couple.monthly_budget);
  const spentInBudget = snap ? Number(snap.spent) : st.budgetSpent;
  const over = spentInBudget > budget;
  const leftover = roundTo(Math.max(0, budget - spentInBudget));
  const isCurrent = key === currentMonthKey();
  const daysLeft = isCurrent ? pace({ spent: st.budgetSpent, budget, key }).daysLeft : 0;
  const mine = me(s);
  const youFirst = (a, b) => (a.member.user_id === mine?.user_id ? -1 : 1) - (b.member.user_id === mine?.user_id ? -1 : 1);
  // A settled month shows what was actually paid back (the snapshot), not today's live totals.
  const sides = snap
    ? s.members.map((m) => {
      const row = snap.byMember.find((b) => b.user_id === m.user_id);
      return { member: m, amount: Number(row?.amount ?? 0), count: st.byMember.find((b) => b.member.user_id === m.user_id)?.count ?? 0 };
    })
    : st.byMember;
  const ordered = [...sides].sort(youFirst);
  const nothing = st.list.length === 0 && !settled;
  const estimates = st.estimated.filter((e) => e.original_currency !== home).length;
  const jointTotal = snap ? Number(snap.joint ?? 0) : st.jointTotal;
  const monthName = monthLabel(key, { withYear: false });
  const transfers = st.byMember.filter((b) => b.amount > 0).sort(youFirst)
    .map((b) => ({ user_id: b.member.user_id, name: b.member.display_name, amount: b.amount }));

  const copyAmount = async (amt) => {
    const text = Number(amt).toFixed(currencyDecimals(home));
    const ok = await copyText(text);
    toast(ok ? `Copied ${text}` : 'Can’t copy. Press and hold the amount.');
  };
  const confirmSettle = () => {
    setReviewing(false);
    settleMonth(key);
    setFresh(key);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const state = settled ? 'done' : isCurrent ? 'progress' : 'due';
  const settledOn = settled?.settled_at ? shortDate(settled.settled_at.slice(0, 10)) : '';
  const nameOf = (b, you) => (you ? 'You' : b.member.display_name);

  return html`
    <section class="screen settle">
      <${MonthNav} label=${monthLabel(key)} onPrev=${() => setKey(addMonths(key, -1))} onNext=${() => setKey(addMonths(key, 1))}
        canNext=${key < currentMonthKey()} sub=${nothing ? 'No expenses' : { done: 'Settled', progress: 'Month not over yet', due: 'Ready to settle' }[state]}/>

      ${nothing ? html`
        <${Empty} icon="settle" title="Nothing to settle">No expenses in ${monthName}.<//>` : html`

        ${state === 'done' && html`
          <div class=${`settled-card ${cheering ? 'fresh' : ''}`} role="status">
            ${cheering && html`<${Confetti} count=${30}/>`}
            <span class="settled-stars" aria-hidden="true"><${Icon} name="sparkle" size=${24}/><${Icon} name="sparkle" size=${12}/></span>
            <div class="settled-main">
              <b>Quest complete!</b>
              <span>${monthName} is settled. Paid back on ${settledOn} by ${memberName(settled.settled_by, s).replace(/^You$/, 'you')}.</span>
            </div>
            ${settled.fund_contribution > 0 && html`
              <div class="settled-fund">
                <span class="settled-chest">${cheering && html`<${CoinRain} count=${10}/>`}<span class=${`fund-icon ${cheering ? 'chest-bounce' : ''}`}><${Icon} name="chest" size=${24}/></span></span>
                <span><b class="settled-plus">+<${CountUp} value=${settled.fund_contribution} format=${(v) => fmt(v, home)} active=${cheering}/></b>to date fund</span>
              </div>`}
          </div>`}

        ${state === 'progress' && html`
          <${TextBox} class="st-on-track" more=${false}>
            <p class="tb-head">${daysLeft <= 0 ? `Last day of ${monthName}` : daysLeft === 1 ? `${monthName} ends tomorrow` : `${monthName} ends in ${daysLeft} days`}</p>
            <p>Spent ${fmt(st.budgetSpent, home)} of ${fmt(budget, home)}.<br/>At month end, each of you gets paid back from the joint account.</p>
          <//>`}

        ${state === 'due' && html`
          <${TextBox} class=${over ? 'st-over' : 'st-on-track'} more=${false}>
            <p class="tb-head">Time to settle ${monthName}</p>
            <p>${over ? `${fmt(spentInBudget - budget, home)} over budget.` : `${fmt(leftover, home)} left. It goes to the date fund.`}<br/>Pay each of you back from the joint account.</p>
          <//>`}

        <div class="duel" role="list" aria-label=${state === 'done' ? 'Paid back from the joint account' : state === 'progress' ? 'Paid so far' : 'Pay back from the joint account'}>
          ${[ordered[0], null, ordered[1]].map((b, i) => {
            if (i === 1) {
              return html`<div key="mid" class="duel-mid" aria-hidden="true">
                <${Jar} size="sm" left=${budget > 0 ? Math.max(0, (budget - spentInBudget) / budget) : 0} summary=""/>
              </div>`;
            }
            if (!b) return html`<div key="ghost" class="duel-side ghost"><div class="sprite sprite-ghost"></div><b>Player 2</b><span>Not joined yet</span></div>`;
            const you = b.member.user_id === mine?.user_id;
            const label = { done: you ? 'You got' : `${b.member.display_name} got`, progress: `${nameOf(b, you)} paid`, due: you ? 'You get' : `${b.member.display_name} gets` }[state];
            const sub = b.amount === 0 ? (state === 'progress' ? 'Nothing yet' : 'Nothing to pay')
              : `${plural(b.count, 'expense', 'expenses')}${state === 'progress' ? ' so far' : ''}`;
            return html`
              <div key=${b.member.user_id} role="listitem" class=${`duel-side party ${b.amount === 0 ? 'zero' : ''}`} style=${partyTone(b.member.user_id, s).style}>
                <${Sprite} avatar=${avatarFor(b.member.user_id, s)} mood=${b.amount > 0 || cheering ? 'happy' : 'idle'} delay=${you ? 0 : 400}
                  action=${cheering ? 'cheer' : ''} actionKey=${cheering ? 1 : 0}/>
                <span class="duel-name">${label}</span>
                <b class="duel-amt">${b.amount === 0 ? '—' : tight(fmt(b.amount, home))}</b>
                <span class="duel-sub">${sub}</span>
                ${state === 'due' && b.amount > 0 && html`<button class="btn btn-secondary small" onClick=${() => copyAmount(b.amount)}><${Icon} name="copy" size=${12}/> Copy</button>`}
              </div>`;
          })}
        </div>

        ${jointTotal > 0 && state === 'due' && html`<p class="hint joint-line"><span class="avatar avatar-joint" style="--size:22px"><${Icon} name="joint" size=${12}/></span><span>${tight(`Joint account paid ${fmt(jointTotal, home)}. Nothing to pay back.`)}</span></p>`}
        ${jointTotal > 0 && state !== 'due' && html`
          <div class="transfer zero">
            <span class="avatar avatar-joint" style="--size:40px"><${Icon} name="joint" size=${24}/></span>
            <div class="transfer-main"><b>${tight(`Joint account paid ${fmt(jointTotal, home)}`)}</b><span>${st.joint.length ? `${plural(st.joint.length, 'expense', 'expenses')} · ` : ''}Nothing to pay back</span></div>
          </div>`}

        ${st.fundSpent > 0 && html`<p class="hint">${fmt(st.fundSpent, home)} came from the date fund. Not counted in the budget.</p>`}
        ${st.tripSpent > 0 && html`<p class="hint">${fmt(st.tripSpent, home)} was spent on trips. It is not in the budget, but you pay each other back for it as usual.</p>`}

        ${state === 'due' && estimates > 0 && html`<p class="notice"><${Icon} name="globe" size=${16}/> ${estimates === 1 ? '1 amount is an estimate.' : `${estimates} amounts are estimates.`} You can fix ${estimates === 1 ? 'it' : 'them'} in the next step.</p>`}
        ${state === 'progress' && estimates > 0 && html`
          <div class="notice warn">
            <${Icon} name="globe" size=${18}/>
            <div>
              <b>${estimates === 1 ? '1 amount is an estimate' : `${estimates} amounts are estimates`}</b>
              <p>Check your card. Add the real amount.</p>
              <div class="est-list">
                ${st.estimated.filter((e) => e.original_currency !== home).map((e) => html`
                  <button key=${e.id} class="link est-link" onClick=${() => nav.open(e.id)}><span class="content">${e.description}</span> · ${tight(fmt(e.original_amount, e.original_currency))}</button>`)}
              </div>
            </div>
          </div>`}

        ${state === 'done' && html`
          ${confirmReopen ? html`
            <div class="notice warn reopen-check" role="alert">
              <${Icon} name="alert" size=${18}/>
              <div>
                <b>Reopen ${monthName}?</b>
                <p>${settled.fund_contribution > 0 ? `The ${fmt(settled.fund_contribution, home)} goes back out of the date fund. ` : ''}Settle it again after you change it.</p>
                <div class="btn-row">
                  <button class="btn btn-secondary small" onClick=${() => { reopenMonth(key); setConfirmReopen(false); }}>Reopen month</button>
                  <button class="btn btn-quiet small" onClick=${() => setConfirmReopen(false)}>Keep settled</button>
                </div>
              </div>
            </div>` : html`
            <div class="settle-actions">
              <button class="btn btn-secondary" onClick=${() => nav.recap(key)}><${Icon} name="sparkle" size=${12}/> See recap</button>
              <button class="btn btn-quiet" onClick=${() => setConfirmReopen(true)}>Reopen month</button>
            </div>`}`}

        ${state === 'progress' && html`
          ${leftover > 0 && html`<p class="fund-preview"><span class="fund-icon"><${Icon} name="chest" size=${24}/></span> What is left on the last day goes to the date fund. Now: ${fmt(leftover, home)}.</p>`}
          <div class="settle-actions">
            <button class="btn btn-secondary" onClick=${() => nav.recap(key)}><${Icon} name="sparkle" size=${12}/> See recap</button>
            <button class="btn btn-quiet" onClick=${() => setReviewing(true)}>Settle early</button>
          </div>`}

        ${state === 'due' && html`
          <button class="btn btn-primary btn-block settle-cta" onClick=${() => setReviewing(true)}>
            <${Icon} name="check" size=${12}/> Settle ${monthName}
          </button>
          <button class="link recap-link" onClick=${() => nav.recap(key)}>See recap</button>`}
      `}
      ${reviewing && html`<${SettleReview} monthName=${monthName} early=${isCurrent} transfers=${transfers} estimated=${st.estimated.filter((e) => e.original_currency !== home)} home=${home}
        onFix=${(id) => closeSheet(() => { setReviewing(false); nav.open(id); })}
        onCopy=${copyAmount} onConfirm=${() => closeSheet(confirmSettle)} onClose=${() => closeSheet(() => setReviewing(false))}/>`}
    </section>`;
}

// ================================================================= RECAP


function recapStats(s, key) {
  const home = s.couple.home_currency;
  const list = monthExpenses(liveExpenses(s), key);
  const budgeted = list.filter((e) => !e.from_fund && !e.trip_id);
  const total = sum(budgeted);
  const budget = Number(s.couple.monthly_budget);
  const byCat = {};
  budgeted.forEach((e) => { byCat[e.category ?? 'other'] = (byCat[e.category ?? 'other'] ?? 0) + e.home_amount; });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  // Groceries and home shopping are shared costs, not dates: leave them out of the date-night cards.
  const dates = list.filter((e) => !['groceries', 'home'].includes(e.category));
  const byDesc = {};
  dates.forEach((e) => {
    const k = e.description.trim().toLowerCase();
    byDesc[k] = byDesc[k] ?? { name: e.description.trim(), n: 0, total: 0 };
    byDesc[k].n += 1;
    byDesc[k].total += e.home_amount;
  });
  const topPlace = Object.values(byDesc).sort((a, b) => b.n - a.n || b.total - a.total)[0];
  const byDay = {};
  dates.forEach((e) => { byDay[e.spent_on] = (byDay[e.spent_on] ?? 0) + e.home_amount; });
  const topDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  const foreign = [...new Set(list.filter((e) => e.original_currency !== home).map((e) => e.original_currency))];
  const biggest = list.slice().sort((a, b) => b.home_amount - a.home_amount)[0];
  const row = settlementRow(key, s);
  return { home, list, total, budget, topCat, topPlace, topDay, foreign, biggest, days: Object.keys(byDay).length, fund: row?.fund_contribution ?? Math.max(0, budget - total), settled: !!row, fundBalance: dateFundBalance(s) };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts a number up from zero while its card is on screen. */
function CountUp({ value, format, active }) {
  const [shown, setShown] = useState(active && !reducedMotion() ? 0 : value);
  useEffect(() => {
    if (!active) return undefined;
    if (reducedMotion()) { setShown(value); return undefined; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1100);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    // Frames pause in a background tab; always land on the real number.
    const settle = setTimeout(() => setShown(value), 1300);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [active, value]);
  return tight(format(shown));
}

/** A burst of pixel confetti in the palette. Positions are seeded so every replay looks the same. */
function Confetti({ count = 26 }) {
  const colors = ['#ffc83d', '#e9573f', '#5cb26b', '#6cc3ef', '#b9a6e8', '#fff4dc'];
  const bits = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
    const dist = 110 + ((i * 37) % 90);
    return `--x:${Math.round(Math.cos(angle) * dist)}px;--y:${Math.round(Math.sin(angle) * dist - 60)}px;--c:${colors[i % colors.length]};--d:${(i % 5) * 40}ms;--s:${6 + (i % 3) * 3}px`;
  });
  return html`<div class="confetti" aria-hidden="true">${bits.map((st, i) => html`<i key=${i} style=${st}></i>`)}</div>`;
}

/** Coins that rain down into the treasure chest. */
function CoinRain({ count = 9 }) {
  return html`<div class="coin-rain" aria-hidden="true">${Array.from({ length: count }, (_, i) => html`
    <i key=${i} style=${`--x:${((i * 29) % 100) - 50}px;--d:${i * 110}ms`}></i>`)}</div>`;
}

export function Recap({ month, onClose }) {
  const s = useStore();
  const r = recapStats(s, month);
  const label = monthLabel(month, { withYear: false });
  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
  const under = r.total <= r.budget;
  const money = (v) => fmt(Math.round(v * 100) / 100, r.home, { cents: true });
  const mine = me(s);
  const other = partner(s);
  const cards = [];

  cards.push({ kind: 'party', tone: 'sun', title: `${label}: total spent`, value: r.total, format: money,
    body: under ? `of our ${fmt(r.budget, r.home)} budget. ${fmt(r.budget - r.total, r.home)} left. Well done, team!` : `of our ${fmt(r.budget, r.home)} budget. ${fmt(r.total - r.budget, r.home)} over. That's okay.` });
  if (r.topCat) {
    const pct = Math.round((r.topCat[1] / Math.max(r.total, 1)) * 100);
    cards.push({ kind: 'category', tone: 'tomato', title: 'Most spent on', big: catLabel(r.topCat[0]), icon: categoryIcon(r.topCat[0]), pct,
      body: `${fmt(r.topCat[1], r.home)}. About ${pct}% of the month.` });
  }
  if (r.topPlace) cards.push({ kind: 'stamp', tone: 'leaf', title: r.topPlace.n > 1 ? 'Our favourite' : 'Top expense', big: r.topPlace.name,
    body: r.topPlace.n > 1 ? `${r.topPlace.n} times. ${fmt(r.topPlace.total, r.home)} in total.` : `${fmt(r.topPlace.total, r.home)}. Money well spent!` });
  if (r.topDay) cards.push({ kind: 'day', tone: 'indigo', title: 'Biggest day out', big: shortDate(r.topDay[0]), value: r.topDay[1], format: money,
    body: r.biggest ? `Biggest item: ${r.biggest.description}.` : 'What a day!' });
  cards.push({ kind: 'hearts', tone: 'cream', title: 'Days out together', value: r.days, format: (v) => `${Math.round(v)} ${Math.round(v) === 1 ? 'day' : 'days'}`,
    hearts: Math.min(r.days, 31), body: `${r.list.length} ${r.list.length === 1 ? 'expense' : 'expenses'} in ${label}.` });
  if (r.foreign.length) cards.push({ kind: 'travel', tone: 'sky', title: 'Travel', big: r.foreign.map(placeFor).join(' · '),
    body: `We spent in ${r.foreign.length} other ${r.foreign.length === 1 ? 'currency' : 'currencies'}. Nice trip!` });
  cards.push({ kind: 'chest', tone: 'sun', title: 'Date fund', value: r.fundBalance + (r.settled ? 0 : r.fund), format: money,
    body: r.settled ? `${fmt(r.fund, r.home)} added from ${label}. Enjoy a treat!` : `${fmt(r.fund, r.home)} is added when you settle ${label}.` });

  const [i, setI] = useState(0);
  const track = useRef(null);
  // Where we are heading: lets quick repeated taps queue up while a card is still sliding in.
  const target = useRef(0);
  const onScroll = (e) => {
    const at = Math.round(e.target.scrollLeft / e.target.clientWidth);
    setI(at);
    if (Math.abs(e.target.scrollLeft - at * e.target.clientWidth) < 2) target.current = at;
  };
  const step = (delta) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(cards.length - 1, target.current + delta));
    target.current = next;
    el.scrollTo({ left: next * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  // Story-style: tap the right side for the next card, left for the previous.
  const onTap = (e) => {
    if (e.target.closest('button')) return;
    const box = track.current.getBoundingClientRect();
    step(e.clientX - box.left > box.width / 3 ? 1 : -1);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };

  const share = async () => {
    const text = `Date Jar, ${label}: we spent ${fmt(r.total, r.home)} of ${fmt(r.budget, r.home)}.${r.topCat ? ` Most on ${catLabel(r.topCat[0]).toLowerCase()}.` : ''}`;
    const res = await shareOrCopy({ title: 'Date Jar recap', text });
    if (res === 'copied') toast('Copied');
  };

  const art = (c, active) => {
    switch (c.kind) {
      case 'party': return html`
        <div class="recap-scene" aria-hidden="true">
          ${active && html`<${Confetti}/>`}
          <${Scene} compact><div class="party-stage">
            ${mine && html`<${Sprite} avatar=${avatarFor(mine.user_id, s)} mood="happy" action=${active ? 'cheer' : ''} actionKey=${active ? 1 : 0}/>`}
            <${Jar} size="sm" left=${r.budget > 0 ? Math.max(0, (r.budget - r.total) / r.budget) : 0} summary=""/>
            ${other && html`<${Sprite} avatar=${avatarFor(other.user_id, s)} mood="happy" delay=${200} action=${active ? 'cheer' : ''} actionKey=${active ? 1 : 0}/>`}
          </div><//>
        </div>`;
      case 'category': return html`<div class="recap-art pop" aria-hidden="true"><span class="art-tile"><${Icon} name=${c.icon} size=${36}/></span></div>`;
      case 'day': return html`<div class="recap-art flip" aria-hidden="true"><span class="art-tile"><${Icon} name="calendar" size=${36}/></span></div>`;
      case 'travel': return html`<div class="recap-art fly" aria-hidden="true"><span class="art-plane"><${Icon} name="travel" size=${36}/></span></div>`;
      case 'chest': return html`<div class="recap-art chest-art" aria-hidden="true">${active && html`<${CoinRain}/>`}<span class="fund-icon big chest-bounce"><${Icon} name="chest" size=${36}/></span></div>`;
      case 'stamp': return html`<div class="recap-art pop" aria-hidden="true"><span class="art-tile"><${Icon} name="heart" size=${36}/></span></div>`;
      default: return null;
    }
  };

  return html`
    <${Sheet} title=${`${label} recap`} onClose=${onClose} full>
      <div class="recap">
        <header class="recap-head">
          <button class="icon-btn" onClick=${onClose} aria-label="Close recap"><${Icon} name="close"/></button>
          <div class="story" aria-hidden="true">${cards.map((_, n) => html`<i key=${n} class=${n < i ? 'done' : n === i ? 'on' : ''}/>`)}</div>
          <button class="icon-btn" onClick=${share} aria-label="Share recap"><${Icon} name="share"/></button>
        </header>
        <div ref=${track} class="recap-track" onScroll=${onScroll} onClick=${onTap} onKeyDown=${onKey} tabindex="0"
          aria-label=${`Recap card ${i + 1} of ${cards.length}. Use arrow keys or swipe.`}>
          ${cards.map((c, n) => html`
            <article key=${n} class=${`recap-card tone-${c.tone} kind-${c.kind} ${n === i ? 'active' : ''}`} aria-hidden=${n !== i}>
              ${art(c, n === i)}
              <div class="recap-panel">
                <h2>${c.title}</h2>
                <p class=${`recap-big ${c.kind === 'stamp' ? 'stamp content' : ''} ${String(c.big ?? '').length > 14 ? 'long' : ''}`}>${c.value != null ? html`<${CountUp} value=${c.value} format=${c.format} active=${n === i}/>` : tight(c.big)}</p>
                ${c.kind === 'day' && html`<p class="recap-sub">${c.big}</p>`}
                ${c.kind === 'category' && html`<div class="recap-meter" aria-hidden="true"><i style=${`--pct:${c.pct / 100}`}></i></div>`}
                ${c.kind === 'hearts' && html`<div class="heart-row" aria-hidden="true">${Array.from({ length: c.hearts }, (_, h) => html`<span key=${h} style=${`--i:${h}`}><${Icon} name="heart" size=${12}/></span>`)}</div>`}
                <p class="recap-body">${c.body}</p>
              </div>
              ${n === 0 && html`<p class="recap-swipe">Tap or swipe <${Icon} name="next" size=${12}/></p>`}
            </article>`)}
        </div>
        <div class="recap-nav">
          <button class="btn btn-secondary small" onClick=${() => step(-1)} disabled=${i === 0} ><${Icon} name="back" size=${12}/> Back</button>
          <button class="btn btn-secondary small" onClick=${() => (i === cards.length - 1 ? onClose() : step(1))}>${i === cards.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    <//>`;
}

// ================================================================= SETTINGS

const csvCell = (v) => {
  const str = v == null ? '' : String(v);
  return /[",\n\t]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

function buildRows(s, from, to, tripId = null) {
  const home = s.couple.home_currency;
  const list = liveExpenses(s).filter((e) => (tripId ? e.trip_id === tripId : e.spent_on >= from && e.spent_on <= to)).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
  const header = ['Date', 'Description', 'Category', 'Trip', 'Paid by', 'Added by', 'Original amount', 'Original currency', 'Exchange rate', `Amount (${home})`, 'Amount confirmed', 'From date fund', 'Month settled'];
  const rows = list.map((e) => [
    e.spent_on, e.description, CATEGORIES.find((c) => c.id === e.category)?.label ?? '', tripById(e.trip_id, s)?.name ?? '',
    e.paid_by ? memberName(e.paid_by, s, { you: false }) : 'Joint account', memberName(e.added_by, s, { you: false }),
    e.original_amount, e.original_currency, e.original_currency === home ? 1 : Number(Number(e.fx_rate).toPrecision(6)),
    e.home_amount, e.amount_confirmed ? 'Yes' : 'No', e.from_fund ? 'Yes' : 'No', settlementRow(monthKey(e.spent_on), s) ? 'Yes' : 'No',
  ]);
  return { header, rows };
}

function ExportSection() {
  const s = useStore();
  const [range, setRange] = useState('this');
  const first = liveExpenses(s).map((e) => e.spent_on).sort()[0] ?? todayISO();
  const [from, setFrom] = useState(`${currentMonthKey()}-01`);
  const [to, setTo] = useState(todayISO());
  const trips = s.trips.slice().sort((a, b) => b.started_on.localeCompare(a.started_on));
  const [pickedTrip, setTripId] = useState(null);
  const tripId = pickedTrip ?? trips[0]?.id ?? null;

  const bounds = () => {
    const cur = currentMonthKey();
    if (range === 'this') return [`${cur}-01`, `${cur}-31`];
    if (range === 'last') { const k = addMonths(cur, -1); return [`${k}-01`, `${k}-31`]; }
    if (range === 'all') return ['0000-01-01', '9999-12-31'];
    return [from, to];
  };
  const { header, rows } = range === 'trip' ? buildRows(s, null, null, tripId) : buildRows(s, ...bounds());

  const exportCsv = async () => {
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const tripName = range === 'trip' ? tripById(tripId, s)?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    const name = `date-jar-${tripName || todayISO()}.csv`;
    const file = new File([csv], name, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Date Jar export' }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const copyTable = async () => {
    const tsv = [header, ...rows].map((r) => r.map(csvCell).join('\t')).join('\n');
    toast((await copyText(tsv)) ? `Copied ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}. Paste in Google Sheets.` : 'Can’t copy');
  };

  return html`
    <div class="export">
      <${Segmented} label="Date range" value=${range} onChange=${setRange} class="wrap"
        options=${[{ value: 'this', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'custom', label: 'Custom' }, { value: 'all', label: 'All time' },
          ...(trips.length ? [{ value: 'trip', label: 'One trip' }] : [])]}/>
      ${range === 'trip' && html`
        <div class="chip-row" role="group" aria-label="Trip to export">
          ${trips.map((t) => html`<${Chip} key=${t.id} class="content" on=${t.id === tripId} onClick=${() => setTripId(t.id)}>${t.name}<//>`)}
        </div>`}
      ${range === 'custom' && html`
        <div class="date-pair">
          <label>From<input type="date" value=${from} min=${first} onInput=${(e) => e.target.value && setFrom(e.target.value)}/></label>
          <label>To<input type="date" value=${to} onInput=${(e) => e.target.value && setTo(e.target.value)}/></label>
        </div>`}
      <p class="hint">${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'} in this ${range === 'trip' ? 'trip' : 'range'}.</p>
      <div class="btn-row">
        <button class="btn btn-secondary" disabled=${!rows.length} onClick=${copyTable}><${Icon} name="copy" size=${18}/> Copy for Google Sheets</button>
        <button class="btn btn-secondary" disabled=${!rows.length} onClick=${exportCsv}><${Icon} name="download" size=${18}/> Save as CSV</button>
      </div>
    </div>`;
}

function InviteSheet({ onClose }) {
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');
  const make = () => { setErr(''); createInvite().then(setCode).catch((e) => setErr(friendlyError(e))); };
  useEffect(make, []);
  const link = `${location.origin}${location.pathname}`;
  const message = `Join our Date Jar! Open ${link} and use invite code ${code}`;
  return html`
    <${Sheet} title="Invite your partner" onClose=${onClose}>
      <${SheetHeader} title="Invite your partner" onClose=${onClose}/>
      <div class="sheet-scroll invite">
        ${err ? html`<p class="error" role="alert">Could not make an invite code. ${err}</p><button class="btn btn-secondary btn-block" onClick=${make}>Try again</button>` : code ? html`
          <p class="hint center">Send this code to your partner. It works once, for 14 days.</p>
          <p class="invite-code" aria-label=${`Invite code ${code.split('').join(' ')}`}>${code}</p>
          <div class="btn-col">
            <button class="btn btn-primary btn-block" onClick=${async () => { const r = await shareOrCopy({ title: 'Join our Date Jar', text: message }); if (r === 'copied') toast('Invite copied'); }}><${Icon} name="share" size=${18}/> Share invite</button>
            <button class="btn btn-quiet" onClick=${async () => toast((await copyText(code)) ? 'Code copied' : 'Can’t copy')}><${Icon} name="copy" size=${18}/> Copy code</button>
          </div>` : html`<p class="hint center">Creating code…</p>`}
      </div>
    <//>`;
}

export function Settings({ nav, arg }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const mine = me(s);
  const other = partner(s);
  const [name, setName] = useState(mine?.display_name ?? '');
  const [budget, setBudget] = useState(String(s.couple.monthly_budget));
  // Switching who holds the phone (demo) or a partner's edit must refresh these, or a blur would save stale text.
  useEffect(() => setName(mine?.display_name ?? ''), [mine?.user_id, mine?.display_name]);
  useEffect(() => setBudget(String(s.couple.monthly_budget)), [s.couple.monthly_budget]);
  const [invite, setInvite] = useState(false);
  const [curPicker, setCurPicker] = useState(false);
  const [tripEdit, setTripEdit] = useState(null); // 'new' or a trip
  const trip = activeTrip(s);
  const pastTrips = s.trips.filter((t) => t.id !== trip?.id).sort((a, b) => b.started_on.localeCompare(a.started_on));
  const tripTotal = (t) => fmt(sum(tripExpenses(t.id, s)), home);
  // #/settings/character opens your own character straight away (from the welcome message on Home).
  const [dressing, setDressing] = useState(arg === 'character' ? mine : null);
  const locked = !onlySamples(s);
  const hasSamples = liveExpenses(s).some((e) => e.sample);

  const saveBudget = () => {
    const n = Number(budget);
    if (n > 0 && n !== Number(s.couple.monthly_budget)) { updateCouple({ monthly_budget: n }); toast('Budget updated'); }
    else setBudget(String(s.couple.monthly_budget));
  };
  const saveName = () => {
    if (name.trim() && name.trim() !== mine.display_name) updateMemberName(mine.user_id, name.trim());
  };

  return html`
    <section class="screen settings">
      <header class="topbar"><h1>Settings</h1></header>

      <h2 class="list-label">Us</h2>
      <div class="group">
        <label class="setting"><span>Your name</span><input value=${name} onInput=${(e) => setName(e.target.value)} onBlur=${saveName} maxlength="40" enterkeyhint="done"/></label>
        <div class="setting"><span>Partner</span>
          ${other ? html`<b>${other.display_name}</b>` : MODE === 'cloud' ? html`<button class="btn btn-secondary small" onClick=${() => setInvite(true)}>Invite</button>` : html`<b>—</b>`}</div>
        ${MODE === 'demo' && other && html`<div class="setting"><span>Use the app as ${other.display_name}</span><button class="btn btn-secondary small" onClick=${() => { const next = other.display_name; switchDemoUser(); toast(`Now using the app as ${next}`); }}>Switch</button></div>`}
      </div>

      <h2 class="list-label">Characters</h2>
      <div class="group">
        ${[mine, other].filter(Boolean).map((m) => {
          const editable = MODE === 'demo' || m.user_id === s.session.userId;
          return html`
            <div key=${m.user_id} class="setting char-row">
              <span class="char-mini" aria-hidden="true"><${CharArt} avatar=${avatarFor(m.user_id, s)} crop="head"/></span>
              <span>${m.user_id === mine?.user_id ? 'You' : m.display_name}<small>${editable ? 'Hair, face, clothes, hats' : 'They can change their own look'}</small></span>
              ${editable && html`<button class="btn btn-secondary small" onClick=${() => setDressing(m)}>Change</button>`}
            </div>`;
        })}
      </div>

      <h2 class="list-label">Money</h2>
      <div class="group">
        <label class="setting"><span>Monthly budget</span>
          <span class="inline-input"><i>${home}</i><input inputmode="decimal" value=${budget} onInput=${(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))} onBlur=${saveBudget}/></span></label>
        <div class="setting"><span>Home currency<small>${locked ? 'Can’t change after you add expenses' : hasSamples ? 'Sample expenses will switch too' : 'All amounts convert to this'}</small></span>
          ${locked ? html`<b>${home}</b>` : html`<button class="btn btn-secondary small" onClick=${() => setCurPicker(true)}>${home}</button>`}</div>
        <button class="setting setting-toggle" role="switch" aria-checked=${s.prefs.categories} onClick=${() => setPref('categories', !s.prefs.categories)}>
          <span>Categories<small>Pick a type (food, travel…) when you add</small></span>
          <span class=${`switch ${s.prefs.categories ? 'on' : ''}`} aria-hidden="true"><i/></span></button>
      </div>

      <h2 class="list-label">Trips</h2>
      <div class="group">
        ${trip ? html`
          <div class="setting"><span>${trip.name}<small>${`${tripRange(trip)} · ${tripTotal(trip)}`}</small></span>
            <button class="btn btn-secondary small" onClick=${() => setTripEdit(trip)}>Edit</button></div>
          <button class="setting action" onClick=${endTrip}><span>End trip<small>New expenses use the monthly budget again</small></span></button>` : html`
          <button class="setting action" onClick=${() => setTripEdit('new')}><span>Start a trip<small>It has its own jar and does not use the monthly budget</small></span></button>`}
        ${pastTrips.map((t) => html`
          <button key=${t.id} class="setting trip-row" onClick=${() => nav.go('history', `trip:${t.id}`)}>
            <span>${t.name}<small>${`${tripRange(t)} · ${tripTotal(t)}`}</small></span><${Icon} name="next" size=${12}/></button>`)}
      </div>

      <h2 class="list-label">Export</h2>
      <div class="group padded"><${ExportSection}/></div>

      <h2 class="list-label">How it works</h2>
      <${HowItWorks}/>

      <h2 class="list-label">Account</h2>
      <div class="group">
        ${s.session?.email && html`<div class="setting"><span>Signed in as</span><b class="mono-ish">${s.session.email}</b></div>`}
        ${MODE === 'cloud' && html`<button class="setting action" onClick=${() => signOut()}>Sign out</button>`}
        ${hasSamples && html`<button class="setting action" onClick=${removeSamples}>Remove sample expenses<small>Your own expenses stay</small></button>`}
        <button class="setting action danger" onClick=${() => {
          if (window.confirm(MODE === 'demo' ? 'Erase all demo data on this phone? You can’t undo this.' : 'Leave this jar? You will lose access to it.')) leaveCouple();
        }}>${MODE === 'demo' ? 'Erase demo data' : 'Leave this jar'}</button>
      </div>

      <p class="about">Date Jar · test version${MODE === 'demo' ? ' · demo mode' : ''}<br/>Exchange rates: open.er-api.com, updated daily.</p>
      ${invite && html`<${InviteSheet} onClose=${() => closeSheet(() => setInvite(false))}/>`}
      ${dressing && html`<${CharacterSheet} member=${dressing} onClose=${() => closeSheet(() => setDressing(null))}/>`}
      ${tripEdit && html`<${TripSheet} trip=${tripEdit === 'new' ? null : tripEdit} onClose=${() => closeSheet(() => setTripEdit(null))}/>`}
      ${curPicker && html`<${CurrencyPicker} value=${home} home=${home} onPick=${(c) => { changeHomeCurrency(c); setCurPicker(false); }} onClose=${() => closeSheet(() => setCurPicker(false))}/>`}
    </section>`;
}

export { InviteSheet, shareOrCopy };
