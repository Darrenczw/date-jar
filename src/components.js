// Shared building blocks: avatars, sheets, item-log rows, toast, menu bar.
import { html, useEffect, useRef } from './ui.js';
import { Icon, categoryIcon } from './icons.js';
import { fmt } from './money.js';
import { dismissToast, entryNumber, getState, memberName, reactionKey } from './store.js';
import { ABtnFace, defaultAvatar } from './sprites.js';

export { PixelJar as Jar } from './sprites.js';

/**
 * The pixel face is monospaced, so "." and "," each take a full cell ("S$895. 60").
 * Wrap separators so CSS can pull them in. Use on any pixel-face text that shows money.
 */
export function tight(text) {
  const label = String(text);
  return html`<span class="money" role="text" aria-label=${label}><span aria-hidden="true">${tightParts(label)}</span></span>`;
}

function tightParts(text) {
  return String(text).split(/([.,])/).map((part, i) => (part === '.' || part === ',' ? html`<span key=${i} class="sep">${part}</span>` : part));
}

// ---------------------------------------------------------------- people

/** Which look a member's sprite has: the jar's creator is "a", the partner "b". */
export function lookFor(userId, s = getState()) {
  const idx = s.members.findIndex((m) => m.user_id === userId);
  return idx <= 0 ? 'a' : 'b';
}

/** A member's character look, falling back to the default for their place in the jar. */
export function avatarFor(userId, s = getState()) {
  const idx = s.members.findIndex((m) => m.user_id === userId);
  return s.members[idx]?.avatar ?? defaultAvatar(Math.max(0, idx));
}

export function Avatar({ name, tone = 'you', size = 32 }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  return html`<span class=${`avatar avatar-${tone}`} style=${`--size:${size}px`} aria-hidden="true">${initial}</span>`;
}

// ---------------------------------------------------------------- dialogs

export function Sheet({ title, onClose, children, tall = false, full = false, class: cls = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    if (!d.open) d.showModal();
    const cancel = (e) => { e.preventDefault(); closeSheet(onClose); };
    d.addEventListener('cancel', cancel);
    return () => d.removeEventListener('cancel', cancel);
  }, []);
  return html`
    <dialog ref=${ref} class=${`sheet ${tall ? 'tall' : ''} ${full ? 'full' : ''} ${cls}`} aria-label=${title}
      onClick=${(e) => e.target === ref.current && closeSheet(onClose)}>
      <div class="sheet-body">${children}</div>
    </dialog>`;
}

