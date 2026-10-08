// The character editor: hair, face, clothes and extras, with a live preview.
import { html, useState } from './ui.js';
import { Segmented, Sheet, SheetHeader, avatarFor } from './components.js';
import { AVATAR_OPTIONS, COLOURED_HATS, CharArt, normalizeAvatar, randomAvatar } from './avatar.js';
import { Scene, Sprite } from './sprites.js';
import { toast, updateMemberAvatar, useStore } from './store.js';

const TABS = [
  { value: 'hair', label: 'Hair' },
  { value: 'face', label: 'Face' },
  { value: 'clothes', label: 'Clothes' },
  { value: 'extras', label: 'Extras' },
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
  const [look, setLook] = useState(() => normalizeAvatar(avatarFor(member.user_id, s), index));
  const [tab, setTab] = useState('hair');
  const [bounce, setBounce] = useState(0);
  const you = member.user_id === s.session.userId;
  const set = (key, value) => { setLook((a) => ({ ...a, [key]: value })); setBounce((n) => n + 1); };
  const surprise = () => { setLook(randomAvatar()); setBounce((n) => n + 1); };
  const save = () => {
    updateMemberAvatar(member.user_id, look);
    onClose();
    toast(you ? 'Looking good!' : `${member.display_name} looks great!`, { tone: 'good' });
  };

  const swatches = (key, label) => html`
    <div class="field-group" key=${key}>
      <span class="field-label" id=${`lbl-${key}`}>${label}</span>
      <div class="swatches" role="radiogroup" aria-labelledby=${`lbl-${key}`}>
        ${AVATAR_OPTIONS[key].map((o) => html`
          <button key=${o.id} type="button" role="radio" aria-checked=${look[key] === o.id} aria-label=${o.label} title=${o.label}
            class=${`swatch ${look[key] === o.id ? 'on' : ''}`} style=${`--sw:${o.id}`} onClick=${() => set(key, o.id)}></button>`)}
      </div>
    </div>`;
  const tiles = (key, label, crop) => html`
    <div class="field-group" key=${key}>
      <span class="field-label" id=${`lbl-${key}`}>${label}</span>
      <div class="look-tiles" role="radiogroup" aria-labelledby=${`lbl-${key}`}>
        ${AVATAR_OPTIONS[key].map((o) => html`
          <button key=${o.id} type="button" role="radio" aria-checked=${look[key] === o.id}
            class=${`look-tile ${look[key] === o.id ? 'on' : ''}`} onClick=${() => set(key, o.id)}>
            <span class=${`look-art look-art-${crop}`}><${CharArt} avatar=${{ ...look, [key]: o.id }} crop=${crop}/></span>
            <span class="look-name">${o.label}</span>
          </button>`)}
      </div>
    </div>`;

  const sections = SECTIONS[tab].filter(([key]) => key !== 'hatColor' || COLOURED_HATS.has(look.hat));
  return html`
    <${Sheet} title=${`Change ${you ? 'your character' : member.display_name}`} onClose=${onClose} tall>
      <${SheetHeader} title=${you ? 'Your character' : member.display_name} onClose=${onClose}
        right=${html`<button class="chip" onClick=${surprise}>Random</button>`}/>
      <div class="sheet-scroll char-scroll">
        <div class="char-top">
          <div class="char-stage"><${Scene} compact>
            <div class="party-stage"><${Sprite} avatar=${look} name=${member.display_name} size=${108} action=${bounce ? 'jump' : ''} actionKey=${bounce}/></div>
          <//></div>
          <${Segmented} options=${TABS} value=${tab} onChange=${setTab} label="Part to change"/>
        </div>
        ${sections.map(([key, label, kind]) => (kind === 'colours' ? swatches(key, label) : tiles(key, label, kind)))}
      </div>
      <div class="add-foot"><button class="btn btn-primary btn-block" onClick=${save}>Save</button></div>
    <//>`;
}
