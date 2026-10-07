// App shell: routing between tabs, overlays, boot.
import { html, render, useEffect, useState } from './ui.js';
import { Icon } from './icons.js';
import { TabBar, Toast, Jar } from './components.js';
import { AddSheet, DetailSheet } from './add.js';
import { Home, History, Settle, Settings, Recap } from './screens.js';
import { Onboarding } from './onboarding.js';
import { MODE, boot, dateFundBalance, liveExpenses, repriceEstimates, settlementRow, useStore } from './store.js';
import { addMonths, currentMonthKey, monthExpenses } from './money.js';
import { loadRates } from './fx.js';

const TABS = ['home', 'history', 'settle', 'settings'];

function parseHash() {
  const [, tab = 'home', arg = ''] = location.hash.split('/');
  if (tab === 'add') return { tab: 'home', arg: '', add: true };
  return { tab: TABS.includes(tab) ? tab : 'home', arg };
}

function Shell() {
  const s = useStore();
  const [route, setRoute] = useState(parseHash());
  const [adding, setAdding] = useState(route.add === true);
  const [editing, setEditing] = useState(null); // expense id
  const [detail, setDetail] = useState(null); // expense id
  const [recap, setRecap] = useState(null); // month key

  useEffect(() => {
    const onHash = () => {
      const r = parseHash();
      setRoute(r);
      if (r.add) { setAdding(true); history.replaceState(null, '', '#/home'); }
    };
    window.addEventListener('hashchange', onHash);
    if (route.add) history.replaceState(null, '', '#/home');
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    loadRates(s.couple.home_currency).then(repriceEstimates).catch(() => {});
  }, [s.couple.home_currency]);

  const go = (tab, arg = '') => {
    location.hash = `#/${tab}${arg ? `/${arg}` : ''}`;
    window.scrollTo({ top: 0 });
  };

  const nav = {
    go,
    add: () => setAdding(true),
    open: (id) => setDetail(id),
    recap: (key) => setRecap(key),
  };

  const prev = addMonths(currentMonthKey(), -1);
  const needsSettle = monthExpenses(liveExpenses(s), prev).length > 0 && !settlementRow(prev, s);

  const Screen = { home: Home, history: History, settle: Settle, settings: Settings }[route.tab];

  return html`
    <div class="app">
      <main id="main"><${Screen} nav=${nav} arg=${route.arg} key=${route.tab}/></main>
      <${TabBar} tab=${route.tab} onTab=${(t) => go(t)} onAdd=${() => setAdding(true)} badge=${needsSettle ? 'settle' : null}/>
      <${Toast} toast=${s.toast}/>
      ${adding && html`<${AddSheet} onClose=${() => setAdding(false)}/>`}
      ${editing && html`<${AddSheet} editing=${s.expenses.find((e) => e.id === editing)} onClose=${() => setEditing(null)}/>`}
      ${detail && html`<${DetailSheet} id=${detail} onClose=${() => setDetail(null)} onEdit=${(id) => { setDetail(null); setEditing(id); }}/>`}
      ${recap && html`<${Recap} month=${recap} onClose=${() => setRecap(null)}/>`}
    </div>`;
}

function Splash() {
  return html`<div class="splash" aria-label="Loading"><${Jar} left=${1} summary="Loading"/></div>`;
}

function App() {
  const s = useStore();
  if (!s.ready) return html`<${Splash}/>`;
  if (!s.couple) return html`<${Onboarding}/>`;
  return html`<${Shell}/>`;
}

render(html`<${App}/>`, document.getElementById('root'));
boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
