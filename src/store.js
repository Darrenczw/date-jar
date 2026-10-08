// App state, local persistence, offline outbox and every user action.
// The UI only ever talks to this module.

import { useEffect, useState } from './ui.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { convert, loadRates } from './fx.js';
import { addMonths, currentMonthKey, monthKey, monthLabel, roundTo, settlementFor, todayISO, budgetExpenses, sum } from './money.js';

export const MODE = SUPABASE_URL && SUPABASE_ANON_KEY ? 'cloud' : 'demo';
const CACHE_KEY = 'datejar.state.v1';

export const CATEGORIES = [
  { id: 'food', label: 'Food & drinks' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'outings', label: 'Outings' },
  { id: 'travel', label: 'Travel' },
  { id: 'home', label: 'Home' },
  { id: 'other', label: 'Other' },
];

export const REACTIONS = [
  { key: 'heart', label: 'Love it' },
  { key: 'yum', label: 'Yum' },
  { key: 'laugh', label: 'Haha' },
  { key: 'fire', label: 'Fire' },
  { key: 'aww', label: 'Aww' },
  { key: 'phew', label: 'Phew' },
];
// Reactions saved before the pixel icons existed were emoji; read them as keys.
const LEGACY_REACTION = { '❤️': 'heart', '😋': 'yum', '😂': 'laugh', '🔥': 'fire', '🥹': 'aww', '😅': 'phew' };
export function reactionKey(value) {
  return LEGACY_REACTION[value] ?? value;
}

const empty = {
  ready: false,
  session: null,
  couple: null,
  members: [],
  expenses: [],
  settlements: [],
  outbox: [],
  prefs: { lastCurrency: null, categories: true, installDismissed: false },
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  syncError: null,
  toast: null,
  justSaved: null,
};

let state = { ...empty, ...readCache() };
const listeners = new Set();

function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!saved || saved.mode !== MODE) return {};
    const { session, couple, members, expenses, settlements, outbox, prefs } = saved;
    return { session, couple, members: members ?? [], expenses: expenses ?? [], settlements: settlements ?? [], outbox: outbox ?? [], prefs: { ...empty.prefs, ...prefs } };
  } catch {
    return {};
  }
}

function persist() {
  const { session, couple, members, expenses, settlements, outbox, prefs } = state;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ mode: MODE, session, couple, members, expenses, settlements, outbox, prefs }));
  } catch { /* private mode / full: app still works for this session */ }
}

export function getState() {
  return state;
}

function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  persist();
  listeners.forEach((fn) => fn(state));
}

export function useStore() {
  const [, force] = useState(0);
  const seen = state;
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    // Effects run after paint: catch any change that landed between render and subscribe.
    if (state !== seen) fn();
    return () => listeners.delete(fn);
  }, []);
  return state;
}

// ---------------------------------------------------------------- backend

const demo = {
  mode: 'demo',
  async restore() { return state.session; },
  async push() {},
  subscribe() { return () => {}; },
};

let backendPromise = null;
function backend() {
  backendPromise ??= MODE === 'cloud' ? import('./backend-supabase.js').then((m) => m.cloud) : Promise.resolve(demo);
  return backendPromise;
}

// ---------------------------------------------------------------- toast

let toastTimer;
/** Turn a technical error into a short message that says what to do. Never shows raw error text. */
export function friendlyError(err) {
  const m = String(err?.message ?? err ?? '');
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute, then try again.';
  if (/jwt|not authenticated|permission|row-level security|401|403/i.test(m)) return 'Please sign in again.';
  if (/otp|token has expired|invalid.*(code|token)/i.test(m)) return 'That code did not work. Check it or ask for a new one.';
  if (/fetch|network|load failed|offline|timeout/i.test(m)) return 'No internet connection. Check it and try again.';
  return 'Something went wrong. Please try again.';
}

