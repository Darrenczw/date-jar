// Exchange rates from open.er-api.com (free, keyless, daily, ~160 currencies).
// One request per home currency per ~12h, cached in localStorage so travel
// spending still converts offline using the last known rates.

import { roundTo } from './money.js';

const KEY = 'datejar.fx';
const MAX_AGE = 12 * 60 * 60 * 1000;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch { /* storage full or blocked: rates just won't persist */ }
}

let cache = readCache();
let inflight = null;

/** Rates table: { base, rates: { CODE: units of CODE per 1 base }, fetchedAt } */
export function cachedRates(base) {
  return cache && cache.base === base ? cache : null;
}

export async function loadRates(base, { force = false } = {}) {
  const fresh = cache && cache.base === base && Date.now() - cache.fetchedAt < MAX_AGE;
  if (fresh && !force) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
      if (!res.ok) throw new Error(`Rates request failed (${res.status})`);
      const data = await res.json();
      if (data.result !== 'success') throw new Error('Rates unavailable');
      cache = { base, rates: data.rates, fetchedAt: Date.now(), asOf: data.time_last_update_utc };
      writeCache(cache);
      return cache;
    } catch (err) {
      if (cache && cache.base === base) return cache; // stale is better than nothing
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Convert an amount in `from` into the home currency.
 * Returns { rate, home } where rate = home units per 1 `from`, or null if unknown.
 */
export function convert(amount, from, home) {
  if (from === home) return { rate: 1, home: roundTo(amount) };
  const table = cachedRates(home);
  const perHome = table?.rates?.[from];
  if (!perHome) return null;
  const rate = 1 / perHome;
  return { rate, home: roundTo(amount * rate) };
}

export function knownCurrencies(home) {
  const table = cachedRates(home);
  return table ? Object.keys(table.rates) : [];
}
