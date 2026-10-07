// The five main screens: Home, History, Settle, Recap, Settings.
import { html, useEffect, useMemo, useState } from './ui.js';
import { Icon } from './icons.js';
import { Avatar, Chip, Empty, ExpenseRow, Jar, MonthNav, Segmented, Sheet, SheetHeader, TextBox, lookFor, tight } from './components.js';
import { HPBar, Scene, Sprite, moodFor } from './sprites.js';
import {
  CATEGORIES, MODE, createInvite, dateFundBalance, defaultSettleMonth, leaveCouple, liveExpenses, me, memberName,
  monthSpent, partner, reopenMonth, setPref, settleMonth, settlementRow, signOut, toast, updateCouple,
  updateMemberName, useStore, switchDemoUser, flush,
} from './store.js';
import {
  addMonths, budgetExpenses, currentMonthKey, dayLabel, fmt, monthExpenses, monthKey, monthLabel, pace,
  roundTo, settlementFor, shortDate, sum, todayISO, currencyDecimals,
} from './money.js';
import { CurrencyPicker } from './add.js';

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

/** The two partners standing beside the jar. */
function Party({ s, mood, jar }) {
  const mine = me(s);
  const other = partner(s);
  return html`
    <div class="party-stage">
      ${mine && html`<${Sprite} look=${lookFor(mine.user_id, s)} tone="you" mood=${mood} name=${mine.display_name}/>`}
      ${jar}
      ${other ? html`<${Sprite} look=${lookFor(other.user_id, s)} tone="partner" mood=${mood} name=${other.display_name} delay=${400}/>`
        : html`<div class="sprite sprite-ghost"><span class="sprite-name">Player 2?</span></div>`}
    </div>`;
}

// ================================================================= HOME

