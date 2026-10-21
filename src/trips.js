// Trips: the sheet to start or edit a trip, and small helpers shared by Home, History and Settings.
import { html, useState } from './ui.js';
import { Icon } from './icons.js';
import { Chip, Sheet, SheetHeader, closeSheet } from './components.js';
import { CurrencyPicker } from './add.js';
import { activeTrip, earlierTripExpenses, endTrip, moveManyToTrip, potChoices, startTrip, toast, tripExpenses, updateTrip, useStore } from './store.js';
import { currencyName, fmt, shortDate, sum, symbolFor, todayISO, tripNameFor } from './money.js';

// Names are the couple's own words: no autocorrect or spellcheck squiggles.
const NAME_INPUT = { autocorrect: 'off', autocapitalize: 'words', spellcheck: false };

/** Day of the trip, counting the first day as day 1. */
export function tripDay(trip, today = todayISO()) {
  const end = trip.ended_on ?? today;
  return Math.max(1, Math.round((Date.parse(end) - Date.parse(trip.started_on)) / 864e5) + 1);
}

/** "12–18 Oct" for an ended trip, "Since 12 Oct" for one that is on. */
export function tripRange(trip) {
  if (!trip.ended_on) return `Since ${shortDate(trip.started_on)}`;
  if (trip.ended_on === trip.started_on) return shortDate(trip.started_on);
  return `${shortDate(trip.started_on)} – ${shortDate(trip.ended_on)}`;
}

/** The pot's dates and money for expenses picked in History: their first and last day, their most used foreign currency. */
function fromPicked(ids, s) {
  const list = s.expenses.filter((e) => ids.includes(e.id));
  const days = list.map((e) => e.spent_on).sort();
  const counts = {};
  list.forEach((e) => { if (e.original_currency !== s.couple.home_currency) counts[e.original_currency] = (counts[e.original_currency] ?? 0) + 1; });
  const currency = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ?? null;
  const last = days[days.length - 1];
  return { currency, from: days[0] ?? todayISO(), to: last && last < todayISO() ? last : null };
}

/**
 * Start a pot, or edit one (`trip`). `currency` is a starting guess for a new pot. `ids` are
 * expenses picked in History: they go in the new pot, and nothing else moves.
 * onDone(trip) runs after a new pot starts.
 */
export function TripSheet({ trip = null, currency: guessed = null, ids = null, onClose, onDone }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [picked] = useState(() => (ids ? fromPicked(ids, s) : null));
  const guess = picked ? picked.currency : guessed;
  const [currency, setCurrency] = useState(trip ? (trip.currency ?? home) : (guess ?? home));
  const [name, setName] = useState(trip?.name ?? tripNameFor(guess, home));
  const [nameTouched, setNameTouched] = useState(!!trip);
  const [budget, setBudget] = useState(trip?.budget ? String(trip.budget) : '');
  const [from, setFrom] = useState(trip?.started_on ?? picked?.from ?? todayISO());
  const [to, setTo] = useState(trip?.ended_on ?? picked?.to ?? null);
  const [picker, setPicker] = useState(false);
  const earlier = trip || ids ? [] : earlierTripExpenses(currency, from, s);

  const pickCurrency = (c) => {
    setCurrency(c);
    setPicker(false);
    if (!nameTouched) setName(tripNameFor(c, home));
  };
  const save = () => {
    const fields = { name: name.trim() || tripNameFor(currency, home), budget: Number(budget) > 0 ? Number(budget) : null };
    if (trip) {
      updateTrip(trip.id, { ...fields, currency: currency !== home ? currency : null, started_on: from, ...(to ? { ended_on: to < from ? from : to } : {}) });
      onClose();
      toast('Pot saved');
      return;
    }
    if (ids) {
      const { trip: made } = startTrip({ ...fields, currency, from, to: to && to < from ? from : to, moveEarlier: false });
      onClose();
      moveManyToTrip(ids, made.id, (n) => `${made.name} made with ${n} ${n === 1 ? 'expense' : 'expenses'}.`);
      onDone?.(made);
      return;
    }
    const { trip: made, moved } = startTrip({ ...fields, currency, from });
    onClose();
    toast(moved ? `${made.name} started. ${moved} earlier ${moved === 1 ? 'expense' : 'expenses'} moved in.` : `${made.name} started. New expenses go in it.`);
    onDone?.(made);
  };

  return html`
    <${Sheet} title=${trip ? 'Edit pot' : 'Start a pot'} onClose=${onClose}>
      <${SheetHeader} title=${trip ? 'Edit pot' : 'Start a pot'} onClose=${onClose}/>
      <div class="sheet-scroll trip-sheet">
        ${ids && html`<p class="hint">${ids.length} picked ${ids.length === 1 ? 'expense goes' : 'expenses go'} in this pot. ${to ? 'Its last day is past, so new expenses keep using the monthly budget.' : 'New expenses go in it too, until you end it.'}</p>`}
        ${!trip && !ids && html`<p class="hint">A pot is for a trip or a big plan. It has its own jar and does not use your monthly date budget. You still pay each other back at month end.</p>`}
        <form class="form" onSubmit=${(e) => { e.preventDefault(); save(); }}>
          <label class="form-field"><span>Pot name</span>
            <input value=${name} maxlength="60" ...${NAME_INPUT} onInput=${(e) => { setName(e.target.value); setNameTouched(true); }}/></label>
          <div class="two-col">
            <label class="form-field"><span>Currency</span>
              <button type="button" class="select-btn" onClick=${() => setPicker(true)}><b>${currency}</b> <span>${currencyName(currency)}</span><${Icon} name="down" size=${16}/></button></label>
            <label class="form-field"><span>Pot budget</span>
              <span class="inline-input big"><i>${symbolFor(home).trim()}</i><input inputmode="decimal" placeholder="No limit" value=${budget} maxlength="9"
                onInput=${(e) => setBudget(e.target.value.replace(/[^0-9.]/g, '').slice(0, 9))} aria-label=${`Pot budget in ${home}. Optional`}/></span>
              <small>Optional. In ${home}.</small></label>
          </div>
          <label class="form-field"><span>First day</span>
            <input type="date" value=${from} max=${todayISO()} onInput=${(e) => e.target.value && setFrom(e.target.value)}/>
            ${!trip && earlier.length > 0 && html`<small>${earlier.length} ${currency} ${earlier.length === 1 ? 'expense' : 'expenses'} since ${shortDate(from)} will move into this pot.</small>`}
            ${!trip && !ids && currency === home && from < todayISO() && html`<small>Only new expenses go in. To add earlier ones, tap Select in History.</small>`}
          </label>
          ${to && html`
            <label class="form-field"><span>Last day</span>
              <input type="date" value=${to} min=${from} max=${todayISO()} onInput=${(e) => e.target.value && setTo(e.target.value)}/></label>`}
        </form>
      </div>
      <div class="add-foot btn-col">
        <button class="btn btn-primary btn-block" onClick=${save}>${trip ? 'Save changes' : 'Start pot'}</button>
        ${trip && !trip.ended_on && html`<button class="btn btn-quiet btn-block" onClick=${() => { onClose(); endTrip(); }}>End pot</button>`}
      </div>
      ${picker && html`<${CurrencyPicker} value=${currency} home=${home} onPick=${pickCurrency} onClose=${() => closeSheet(() => setPicker(false))}/>`}
    <//>`;
}

