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
  updateMemberName, useStore, switchDemoUser, flush, friendlyError,
} from './store.js';
import {
  addMonths, budgetExpenses, currentMonthKey, dayLabel, fmt, monthExpenses, monthKey, monthLabel, pace,
  roundTo, settlementFor, shortDate, sum, todayISO, currencyDecimals,
} from './money.js';
import { CurrencyPicker } from './add.js';

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
    ahead: 'Spending a bit fast',
    hot: 'Spending too fast',
    over: 'Over budget',
  }[p.status];

  let detail;
  if (p.status === 'empty') detail = 'Nothing spent yet. Add your first date.';
  else if (p.status === 'over') detail = `${fmt(spent - budget, home)} over our ${fmt(budget, home)} budget. That's okay.`;
  else if (p.daysLeft > 0) detail = `We can spend about ${fmt(Math.floor(p.perDay), home)} a day.`;
  else detail = `${fmt(p.remaining, home)} left this month.`;

  const summary = `${fmt(Math.max(0, budget - spent), home)} of ${fmt(budget, home)} budget left. ${headline.replace(/[!.]$/, '')}. ${detail}`;
  const showInstall = isIOS && !standalone && !s.prefs.installDismissed;
  const waiting = s.outbox.length;

  // Every message on Home pages through the one RPG text box (▼ = next message).
  const pages = [
    { id: 'status', tone: `st-${p.status}`, head: headline, body: html`${detail} ${spent > 0 ? html`<span class="tb-spent">Spent so far: ${fmt(spent, home)}.</span>` : ''}` },
    prevOpen && { id: 'settle', head: `Time to settle ${monthLabel(prevKey, { withYear: false })}`, body: 'Pay each other back from the joint account.', action: { label: 'Settle up', run: () => nav.go('settle', prevKey) } },
    !other && MODE === 'cloud' && { id: 'invite', head: 'Invite your partner', body: 'They see each expense right away.', action: { label: 'Invite', run: () => nav.go('settings') } },
    showInstall && { id: 'install', head: 'Add to your Home Screen', body: html`Tap <${Icon} name="share" size=${12} class="inline-icon"/>, then “Add to Home Screen”. Date Jar opens like an app.`, action: { label: 'Got it', run: () => setPref('installDismissed', true) } },
    MODE === 'demo' && { id: 'demo', head: 'Demo mode', body: `Your data stays on this phone only. Sharing with your partner comes later.${monthList.some((e) => e.sample) ? ' Items marked “sample” are examples.' : ''}` },
  ].filter(Boolean).sort((a, b) => (b.id === 'settle') - (a.id === 'settle'));
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

      ${(!s.online || waiting > 0 || s.syncError) && html`
        <p class=${`status-pill ${!s.online ? 'offline' : ''}`} role="status">
          <${Icon} name=${!s.online ? 'offline' : 'sync'} size=${12}/>
          ${!s.online ? (waiting ? `Offline. ${plural(waiting, 'change', 'changes')} will sync later.` : 'Offline. You can still add expenses.')
            : waiting && !s.syncError ? `Syncing ${plural(waiting, 'change', 'changes')}…` : 'Could not sync. Your changes are saved on this phone.'}
          ${s.online && (waiting > 0 || s.syncError) && html`<button class="link" onClick=${flush}>Try again</button>`}
        </p>`}

      <${Scene}>
        <${Party} s=${s} mood=${moodFor(p.status)} leftLabel=${p.status === 'over' ? `${fmt(spent - budget, home)} over!` : `${fmt(Math.max(0, budget - spent), home)} left!`}
          jarProps=${{ left, pace: p.isCurrent ? 1 - p.timePct : null, dayLabel: 'today', dropKey: justSaved, summary }}/>
      <//>

      <div class="hp-row">
        <${HPBar} left=${left} budgetLeftLabel=${fmt(Math.max(0, budget - spent), home)} pace=${1 - p.timePct} paceLabel="Where we should be today"/>
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

      <h2 class="list-label">Who paid this month</h2>
      <div class="payers" role="list" aria-label="Who paid this month">
        ${[mine, other].filter(Boolean).map((m) => html`
          <div key=${m.user_id} role="listitem">
            <${Avatar} name=${m.display_name} userId=${m.user_id} size=${22}/>
            <span>${m.user_id === mine?.user_id ? 'You' : m.display_name} paid</span><b>${tight(fmt(paidBy(m.user_id), home, { cents: true }))}</b>
          </div>`)}
        <div role="listitem">
          <span class="avatar avatar-joint" style="--size:22px"><${Icon} name="joint" size=${12}/></span>
          <span>Joint</span><b>${tight(fmt(jointTotal, home, { cents: true }))}</b>
        </div>
      </div>

      ${fund > 0 && html`
        <p class="fund-line"><span class="fund-icon"><${Icon} name="chest" size=${24}/></span><span>Date fund <b>${tight(fmt(fund, home))}</b><small>Saved from past months. For a special date!</small></span></p>`}

      <div class="list-head"><h2 class="list-label">Recent expenses</h2>${recent.length > 0 && html`<button class="link" onClick=${() => nav.go('history')}>See all</button>`}</div>
      ${recent.length === 0 ? html`
        <${Empty} icon="jar" title="No expenses yet this month" action=${html`<button class="btn btn-primary" onClick=${nav.add}><${Icon} name="plus" size=${12}/> Add first expense</button>`}>
          Add what you spend on dates: dinner, coffee, movies. You split it 50/50.
        <//>` : html`
        <div class="rows">${recent.map((e) => html`<${ExpenseRow} key=${e.id} e=${e} home=${home} onOpen=${nav.open}/>`)}</div>`}

      ${spent > 0 && html`<button class="link recap-link" onClick=${() => nav.recap(key)}>See this month's recap</button>`}
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
        canNext=${key < currentMonthKey()} sub=${`${fmt(total, home)} · ${list.length} ${list.length === 1 ? 'expense' : 'expenses'}${settled ? ' · settled' : ''}`}
        art=${html`<${Jar} size="sm" left=${leftFrac(monthTotal, budget)} summary=${`${fmt(Math.max(0, budget - monthTotal), home)} left in budget`}/>`}/>
      <div class="search-wrap">
        <${Icon} name="search" size=${12}/>
        <input type="search" placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search expenses" autocomplete="off"/>
      </div>
      <div class="chip-row scroll" role="group" aria-label="Filter">
        <${Chip} on=${who === 'all' && kind === 'all'} onClick=${() => { setWho('all'); setKind('all'); }}>All<//>
        ${mine && html`<${Chip} on=${who === mine.user_id} onClick=${() => setWho(who === mine.user_id ? 'all' : mine.user_id)}>Paid by me<//>`}
        ${other && html`<${Chip} on=${who === other.user_id} onClick=${() => setWho(who === other.user_id ? 'all' : other.user_id)}>Paid by ${other.display_name}<//>`}
        <${Chip} on=${who === 'joint'} onClick=${() => setWho(who === 'joint' ? 'all' : 'joint')}>Joint account<//>
        ${hasForeign && html`<${Chip} on=${kind === 'foreign'} onClick=${() => setKind(kind === 'foreign' ? 'all' : 'foreign')}>Foreign<//>`}
        ${hasEstimated && html`<${Chip} on=${kind === 'estimated'} onClick=${() => setKind(kind === 'estimated' ? 'all' : 'estimated')}>Estimates<//>`}
      </div>

      ${days.length === 0 ? html`
        <${Empty} icon=${filtered ? 'search' : 'history'} title=${filtered ? 'No matches' : `No expenses in ${monthLabel(key, { withYear: false })}`}
          action=${!filtered && key === currentMonthKey() ? html`<button class="btn btn-primary" onClick=${nav.add}><${Icon} name="plus" size=${18}/> Add expense</button>` : null}>
          ${filtered ? 'Clear a filter or try another word.' : 'New expenses show here. Newest first.'}
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
  // The month just settled on this screen: both characters cheer and the quest card plays its moment once.
  const [fresh, setFresh] = useState(null);
  useEffect(() => { if (!fresh) return undefined; const t = setTimeout(() => setFresh(null), 2800); return () => clearTimeout(t); }, [fresh]);
  const cheering = fresh === key;

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
    toast(ok ? `Copied ${amt}` : 'Can’t copy. Press and hold the amount.');
  };
  const monthName = monthLabel(key, { withYear: false });

  return html`
    <section class="screen settle">
      <${MonthNav} label=${monthLabel(key)} onPrev=${() => setKey(addMonths(key, -1))} onNext=${() => setKey(addMonths(key, 1))}
        canNext=${key < currentMonthKey()} sub=${isCurrent ? 'Month not over yet' : settled ? 'Settled' : 'Ready to settle'}/>

      ${nothing ? html`
        <${Empty} icon="settle" title="Nothing to settle">No expenses in ${monthName}.<//>` : html`
        <${TextBox} class=${over ? 'st-over' : 'st-on-track'} more=${false}>
          <p class="tb-head">${tight(over ? `${fmt(st.budgetSpent - budget, home)} over budget` : `${fmt(leftover, home)} left in budget`)}</p>
          <p>Spent ${fmt(st.budgetSpent, home)} of ${fmt(budget, home)}.<br/>Settle up: pay each of you back from the joint account.</p>
        <//>

        <div class="duel" role="list" aria-label="Pay back from the joint account">
          ${[ordered[0], null, ordered[1]].map((b, i) => {
            if (i === 1) {
              return html`<div key="mid" class="duel-mid" aria-hidden="true">
                <${Jar} size="sm" left=${budget > 0 ? Math.max(0, (budget - st.budgetSpent) / budget) : 0} summary=""/>
              </div>`;
            }
            if (!b) return html`<div key="ghost" class="duel-side ghost"><div class="sprite sprite-ghost"></div><b>Player 2</b><span>Not joined yet</span></div>`;
            const you = b.member.user_id === mine?.user_id;
            return html`
              <div key=${b.member.user_id} role="listitem" class=${`duel-side party ${b.amount === 0 ? 'zero' : ''}`} style=${partyTone(b.member.user_id, s).style}>
                <${Sprite} avatar=${avatarFor(b.member.user_id, s)} mood=${b.amount > 0 || cheering ? 'happy' : 'idle'} delay=${you ? 0 : 400}
                  action=${cheering ? 'cheer' : ''} actionKey=${cheering ? 1 : 0}/>
                <span class="duel-name">${you ? 'You get' : `${b.member.display_name} gets`}</span>
                <b class="duel-amt">${b.amount === 0 ? '—' : tight(fmt(b.amount, home, { cents: true }))}</b>
                <span class="duel-sub">${b.amount === 0 ? 'Nothing to pay' : `Paid ${plural(b.count, 'expense', 'expenses')}`}</span>
                ${b.amount > 0 && html`<button class="btn btn-secondary small" onClick=${() => copyAmount(b.amount.toFixed(currencyDecimals(home)))}><${Icon} name="copy" size=${12}/> Copy</button>`}
              </div>`;
          })}
        </div>

        ${st.joint.length > 0 && html`
          <div class="transfer zero">
            <span class="avatar avatar-joint" style="--size:40px"><${Icon} name="joint" size=${24}/></span>
            <div class="transfer-main"><b>${tight(`Joint account paid ${fmt(st.jointTotal, home, { cents: true })}`)}</b><span>${plural(st.joint.length, 'expense', 'expenses')} · Nothing to pay back</span></div>
          </div>`}

        ${st.fundSpent > 0 && html`<p class="hint">${fmt(st.fundSpent, home)} came from the date fund. Not counted in the budget.</p>`}

        ${estimates > 0 && html`
          <div class="notice warn">
            <${Icon} name="globe" size=${18}/>
            <div>
              <b>${estimates === 1 ? '1 amount is an estimate' : `${estimates} amounts are estimates`}</b>
              <p>Check your card. Add the real amount.</p>
              <div class="est-list">
                ${st.estimated.filter((e) => e.original_currency !== home).map((e) => html`
                  <button key=${e.id} class="link" onClick=${() => nav.open(e.id)}>${e.description} · ${fmt(e.original_amount, e.original_currency)}</button>`)}
              </div>
            </div>
          </div>`}

        ${settled ? html`
          <div class=${`settled-card ${cheering ? 'fresh' : ''}`} role="status">
            ${cheering && html`<${Confetti} count=${30}/>`}
            <span class="settled-stars" aria-hidden="true"><${Icon} name="sparkle" size=${24}/><${Icon} name="sparkle" size=${12}/></span>
            <div class="settled-main">
              <b>Quest complete!</b>
              <span>Settled by ${memberName(settled.settled_by, s).replace(/^You$/, 'you')} on ${shortDate(settled.settled_at.slice(0, 10))}</span>
            </div>
            ${settled.fund_contribution > 0 && html`
              <div class="settled-fund">
                <span class="settled-chest">${cheering && html`<${CoinRain} count=${10}/>`}<span class=${`fund-icon ${cheering ? 'chest-bounce' : ''}`}><${Icon} name="chest" size=${24}/></span></span>
                <span><b class="settled-plus">+<${CountUp} value=${settled.fund_contribution} format=${(v) => fmt(v, home)} active=${cheering}/></b>to date fund</span>
              </div>`}
          </div>
          <div class="settle-actions">
            <button class="btn btn-secondary" onClick=${() => nav.recap(key)}><${Icon} name="sparkle" size=${12}/> See recap</button>
            <button class="btn btn-quiet" onClick=${() => reopenMonth(key)}>Reopen month</button>
          </div>` : html`
          ${leftover > 0 && html`<p class="fund-preview"><span class="fund-icon"><${Icon} name="chest" size=${24}/></span> ${isCurrent ? `Left so far: ${fmt(leftover, home)}. At month end, it goes to the date fund.` : `Left over: ${fmt(leftover, home)}. It goes to the date fund.`}</p>`}
          <p class="hint center settle-first">First, move the money in your bank app. Then tap below. Date Jar does not move money.</p>
          <button class="btn btn-primary btn-block" onClick=${() => {
            const asks = [];
            if (isCurrent) asks.push(`${monthName} is not over yet.`);
            if (estimates) asks.push(estimates === 1 ? '1 amount is still an estimate.' : `${estimates} amounts are still estimates.`);
            if (asks.length && !window.confirm(`${asks.join(' ')} Settle anyway?`)) return;
            settleMonth(key);
            setFresh(key);
          }}>
            <${Icon} name="check" size=${12}/> Mark ${monthName} as settled
          </button>
          <button class="link recap-link" onClick=${() => nav.recap(key)}>See recap</button>`}
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
  if (r.topDay) cards.push({ kind: 'day', tone: 'indigo', title: 'Biggest spending day', big: shortDate(r.topDay[0]), value: r.topDay[1], format: money,
    body: r.biggest ? `Biggest item: ${r.biggest.description}.` : 'What a day!' });
  cards.push({ kind: 'hearts', tone: 'cream', title: 'Days out together', value: r.days, format: (v) => `${Math.round(v)} ${Math.round(v) === 1 ? 'day' : 'days'}`,
    hearts: Math.min(r.days, 31), body: `${r.list.length} ${r.list.length === 1 ? 'expense' : 'expenses'} in ${label}.` });
  if (r.foreign.length) cards.push({ kind: 'travel', tone: 'sky', title: 'Travel', big: r.foreign.join(' · '),
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
                <p class=${`recap-big ${c.kind === 'stamp' ? 'stamp' : ''}`}>${c.value != null ? html`<${CountUp} value=${c.value} format=${c.format} active=${n === i}/>` : tight(c.big)}</p>
                ${c.kind === 'day' && html`<p class="recap-sub">${c.big}</p>`}
                ${c.kind === 'category' && html`<div class="recap-meter" aria-hidden="true"><i style=${`--pct:${c.pct / 100}`}></i></div>`}
                ${c.kind === 'hearts' && html`<div class="heart-row" aria-hidden="true">${Array.from({ length: c.hearts }, (_, h) => html`<span key=${h} style=${`--i:${h}`}><${Icon} name="heart" size=${12}/></span>`)}</div>`}
                <p class="recap-body">${c.body}</p>
              </div>
              ${n === 0 && html`<p class="recap-swipe">Tap or swipe <${Icon} name="next" size=${12}/></p>`}
            </article>`)}
        </div>
        <div class="recap-nav">
          <button class="btn btn-secondary small" onClick=${() => step(-1)} disabled=${i === 0} aria-label="Previous card"><${Icon} name="back" size=${12}/></button>
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
    toast((await copyText(tsv)) ? `Copied ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}. Paste in Google Sheets.` : 'Can’t copy');
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