export function toast(message, { undo, tone = 'neutral', ms } = {}) {
  clearTimeout(toastTimer);
  setState({ toast: { id: Date.now(), message, undo, tone } });
  // Undo stays longer: people log on the move and may look away.
  toastTimer = setTimeout(() => setState({ toast: null }), ms ?? (undo ? 8000 : 4000));
}
export function dismissToast() {
  clearTimeout(toastTimer);
  setState({ toast: null });
}

// ---------------------------------------------------------------- derived

export function me(s = state) {
  return s.members.find((m) => m.user_id === s.session?.userId) ?? null;
}

export function partner(s = state) {
  return s.members.find((m) => m.user_id !== s.session?.userId) ?? null;
}

export function memberName(userId, s = state, { you = true } = {}) {
  if (!userId) return 'Joint account';
  if (you && userId === s.session?.userId) return 'You';
  return s.members.find((m) => m.user_id === userId)?.display_name ?? 'Someone';
}

/** Stable item-log number for an expense (No. 027), in the order entries were created. */
let numbering = { src: null, map: new Map() };
export function entryNumber(id, s = state) {
  if (numbering.src !== s.expenses) {
    const sorted = s.expenses.slice().sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
    numbering = { src: s.expenses, map: new Map(sorted.map((e, i) => [e.id, i + 1])) };
  }
  return numbering.map.get(id) ?? 0;
}

export function liveExpenses(s = state) {
  return s.expenses.filter((e) => !e.deleted_at);
}

export function settlementRow(key, s = state) {
  const row = s.settlements.find((r) => r.year_month === key);
  return row && row.settled ? row : null;
}

export function dateFundBalance(s = state) {
  const added = sum(s.settlements.filter((r) => r.settled), (r) => r.fund_contribution);
  const spent = sum(liveExpenses(s).filter((e) => e.from_fund));
  return roundTo(added - spent);
}

/** Up to `n` description suggestions, most frequent + recent first. */
export function suggestions(s = state, n = 6) {
  const seen = new Map();
  const list = liveExpenses(s).slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  list.forEach((e, i) => {
    const k = e.description.trim().toLowerCase();
    if (!k) return;
    const entry = seen.get(k) ?? { description: e.description.trim(), category: e.category, score: 0 };
    entry.score += 1 + Math.max(0, 20 - i) / 10;
    seen.set(k, entry);
  });
  const out = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, n);
  if (out.length < 3) {
    for (const d of [{ description: 'Dinner', category: 'food' }, { description: 'Coffee', category: 'food' }, { description: 'Groceries', category: 'groceries' }, { description: 'Movie', category: 'outings' }]) {
      if (out.length >= n) break;
      if (!out.some((o) => o.description.toLowerCase() === d.description.toLowerCase())) out.push(d);
    }
  }
  return out;
}

// ---------------------------------------------------------------- sync

let unsubscribe = () => {};
let flushing = false;

export async function flush() {
  if (flushing || !state.outbox.length) return;
  const be = await backend();
  flushing = true;
  setState({ syncing: true });
  try {
    while (state.outbox.length) {
      const op = state.outbox[0];
      try {
        await be.push(op);
        setState((s) => ({ outbox: s.outbox.slice(1), syncError: null }));
      } catch (err) {
        if (err.status >= 400 && err.status < 500) {
          // The server refused this change for good; drop it so the queue keeps moving.
          setState((s) => ({ outbox: s.outbox.slice(1), syncError: err.message }));
        } else {
          break; // offline or server hiccup: try again later
        }
      }
    }
  } finally {
    flushing = false;
    setState({ syncing: false });
  }
}

function enqueue(op) {
  setState((s) => ({ outbox: [...s.outbox, op] }));
  flush();
}

function applyRemote(kind, row) {
  if (kind === 'expense' && row?.id) {
    const pending = state.outbox.some((op) => op.type === 'expense' && op.row.id === row.id);
    if (pending) return;
    setState((s) => {
      const i = s.expenses.findIndex((e) => e.id === row.id);
      if (i >= 0 && (s.expenses[i].updated_at || '') > (row.updated_at || '')) return {};
      const expenses = s.expenses.slice();
      if (i >= 0) expenses[i] = row;
      else expenses.unshift(row);
      return { expenses };
    });
  } else if (kind === 'settlement' && row?.year_month) {
    setState((s) => ({ settlements: [...s.settlements.filter((r) => r.year_month !== row.year_month), row] }));
  } else if (kind === 'couple' && row?.id) {
    setState({ couple: row });
  } else if (kind === 'members') {
    refresh();
  }
}

