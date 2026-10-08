// Quick add / edit, currency picker and expense detail.
import { html, useEffect, useMemo, useRef, useState } from './ui.js';
import { Icon } from './icons.js';
import { Chip, Segmented, Sheet, SheetHeader, closeSheet, partyTone, tight } from './components.js';
import {
  CATEGORIES, REACTIONS, reactionKey, dateFundBalance, deleteExpense, memberName, me, partner,
  react, saveExpense, suggestions, undoAdd, toast, useStore, getState, settlementRow, entryNumber,
} from './store.js';
import { convert, cachedRates, loadRates, knownCurrencies } from './fx.js';
import {
  POPULAR_CURRENCIES, currencyDecimals, currencyName, dayLabel, fmt, symbolFor, todayISO, roundTo, monthKey, monthLabel,
} from './money.js';

// ---------------------------------------------------------------- helpers

function groupDigits(str) {
  const [int, dec] = str.split('.');
  const grouped = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec != null ? `${grouped}.${dec}` : grouped;
}

function pressKey(current, key, decimals) {
  if (key === 'back') return current.slice(0, -1);
  if (key === '.') {
    if (decimals === 0 || current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const [int, dec] = current.split('.');
  if (dec != null && dec.length >= decimals) return current;
  if (dec == null && int.length >= 9) return current;
  if (current === '0' && key === '0') return current;
  if (current === '0') return key;
  return current + key;
}

/** The currency a new entry starts in: home, unless the latest entry (under 12h old) was abroad. */
function tripCurrency(s, home) {
  const latest = s.expenses.filter((e) => !e.deleted_at).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
  if (!latest || latest.original_currency === home) return home;
  const age = Date.now() - new Date(latest.created_at).getTime();
  return age < 12 * 60 * 60 * 1000 ? latest.original_currency : home;
}

/** "¥100 = S$0.81" reads better than "1 JPY = S$0.00810" for small-unit currencies. */
function rateLine(code, rate, home) {
  const per = rate < 0.1 ? (rate < 0.001 ? 10000 : 100) : 1;
  return `${fmt(per, code)} = ${fmt(rate * per, home, { cents: true })}`;
}

// ---------------------------------------------------------------- currency picker

export function CurrencyPicker({ value, home, onPick, onClose }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { loadRates(home).then(() => tick((n) => n + 1)).catch(() => {}); }, []);

  const used = useMemo(() => {
    const set = new Set([s.prefs.lastCurrency, home, value].filter(Boolean));
    s.expenses.forEach((e) => set.add(e.original_currency));
    return [...set];
  }, []);
  const all = knownCurrencies(home);
  const pool = all.length ? all : POPULAR_CURRENCIES;
  const rest = pool.filter((c) => !used.includes(c) && !POPULAR_CURRENCIES.includes(c)).sort();
  const pop = POPULAR_CURRENCIES.filter((c) => !used.includes(c) && (all.length === 0 || all.includes(c)));

  const match = (c) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return c.toLowerCase().includes(needle) || currencyName(c).toLowerCase().includes(needle);
  };
  const section = (title, list) => {
    const rows = list.filter(match);
    if (!rows.length) return null;
    return html`
      <section>
        <h3 class="list-label">${title}</h3>
        ${rows.map((c) => html`
          <button key=${c} class=${`cur-row ${c === value ? 'on' : ''}`} onClick=${() => onPick(c)}>
            <b>${c}</b><span>${currencyName(c)}</span><i>${symbolFor(c).trim()}</i>
            ${c === value && html`<${Icon} name="check" size=${18}/>`}
          </button>`)}
      </section>`;
  };

  return html`
    <${Sheet} title="Choose currency" onClose=${onClose} tall>
      <${SheetHeader} title="Currency" onClose=${onClose}/>
      <div class="search-wrap">
        <${Icon} name="search" size=${18}/>
        <input type="search" placeholder="Search currency or country" value=${q} onInput=${(e) => setQ(e.target.value)} autocomplete="off" autocapitalize="off" aria-label="Search currencies"/>
      </div>
      <div class="sheet-scroll">
        ${section('Recent', used)}
        ${section('Popular for travel', pop)}
        ${section('All currencies', rest)}
      </div>
    <//>`;
}