export function Home({ nav }) {
  const s = useStore();
  const [page, setPage] = useState(0);
  const home = s.couple.home_currency;
  const key = currentMonthKey();
  const budget = Number(s.couple.monthly_budget);
  const spent = monthSpent(key, s);
  const p = pace({ spent, budget, key });
  const mine = me(s);
  const other = partner(s);
  const fund = dateFundBalance(s);
  const monthList = budgetExpenses(liveExpenses(s), key);
  const recent = monthExpenses(liveExpenses(s), key).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5);

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
    ahead: 'A little ahead of pace.',
    hot: 'Running a bit hot…',
    over: 'The jar ran dry.',
  }[p.status];

  let detail;
  if (p.status === 'empty') detail = 'Log your first date and watch the honey go.';
  else if (p.status === 'over') detail = `${fmt(spent - budget, home)} past our ${fmt(budget, home)}. It happens.`;
  else if (p.daysLeft > 0) detail = `About ${fmt(Math.floor(p.perDay), home)} a day left for us.`;
  else detail = `${fmt(p.remaining, home)} left this month.`;

  const summary = `${fmt(Math.max(0, budget - spent), home)} of ${fmt(budget, home)} left in the jar. ${headline} ${detail}`;
  const showInstall = isIOS && !standalone && !s.prefs.installDismissed;
  const waiting = s.outbox.length;

  // Every message on Home pages through the one RPG text box (▼ = next message).
  const pages = [
    { id: 'status', tone: `st-${p.status}`, head: headline, body: html`${detail} ${spent > 0 ? html`<span class="tb-spent">We've spent ${fmt(spent, home)} so far.</span>` : ''}` },
    prevOpen && { id: 'settle', head: `${monthLabel(prevKey, { withYear: false })} is ready to settle`, body: 'See who gets what back from the joint account.', action: { label: 'Settle up', run: () => nav.go('settle', prevKey) } },
    !other && MODE === 'cloud' && { id: 'invite', head: 'Invite player 2', body: 'Your partner sees every entry the moment you add it.', action: { label: 'Invite', run: () => nav.go('settings') } },
    showInstall && { id: 'install', head: 'Add to your Home Screen', body: html`Tap <${Icon} name="share" size=${12} class="inline-icon"/> then “Add to Home Screen” to open Date Jar like an app.`, action: { label: 'Got it', run: () => setPref('installDismissed', true) } },
    MODE === 'demo' && { id: 'demo', head: 'Demo mode', body: `Everything stays on this phone for now. Syncing with your partner is coming soon.${monthList.some((e) => e.sample) ? ' Entries tagged “sample” are examples.' : ''}` },
  ].filter(Boolean).sort((a, b) => (b.id === 'settle') - (a.id === 'settle'));
  const pageIdx = Math.min(page, pages.length - 1);
  const msg = pages[pageIdx];

  return html`
    <section class="screen home">
      <header class="topbar slim">
        <h1 class="bar-title">${monthLabel(key, { withYear: false })} · Day ${p.day}</h1>
        <button class="people" onClick=${() => nav.go('settings')} aria-label="Who's in this jar">
          ${mine && html`<${Avatar} name=${mine.display_name} tone="you" size=${30}/>`}
          ${other ? html`<${Avatar} name=${other.display_name} tone="partner" size=${30}/>` : html`<span class="avatar avatar-ghost" style="--size:30px"><${Icon} name="plus" size=${12}/></span>`}
        </button>
      </header>

      ${(!s.online || waiting > 0 || s.syncError) && html`
        <p class=${`status-pill ${!s.online ? 'offline' : ''}`} role="status">
          <${Icon} name=${!s.online ? 'offline' : 'sync'} size=${12}/>
          ${!s.online ? `Offline${waiting ? ` · ${waiting} waiting to sync` : ''}` : waiting ? `Syncing ${waiting}…` : s.syncError}
          ${s.online && waiting > 0 && html`<button class="link" onClick=${flush}>Retry</button>`}
        </p>`}

      <${Scene}>
        <${Party} s=${s} mood=${moodFor(p.status)} jar=${html`
          <${Jar} left=${left} pace=${p.isCurrent ? 1 - p.timePct : null} dayLabel="today" dropKey=${justSaved} summary=${summary}/>`}/>
      <//>

      <div class="hp-row">
        <${HPBar} left=${left} budgetLeftLabel=${fmt(Math.max(0, budget - spent), home)} pace=${1 - p.timePct} paceLabel="Where we'd be at an even pace"/>
        <p class="hp-nums"><b data-over=${p.status === 'over'}>${tight(p.status === 'over' ? `−${fmt(spent - budget, home)}` : fmt(Math.max(0, budget - spent), home))}</b> <span>/ ${tight(fmt(budget, home))} left</span></p>
      </div>

      <div class=${`textbox paged ${msg.tone ?? ''}`} aria-live="polite">
        <p class="tb-head">${msg.head}</p>
        <p>${msg.body}</p>
        ${msg.action && html`<button class="tb-action" onClick=${msg.action.run}><i class="cursor" aria-hidden="true"></i>${msg.action.label}</button>`}
        ${pages.length > 1 && html`
          <button class="tb-next" onClick=${() => setPage((pageIdx + 1) % pages.length)} aria-label=${`Next message, ${pageIdx + 1} of ${pages.length}`}>
            <span class="tb-count">${pageIdx + 1}/${pages.length}</span><i class="more" aria-hidden="true"></i>
          </button>`}
      </div>

      <h2 class="list-label">Party this month</h2>
      <div class="payers" role="list" aria-label="Who paid this month">
        ${[mine, other].filter(Boolean).map((m) => html`
          <div key=${m.user_id} role="listitem">
            <${Avatar} name=${m.display_name} tone=${m.user_id === mine?.user_id ? 'you' : 'partner'} size=${22}/>
            <span>${m.user_id === mine?.user_id ? 'You' : m.display_name} paid</span><b>${tight(fmt(paidBy(m.user_id), home, { cents: true }))}</b>
          </div>`)}
        <div role="listitem">
          <span class="avatar avatar-joint" style="--size:22px"><${Icon} name="joint" size=${12}/></span>
          <span>Joint</span><b>${tight(fmt(jointTotal, home, { cents: true }))}</b>
        </div>
      </div>

      ${fund > 0 && html`
        <p class="fund-line"><span class="fund-icon"><${Icon} name="chest" size=${24}/></span><span>Treasure chest <b>${tight(fmt(fund, home))}</b><small>Our date fund. Treat yourselves!</small></span></p>`}

      <div class="list-head"><h2 class="list-label">Item log</h2>${recent.length > 0 && html`<button class="link" onClick=${() => nav.go('history')}>See all</button>`}</div>
      ${recent.length === 0 ? html`
        <${Empty} icon="jar" title="Nothing logged this month" action=${html`<button class="btn btn-primary" onClick=${nav.add}><${Icon} name="plus" size=${12}/> Add our first expense</button>`}>
          Dinner, coffee, movie night. Anything you split 50/50 goes here.
        <//>` : html`
        <div class="rows">${recent.map((e) => html`<${ExpenseRow} key=${e.id} e=${e} home=${home} onOpen=${nav.open}/>`)}</div>`}

      ${spent > 0 && html`<button class="link recap-link" onClick=${() => nav.recap(key)}>Peek at this month's recap</button>`}
    </section>`;
}

// ================================================================= HISTORY

export function History({ nav }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [key, setKey] = useState(currentMonthKey());
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [kind, setKind] = useState('all');
  const mine = me(s);
  const other = partner(s);

  const all = monthExpenses(liveExpenses(s), key);
  const list = all
    .filter((e) => !q.trim() || `${e.description} ${e.original_currency}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((e) => who === 'all' || (who === 'joint' ? !e.paid_by : e.paid_by === who))
    .filter((e) => kind === 'all' || (kind === 'foreign' ? e.original_currency !== home : !e.amount_confirmed))
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || '').localeCompare(a.created_at || ''));

  const days = [];
  list.forEach((e) => {
    const last = days[days.length - 1];
    if (last && last.date === e.spent_on) last.items.push(e);
    else days.push({ date: e.spent_on, items: [e] });
  });

  const total = sum(list);
  const settled = settlementRow(key, s);
  const filtered = who !== 'all' || kind !== 'all' || q.trim();
  const hasForeign = all.some((e) => e.original_currency !== home);
  const hasEstimated = all.some((e) => !e.amount_confirmed);
  const budget = Number(s.couple.monthly_budget);
  const monthTotal = monthSpent(key, s);

  return html`
    <section class="screen history">
      <${MonthNav} label=${monthLabel(key)} onPrev=${() => setKey(addMonths(key, -1))} onNext=${() => setKey(addMonths(key, 1))}
        canNext=${key < currentMonthKey()} sub=${`${fmt(total, home)} · ${list.length} ${list.length === 1 ? 'item' : 'items'}${settled ? ' · settled' : ''}`}
        art=${html`<${Jar} size="sm" left=${leftFrac(monthTotal, budget)} summary=${`${fmt(Math.max(0, budget - monthTotal), home)} was left in the jar`}/>`}/>
      <div class="search-wrap">
        <${Icon} name="search" size=${12}/>
        <input type="search" placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search expenses" autocomplete="off"/>
      </div>
      <div class="chip-row scroll" role="group" aria-label="Filter">
        <${Chip} on=${who === 'all' && kind === 'all'} onClick=${() => { setWho('all'); setKind('all'); }}>All<//>
        ${mine && html`<${Chip} on=${who === mine.user_id} onClick=${() => setWho(who === mine.user_id ? 'all' : mine.user_id)}>Paid by me<//>`}
        ${other && html`<${Chip} on=${who === other.user_id} onClick=${() => setWho(who === other.user_id ? 'all' : other.user_id)}>Paid by ${other.display_name}<//>`}
        <${Chip} on=${who === 'joint'} onClick=${() => setWho(who === 'joint' ? 'all' : 'joint')}>Joint<//>
        ${hasForeign && html`<${Chip} on=${kind === 'foreign'} onClick=${() => setKind(kind === 'foreign' ? 'all' : 'foreign')}>Foreign<//>`}
        ${hasEstimated && html`<${Chip} on=${kind === 'estimated'} onClick=${() => setKind(kind === 'estimated' ? 'all' : 'estimated')}>To confirm<//>`}
      </div>

      ${days.length === 0 ? html`
        <${Empty} icon=${filtered ? 'search' : 'history'} title=${filtered ? 'No matches' : `Nothing logged in ${monthLabel(key, { withYear: false })}`}
          action=${!filtered && key === currentMonthKey() ? html`<button class="btn btn-primary" onClick=${nav.add}><${Icon} name="plus" size=${18}/> Add an expense</button>` : null}>
          ${filtered ? 'Try clearing a filter or searching for something else.' : 'Expenses you add will show up here, newest first.'}
        <//>` : days.map((d) => html`
        <section key=${d.date} class="day">
          <h2 class="day-head"><span>${dayLabel(d.date)}</span><span>${tight(fmt(sum(d.items), home))}</span></h2>
          <div class="rows">${d.items.map((e) => html`<${ExpenseRow} key=${e.id} e=${e} home=${home} onOpen=${nav.open}/>`)}</div>
        </section>`)}
    </section>`;
}

// ================================================================= SETTLE

export function Settle({ nav, arg }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [key, setKey] = useState(arg || defaultSettleMonth(s));
  useEffect(() => { if (arg) setKey(arg); }, [arg]);

  const st = useMemo(() => settlementFor(liveExpenses(s), s.members, key), [s.expenses, s.members, key]);
  const settled = settlementRow(key, s);
  const budget = Number(s.couple.monthly_budget);
  const over = st.budgetSpent > budget;
  const leftover = roundTo(Math.max(0, budget - st.budgetSpent));
  const isCurrent = key === currentMonthKey();
  const mine = me(s);
  const ordered = [...st.byMember].sort((a, b) => (a.member.user_id === mine?.user_id ? -1 : 1) - (b.member.user_id === mine?.user_id ? -1 : 1));
  const nothing = st.list.length === 0;
  const estimates = st.estimated.filter((e) => e.original_currency !== home).length;

  const copyAmount = async (amt) => {
    const ok = await copyText(String(amt));
    toast(ok ? `Copied ${amt}` : 'Couldn’t copy. Long-press the amount instead.');
  };

  return html`
    <section class="screen settle">
      <${MonthNav} label=${monthLabel(key)} onPrev=${() => setKey(addMonths(key, -1))} onNext=${() => setKey(addMonths(key, 1))}
        canNext=${key < currentMonthKey()} sub=${isCurrent ? 'Still in progress' : settled ? 'Settled' : 'Ready to settle'}/>

      ${nothing ? html`
        <${Empty} icon="settle" title="Nothing to settle">No expenses in ${monthLabel(key, { withYear: false })}.<//>` : html`
        <${TextBox} class=${over ? 'st-over' : 'st-on-track'} more=${false}>
          <p class="tb-head">${tight(over ? `${fmt(st.budgetSpent - budget, home)} over budget` : `${fmt(leftover, home)} left in the jar`)}</p>
          <p>We spent ${fmt(st.budgetSpent, home)} of our ${fmt(budget, home)} in ${monthLabel(key, { withYear: false })}. Here's what to move from the joint account:</p>
        <//>

        <div class="duel" role="list" aria-label="Transfers from the joint account">
          ${[ordered[0], null, ordered[1]].map((b, i) => {
            if (i === 1) {
              return html`<div key="mid" class="duel-mid" aria-hidden="true">
                <${Jar} size="sm" left=${budget > 0 ? Math.max(0, (budget - st.budgetSpent) / budget) : 0} summary=""/>
              </div>`;
            }
            if (!b) return html`<div key="ghost" class="duel-side ghost"><div class="sprite sprite-ghost"></div><b>Player 2</b><span>Not joined yet</span></div>`;
            const you = b.member.user_id === mine?.user_id;
            return html`
              <div key=${b.member.user_id} role="listitem" class=${`duel-side ${b.amount === 0 ? 'zero' : ''}`}>
                <${Sprite} look=${lookFor(b.member.user_id, s)} tone=${you ? 'you' : 'partner'} mood=${b.amount > 0 ? 'happy' : 'idle'} delay=${you ? 0 : 400}/>
                <span class="duel-name">Joint → ${you ? 'you' : b.member.display_name}</span>
                <b class="duel-amt">${b.amount === 0 ? '—' : tight(fmt(b.amount, home, { cents: true }))}</b>
                <span class="duel-sub">${b.amount === 0 ? 'nothing to move' : `${you ? 'you' : 'they'} paid ${b.count} ${b.count === 1 ? 'time' : 'times'}`}</span>
                ${b.amount > 0 && html`<button class="btn btn-secondary small" onClick=${() => copyAmount(b.amount.toFixed(currencyDecimals(home)))}><${Icon} name="copy" size=${12}/> Copy</button>`}
              </div>`;
          })}
        </div>

        ${st.joint.length > 0 && html`
          <div class="transfer zero">
            <span class="avatar avatar-joint" style="--size:40px"><${Icon} name="joint" size=${24}/></span>
            <div class="transfer-main"><b>${tight(fmt(st.jointTotal, home, { cents: true }))} paid straight from the account</b><span>${st.joint.length} ${st.joint.length === 1 ? 'expense' : 'expenses'} · nothing to move</span></div>
          </div>`}

        ${st.fundSpent > 0 && html`<p class="hint">${fmt(st.fundSpent, home)} came out of the treasure chest and doesn't count toward the budget.</p>`}

        ${st.estimated.some((e) => e.original_currency !== home) && html`
          <div class="notice warn">
            <${Icon} name="globe" size=${18}/>
            <div>
              <b>${st.estimated.filter((e) => e.original_currency !== home).length} foreign ${st.estimated.filter((e) => e.original_currency !== home).length === 1 ? 'charge is' : 'charges are'} still estimated</b>
              <p>Confirm what your card actually charged so the amounts match your statement.</p>
              <div class="est-list">
                ${st.estimated.filter((e) => e.original_currency !== home).map((e) => html`
                  <button key=${e.id} class="link" onClick=${() => nav.open(e.id)}>${e.description} · ${fmt(e.original_amount, e.original_currency)}</button>`)}
              </div>
            </div>
          </div>`}

        ${settled ? html`
          <div class="settled-card" role="status">
            <span class="settled-stars" aria-hidden="true"><${Icon} name="sparkle" size=${24}/><${Icon} name="sparkle" size=${12}/></span>
            <div>
              <b>Quest complete!</b>
              <span>${memberName(settled.settled_by, s)} settled it on ${shortDate(settled.settled_at.slice(0, 10))}${settled.fund_contribution > 0 ? ` · +${fmt(settled.fund_contribution, home)} into the treasure chest` : ''}</span>
            </div>
          </div>
          <div class="settle-actions">
            <button class="btn btn-secondary" onClick=${() => nav.recap(key)}><${Icon} name="sparkle" size=${12}/> See the recap</button>
            <button class="btn btn-quiet" onClick=${() => reopenMonth(key)}>Reopen month</button>
          </div>` : html`
          ${leftover > 0 && html`<p class="fund-preview"><span class="fund-icon"><${Icon} name="chest" size=${24}/></span> ${isCurrent ? `If the month ended today, ${fmt(leftover, home)} would go into the treasure chest.` : `${fmt(leftover, home)} left over goes into the treasure chest.`}</p>`}
          <p class="hint center settle-first">First make these transfers in your banking app. Date Jar never moves money.</p>
          <button class="btn btn-primary btn-block" onClick=${() => {
            const asks = [];
            if (isCurrent) asks.push(`${monthLabel(key, { withYear: false })} isn't over yet.`);
            if (estimates) asks.push(`${estimates} foreign ${estimates === 1 ? 'charge is' : 'charges are'} still estimated, so amounts may not match your statement.`);
            if (asks.length && !window.confirm(`${asks.join(' ')} Settle anyway?`)) return;
            settleMonth(key);
          }}>
            <${Icon} name="check" size=${12}/> ${estimates ? `Settle with ${estimates} ${estimates === 1 ? 'estimate' : 'estimates'}` : `Mark ${monthLabel(key, { withYear: false })} as settled`}
          </button>
          <button class="link recap-link" onClick=${() => nav.recap(key)}>Preview the recap</button>`}
      `}
    </section>`;
}

// ================================================================= RECAP

function recapStats(s, key) {
  const home = s.couple.home_currency;
  const list = monthExpenses(liveExpenses(s), key);
  const budgeted = list.filter((e) => !e.from_fund);
  const total = sum(budgeted);
  const budget = Number(s.couple.monthly_budget);
  const byCat = {};
  budgeted.forEach((e) => { byCat[e.category ?? 'other'] = (byCat[e.category ?? 'other'] ?? 0) + e.home_amount; });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const byDesc = {};
  list.forEach((e) => {
    const k = e.description.trim().toLowerCase();
    byDesc[k] = byDesc[k] ?? { name: e.description.trim(), n: 0, total: 0 };
    byDesc[k].n += 1;
    byDesc[k].total += e.home_amount;
  });
  const topPlace = Object.values(byDesc).sort((a, b) => b.n - a.n || b.total - a.total)[0];
  const byDay = {};
  list.forEach((e) => { byDay[e.spent_on] = (byDay[e.spent_on] ?? 0) + e.home_amount; });
  const topDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  const foreign = [...new Set(list.filter((e) => e.original_currency !== home).map((e) => e.original_currency))];
  const biggest = list.slice().sort((a, b) => b.home_amount - a.home_amount)[0];
  const row = settlementRow(key, s);
  return { home, list, total, budget, topCat, topPlace, topDay, foreign, biggest, days: Object.keys(byDay).length, fund: row?.fund_contribution ?? Math.max(0, budget - total), settled: !!row, fundBalance: dateFundBalance(s) };
}

export function Recap({ month, onClose }) {
  const s = useStore();
  const r = recapStats(s, month);
  const label = monthLabel(month, { withYear: false });
  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
  const under = r.total <= r.budget;
  const cards = [];

  cards.push({ tone: 'sun', art: 'party', title: `${label}, in the jar`, big: fmt(r.total, r.home), body: under ? `of our ${fmt(r.budget, r.home)}. ${fmt(r.budget - r.total, r.home)} to spare.` : `of our ${fmt(r.budget, r.home)}. We went ${fmt(r.total - r.budget, r.home)} over, and that's okay.` });
  if (r.topCat) cards.push({ tone: 'tomato', title: 'Where it went', big: catLabel(r.topCat[0]), body: `${fmt(r.topCat[1], r.home)}, about ${Math.round((r.topCat[1] / Math.max(r.total, 1)) * 100)}% of the month.` });
  if (r.topPlace) cards.push({ tone: 'leaf', title: r.topPlace.n > 1 ? 'Our regular' : 'Top spot', big: r.topPlace.name, body: r.topPlace.n > 1 ? `${r.topPlace.n} times, ${fmt(r.topPlace.total, r.home)} in all.` : `${fmt(r.topPlace.total, r.home)}.` });
  if (r.topDay) cards.push({ tone: 'indigo', title: 'Priciest day', big: shortDate(r.topDay[0]), body: `${fmt(r.topDay[1], r.home)} in one day${r.biggest ? `, led by ${r.biggest.description}` : ''}.` });
  cards.push({ tone: 'cream', title: 'Out together', big: `${r.days} ${r.days === 1 ? 'day' : 'days'}`, body: `${r.list.length} ${r.list.length === 1 ? 'expense' : 'expenses'} shared across ${label}.` });
  if (r.foreign.length) cards.push({ tone: 'sky', title: 'Abroad', big: r.foreign.join(' · '), body: `We spent in ${r.foreign.length} ${r.foreign.length === 1 ? 'currency' : 'currencies'} besides ${r.home}.` });
  cards.push({ tone: 'sun', art: 'chest', title: 'Treasure chest', big: fmt(r.fundBalance + (r.settled ? 0 : r.fund), r.home), body: r.settled ? `Now in the fund, ${fmt(r.fund, r.home)} added from ${label}.` : `${fmt(r.fund, r.home)} will join once ${label} is settled. Treat yourselves.` });

  const [i, setI] = useState(0);
  const onScroll = (e) => setI(Math.round(e.target.scrollLeft / e.target.clientWidth));

  const share = async () => {
    const text = `${label} in our Date Jar: ${fmt(r.total, r.home)} of ${fmt(r.budget, r.home)}${r.topCat ? `, mostly ${catLabel(r.topCat[0]).toLowerCase()}` : ''}.`;
    const res = await shareOrCopy({ title: 'Date Jar recap', text });
    if (res === 'copied') toast('Copied to your clipboard');
  };

  return html`
    <${Sheet} title=${`${label} recap`} onClose=${onClose} full>
      <div class="recap">
        <header class="recap-head">
          <button class="icon-btn" onClick=${onClose} aria-label="Close recap"><${Icon} name="close"/></button>
          <div class="dots" aria-hidden="true">${cards.map((_, n) => html`<i key=${n} class=${n === i ? 'on' : ''}/>`)}</div>
          <button class="icon-btn" onClick=${share} aria-label="Share recap"><${Icon} name="share"/></button>
        </header>
        <div class="recap-track" onScroll=${onScroll} tabindex="0" aria-label="Recap cards, swipe sideways">
          ${cards.map((c, n) => html`
            <article key=${n} class=${`recap-card tone-${c.tone}`}>
              ${c.art === 'party' && html`
                <div class="recap-scene" aria-hidden="true"><${Scene} compact>
                  <div class="party-stage">
                    <${Sprite} look="a" tone="you" mood="happy"/>
                    <${Jar} size="sm" left=${r.budget > 0 ? Math.max(0, (r.budget - r.total) / r.budget) : 0} summary=""/>
                    <${Sprite} look="b" tone="partner" mood="happy" delay=${400}/>
                  </div>
                <//></div>`}
              ${c.art === 'chest' && html`<div class="recap-art" aria-hidden="true"><span class="fund-icon big"><${Icon} name="chest" size=${36}/></span></div>`}
              <div class="recap-panel">
                <h2>${c.title}</h2>
                <p class="recap-big">${tight(c.big)}</p>
                <p class="recap-body">${c.body}</p>
              </div>
              ${n === 0 && html`<p class="recap-swipe">Swipe <${Icon} name="next" size=${12}/></p>`}
            </article>`)}
        </div>
      </div>
    <//>`;
}

