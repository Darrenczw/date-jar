// Trips: the sheet to start or edit a trip, and small helpers shared by Home, History and Settings.
import { html, useState } from './ui.js';
import { Icon } from './icons.js';
import { Sheet, SheetHeader, closeSheet } from './components.js';
import { CurrencyPicker } from './add.js';
import { earlierTripExpenses, endTrip, startTrip, toast, updateTrip, useStore } from './store.js';
import { currencyName, shortDate, symbolFor, todayISO, tripNameFor } from './money.js';

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

/**
 * Start a trip, or edit one (`trip`). `currency` is a starting guess for a new trip.
 * onDone(trip) runs after a new trip starts.
 */
export function TripSheet({ trip = null, currency: guess = null, onClose, onDone }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [currency, setCurrency] = useState(trip ? (trip.currency ?? home) : (guess ?? home));
  const [name, setName] = useState(trip?.name ?? tripNameFor(guess, home));
  const [nameTouched, setNameTouched] = useState(!!trip);
  const [budget, setBudget] = useState(trip?.budget ? String(trip.budget) : '');
  const [from, setFrom] = useState(trip?.started_on ?? todayISO());
  const [to, setTo] = useState(trip?.ended_on ?? null);
  const [picker, setPicker] = useState(false);
  const earlier = trip ? [] : earlierTripExpenses(currency, from, s);

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
      toast('Trip saved');
      return;
    }
    const { trip: made, moved } = startTrip({ ...fields, currency, from });
    onClose();
    toast(moved ? `${made.name} started. ${moved} earlier ${moved === 1 ? 'expense' : 'expenses'} moved in.` : `${made.name} started. New expenses go in it.`);
    onDone?.(made);
  };

  return html`
    <${Sheet} title=${trip ? 'Edit trip' : 'Start a trip'} onClose=${onClose}>
      <${SheetHeader} title=${trip ? 'Edit trip' : 'Start a trip'} onClose=${onClose}/>
      <div class="sheet-scroll trip-sheet">
        ${!trip && html`<p class="hint">A trip has its own jar. It does not use your monthly date budget. You still pay each other back at month end.</p>`}
        <form class="form" onSubmit=${(e) => { e.preventDefault(); save(); }}>
          <label class="form-field"><span>Trip name</span>
            <input value=${name} maxlength="60" ...${NAME_INPUT} onInput=${(e) => { setName(e.target.value); setNameTouched(true); }}/></label>
          <div class="two-col">
            <label class="form-field"><span>Money used there</span>
              <button type="button" class="select-btn" onClick=${() => setPicker(true)}><b>${currency}</b> <span>${currencyName(currency)}</span><${Icon} name="down" size=${16}/></button></label>
            <label class="form-field"><span>Trip budget</span>
              <span class="inline-input big"><i>${symbolFor(home).trim()}</i><input inputmode="decimal" placeholder="No limit" value=${budget} maxlength="9"
                onInput=${(e) => setBudget(e.target.value.replace(/[^0-9.]/g, '').slice(0, 9))} aria-label=${`Trip budget in ${home}. Optional`}/></span>
              <small>Optional. In ${home}.</small></label>
          </div>
          <label class="form-field"><span>First day</span>
            <input type="date" value=${from} max=${todayISO()} onInput=${(e) => e.target.value && setFrom(e.target.value)}/>
            ${!trip && earlier.length > 0 && html`<small>${earlier.length} ${currency} ${earlier.length === 1 ? 'expense' : 'expenses'} since ${shortDate(from)} will move into this trip.</small>`}
          </label>
          ${to && html`
            <label class="form-field"><span>Last day</span>
              <input type="date" value=${to} min=${from} max=${todayISO()} onInput=${(e) => e.target.value && setTo(e.target.value)}/></label>`}
        </form>
      </div>
      <div class="add-foot btn-col">
        <button class="btn btn-primary btn-block" onClick=${save}>${trip ? 'Save changes' : 'Start trip'}</button>
        ${trip && !trip.ended_on && html`<button class="btn btn-quiet btn-block" onClick=${() => { onClose(); endTrip(); }}>End trip</button>`}
      </div>
      ${picker && html`<${CurrencyPicker} value=${currency} home=${home} onPick=${pickCurrency} onClose=${() => closeSheet(() => setPicker(false))}/>`}
    <//>`;
}
