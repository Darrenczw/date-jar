// Shared building blocks: avatars, sheets, item-log rows, toast, menu bar.
import { html, useEffect, useRef } from './ui.js';
import { Icon, categoryIcon } from './icons.js';
import { fmt } from './money.js';
import { dismissToast, entryNumber, getState, memberName, reactionKey } from './store.js';
import { ABtnFace, defaultAvatar } from './sprites.js';
import { normalizeAvatar } from './avatar.js';

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

/** A member's character look, falling back to the default for their place in the jar. */
export function avatarFor(userId, s = getState()) {
  const idx = s.members.findIndex((m) => m.user_id === userId);
  return s.members[idx]?.avatar ?? defaultAvatar(Math.max(0, idx));
}

/** Relative luminance of a #rrggbb colour. */
function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const INK = '#2e2a4f';
const CREAM = '#fff4dc';
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const mix = (hex, to, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + parseInt(to.slice(i, i + 2), 16) * t)
  .toString(16).padStart(2, '0')).join('');

/** Dark ink or cream, whichever reads better on a fill colour. */
export function inkOn(hex) {
  return contrast(hex, INK) >= contrast(hex, CREAM) ? INK : CREAM;
}

/** The fill nudged lighter (under ink) or darker (under cream) until text on it passes AA. */
function textFill(hex) {
  const ink = inkOn(hex);
  let fill = hex;
  for (let t = 0.1; contrast(fill, ink) < 4.5 && t <= 0.6; t += 0.1) fill = mix(hex, ink === INK ? '#ffffff' : '#1b1530', t);
  return fill;
}

/**
 * A member's party colour: the colour of their character's top, so the badge always matches the sprite.
 * --tone is the exact colour (pips, scenery); --tone-fill is the text-safe version for badges and buttons.
 */
export function partyTone(userId, s = getState()) {
  const idx = Math.max(0, s.members.findIndex((m) => m.user_id === userId));
  const bg = normalizeAvatar(avatarFor(userId, s), idx).topColor;
  const ink = inkOn(bg);
  return { bg, ink, style: `--tone:${bg};--tone-fill:${textFill(bg)};--tone-ink:${ink}` };
}

/** A member's initial on their party colour. */
export function Avatar({ name, userId, size = 32 }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  return html`<span class="avatar avatar-party" style=${`--size:${size}px;${partyTone(userId).style}`} aria-hidden="true">${initial}</span>`;
}

// ---------------------------------------------------------------- dialogs

/**
 * A bottom sheet. `dirty` means it holds unsaved work: a stray backdrop tap is ignored,
 * and Esc calls `onClose` straight away so the sheet can ask before discarding.
 */
export function Sheet({ title, onClose, children, tall = false, full = false, dirty = false, class: cls = '' }) {
  const ref = useRef(null);
  const latest = useRef({ onClose, dirty });
  latest.current = { onClose, dirty };
  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    if (!d.open) d.showModal();
    const cancel = (e) => { e.preventDefault(); const l = latest.current; if (l.dirty) l.onClose(); else closeSheet(l.onClose); };
    d.addEventListener('cancel', cancel);
    return () => d.removeEventListener('cancel', cancel);
  }, []);
  return html`
    <dialog ref=${ref} class=${`sheet ${tall ? 'tall' : ''} ${full ? 'full' : ''} ${cls}`} aria-label=${title}
      onClick=${(e) => e.target === ref.current && !dirty && closeSheet(onClose)}>
      <div class="sheet-body">${children}</div>
    </dialog>`;
}