/** Pull everything from the server and re-apply anything still queued. */
export async function refresh() {
  if (MODE !== 'cloud' || !state.session) return;
  const be = await backend();
  try {
    await flush();
    const data = await be.fetchAll(state.session.userId);
    const queued = state.outbox.filter((op) => op.type === 'expense').map((op) => op.row);
    const expenses = [...queued, ...data.expenses.filter((e) => !queued.some((q) => q.id === e.id))];
    const coupleChanged = data.couple?.id !== state.couple?.id;
    setState({ couple: data.couple, members: data.members, expenses, settlements: data.settlements, syncError: null });
    if (coupleChanged) watchCouple();
  } catch (err) {
    if (navigator.onLine) setState({ syncError: err.message });
  }
}

function watchCouple() {
  unsubscribe();
  unsubscribe = () => {};
  if (MODE !== 'cloud' || !state.couple) return;
  backend().then((be) => {
    unsubscribe = be.subscribe(state.couple.id, applyRemote);
  });
}

export async function boot() {
  const be = await backend();
  try {
    const session = await be.restore();
    setState({ session });
  } catch { /* offline: keep cached session */ }
  setState({ ready: true });
  if (state.couple) loadRates(state.couple.home_currency).catch(() => {});
  if (MODE === 'cloud' && state.session) {
    watchCouple();
    refresh();
  }
  window.addEventListener('online', () => { setState({ online: true }); refresh(); });
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

// ---------------------------------------------------------------- auth & couple

export async function sendCode(email) {
  const be = await backend();
  await be.sendCode(email);
}

export async function verifyCode(email, code) {
  const be = await backend();
  const session = await be.verifyCode(email, code);
  setState({ session, couple: null, members: [], expenses: [], settlements: [], outbox: [] });
  await refresh();
}

export async function signOut() {
  const be = await backend();
  unsubscribe();
  if (MODE === 'cloud') await be.signOut().catch(() => {});
  setState({ ...empty, ready: true, prefs: state.prefs, online: state.online });
}

export async function createCouple({ myName, partnerName, currency, budget, sample = false }) {
  if (MODE === 'demo') {
    const session = { userId: 'me', email: null };
    const couple = { id: 'demo', home_currency: currency, monthly_budget: budget, created_at: new Date().toISOString() };
    const members = [
      { couple_id: 'demo', user_id: 'me', display_name: myName.trim() },
      { couple_id: 'demo', user_id: 'partner', display_name: partnerName.trim() || 'Partner' },
    ];
    setState({ session, couple, members, expenses: [], settlements: [], prefs: { ...state.prefs, lastCurrency: currency } });
    loadRates(currency).catch(() => {});
    if (sample) seedSample();
    return;
  }
  const be = await backend();
  await be.createCouple({ displayName: myName.trim(), currency, budget });
  setState((s) => ({ prefs: { ...s.prefs, lastCurrency: currency } }));
  await refresh();
  loadRates(currency).catch(() => {});
}

export async function joinCouple({ code, myName }) {
  const be = await backend();
  await be.joinCouple({ code, displayName: myName.trim() });
  await refresh();
  if (state.couple) loadRates(state.couple.home_currency).catch(() => {});
}

export async function createInvite() {
  const be = await backend();
  return be.createInvite();
}

export async function leaveCouple() {
  if (MODE === 'demo') {
    setState({ ...empty, ready: true, online: state.online });
    return;
  }
  const be = await backend();
  await be.leaveCouple();
  unsubscribe();
  setState({ couple: null, members: [], expenses: [], settlements: [], outbox: [] });
}

export function updateCouple(fields) {
  const couple = { ...state.couple, ...fields, updated_at: new Date().toISOString() };
  setState({ couple });
  if (MODE === 'cloud') enqueue({ type: 'couple', row: { id: couple.id, ...fields } });
}

export function updateMemberName(userId, name) {
  const members = state.members.map((m) => (m.user_id === userId ? { ...m, display_name: name } : m));
  setState({ members });
  const row = members.find((m) => m.user_id === userId);
  if (MODE === 'cloud' && row) enqueue({ type: 'member', row });
}

/** Demo mode only: hand the phone to the other partner, to try both sides. */
export function switchDemoUser() {
  if (MODE !== 'demo') return;
  setState((s) => ({ session: { ...s.session, userId: s.session.userId === 'me' ? 'partner' : 'me' } }));
}

/** Save a member's character look ({hair, hairColor, skin, shirt, acc}). */
export function updateMemberAvatar(userId, avatar) {
  const members = state.members.map((m) => (m.user_id === userId ? { ...m, avatar } : m));
  setState({ members });
  const row = members.find((m) => m.user_id === userId);
  if (MODE === 'cloud' && row) enqueue({ type: 'member', row });
}

export function setPref(key, value) {
  setState((s) => ({ prefs: { ...s.prefs, [key]: value } }));
}

// ---------------------------------------------------------------- expenses

/**
 * Create or update an expense from a draft:
 * { id?, description, category, spent_on, amount, currency, paid_by, home_override?, from_fund }
 */
export function saveExpense(draft) {
  const s = state;
  const home = s.couple.home_currency;
  const amount = roundTo(Number(draft.amount), 2);
  const conv = convert(amount, draft.currency, home);
  const existing = draft.id ? s.expenses.find((e) => e.id === draft.id) : null;
  const now = new Date().toISOString();

  let home_amount;
  let fx_rate;
  let amount_confirmed;
  if (draft.home_override != null && draft.currency !== home) {
    home_amount = roundTo(Number(draft.home_override));
    fx_rate = amount ? home_amount / amount : 0;
    amount_confirmed = true;
  } else if (existing && existing.original_amount === amount && existing.original_currency === draft.currency) {
    ({ home_amount, fx_rate, amount_confirmed } = existing);
  } else if (conv) {
    ({ home: home_amount, rate: fx_rate } = conv);
    amount_confirmed = draft.currency === home;
  } else {
    // No rate yet (offline, first time abroad). Saved as pending; refreshed on next sync.
    home_amount = 0;
    fx_rate = 0;
    amount_confirmed = false;
  }

  const row = {
    ...(existing ?? {}),
    id: existing?.id ?? crypto.randomUUID(),
    couple_id: s.couple.id,
    description: draft.description.trim(),
    category: draft.category || null,
    spent_on: draft.spent_on,
    original_amount: amount,
    original_currency: draft.currency,
    fx_rate,
    home_amount,
    amount_confirmed,
    paid_by: draft.paid_by || null,
    from_fund: !!draft.from_fund,
    added_by: existing?.added_by ?? s.session.userId,
    edited_by: existing ? s.session.userId : null,
    reactions: existing?.reactions ?? {},
    created_at: existing?.created_at ?? now,
    updated_at: now,
    deleted_at: null,
  };

  // Changing a settled month reopens it.
  const months = new Set([monthKey(row.spent_on), existing && monthKey(existing.spent_on)].filter(Boolean));
  months.forEach((k) => { if (settlementRow(k)) reopenMonth(k, { silent: true }); });

  setState((st) => ({
    expenses: existing ? st.expenses.map((e) => (e.id === row.id ? row : e)) : [row, ...st.expenses],
    prefs: { ...st.prefs, lastCurrency: draft.currency },
    justSaved: existing ? null : { id: row.id, at: Date.now() },
  }));
  if (MODE === 'cloud') enqueue({ type: 'expense', row });
  if (!conv && draft.currency !== home && draft.home_override == null) {
    loadRates(home).then(() => repriceEstimates()).catch(() => {});
  }
  return row;
}

/** Fill in any expenses saved without a rate once rates are available. */
export function repriceEstimates() {
  const home = state.couple?.home_currency;
  if (!home) return;
  state.expenses
    .filter((e) => !e.deleted_at && !e.amount_confirmed && !e.fx_rate)
    .forEach((e) => {
      const conv = convert(e.original_amount, e.original_currency, home);
      if (!conv) return;
      const row = { ...e, fx_rate: conv.rate, home_amount: conv.home, updated_at: new Date().toISOString() };
      setState((s) => ({ expenses: s.expenses.map((x) => (x.id === row.id ? row : x)) }));
      if (MODE === 'cloud') enqueue({ type: 'expense', row });
    });
}

export function deleteExpense(id) {
  const existing = state.expenses.find((e) => e.id === id);
  if (!existing) return;
  const k = monthKey(existing.spent_on);
  const wasSettled = state.settlements.find((r) => r.year_month === k && r.settled);
  if (wasSettled) reopenMonth(k, { silent: true });
  const row = { ...existing, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), edited_by: state.session.userId };
  setState((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? row : e)) }));
  if (MODE === 'cloud') enqueue({ type: 'expense', row });
  toast(wasSettled ? `Deleted “${existing.description}”. ${monthLabel(k, { withYear: false })} is open again.` : `Deleted “${existing.description}”`, {
    undo: () => {
      const back = { ...existing, updated_at: new Date().toISOString() };
      setState((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? back : e)) }));
      if (MODE === 'cloud') enqueue({ type: 'expense', row: back });
      // Putting the expense back restores the month exactly as it was settled.
      if (wasSettled) {
        const again = { ...wasSettled };
        setState((s) => ({ settlements: s.settlements.map((r) => (r.year_month === k ? again : r)) }));
        if (MODE === 'cloud') enqueue({ type: 'settlement', row: again });
      }
    },
  });
}