/**
 * Which pot an expense is in (`value`, a pot id or null). Used by both the edit sheet and the
 * expense screen, with the same choices from potChoices(). `e` is null for a new expense.
 */
export function PotChoice({ e, value, onPick }) {
  const s = useStore();
  const pots = potChoices(e, s);
  if (!pots.length) return null;
  return html`
    <div class="field-group pot-choice">
      <div class="chip-row" role="group" aria-label="Pot">
        ${pots.map((p) => html`
          <${Chip} key=${p.id} on=${value === p.id} onClick=${() => onPick(value === p.id ? null : p.id)}
            aria-label=${`In ${p.name}`}><${Icon} name="travel" size=${12}/> <span>In ${p.name}</span><//>`)}
      </div>
      <p class="hint">${value ? 'Not in the monthly budget. Tap to take it out.' : 'Not in a pot: it uses the monthly budget.'}</p>
    </div>`;
}

/** Pick the pot for expenses chosen in History: the one that is on, past pots, or a new one. */
export function PotPickSheet({ ids, onClose, onDone }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const on = activeTrip(s);
  const pots = s.trips.slice().sort((a, b) => (b.id === on?.id) - (a.id === on?.id) || b.started_on.localeCompare(a.started_on));
  const [making, setMaking] = useState(false);
  const put = (pot) => {
    onClose();
    moveManyToTrip(ids, pot.id, (n) => (n ? `${n} ${n === 1 ? 'expense' : 'expenses'} moved into ${pot.name}.` : `Already in ${pot.name}.`));
    onDone?.();
  };
  const title = `Move ${ids.length} ${ids.length === 1 ? 'expense' : 'expenses'} to`;
  return html`
    <${Sheet} title=${title} onClose=${onClose}>
      <${SheetHeader} title=${title} onClose=${onClose}/>
      <div class="sheet-scroll">
        <div class="group">
          ${pots.map((p) => html`
            <button key=${p.id} class="setting trip-row" onClick=${() => put(p)}>
              <span>${p.name}<small>${`${p.id === on?.id ? 'On now · ' : ''}${tripRange(p)} · ${fmt(sum(tripExpenses(p.id, s)), home)}`}</small></span><${Icon} name="next" size=${12}/></button>`)}
          <button class="setting action" onClick=${() => setMaking(true)}><span>New pot<small>For a trip or plan you did not make a pot for</small></span></button>
        </div>
      </div>
      ${making && html`<${TripSheet} ids=${ids} onClose=${() => closeSheet(() => { setMaking(false); onClose(); })} onDone=${onDone}/>`}
    <//>`;
}