// ---------------------------------------------------------------- add / edit

export function AddSheet({ editing = null, onClose }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const mine = me(s);
  const other = partner(s);
  const fundBalance = dateFundBalance(s);

  const [amount, setAmount] = useState(editing ? String(editing.original_amount) : '');
  const [currency, setCurrency] = useState(() => editing?.original_currency ?? tripCurrency(s, home));
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState(editing?.category ?? null);
  const [date, setDate] = useState(editing?.spent_on ?? todayISO());
  const [paidBy, setPaidBy] = useState(editing ? (editing.paid_by ?? 'joint') : s.session.userId);
  const [fromFund, setFromFund] = useState(!!editing?.from_fund);
  const [override, setOverride] = useState(editing && editing.amount_confirmed && editing.original_currency !== home ? String(editing.home_amount) : '');
  const [typing, setTyping] = useState(false);
  const [picker, setPicker] = useState(false);
  const [, tick] = useState(0);
  const descRef = useRef(null);

  useEffect(() => { loadRates(home).then(() => tick((n) => n + 1)).catch(() => {}); }, []);

  const decimals = currencyDecimals(currency);
  const num = Number(amount) || 0;
  const foreign = currency !== home;
  const conv = foreign ? convert(num, currency, home) : null;
  const rates = cachedRates(home);
  const sheetsSettled = settlementRow(monthKey(date));

  const chips = useMemo(() => suggestions(s, 6), []);

  const onKey = (k) => setAmount((cur) => pressKey(cur, k, decimals));

  const changeCurrency = (c) => {
    setCurrency(c);
    setPicker(false);
    const d = currencyDecimals(c);
    setAmount((cur) => {
      if (d === 0 && cur.includes('.')) return cur.split('.')[0];
      return cur;
    });
    if (c === home) setOverride('');
  };

  const canSave = num > 0;
  const save = () => {
    if (!canSave) return;
    const fallback = category ? CATEGORIES.find((c) => c.id === category)?.label : 'Shared expense';
    const finalDescription = description.trim() || fallback;
    const row = saveExpense({
      id: editing?.id,
      description: finalDescription,
      category,
      spent_on: date,
      amount: num,
      currency,
      paid_by: paidBy === 'joint' ? null : paidBy,
      home_override: foreign && override !== '' && Number(override) > 0 ? Number(override) : null,
      from_fund: fromFund,
    });
    onClose();
    if (editing) {
      toast('Changes saved');
    } else {
      toast(`Added ${row.description} · ${row.original_currency !== home ? `${fmt(row.original_amount, row.original_currency)} (≈ ${fmt(row.home_amount, home)})` : fmt(row.home_amount, home)}`, {
        undo: () => undoAdd(row.id),
      });
    }
  };

  const payerOptions = [
    { value: mine?.user_id, label: 'Me', tone: mine && partyTone(mine.user_id, s) },
    ...(other ? [{ value: other.user_id, label: other.display_name, tone: partyTone(other.user_id, s) }] : []),
    { value: 'joint', label: 'Joint', icon: 'joint' },
  ];

  const shown = amount === '' ? '0' : groupDigits(amount);
  const sizeClass = shown.length > 11 ? 'xs' : shown.length > 8 ? 'sm' : '';

  return html`
    <${Sheet} title=${editing ? 'Edit expense' : 'New expense'} onClose=${onClose} tall class=${typing ? 'typing' : ''}>
      <${SheetHeader} title=${editing ? 'Edit expense' : 'New expense'} onClose=${onClose}
        right=${html`
          <label class="chip chip-date">
            <${Icon} name="calendar" size=${16}/><span>${dayLabel(date)}</span>
            <input type="date" value=${date} onInput=${(e) => e.target.value && setDate(e.target.value)} aria-label="Date"/>
          </label>`}/>

      <div class="sheet-scroll add-scroll">
        <div class="amount-wrap">
          <button class="cur-btn" onClick=${() => setPicker(true)} aria-label=${`Currency: ${currency}. Change`}>
            <span>${symbolFor(currency).trim()}</span>${currency !== home && html`<span class="cur-code">${currency}</span>`}<${Icon} name="down" size=${14}/>
          </button>
          <output class=${`amount ${sizeClass} ${amount === '' ? 'ph' : ''}`} aria-live="polite" aria-label="Amount">${tight(shown)}</output>
        </div>
        ${foreign && html`
          <p class="conv" aria-live="polite">
            ${conv && num > 0 ? html`<b>≈ ${tight(fmt(override !== '' ? Number(override) || conv.home : conv.home, home))}</b> ${override !== '' ? 'card amount' : 'estimate'} · ${tight(rateLine(currency, conv.rate, home))}`
              : num > 0 ? html`No exchange rate yet. We convert it when you are online.`
              : html`Converted to ${home} at today's rate${rates?.asOf ? '' : ''}.`}
          </p>`}
        ${!foreign && html`<p class="conv"> </p>`}

        <div class="field-group">
          <div class="desc-wrap">
            <input ref=${descRef} class="desc" type="text" value=${description} placeholder="What was it? (optional)" maxlength="120"
              onInput=${(e) => setDescription(e.target.value)} onFocus=${() => setTyping(true)} onBlur=${() => setTyping(false)}
              autocomplete="off" autocapitalize="sentences" enterkeyhint="done" aria-label="Description"/>
          </div>
          <div class="chip-row scroll" role="group" aria-label="Quick descriptions">
            ${chips.map((c) => html`
              <${Chip} key=${c.description} class="content" on=${description.trim().toLowerCase() === c.description.toLowerCase()}
                onClick=${() => { setDescription(c.description); if (c.category) setCategory(c.category); }}>${c.description}<//>`)}
          </div>
        </div>

        <div class="field-group">
          <span class="field-label" id="paid-label">Paid by</span>
          <${Segmented} label="Paid by" options=${payerOptions} value=${paidBy} onChange=${setPaidBy}/>
        </div>

        ${s.prefs.categories && html`
          <div class="field-group">
            <span class="field-label">Category</span>
            <div class="chip-row" role="group" aria-label="Category">
              ${CATEGORIES.map((c) => html`<${Chip} key=${c.id} class="content" on=${category === c.id} onClick=${() => setCategory(category === c.id ? null : c.id)}>${c.label}<//>`)}
            </div>
          </div>`}

        ${foreign && html`
          <div class="field-group">
            <label class="field-label" for="override">Card amount (${home}) · optional</label>
            <div class="override">
              <span>${symbolFor(home).trim()}</span>
              <input id="override" type="text" inputmode="decimal" placeholder=${conv ? String(conv.home) : 'Amount on your card statement'}
                value=${override} onInput=${(e) => setOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                onFocus=${() => setTyping(true)} onBlur=${() => setTyping(false)}/>
            </div>
            <p class="hint">Add this when your card shows the real amount. Settle up uses it.</p>
          </div>`}

        ${(fundBalance > 0 || fromFund) && html`
          <div class="field-group">
            <${Chip} on=${fromFund} onClick=${() => setFromFund(!fromFund)}><${Icon} name="chest" size=${12}/> Pay from date fund (${fmt(fundBalance, home)})<//>
          </div>`}

        ${sheetsSettled && html`<p class="notice"><${Icon} name="info" size=${16}/> ${monthLabel(monthKey(date), { withYear: false })} is already settled. Saving reopens it.</p>`}
      </div>

      <div class="add-foot">
        <div class="pad" role="group" aria-label="Number pad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals ? '.' : '', '0', 'back'].map((k) => k === '' ? html`<span key="gap"/>` : html`
            <button key=${k} class=${`key ${k === 'back' ? 'key-back' : ''}`} onClick=${() => onKey(k)} aria-label=${k === 'back' ? 'Delete last digit' : k === '.' ? 'Decimal point' : k}>
              ${k === 'back' ? html`<${Icon} name="backspace" size=${24}/>` : k}
            </button>`)}
        </div>
        <button class="btn btn-primary btn-block save" disabled=${!canSave} onClick=${save}>
          ${typing ? 'Done' : editing ? 'Save changes' : canSave ? html`<span>${tight(`Save ${fmt(num, currency)}`)}</span>` : 'Enter an amount'}
        </button>
      </div>
      ${picker && html`<${CurrencyPicker} value=${currency} home=${home} onPick=${changeCurrency} onClose=${() => closeSheet(() => setPicker(false))}/>`}
    <//>`;
}

// ---------------------------------------------------------------- detail

export function DetailSheet({ id, onClose, onEdit }) {
  const s = useStore();
  const e = s.expenses.find((x) => x.id === id && !x.deleted_at);
  if (!e) { onClose(); return null; }
  const home = s.couple.home_currency;
  const foreign = e.original_currency !== home;
  const uid = s.session.userId;
  const mine = reactionKey(e.reactions?.[uid]);
  const counts = Object.entries(e.reactions ?? {}).map(([u, r]) => [u, reactionKey(r)]);
  const reactionLabel = (key) => REACTIONS.find((x) => x.key === key)?.label ?? key;

  const confirmDelete = () => {
    const settledMonth = settlementRow(monthKey(e.spent_on));
    const warn = settledMonth ? ` ${monthLabel(monthKey(e.spent_on), { withYear: false })} is settled. This will reopen it.` : '';
    // Deleting shows an Undo toast, so only ask first when it would also reopen a settled month.
    if (!settledMonth || window.confirm(`Delete “${e.description}”?${warn}`)) {
      onClose();
      deleteExpense(e.id);
    }
  };

  const edited = e.edited_by ? `Edited by ${memberName(e.edited_by, s)}` : null;
  const dl = (label, value) => html`<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`;

  return html`
    <${Sheet} title=${e.description} onClose=${onClose}>
      <${SheetHeader} title="Expense" onClose=${onClose}/>
      <div class="sheet-scroll detail">
        <p class="detail-no">No.${String(entryNumber(e.id, s)).padStart(3, '0')}</p>
        <h2 class="detail-title">${e.description}</h2>
        <p class="detail-amt">${e.home_amount || !foreign ? tight(fmt(e.home_amount, home, { cents: true })) : 'Waiting for rate'}</p>
        ${foreign && html`<p class="detail-orig">${fmt(e.original_amount, e.original_currency, { cents: true })} ${e.fx_rate ? `· ${rateLine(e.original_currency, Number(e.fx_rate), home)}` : ''}</p>`}
        ${foreign && !e.amount_confirmed && html`
          <p class="notice"><${Icon} name="info" size=${16}/> This amount is an estimate.
            <button class="link" onClick=${() => onEdit(e.id)}>Add card amount</button></p>`}
        ${foreign && e.amount_confirmed && html`<p class="notice ok"><${Icon} name="check" size=${16}/> Matches the card amount.</p>`}

        <dl class="kvs">
          ${dl('Paid by', e.paid_by ? memberName(e.paid_by, s) : 'Joint account')}
          ${dl('Date', dayLabel(e.spent_on))}
          ${e.category && dl('Category', CATEGORIES.find((c) => c.id === e.category)?.label ?? e.category)}
          ${e.from_fund && dl('From', 'Date fund (not budget)')}
          ${dl('Added by', `${memberName(e.added_by, s)}${edited ? ` · ${edited}` : ''}`)}
        </dl>

        <div class="reactions" role="group" aria-label="React">
          ${REACTIONS.map((r) => html`
            <button key=${r.key} class=${`react-${r.key} ${mine === r.key ? "on" : ""}`} aria-pressed=${mine === r.key} aria-label=${r.label}
              onClick=${() => react(e.id, r.key)}><${Icon} name=${r.key} size=${24}/></button>`)}
        </div>
        ${counts.length > 0 && html`<p class="hint center">${counts.map(([u, r]) => `${memberName(u, s)}: ${reactionLabel(r)}`).join(" · ")}</p>`}

        <div class="detail-actions">
          <button class="btn btn-secondary" onClick=${() => onEdit(e.id)}><${Icon} name="edit" size=${18}/> Edit</button>
          <button class="btn btn-quiet danger" onClick=${confirmDelete}><${Icon} name="trash" size=${18}/> Delete expense</button>
        </div>
      </div>
    <//>`;
}