export function undoAdd(id) {
  const existing = state.expenses.find((e) => e.id === id);
  if (!existing) return;
  const row = { ...existing, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  setState((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? row : e)), justSaved: null }));
  if (MODE === 'cloud') enqueue({ type: 'expense', row });
}

export function react(id, key) {
  const uid = state.session.userId;
  const existing = state.expenses.find((e) => e.id === id);
  if (!existing) return;
  const reactions = { ...(existing.reactions ?? {}) };
  if (reactionKey(reactions[uid]) === key) delete reactions[uid];
  else reactions[uid] = key;
  const row = { ...existing, reactions, updated_at: new Date().toISOString() };
  setState((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? row : e)) }));
  if (MODE === 'cloud') enqueue({ type: 'expense', row });
}

// ---------------------------------------------------------------- settle up

export function settleMonth(key) {
  const s = state;
  const st = settlementFor(liveExpenses(s), s.members, key);
  const budget = Number(s.couple.monthly_budget);
  const row = {
    couple_id: s.couple.id,
    year_month: key,
    settled: true,
    settled_by: s.session.userId,
    settled_at: new Date().toISOString(),
    fund_contribution: roundTo(Math.max(0, budget - st.budgetSpent)),
    snapshot: {
      budget,
      spent: st.budgetSpent,
      byMember: st.byMember.map((b) => ({ user_id: b.member.user_id, name: b.member.display_name, amount: b.amount })),
      joint: st.jointTotal,
    },
  };
  setState((x) => ({ settlements: [...x.settlements.filter((r) => r.year_month !== key), row] }));
  if (MODE === 'cloud') enqueue({ type: 'settlement', row });
  return row;
}

