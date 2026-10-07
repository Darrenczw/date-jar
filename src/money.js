// Money, dates and month maths. Pure functions, no state.

const SYMBOLS = {
  SGD: 'S$', USD: 'US$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', CAD: 'C$', TWD: 'NT$',
  MYR: 'RM', JPY: '¥', CNY: 'CN¥', KRW: '₩', THB: '฿', EUR: '€', GBP: '£',
  IDR: 'Rp', VND: '₫', PHP: '₱', INR: '₹', CHF: 'CHF ', MOP: 'MOP$',
};

// Currencies shown first in the picker; the rest come from the rates table.
export const POPULAR_CURRENCIES = [
  'SGD', 'MYR', 'JPY', 'KRW', 'TWD', 'THB', 'IDR', 'VND', 'HKD', 'CNY',
  'PHP', 'AUD', 'NZD', 'USD', 'EUR', 'GBP', 'CHF', 'INR', 'CAD',
];

const decimalsCache = {};
export function currencyDecimals(code) {
  if (decimalsCache[code] != null) return decimalsCache[code];
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { /* unknown code: keep 2 */ }
  return (decimalsCache[code] = d);
}

export function symbolFor(code) {
  return SYMBOLS[code] ?? `${code} `;
}

let displayNames;
export function currencyName(code) {
  try {
    displayNames ??= new Intl.DisplayNames(['en'], { type: 'currency' });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function roundTo(value, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

// "S$1,234.50"; whole numbers drop the cents unless `cents` is forced.
export function fmt(amount, code = 'SGD', { cents = 'auto', sign = false } = {}) {
  const decimals = currencyDecimals(code);
  const abs = Math.abs(amount);
  const showCents = decimals > 0 && (cents === true || (cents === 'auto' && roundTo(abs % 1, decimals) !== 0));
  const n = new Intl.NumberFormat('en', {
    minimumFractionDigits: showCents ? decimals : 0,
    maximumFractionDigits: showCents ? decimals : 0,
  }).format(abs);
  const prefix = amount < 0 ? '−' : sign && amount > 0 ? '+' : '';
  return `${prefix}${symbolFor(code)}${n}`;
}

// ---- Dates (always local calendar dates, stored as YYYY-MM-DD) ----

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function currentMonthKey() {
  return monthKey(todayISO());
}

export function addMonths(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(key, { short = false, withYear = true } = {}) {
  const [y, m] = key.split('-').map(Number);
  const opts = { month: short ? 'short' : 'long' };
  if (withYear) opts.year = 'numeric';
  return new Date(y, m - 1, 1).toLocaleDateString('en-SG', opts);
}

export function dayLabel(iso) {
  const today = todayISO();
  const yesterday = todayISO(new Date(Date.now() - 864e5));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

// ---- Budget maths ----

// Expenses that count against the monthly budget (date-fund spends don't).
export function budgetExpenses(expenses, key) {
  return expenses.filter((e) => !e.deleted_at && monthKey(e.spent_on) === key && !e.from_fund);
}

export function monthExpenses(expenses, key) {
  return expenses.filter((e) => !e.deleted_at && monthKey(e.spent_on) === key);
}

export function sum(list, pick = (e) => e.home_amount) {
  return roundTo(list.reduce((t, e) => t + (Number(pick(e)) || 0), 0));
}

/**
 * Where the couple stands this month.
 * status: 'empty' | 'on-track' | 'ahead' | 'hot' | 'over'
 */
export function pace({ spent, budget, key, today = todayISO() }) {
  const days = daysInMonth(key);
  const isCurrent = monthKey(today) === key;
  const isPast = key < monthKey(today);
  const day = isCurrent ? Number(today.slice(8, 10)) : isPast ? days : 0;
  const timePct = day / days;
  const spentPct = budget > 0 ? spent / budget : 0;
  const daysLeft = isCurrent ? days - day + 1 : 0;
  const remaining = roundTo(budget - spent);
  const perDay = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0;

  let status = 'on-track';
  if (spent <= 0) status = 'empty';
  else if (spent > budget) status = 'over';
  else if (spentPct - timePct > 0.15) status = 'hot';
  else if (spentPct - timePct > 0.04) status = 'ahead';

  return { day, days, timePct, spentPct, daysLeft, remaining, perDay, status, isCurrent, isPast };
}

// Who gets what back from the joint account for a month.
export function settlementFor(expenses, members, key) {
  const list = monthExpenses(expenses, key);
  const byMember = members.map((m) => ({
    member: m,
    amount: sum(list.filter((e) => e.paid_by === m.user_id)),
    count: list.filter((e) => e.paid_by === m.user_id).length,
  }));
  const joint = list.filter((e) => !e.paid_by);
  const estimated = list.filter((e) => !e.amount_confirmed);
  return {
    list,
    byMember,
    joint,
    jointTotal: sum(joint),
    estimated,
    budgetSpent: sum(list.filter((e) => !e.from_fund)),
    fundSpent: sum(list.filter((e) => e.from_fund)),
    total: sum(list),
  };
}

export function parseAmountInput(str) {
  const n = Number(String(str).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
