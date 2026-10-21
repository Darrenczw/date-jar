// Pots (called trips in the code and database): the sheet to open or edit a pot, the "Add to pot" picker,
// and small helpers shared by Home, History and Settings.
import { html, useState } from './ui.js';
import { Icon } from './icons.js';
import { Sheet, SheetHeader, closeSheet } from './components.js';
import { CurrencyPicker } from './add.js';
import {
  activeTrip, earlierTripExpenses, endTrip, moveToTrip, startTrip, toast, tripExpenses, updateCouple, updateTrip, useStore,
} from './store.js';
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

/**
 * Open a pot, or edit one (`trip`). `currency` is a starting guess for a new pot.
 * `fromIds`: the pot is made for these selected expenses, so it starts on the earliest of them,
 * does not collect new expenses by default, and moves nothing else in. onDone(pot) runs after a new pot opens.
 */
export function TripSheet({ trip = null, currency: guess = null, fromIds = null, onClose, onDone }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const on = activeTrip(s);
  const firstPicked = fromIds ? s.expenses.filter((e) => fromIds.includes(e.id)).map((e) => e.spent_on).sort()[0] : null;
  const [currency, setCurrency] = useState(trip ? (trip.currency ?? home) : (guess ?? home));
  const [name, setName] = useState(trip?.name ?? tripNameFor(guess, home));
  const [nameTouched, setNameTouched] = useState(!!trip);
  const [budget, setBudget] = useState(trip?.budget ? String(trip.budget) : '');
  const [from, setFrom] = useState(trip?.started_on ?? firstPicked ?? todayISO());
  const [to, setTo] = useState(trip?.ended_on ?? null);
  // "Collecting": new expenses go into this pot. Only one pot collects at a time.
  const [collect, setCollect] = useState(trip ? on?.id === trip.id : !fromIds);
  const [picker, setPicker] = useState(false);
  const earlier = trip || fromIds || !collect ? [] : earlierTripExpenses(currency, from, s);
  const other = on && on.id !== trip?.id ? on : null;

  const pickCurrency = (c) => {
    setCurrency(c);
    setPicker(false);
    if (!nameTouched) setName(tripNameFor(c, home));
  };
  const save = () => {
    const fields = { name: name.trim() || tripNameFor(currency, home) || 'Our pot', budget: Number(budget) > 0 ? Number(budget) : null };
    if (trip) {
      const wasOn = on?.id === trip.id;
      updateTrip(trip.id, {
        ...fields, currency: currency !== home ? currency : null, started_on: from,
        ...(collect ? { ended_on: null } : to ? { ended_on: to < from ? from : to } : {}),
      });
      if (collect && !wasOn) updateCouple({ active_trip_id: trip.id });
      if (!collect && wasOn) updateCouple({ active_trip_id: null });
      onClose();
      toast('Pot saved');
      return;
    }
    const { trip: made, moved } = startTrip({ ...fields, currency, from, activate: collect, moveEarlier: !fromIds });
    onClose();
    if (!fromIds) {
      toast(moved ? `Pot ${made.name} opened. ${moved} earlier ${moved === 1 ? 'expense' : 'expenses'} moved in.`
        : collect ? `Pot ${made.name} opened. New expenses go in it.` : `Pot ${made.name} opened.`);
    }
    onDone?.(made);
  };

  return html`
    <${Sheet} title=${trip ? 'Edit pot' : 'Open a pot'} onClose=${onClose}>
      <${SheetHeader} title=${trip ? 'Edit pot' : 'Open a pot'} onClose=${onClose}/>
      <div class="sheet-scroll trip-sheet">
        ${!trip && html`<p class="hint">A pot keeps a trip or a big plan apart. It has its own budget and does not use your monthly date budget. You still pay each other back at month end.</p>`}
        <form class="form" onSubmit=${(e) => { e.preventDefault(); save(); }}>
          <label class="form-field"><span>Pot name</span>
            <input value=${name} maxlength="60" placeholder="Shanghai, anniversary, new sofa…" ...${NAME_INPUT} onInput=${(e) => { setName(e.target.value); setNameTouched(true); }}/></label>
          <div class="two-col">
            <label class="form-field"><span>Main currency</span>
              <button type="button" class="select-btn" onClick=${() => setPicker(true)}><b>${currency}</b> <span>${currencyName(currency)}</span><${Icon} name="down" size=${16}/></button></label>
            <label class="form-field"><span>Pot budget</span>
              <span class="inline-input big"><i>${symbolFor(home).trim()}</i><input inputmode="decimal" placeholder="No limit" value=${budget} maxlength="9"
                onInput=${(e) => setBudget(e.target.value.replace(/[^0-9.]/g, '').slice(0, 9))} aria-label=${`Pot budget in ${home}. Optional`}/></span>
              <small>Optional. In ${home}.</small></label>
          </div>
          <label class="form-field"><span>Start</span>
            <input type="date" value=${from} max=${todayISO()} onInput=${(e) => e.target.value && setFrom(e.target.value)}/>
            ${earlier.length > 0 && html`<small>${earlier.length} ${currency} ${earlier.length === 1 ? 'expense' : 'expenses'} since ${shortDate(from)} will move into this pot.</small>`}
          </label>
          ${to && !collect && html`
            <label class="form-field"><span>End</span>
              <input type="date" value=${to} min=${from} max=${todayISO()} onInput=${(e) => e.target.value && setTo(e.target.value)}/></label>`}
          <div class="group">
            <button type="button" class="setting setting-toggle" role="switch" aria-checked=${collect} onClick=${() => setCollect(!collect)}>
              <span>Add new expenses to this pot<small>${collect && other ? `${other.name} stops collecting.` : 'Turn off when the trip or plan is over.'}</small></span>
              <span class=${`switch ${collect ? 'on' : ''}`} aria-hidden="true"><i/></span></button>
          </div>
        </form>
      </div>
      <div class="add-foot btn-col">
        <button class="btn btn-primary btn-block" onClick=${save}>${trip ? 'Save changes' : 'Open pot'}</button>
        ${trip && !trip.ended_on && html`<button class="btn btn-quiet btn-block" onClick=${() => { onClose(); if (on?.id === trip.id) endTrip(); else updateTrip(trip.id, { ended_on: todayISO() }); }}>Close pot</button>`}
      </div>
      ${picker && html`<${CurrencyPicker} value=${currency} home=${home} onPick=${pickCurrency} onClose=${() => closeSheet(() => setPicker(false))}/>`}
    <//>`;
}