/** Asks before unsaved work is thrown away. Shown at the top of a sheet. */
export function DiscardBar({ what, onDiscard, onKeep }) {
  return html`
    <div class="discard-bar" role="alertdialog" aria-label=${`Discard ${what}?`}>
      <b>Discard ${what}?</b>
      <div class="btn-row">
        <button class="btn btn-secondary small" onClick=${onDiscard}>Discard</button>
        <button class="btn btn-quiet small" onClick=${onKeep}>Keep editing</button>
      </div>
    </div>`;
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
  const estimate = foreign && !e.amount_confirmed;
  // Least important last, so a narrow row cuts the entry number before anything useful.
  const sub = [
    e.paid_by ? `${payer} paid` : 'Joint account',
    foreign ? fmt(e.original_amount, e.original_currency) : null,
    addedByOther ? `added by ${memberName(e.added_by, s).replace(/^You$/, 'you')}` : null,
    `No.${no}`,
  ].filter(Boolean).join(' · ');
  return html`
    <button class="row" onClick=${() => onOpen(e.id)}>
      <span class=${`row-icon ${e.from_fund ? 'fund' : `cat-${e.category || 'none'}`}`}><${Icon} name=${e.from_fund ? 'chest' : categoryIcon(e.category)} size=${24}/></span>
      <span class="row-main">
        <span class="row-title"><span class="row-desc">${e.description}</span>${reactions.length > 0 && html`<span class="row-react" aria-label=${`${reactions.length} ${reactions.length === 1 ? "reaction" : "reactions"}`}>${reactions.map((r, i) => html`<${Icon} key=${i} name=${r} size=${12} class=${`react-${r}`}/>`)}</span>`}</span>
        <span class="row-sub"><i class=${`pip ${e.paid_by ? '' : 'pip-joint'}`} style=${e.paid_by ? partyTone(e.paid_by, s).style : ''} aria-hidden="true"></i>${sub}</span>
      </span>
      <span class="row-amt">
        ${e.home_amount || !foreign ? html`<span>${tight(fmt(e.home_amount, home))}</span>` : html`<span class="pending">no rate yet</span>`}
        ${e.from_fund && html`<span class="row-fund">date fund</span>`}
        ${estimate && html`<span class="row-tag row-est">estimate</span>`}
        ${e.sample && html`<span class="row-tag">sample</span>`}
      </span>
    </button>`;
}

/**
 * Arrow keys for a radio group (role="radiogroup" of role="radio" buttons), as screen-reader
 * and keyboard users expect: arrows move and select, and only the checked option is a Tab stop.
 */
export function radioKeys(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
  if (!(e.key in keys)) return;
  const radios = [...e.currentTarget.querySelectorAll('[role="radio"]')];
  const at = radios.indexOf(document.activeElement);
  if (at < 0) return;
  e.preventDefault();
  const step = keys[e.key];
  const next = step === 'first' ? 0 : step === 'last' ? radios.length - 1 : (at + step + radios.length) % radios.length;
  radios[next].focus();
  radios[next].click();
}
/** Tab stop for one option in a radioKeys group. */
export const radioTab = (checked) => (checked ? 0 : -1);

export function Segmented({ options, value, onChange, label, class: cls = '' }) {
  return html`
    <div class=${`segmented ${cls}`} role="radiogroup" aria-label=${label} onKeyDown=${radioKeys}>
      ${options.map((o) => html`
        <button key=${o.value} role="radio" aria-checked=${o.value === value} tabIndex=${radioTab(o.value === value)} class=${`${o.value === value ? 'on' : ''} ${o.tone ? 'toned' : ''}`} style=${o.tone?.style ?? ''}
          onClick=${() => onChange(o.value)} type="button">
          ${o.tone ? html`<i class="seg-pip" aria-hidden="true"></i>` : o.icon && html`<${Icon} name=${o.icon} size=${12}/>`}
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
      <span class="tab-icon"><${Icon} name=${icon} size=${24}/>${badge === id && html`<i class="tab-badge" role="img" aria-label="ready to settle"></i>`}</span>
      <span>${label}</span>
    </button>`;
  return html`
    <nav class="tabbar" aria-label="Main">
      ${item('home', 'home', 'Home')}
      ${item('history', 'history', 'History')}
      <button class="tab-add" onClick=${onAdd} aria-label="Add expense"><${ABtnFace}/><${Icon} name="plus" size=${24}/></button>
      ${item('settle', 'settle', 'Settle')}
      ${item('settings', 'settings', 'Settings')}
    </nav>`;
}