// ================================================================= SETTINGS

const csvCell = (v) => {
  const str = v == null ? '' : String(v);
  return /[",\n\t]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

function buildRows(s, from, to) {
  const home = s.couple.home_currency;
  const list = liveExpenses(s).filter((e) => e.spent_on >= from && e.spent_on <= to).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
  const header = ['Date', 'Description', 'Category', 'Paid by', 'Added by', 'Original amount', 'Original currency', 'Exchange rate', `Amount (${home})`, 'Amount confirmed', 'From date fund', 'Month settled'];
  const rows = list.map((e) => [
    e.spent_on, e.description, CATEGORIES.find((c) => c.id === e.category)?.label ?? '',
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

  const bounds = () => {
    const cur = currentMonthKey();
    if (range === 'this') return [`${cur}-01`, `${cur}-31`];
    if (range === 'last') { const k = addMonths(cur, -1); return [`${k}-01`, `${k}-31`]; }
    if (range === 'all') return ['0000-01-01', '9999-12-31'];
    return [from, to];
  };
  const { header, rows } = buildRows(s, ...bounds());

  const exportCsv = async () => {
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const name = `date-jar-${todayISO()}.csv`;
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
    toast((await copyText(tsv)) ? `Copied ${rows.length} rows. Paste into Google Sheets` : 'Couldn’t copy');
  };

  return html`
    <div class="export">
      <${Segmented} label="Date range" value=${range} onChange=${setRange} class="wrap"
        options=${[{ value: 'this', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'custom', label: 'Custom' }, { value: 'all', label: 'All time' }]}/>
      ${range === 'custom' && html`
        <div class="date-pair">
          <label>From<input type="date" value=${from} min=${first} onInput=${(e) => e.target.value && setFrom(e.target.value)}/></label>
          <label>To<input type="date" value=${to} onInput=${(e) => e.target.value && setTo(e.target.value)}/></label>
        </div>`}
      <p class="hint">${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'} in this range.</p>
      <div class="btn-row">
        <button class="btn btn-secondary" disabled=${!rows.length} onClick=${copyTable}><${Icon} name="copy" size=${18}/> Copy for Google Sheets</button>
        <button class="btn btn-secondary" disabled=${!rows.length} onClick=${exportCsv}><${Icon} name="download" size=${18}/> Save as CSV</button>
      </div>
    </div>`;
}

function InviteSheet({ onClose }) {
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { createInvite().then(setCode).catch((e) => setErr(e.message)); }, []);
  const link = `${location.origin}${location.pathname}`;
  const message = `Join our Date Jar! Open ${link} and use invite code ${code}`;
  return html`
    <${Sheet} title="Invite your partner" onClose=${onClose}>
      <${SheetHeader} title="Invite your partner" onClose=${onClose}/>
      <div class="sheet-scroll invite">
        ${err ? html`<p class="error">${err}</p>` : code ? html`
          <p class="hint center">Send them this code. It works once and lasts 14 days.</p>
          <p class="invite-code" aria-label=${`Invite code ${code.split('').join(' ')}`}>${code}</p>
          <div class="btn-col">
            <button class="btn btn-primary btn-block" onClick=${async () => { const r = await shareOrCopy({ title: 'Join our Date Jar', text: message }); if (r === 'copied') toast('Invite copied'); }}><${Icon} name="share" size=${18}/> Share invite</button>
            <button class="btn btn-quiet" onClick=${async () => toast((await copyText(code)) ? 'Code copied' : 'Couldn’t copy')}><${Icon} name="copy" size=${18}/> Copy code</button>
          </div>` : html`<p class="hint center">Making a code…</p>`}
      </div>
    <//>`;
}

export function Settings({ nav }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const mine = me(s);
  const other = partner(s);
  const [name, setName] = useState(mine?.display_name ?? '');
  const [budget, setBudget] = useState(String(s.couple.monthly_budget));
  const [invite, setInvite] = useState(false);
  const [curPicker, setCurPicker] = useState(false);
  const locked = liveExpenses(s).length > 0;

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
        ${MODE === 'demo' && other && html`<div class="setting"><span>Pretend to be ${s.session.userId === 'me' ? other.display_name : mine.display_name}</span><button class="btn btn-secondary small" onClick=${() => { switchDemoUser(); toast('Switched who is holding the phone'); }}>Switch</button></div>`}
      </div>

      <h2 class="list-label">Money</h2>
      <div class="group">
        <label class="setting"><span>Monthly budget</span>
          <span class="inline-input"><i>${home}</i><input inputmode="decimal" value=${budget} onInput=${(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))} onBlur=${saveBudget}/></span></label>
        <div class="setting"><span>Home currency<small>${locked ? 'Locked once you log expenses' : 'Everything is converted to this'}</small></span>
          ${locked ? html`<b>${home}</b>` : html`<button class="btn btn-secondary small" onClick=${() => setCurPicker(true)}>${home}</button>`}</div>
        <div class="setting"><span>Category tags<small>Optional labels when adding</small></span>
          <button class=${`switch ${s.prefs.categories ? 'on' : ''}`} role="switch" aria-checked=${s.prefs.categories} aria-label="Category tags" onClick=${() => setPref('categories', !s.prefs.categories)}><i/></button></div>
      </div>

      <h2 class="list-label">Export</h2>
      <div class="group padded"><${ExportSection}/></div>

      <h2 class="list-label">Account</h2>
      <div class="group">
        ${s.session?.email && html`<div class="setting"><span>Signed in as</span><b class="mono-ish">${s.session.email}</b></div>`}
        ${MODE === 'cloud' && html`<button class="setting action" onClick=${() => signOut()}>Sign out</button>`}
        <button class="setting action danger" onClick=${() => {
          if (window.confirm(MODE === 'demo' ? 'Erase this demo jar from the phone?' : 'Leave this jar? You will lose access to it.')) leaveCouple();
        }}>${MODE === 'demo' ? 'Erase demo data' : 'Leave this jar'}</button>
      </div>

      <p class="about">Date Jar · test version${MODE === 'demo' ? ' · demo mode' : ''}<br/>Rates by open.er-api.com, refreshed daily.</p>
      ${invite && html`<${InviteSheet} onClose=${() => setInvite(false)}/>`}
      ${curPicker && html`<${CurrencyPicker} value=${home} home=${home} onPick=${(c) => { updateCouple({ home_currency: c }); setCurPicker(false); }} onClose=${() => setCurPicker(false)}/>`}
    </section>`;
}

export { InviteSheet, shareOrCopy };