/** "Add to pot": put the selected expenses in a pot (or a new one), or take them out of pots. Undo puts each back. */
export function PotPicker({ ids, onClose, onDone }) {
  const s = useStore();
  const home = s.couple.home_currency;
  const [making, setMaking] = useState(false);
  const picked = ids.map((id) => s.expenses.find((e) => e.id === id && !e.deleted_at)).filter(Boolean);
  const on = activeTrip(s);
  const pots = [on, ...s.trips.filter((t) => t.id !== on?.id).sort((a, b) => b.started_on.localeCompare(a.started_on))].filter(Boolean);
  // A new pot starts in the currency most of the selected foreign expenses use.
  const counts = {};
  picked.filter((e) => e.original_currency !== home).forEach((e) => { counts[e.original_currency] = (counts[e.original_currency] ?? 0) + 1; });
  const guess = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const n = picked.length;
  const what = `${n} ${n === 1 ? 'expense' : 'expenses'}`;

  const moveAll = (to, name) => {
    const before = picked.map((e) => [e.id, e.trip_id ?? null]);
    before.forEach(([id]) => moveToTrip(id, to));
    onDone?.();
    toast(to ? `Added ${what} to ${name}` : `Took ${what} out of pots`, { undo: () => before.forEach(([id, t]) => moveToTrip(id, t)) });
  };

  return html`
    <${Sheet} title="Add to pot" onClose=${onClose}>
      <${SheetHeader} title="Add to pot" onClose=${onClose}/>
      <div class="sheet-scroll pot-picker">
        <p class="hint">${what} · ${fmt(sum(picked), home)}. In a pot, they do not use the monthly budget.</p>
        <div class="group">
          <button class="setting action new-pot" onClick=${() => setMaking(true)}><${Icon} name="plus" size=${12}/> New pot</button>
          ${pots.map((t) => {
            const all = picked.every((e) => e.trip_id === t.id);
            return html`
              <button key=${t.id} class="setting pot-row" disabled=${all} onClick=${() => moveAll(t.id, t.name)}>
                <span class="pot-icon" aria-hidden="true"><${Icon} name="pot" size=${24}/></span>
                <span>${t.name}<small>${`${tripRange(t)} · ${fmt(sum(tripExpenses(t.id, s)), home)}${t.id === on?.id ? ' · collecting' : ''}${all ? ' · already in it' : ''}`}</small></span>
                <${Icon} name="next" size=${12}/></button>`;
          })}
        </div>
        ${picked.some((e) => e.trip_id) && html`<button class="btn btn-quiet btn-block" onClick=${() => moveAll(null)}>Take out of pots</button>`}
      </div>
      ${making && html`<${TripSheet} currency=${guess} fromIds=${ids} onClose=${() => closeSheet(() => setMaking(false))} onDone=${(made) => moveAll(made.id, made.name)}/>`}
    <//>`;
}