export function reopenMonth(key, { silent = false } = {}) {
  const existing = state.settlements.find((r) => r.year_month === key);
  if (!existing) return;
  const row = { ...existing, settled: false, settled_at: null, fund_contribution: 0 };
  setState((x) => ({ settlements: x.settlements.map((r) => (r.year_month === key ? row : r)) }));
  if (MODE === 'cloud') enqueue({ type: 'settlement', row });
  if (!silent) toast('Month reopened');
}

/** The month the Settle tab should open on. */
export function defaultSettleMonth(s = state) {
  const prev = addMonths(currentMonthKey(), -1);
  const hasPrev = liveExpenses(s).some((e) => monthKey(e.spent_on) === prev);
  if (hasPrev && !settlementRow(prev, s)) return prev;
  return currentMonthKey();
}

export function monthSpent(key, s = state) {
  return sum(budgetExpenses(liveExpenses(s), key));
}

/** True while the jar holds only sample expenses (the home currency can still change). */
export function onlySamples(s = state) {
  return !liveExpenses(s).some((e) => !e.sample);
}

/** Change the home currency. Allowed until the first real expense; sample expenses are redrawn in the new currency. */
export function changeHomeCurrency(currency) {
  if (!onlySamples()) return;
  const hadSamples = liveExpenses().some((e) => e.sample);
  updateCouple({ home_currency: currency });
  loadRates(currency).catch(() => {});
  if (hadSamples) { setState({ settlements: [] }); seedSample(); }
}

