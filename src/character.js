// The character editor: hair, face, clothes and extras, with a live preview.
import { html, useState } from './ui.js';
import { DiscardBar, Segmented, Sheet, SheetHeader, avatarFor, radioKeys, radioTab } from './components.js';
import { AVATAR_OPTIONS, COLOURED_HATS, CharArt, normalizeAvatar, randomAvatar } from './avatar.js';
import { Scene, Sprite } from './sprites.js';
import { toast, updateMemberAvatar, useStore } from './store.js';
import { TYPE_GROUPS, classFor, variant } from './mbti.js';

const TABS = [
  { value: 'hair', label: 'Hair' },
  { value: 'face', label: 'Face' },
  { value: 'clothes', label: 'Clothes' },
  { value: 'extras', label: 'Extras' },
  { value: 'type', label: 'Type' },
];

// What each tab shows: [look key, label, kind]. "tiles" show a small picture; "colours" show swatches.
const SECTIONS = {
  hair: [['hair', 'Style', 'head'], ['hairColor', 'Colour', 'colours']],
  face: [['skin', 'Skin', 'colours'], ['eyes', 'Eyes', 'head'], ['mouth', 'Mouth', 'head'], ['cheeks', 'Cheeks', 'head'],
    ['beard', 'Facial hair', 'head']],
  clothes: [['top', 'Top', 'body'], ['topColor', 'Top colour', 'colours'], ['bottom', 'Bottom', 'body'],
    ['bottomColor', 'Bottom colour', 'colours']],
  extras: [['hat', 'Hat', 'head'], ['hatColor', 'Hat colour', 'colours'], ['glasses', 'Glasses', 'head'], ['extra', 'Accessory', 'head']],
};