/** Slide the topmost sheet away, then run `done` (which unmounts it). */
export function closeSheet(done) {
  const open = [...document.querySelectorAll('dialog.sheet[open]')].pop();
  // Already sliding out (a nested close, or a second tap): finish now.
  if (!open || open.classList.contains('closing') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  open.classList.add('closing');
  setTimeout(done, 230);
}

export function SheetHeader({ title, onClose, right }) {
  return html`
    <header class="sheet-head">
      <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="close"/></button>
      <h2>${title}</h2>
      <div class="sheet-head-right">${right}</div>
    </header>`;
}

/** An RPG text box. */
export function TextBox({ children, class: cls = '', more = true }) {
  return html`<div class=${`textbox ${cls}`}>${children}${more && html`<i class="more" aria-hidden="true"></i>`}</div>`;
}

// ---------------------------------------------------------------- rows

export function ExpenseRow({ e, onOpen, home }) {
  const s = getState();
  const foreign = e.original_currency !== home;
  const reactions = Object.values(e.reactions ?? {}).map(reactionKey);
  const payer = memberName(e.paid_by, s);
  const addedByOther = e.added_by && e.added_by !== e.paid_by && e.paid_by;
  const no = String(entryNumber(e.id, s)).padStart(3, '0');
  const sub = [
    e.paid_by ? `${payer} paid` : 'Joint account',
    foreign ? `${fmt(e.original_amount, e.original_currency)}${e.amount_confirmed ? '' : ' · estimated'}` : null,
    addedByOther ? `added by ${memberName(e.added_by, s).replace(/^You$/, 'you')}` : null,
  ].filter(Boolean).join(' · ');
  return html`
    <button class="row" onClick=${() => onOpen(e.id)}>
      <span class=${`row-icon ${e.from_fund ? 'fund' : ''}`}><${Icon} name=${e.from_fund ? 'chest' : categoryIcon(e.category)} size=${24}/></span>
      <span class="row-main">
        <span class="row-title"><i class="row-no">No.${no}</i>${e.description}${e.sample && html`<span class="row-sample">sample</span>`}${reactions.length > 0 && html`<span class="row-react" aria-label=${`${reactions.length} ${reactions.length === 1 ? "reaction" : "reactions"}`}>${reactions.map((r, i) => html`<${Icon} key=${i} name=${r} size=${12} class=${`react-${r}`}/>`)}</span>`}</span>
        <span class="row-sub">${sub}</span>
      </span>
      <span class="row-amt">
        ${e.home_amount || !foreign ? html`<span>${tight(fmt(e.home_amount, home))}</span>` : html`<span class="pending">pending rate</span>`}
        ${e.from_fund && html`<span class="row-fund">treasure</span>`}
      </span>
    </button>`;
}

export function Segmented({ options, value, onChange, label, class: cls = '' }) {
  return html`
    <div class=${`segmented ${cls}`} role="radiogroup" aria-label=${label}>
      ${options.map((o) => html`
        <button key=${o.value} role="radio" aria-checked=${o.value === value} class=${o.value === value ? 'on' : ''}
          onClick=${() => onChange(o.value)} type="button">
          ${o.icon && html`<${Icon} name=${o.icon} size=${12}/>`}
          <span>${o.label}</span>
        </button>`)}
    </div>`;
}

export function Chip({ on, onClick, children, class: cls = '', ...rest }) {
  return html`<button type="button" class=${`chip ${on ? 'on' : ''} ${cls}`} aria-pressed=${on} onClick=${onClick} ...${rest}>${children}</button>`;
}

export function MonthNav({ label, onPrev, onNext, canNext = true, sub, art }) {
  return html`
    <div class="month-nav">
      <button class="icon-btn" onClick=${onPrev} aria-label="Previous month"><${Icon} name="back"/></button>
      <div class="month-nav-label">${art}<div><h1>${label}</h1>${sub && html`<p>${sub}</p>`}</div></div>
      <button class="icon-btn" onClick=${onNext} disabled=${!canNext} aria-label="Next month"><${Icon} name="next"/></button>
    </div>`;
}

export function Empty({ icon = 'jar', title, children, action }) {
  return html`
    <div class="empty">
      <span class="empty-icon"><${Icon} name=${icon} size=${36}/></span>
      <h3>${title}</h3>
      <p>${children}</p>
      ${action}
    </div>`;
}

// ---------------------------------------------------------------- toast & menu bar

export function Toast({ toast }) {
  if (!toast) return null;
  return html`
    <div class=${`toast toast-${toast.tone}`} role="status" aria-live="polite" key=${toast.id}>
      <span>${tight(toast.message)}</span>
      ${toast.undo && html`<button onClick=${() => { toast.undo(); dismissToast(); }}>Undo</button>`}
    </div>`;
}

export function TabBar({ tab, onTab, onAdd, badge }) {
  const item = (id, icon, label) => html`
    <button class=${`tab ${tab === id ? 'on' : ''}`} onClick=${() => onTab(id)} aria-current=${tab === id ? 'page' : undefined}>
      <span class="tab-icon"><${Icon} name=${icon} size=${24}/>${badge === id && html`<i class="tab-badge" aria-label="needs attention"></i>`}</span>
      <span>${label}</span>
    </button>`;
  return html`
    <nav class="tabbar" aria-label="Main">
      ${item('home', 'home', 'Home')}
      ${item('history', 'history', 'Log')}
      <button class="tab-add" onClick=${onAdd} aria-label="Add expense"><${ABtnFace}/><${Icon} name="plus" size=${24}/></button>
      ${item('settle', 'settle', 'Settle')}
      ${item('settings', 'settings', 'Settings')}
    </nav>`;
}