/** Remove every sample expense (and any month settled only with samples). Your own expenses stay. */
export function removeSamples() {
  const expenses = state.expenses.filter((e) => !e.sample);
  const months = new Set(expenses.filter((e) => !e.deleted_at).map((e) => monthKey(e.spent_on)));
  setState({ expenses, settlements: state.settlements.filter((r) => months.has(r.year_month)) });
  toast('Sample expenses removed');
}

// ---------------------------------------------------------------- sample data (demo only)

function seedSample() {
  const home = state.couple.home_currency;
  const cur = currentMonthKey();
  const prev = addMonths(cur, -1);
  const today = Number(todayISO().slice(8, 10));
  const d = (key, day) => `${key}-${String(Math.max(1, day)).padStart(2, '0')}`;
  const P = 'partner';
  const M = 'me';
  const items = [
    [prev, 2, 'Brunch at Kith', 'food', 46.8, home, M],
    [prev, 5, 'Groceries', 'groceries', 88.2, home, P],
    [prev, 8, 'Movie + popcorn', 'outings', 41, home, M],
    [prev, 12, 'Ramen', 'food', 38.5, home, P],
    [prev, 14, 'Ichiran Shibuya', 'travel', 4200, 'JPY', M],
    [prev, 15, 'teamLab Planets', 'travel', 7600, 'JPY', P],
    [prev, 15, 'Izakaya dinner', 'travel', 11800, 'JPY', M],
    [prev, 16, 'Konbini snacks', 'travel', 1980, 'JPY', P],
    [prev, 22, 'Dinner at Burnt Ends', 'food', 186, home, M],
    [prev, 26, 'Groceries', 'groceries', 64.3, home, null],
    [prev, 29, 'Coffee', 'food', 13.6, home, P],
    [cur, today - 1, 'Coffee', 'food', 12.4, home, M],
    [cur, today, 'Dinner', 'food', 68, home, P],
  ].filter(([key, day]) => key !== cur || day >= 1);
  const fallbackRates = { JPY: 0.0089 };
  const now = Date.now();
  const expenses = items.map(([key, day, description, category, amount, currency, paid], i) => {
    const conv = convert(amount, currency, home) ?? { rate: fallbackRates[currency] ?? 1, home: roundTo(amount * (fallbackRates[currency] ?? 1)) };
    return {
      id: crypto.randomUUID(),
      couple_id: 'demo',
      description,
      category,
      spent_on: d(key, day),
      original_amount: amount,
      original_currency: currency,
      fx_rate: conv.rate,
      home_amount: conv.home,
      amount_confirmed: currency === home || i === 4,
      paid_by: paid,
      from_fund: false,
      added_by: i % 3 === 0 ? P : M,
      edited_by: null,
      reactions: i === 8 ? { partner: 'heart' } : i === 5 ? { me: 'fire' } : {},
      created_at: new Date(now - (items.length - i) * 36e5).toISOString(),
      updated_at: new Date(now - (items.length - i) * 36e5).toISOString(),
      deleted_at: null,
      sample: true,
    };
  });
  setState({ expenses: expenses.reverse() });
}