/** Dress up a character, with a live preview that stays in view. */
export function CharacterSheet({ member, onClose }) {
  const s = useStore();
  const index = Math.max(0, s.members.findIndex((m) => m.user_id === member.user_id));
  const [start] = useState(() => normalizeAvatar(avatarFor(member.user_id, s), index));
  const [look, setLook] = useState(start);
  const [asking, setAsking] = useState(false);
  const dirty = JSON.stringify(look) !== JSON.stringify(start);
  // Your top colour is your colour across the app, so it helps when the two of you differ.
  const otherMember = s.members.find((m) => m.user_id !== member.user_id);
  const otherIndex = s.members.findIndex((m) => m.user_id === otherMember?.user_id);
  const otherTop = otherMember ? normalizeAvatar(avatarFor(otherMember.user_id, s), Math.max(0, otherIndex)).topColor : null;
  const requestClose = () => (dirty ? setAsking(true) : onClose());
  const [tab, setTab] = useState('hair');
  const [bounce, setBounce] = useState(0);
  const you = member.user_id === s.session.userId;
  const set = (key, value) => { setLook((a) => ({ ...a, [key]: value })); setBounce((n) => n + 1); };
  const surprise = () => { setLook((a) => ({ ...randomAvatar(), mbti: a.mbti })); setBounce((n) => n + 1); };
  const save = () => {
    updateMemberAvatar(member.user_id, look);
    onClose();
    toast(you ? 'Looking good!' : `${member.display_name} looks great!`, { tone: 'good' });
  };

  const swatches = (key, label) => html`
    <div class="field-group" key=${key}>
      <span class="field-label" id=${`lbl-${key}`}>${label}</span>
      ${key === 'topColor' && html`<p class="hint swatch-hint">${look.topColor === otherTop ? `${otherMember.display_name} wears this colour too. Pick another so you are easy to tell apart.` : 'This is your colour in the app.'}</p>`}
      <div class="swatches" role="radiogroup" aria-labelledby=${`lbl-${key}`} onKeyDown=${radioKeys}>
        ${AVATAR_OPTIONS[key].map((o) => html`
          <button key=${o.id} type="button" role="radio" aria-checked=${look[key] === o.id} tabIndex=${radioTab(look[key] === o.id)} aria-label=${o.label} title=${o.label}
            class=${`swatch ${look[key] === o.id ? 'on' : ''}`} style=${`--sw:${o.id}`} onClick=${() => set(key, o.id)}></button>`)}
      </div>
    </div>`;
  const tiles = (key, label, crop) => html`
    <div class="field-group" key=${key}>
      <span class="field-label" id=${`lbl-${key}`}>${label}</span>
      <div class="look-tiles" role="radiogroup" aria-labelledby=${`lbl-${key}`} onKeyDown=${radioKeys}>
        ${AVATAR_OPTIONS[key].map((o) => html`
          <button key=${o.id} type="button" role="radio" aria-checked=${look[key] === o.id} tabIndex=${radioTab(look[key] === o.id)}
            class=${`look-tile ${look[key] === o.id ? 'on' : ''}`} onClick=${() => set(key, o.id)}>
            <span class=${`look-art look-art-${crop}`}><${CharArt} avatar=${{ ...look, ...(key === 'hair' ? { hat: 'none' } : {}), [key]: o.id }} crop=${crop}/></span>
            <span class="look-name">${o.label}</span>
          </button>`)}
      </div>
    </div>`;

  // Your personality type: shows on your character and in the month recap. Optional.
  const typePicker = () => html`
    <div class="field-group">
      <p class="hint">Your personality type, if you know it. It shows ${variant() === 'B' ? 'as your class' : 'under your name'} and the month recap checks it against how you spend.</p>
      ${TYPE_GROUPS.map((g) => html`
        <div key=${g.label} class="type-group">
          <span class="field-label">${g.label}</span>
          <div class="type-tiles" role="radiogroup" aria-label=${g.label} onKeyDown=${radioKeys}>
            ${g.types.map(([code, cls]) => html`
              <button key=${code} type="button" role="radio" aria-checked=${look.mbti === code} tabIndex=${radioTab(look.mbti === code)}
                class=${`type-tile ${look.mbti === code ? 'on' : ''}`} onClick=${() => set('mbti', look.mbti === code ? null : code)}>
                <b>${code}</b><small>${cls}</small></button>`)}
          </div>
        </div>`)}
      <p class="hint">Not sure? Leave it empty, or take a free 16-type test online. Tap your type again to clear it.</p>
    </div>`;
  const sections = tab === 'type' ? [] : SECTIONS[tab].filter(([key]) => key !== 'hatColor' || COLOURED_HATS.has(look.hat));
  return html`
    <${Sheet} title=${`Change ${you ? 'your character' : member.display_name}`} onClose=${requestClose} dirty=${dirty} tall>
      <${SheetHeader} title=${you ? 'Your character' : member.display_name} onClose=${requestClose}
        right=${html`<button class="chip" onClick=${surprise}>Random</button>`}/>
      ${asking && html`<${DiscardBar} what="changes" onDiscard=${() => { setAsking(false); onClose(); }} onKeep=${() => setAsking(false)}/>`}
      <div class="sheet-scroll char-scroll">
        <div class="char-top">
          <div class="char-stage"><${Scene} compact>
            <div class="party-stage"><${Sprite} avatar=${look} name=${member.display_name} tag=${look.mbti ? (variant() === 'B' ? classFor(look.mbti) : look.mbti) : null} size=${108} action=${bounce ? 'jump' : ''} actionKey=${bounce}/></div>
          <//></div>
          <${Segmented} options=${TABS} value=${tab} onChange=${setTab} label="Part to change"/>
        </div>
        ${tab === 'type' && typePicker()}
        ${sections.map(([key, label, kind]) => (kind === 'colours' ? swatches(key, label) : tiles(key, label, kind)))}
      </div>
      <div class="add-foot"><button class="btn btn-primary btn-block" disabled=${!dirty} onClick=${save}>${dirty ? 'Save' : 'No changes yet'}</button></div>
    <//>`;
}