export function Settings({ nav }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const mine = me(s);
  const other = partner(s);
  const [name, setName] = useState(mine?.display_name ?? '');
  const [budget, setBudget] = useState(String(s.couple.monthly_budget));
  const [invite, setInvite] = useState(false);
  const [curPicker, setCurPicker] = useState(false);
  const [dressing, setDressing] = useState(null);
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
        <div class="setting"><span>Home currency<small>${locked ? 'Can’t change after you add expenses' : 'All amounts convert to this'}</small></span>
          ${locked ? html`<b>${home}</b>` : html`<button class="btn btn-secondary small" onClick=${() => setCurPicker(true)}>${home}</button>`}</div>
        <div class="setting"><span>Categories<small>Pick a type (food, travel…) when you add</small></span>
          <button class=${`switch ${s.prefs.categories ? 'on' : ''}`} role="switch" aria-checked=${s.prefs.categories} aria-label="Categories" onClick=${() => setPref('categories', !s.prefs.categories)}><i/></button></div>
      </div>

      <h2 class="list-label">Export</h2>
      <div class="group padded"><${ExportSection}/></div>

      <h2 class="list-label">Account</h2>
      <div class="group">
        ${s.session?.email && html`<div class="setting"><span>Signed in as</span><b class="mono-ish">${s.session.email}</b></div>`}
        ${MODE === 'cloud' && html`<button class="setting action" onClick=${() => signOut()}>Sign out</button>`}
        <button class="setting action danger" onClick=${() => {
          if (window.confirm(MODE === 'demo' ? 'Erase all demo data on this phone? You can’t undo this.' : 'Leave this jar? You will lose access to it.')) leaveCouple();
        }}>${MODE === 'demo' ? 'Erase demo data' : 'Leave this jar'}</button>
      </div>

      <p class="about">Date Jar · test version${MODE === 'demo' ? ' · demo mode' : ''}<br/>Exchange rates: open.er-api.com, updated daily.</p>
      ${invite && html`<${InviteSheet} onClose=${() => closeSheet(() => setInvite(false))}/>`}
      ${dressing && html`<${CharacterSheet} member=${dressing} onClose=${() => closeSheet(() => setDressing(null))}/>`}
      ${curPicker && html`<${CurrencyPicker} value=${home} home=${home} onPick=${(c) => { updateCouple({ home_currency: c }); setCurPicker(false); }} onClose=${() => closeSheet(() => setCurPicker(false))}/>`}
    </section>`;
}

export { InviteSheet, shareOrCopy };
