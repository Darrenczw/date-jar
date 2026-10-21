// R9 prototype: personality types as character classes, and money styles read from what each partner paid.
import { daysInMonth, monthKey, sum, todayISO } from './money.js';

// The 16 types, grouped in the usual four families. Each has its own RPG class (our words, not a test's).
export const TYPE_GROUPS = [
  { label: 'Thinkers', types: [['INTJ', 'Archmage'], ['INTP', 'Alchemist'], ['ENTJ', 'Warlord'], ['ENTP', 'Trickster']] },
  { label: 'Feelers', types: [['INFJ', 'Oracle'], ['INFP', 'Druid'], ['ENFJ', 'Paladin'], ['ENFP', 'Bard']] },
  { label: 'Keepers', types: [['ISTJ', 'Knight'], ['ISFJ', 'Cleric'], ['ESTJ', 'Captain'], ['ESFJ', 'Innkeeper']] },
  { label: 'Explorers', types: [['ISTP', 'Ranger'], ['ISFP', 'Minstrel'], ['ESTP', 'Rogue'], ['ESFP', 'Dancer']] },
];
const CLASS = Object.fromEntries(TYPE_GROUPS.flatMap((g) => g.types));
export const classFor = (type) => CLASS[type] ?? null;

/** Prototype only: which design to show. A = type tag + one shared card, B = class title + a card each. */
export function variant() {
  try { return localStorage.getItem('r9variant') === 'B' ? 'B' : 'A'; } catch { return 'A'; }
}

/** The short label under a character's name, or null when no type is set. */
export function typeTag(avatar) {
  const t = avatar?.mbti;
  if (!t) return null;
  return variant() === 'B' ? classFor(t) : t;
}

const norm = (d) => d.trim().toLowerCase();

/**
 * How one partner spent on dates in a month, from what they paid. Null with fewer than 3 expenses.
 * jp: spread over the weeks (J) or in a few bursts (P). sn: old favourites (S) or new places (N).
 */
export function moneyStyle(s, userId, key) {
  const live = s.expenses.filter((e) => !e.deleted_at);
  const month = live.filter((e) => monthKey(e.spent_on) === key && !['groceries', 'home'].includes(e.category));
  const theirs = month.filter((e) => e.paid_by === userId);
  if (theirs.length < 3) return null;
  const known = new Set(live.filter((e) => monthKey(e.spent_on) < key).map((e) => norm(e.description)));
  const repeats = theirs.filter((e) => known.has(norm(e.description))).length;
  const today = todayISO();
  const lastDay = key === monthKey(today) ? Number(today.slice(8, 10)) : daysInMonth(key);
  const weeksSoFar = Math.ceil(lastDay / 7);
  const weeks = new Set(theirs.map((e) => Math.floor((Number(e.spent_on.slice(8, 10)) - 1) / 7))).size;
  const n = theirs.length;
  return {
    n,
    share: Math.round((sum(theirs) / Math.max(sum(month), 1)) * 100),
    jp: weeks / weeksSoFar >= 0.75
      ? { letter: 'J', label: 'Steady', line: `Spent in ${weeks} of ${weeksSoFar} weeks` }
      : { letter: 'P', label: 'In bursts', line: `All in ${weeks} of ${weeksSoFar} weeks` },
    sn: repeats / n >= 0.5
      ? { letter: 'S', label: 'Regular', line: `${repeats} of ${n} at old favourites` }
      : { letter: 'N', label: 'Explorer', line: `${n - repeats} of ${n} at new places` },
  };
}

/** Does this month match the type? Counts the letters the money backs up (0–2). */
export function typeCheck(type, style) {
  if (!type || !style) return null;
  const hits = [style.jp.letter, style.sn.letter].filter((l) => type.includes(l)).length;
  return { hits, verdict: hits === 2 ? 'True to type' : hits === 1 ? 'Half and half' : 'Plot twist' };
}
