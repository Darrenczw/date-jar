// The partner characters: a 16×20 pixel grid built from layers (hair, face, clothes, hat, extras).
import { html } from './ui.js';
import { Icon } from './icons.js';
import { addOutline, runs } from './pixels.js';

const W = 16;
const H = 20;

// One letter per pixel. "." leaves the pixel as it is.
const CODES = {
  h: 'hair', H: 'hair-d', s: 'skin', S: 'skin-d', e: 'line', r: 'blush', m: 'mouth', W: 'white',
  c: 'top', C: 'top-d', w: 'cream', p: 'bottom', P: 'bottom-d', k: 'shoe',
  a: 'hat', A: 'hat-d', L: 'shades', l: 'lens', y: 'gold', Y: 'gold-d', f: 'pink', F: 'pink-d', n: 'leaf', x: 'red', X: 'red-d',
};

// ---------------------------------------------------------------- the art
// Rows are 14 wide (centred on the 16-wide grid) or a full 16 wide for things that reach past the head.

const HEAD = [2, [
  '....ssssss....',
  '..ssssssssss..',
  '.ssssssssssss.',
  '.ssssssssssss.',
  '.ssssssssssss.',
  '.ssssssssssss.',
  '.ssssssssssss.',
  '.ssssssssssss.',
  '..ssssssssss..',
  '...ssssssss...',
]];

const EYES = {
  dots: [7, ['....e....e....', '....e....e....']],
  lashes: [7, ['...ee....ee...', '....e....e....']],
  happy: [7, ['....e....e....', '...e.e..e.e...']],
  sleepy: [8, ['...eee..eee...']],
  wink: [7, ['....e.........', '....e...eee...']],
};

const MOUTH = {
  smile: [10, ['......mm......']],
  grin: [10, ['.....mmmm.....', '......mm......']],
  oh: [10, ['......mm......', '......mm......']],
  none: [0, []],
};

const CHEEKS = {
  blush: [9, ['..rr......rr..']],
  freckles: [9, ['..S.S....S.S..']],
  none: [0, []],
};

const BEARD = {
  none: [0, []],
  moustache: [9, ['.....hhhh.....']],
  goatee: [11, ['.....hhhh.....']],
  beard: [8, ['.h..........h.', '.hh........hh.', '..hhhhhhhhhh..', '...hhhhhhhh...']],
  stubble: [10, ['..SS......SS..', '...SSSSSSSS...']],
};

// Hair: [front layer, back layer]; each is [first row, rows]. The back layer sits behind the body.
const CAP = ['....hhhhhh....', '..hhhhhhhhhh..', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.'];
const HAIR = {
  short: [[2, [...CAP, '.hhhhhhhhhhhh.', '.h..h.h..h..h.', '.h..........h.']]],
  swoop: [[2, [...CAP, '.hhhhhhhhhhhh.', '.hhhhhhh....h.', '.hh.........h.']]],
  spiky: [[0, ['...h..hh..h...', '..hhh.hh.hhh..', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.',
    '.hhh.hh.hh.hh.', '.h..........h.']]],
  buzz: [[2, ['....hhhhhh....', '..hHhhhhhhHh..', '.hhhhhhhhhhhh.', '.h..........h.']]],
  curly: [[1, ['...h.hh.hh.h..', '..hhhhhhhhhhh.', '.hhHhhhhhHhhhh', 'hhhhhhHhhhhhhh', 'hhHhhhhhhhhHhh', 'hhhhhhhhhhhhhh',
    'h.hh.hh.hh.hhh', 'hh..........hh', 'h............h']]],
  afro: [[0, ['....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hhhhhHhhhhhhhh.', 'hhhHhhhhhhhHhhhh', 'hhhhhhhhhhhhhhhh',
    'hhhhhhhhHhhhhhhh', 'hhhhhhhhhhhhhhhh', 'hhh..........hhh', 'hhh..........hhh', '.hh..........hh.', '..h..........h..']]],
  mohawk: [[0, ['......hh......', '.....hhhh.....', '.....hhhh.....', '..SSShhhhSSS..', '.SSSShhhhSSSS.', '.....hhhh.....']]],
  bald: [[2, ['....WW........']]],
  bob: [[2, [...CAP, '.hhhhhhhhhhhhhh.', '.hhhhhhhhhhhhhh.', '.hhh........hhh.', '.hh..........hh.', '.hh..........hh.',
    '.hhh........hhh.', '..hh........hh..']]],
  long: [[2, [...CAP, '.hhhhhhhhhhhhhh.', '.hhhhhhhhh.hhhh.', '.hh..........hh.', '.hh..........hh.', '.hh..........hh.',
    '.hh..........hh.', '.hh..........hh.']], [12, ['.hh..........hh.', '.hh..........hh.', '.hh..........hh.', '..h..........h..']]],
  ponytail: [[2, [...CAP, '.hhhhhhhhhhhh.', '.h..h.h..h..h.', '.h..........h.']], [4, ['..............h.', '..............xh',
    '..............hh', '..............hh', '...............h', '...............h', '..............h.']]],
  bun: [[0, ['.....hhhh.....', '.....hhhh.....', ...CAP, '.hhhhhhhhhhhh.', '.h.h......h.h.']]],
  pigtails: [[2, [...CAP, '.hhhhhhhhhhhh.', 'hh.h.h..h.h.hh', 'hh..........hh']], [6, ['.x............x.', 'hhh..........hhh',
    'hhh..........hhh', 'hhh..........hhh', '.hh..........hh.', '..h..........h..']]],
};

// Tops cover rows 12–15 (a dress also covers the legs).
const TOP = {
  tee: [12, ['...cccccccc...', '..CCccccccCC..', '..CCccccccCC..', '..ssccccccss..']],
  hoodie: [12, ['...CCccccCC...', '..CCcwccwcCC..', '..CCcwccwcCC..', '..ssCCCCCCss..']],
  stripes: [12, ['...cccccccc...', '..wwwwwwwwww..', '..CCccccccCC..', '..sswwwwwwss..']],
  sweater: [12, ['...cccwwccc...', '..CCccccccCC..', '..CCccccccCC..', '..ssCCCCCCss..']],
  overalls: [12, ['...cpccccpc...', '..CCyppppyCC..', '..CCppppppCC..', '..ssppppppss..']],
  suit: [12, ['...ccCwwCcc...', '..CCccxxccCC..', '..CCccxxccCC..', '..ssccccccss..']],
  dress: [12, ['...cccccccc...', '..CCccccccCC..', '..CCccccccCC..', '..ssccccccss..', '...cccccccc...',
    '..cccccccccc..', '....ss..ss....']],
};

const BOTTOM = {
  pants: [16, ['....pppppp....', '....pp..pp....', '....pp..pp....', '...kkk..kkk...']],
  shorts: [16, ['....pppppp....', '....pp..pp....', '....ss..ss....', '...kkk..kkk...']],
  skirt: [16, ['...pppppppp...', '..pppppppppp..', '....ss..ss....', '...kkk..kkk...']],
};

// Hats: [first row, rows, hair hidden above this row]. Coloured hats use the hat colour ("a").
const HAT = {
  none: [0, [], 0],
  cap: [2, ['....aaaaaa....', '..aaaaaaaaaa..', '.aaaaaaaaaaaa.', '..AAAAAAAAAAAAAA'], 5],
  beanie: [0, ['......ww......', '.....aaaa.....', '...aaaaaaaa...', '..aaaaaaaaaa..', '.aaaaaaaaaaaa.', '.AAAAAAAAAAAA.'], 6],
  bucket: [2, ['....aaaaaa....', '...aaaaaaaa...', '..aaaaaaaaaa..', 'AAAAAAAAAAAAAAAA'], 5],
  beret: [1, ['........a.....', '..aaaaaaaa....', 'aaaaaaaaaaaa..', '.AAAAAAAAAAAa.'], 4],
  crown: [0, ['...y..yy..y...', '...yy.yy.yy...', '...yyyxxyyy...', '...YYYYYYYY...'], 2],
  party: [0, ['......yy......', '......aa......', '.....aaaa.....', '....wwwwww....', '...aaaaaaaa...'], 2],
  cat: [0, ['..hh......hh..', '..hfh....hfh..', '..hhh....hhh..'], 0],
  bunny: [0, ['...ww....ww...', '...wf....fw...', '...wf....fw...'], 0],
  flowers: [2, ['...f..y..f....', '..fyfnfyfnfyf.'], 0],
};

const GLASSES = {
  none: [0, []],
  round: [6, ['...eee..eee...', '..ellleellle..', '..ellleellle..', '...eee..eee...']],
  square: [6, ['..eeeeeeeeee..', '..ellleellle..', '..ellleellle..', '..eeeeeeeeee..']],
  shades: [6, ['..eeeeeeeeee..', '.eelLLeelLLee.', '..eLLLeeLLLe..', '...eee..eee...']],
  hearts: [6, ['...f.f..f.f...', '..fWffffWfff..', '...fff..fff...', '....f....f....']],
};
// Glasses with clear lenses show the eyes through them.
const SEE_THROUGH = new Set(['round', 'square']);

const EXTRA = {
  none: [0, []],
  flower: [4, ['...........f..', '..........fyf.', '...........f..']],
  bow: [3, ['........ff.ff.', '........ffFff.', '........ff.ff.']],
  clip: [4, ['..........yy..', '..........YY..']],
  earrings: [10, ['..y..........y..', '..y..........y..']],
  scarf: [11, ['..xxxxxxxxxx..', '...XxxxxxxX...', '....xx........', '....xX........']],
  headphones: [1, ['.....eeeeee.....', '...ee......ee...', '..e..........e..', '..e..........e..', '..e..........e..',
    '.xx..........xx.', '.xX..........Xx.', '.xx..........xx.']],
};

// ---------------------------------------------------------------- the options people pick from

const PALETTE = {
  hair: [['#2b2233', 'Black'], ['#3b2a24', 'Dark brown'], ['#5a3a2e', 'Brown'], ['#8a4b2a', 'Chestnut'], ['#c8602e', 'Ginger'],
    ['#d9a441', 'Honey'], ['#f0e0b0', 'Blonde'], ['#9a9aa8', 'Grey'], ['#e48aa8', 'Pink'], ['#a98be0', 'Purple'],
    ['#4f6fd1', 'Blue'], ['#5fc4a4', 'Mint']],
  skin: [['#ffe6d0', 'Very light'], ['#ffd9b8', 'Light'], ['#f7c9a0', 'Fair'], ['#e8b187', 'Warm'], ['#d49a6a', 'Tan'],
    ['#b97a4f', 'Brown'], ['#96613d', 'Dark'], ['#74492f', 'Very dark']],
  clothes: [['#ffc83d', 'Yellow'], ['#f39a3d', 'Orange'], ['#e9573f', 'Red'], ['#f27bb0', 'Pink'], ['#b9a6e8', 'Purple'],
    ['#6cc3ef', 'Sky blue'], ['#4f78b8', 'Blue'], ['#2f9c9a', 'Teal'], ['#5cb26b', 'Green'], ['#fff4dc', 'Cream'],
    ['#9a9aa8', 'Grey'], ['#3a3548', 'Black']],
};
const list = (pairs) => pairs.map(([id, label]) => ({ id, label }));

export const AVATAR_OPTIONS = {
  hair: list([['short', 'Short'], ['swoop', 'Side part'], ['spiky', 'Spiky'], ['buzz', 'Very short'], ['curly', 'Curly'],
    ['afro', 'Afro'], ['mohawk', 'Mohawk'], ['bald', 'Bald'], ['bob', 'Bob'], ['long', 'Long'], ['ponytail', 'Ponytail'],
    ['bun', 'Bun'], ['pigtails', 'Pigtails']]),
  hairColor: list(PALETTE.hair),
  skin: list(PALETTE.skin),
  eyes: list([['dots', 'Dots'], ['lashes', 'Lashes'], ['happy', 'Happy'], ['sleepy', 'Sleepy'], ['wink', 'Wink']]),
  mouth: list([['smile', 'Smile'], ['grin', 'Big smile'], ['oh', 'Surprised'], ['none', 'None']]),
  cheeks: list([['blush', 'Blush'], ['freckles', 'Freckles'], ['none', 'None']]),
  beard: list([['none', 'None'], ['moustache', 'Moustache'], ['goatee', 'Chin beard'], ['beard', 'Beard'], ['stubble', 'Short beard']]),
  top: list([['tee', 'T-shirt'], ['hoodie', 'Hoodie'], ['stripes', 'Stripes'], ['sweater', 'Sweater'], ['overalls', 'Overalls'],
    ['suit', 'Suit'], ['dress', 'Dress']]),
  topColor: list(PALETTE.clothes),
  bottom: list([['pants', 'Long pants'], ['shorts', 'Shorts'], ['skirt', 'Skirt']]),
  bottomColor: list([['#4b4a7a', 'Navy'], ...PALETTE.clothes.filter(([id]) => id !== '#ffc83d' && id !== '#f39a3d'), ['#c9a874', 'Khaki']]),
  hat: list([['none', 'None'], ['cap', 'Cap'], ['beanie', 'Wool hat'], ['bucket', 'Bucket hat'], ['beret', 'Beret'], ['crown', 'Crown'],
    ['party', 'Party hat'], ['cat', 'Cat ears'], ['bunny', 'Bunny ears'], ['flowers', 'Flowers']]),
  hatColor: list(PALETTE.clothes),
  glasses: list([['none', 'None'], ['round', 'Round'], ['square', 'Square'], ['shades', 'Sunglasses'], ['hearts', 'Hearts']]),
  extra: list([['none', 'None'], ['flower', 'Flower'], ['bow', 'Bow'], ['clip', 'Hair clip'], ['earrings', 'Earrings'],
    ['scarf', 'Scarf'], ['headphones', 'Headphones']]),
};

/** Hats that take the hat colour (the others have fixed colours). */
export const COLOURED_HATS = new Set(['cap', 'beanie', 'bucket', 'beret', 'party']);

const BASE = {
  hair: 'short', hairColor: '#5a3a2e', skin: '#f7c9a0', eyes: 'dots', mouth: 'smile', cheeks: 'blush', beard: 'none',
  top: 'tee', topColor: '#ffc83d', bottom: 'pants', bottomColor: '#4b4a7a', hat: 'none', hatColor: '#e9573f', glasses: 'none', extra: 'none',
};

/** The look a member starts with: the jar's creator in yellow, the partner in sky blue. */
export function defaultAvatar(index = 0) {
  return index === 0 ? { ...BASE } : { ...BASE, hair: 'bob', topColor: '#6cc3ef' };
}

// Looks saved before the bigger wardrobe: {hair, hairColor, skin, shirt, acc}.
const OLD_ACC = { cap: { hat: 'cap' }, glasses: { glasses: 'round' }, bow: { extra: 'bow' }, flower: { extra: 'flower' } };

/** Fill in anything missing so every saved look renders. */
export function normalizeAvatar(a, index = 0) {
  if (!a) return defaultAvatar(index);
  const { shirt, acc, ...rest } = a;
  const out = { ...defaultAvatar(index), ...(shirt ? { topColor: shirt } : {}), ...(OLD_ACC[acc] ?? {}), ...rest };
  Object.keys(BASE).forEach((key) => {
    const opts = AVATAR_OPTIONS[key];
    if (opts && !key.endsWith('Color') && key !== 'skin' && !opts.some((o) => o.id === out[key])) out[key] = BASE[key];
  });
  return out;
}

/** A random look, for "Surprise me". */
export function randomAvatar() {
  const any = (key) => AVATAR_OPTIONS[key][Math.floor(Math.random() * AVATAR_OPTIONS[key].length)].id;
  const sometimes = (key, odds) => (Math.random() < odds ? any(key) : 'none');
  return {
    ...BASE, hair: any('hair'), hairColor: any('hairColor'), skin: any('skin'), eyes: any('eyes'), mouth: any('mouth'),
    cheeks: any('cheeks'), beard: sometimes('beard', 0.25), top: any('top'), topColor: any('topColor'), bottom: any('bottom'),
    bottomColor: any('bottomColor'), hat: sometimes('hat', 0.5), hatColor: any('hatColor'), glasses: sometimes('glasses', 0.35),
    extra: sometimes('extra', 0.4),
  };
}

// ---------------------------------------------------------------- drawing

const SHAPE_KEYS = ['hair', 'eyes', 'mouth', 'cheeks', 'beard', 'top', 'bottom', 'hat', 'glasses', 'extra'];
const partsCache = new Map();

function spriteParts(a) {
  const key = SHAPE_KEYS.map((k) => a[k]).join('|');
  if (partsCache.has(key)) return partsCache.get(key);
  const grid = new Map();
  const paint = ([y0, rows], minY = -1) => rows.forEach((row, i) => {
    const y = y0 + i;
    if (y < minY) return;
    const dx = (W - row.length) / 2;
    [...row].forEach((ch, i) => { if (ch !== '.') grid.set(`${i + dx},${y}`, [i + dx, y, CODES[ch]]); });
  });
  const [front, back] = HAIR[a.hair] ?? HAIR.short;
  const hat = HAT[a.hat] ?? HAT.none;
  if (back) paint(back, hat[2]);
  paint(BOTTOM[a.bottom] ?? BOTTOM.pants);
  paint(TOP[a.top] ?? TOP.tee);
  paint(HEAD);
  paint(CHEEKS[a.cheeks] ?? CHEEKS.blush);
  paint(EYES[a.eyes] ?? EYES.dots);
  paint(BEARD[a.beard] ?? BEARD.none);
  paint(MOUTH[a.mouth] ?? MOUTH.smile);
  paint(front, hat[2]);
  const extra = EXTRA[a.extra] ?? EXTRA.none;
  if (a.extra === 'scarf' || a.extra === 'earrings') paint(extra);
  paint(GLASSES[a.glasses] ?? GLASSES.none);
  if (SEE_THROUGH.has(a.glasses)) paint(EYES[a.eyes] ?? EYES.dots);
  if (a.extra === 'headphones') paint(extra);
  paint([hat[0], hat[1]]);
  if (!['scarf', 'earrings', 'headphones'].includes(a.extra)) paint(extra);
  const cells = [...grid.values()];
  const parts = runs([...cells, ...addOutline(cells, W, H)]);
  partsCache.set(key, parts);
  return parts;
}

/** Inline colour variables for one look; the shades are mixed in CSS. */
export function avatarStyle(a) {
  return `--hair:${a.hairColor};--skin:${a.skin};--top:${a.topColor};--bottom:${a.bottomColor};--hat:${a.hatColor}`;
}

// Crops for the picker tiles: the whole body, the head, or the outfit.
const CROPS = { full: '-1 -1 18 22', head: '-1 -1 18 15', body: '-1 11 18 10' };

/** Just the pixel art, for picker tiles and anywhere a bare figure is needed. */
export function CharArt({ avatar, crop = 'full', class: cls = '' }) {
  const a = normalizeAvatar(avatar);
  return html`<svg class=${`char-art ${cls}`} style=${avatarStyle(a)} viewBox=${CROPS[crop]} shape-rendering="crispEdges" aria-hidden="true">
    ${spriteParts(a).map((p) => html`<path key=${p.c} class=${`px-${p.c}`} d=${p.d}/>`)}</svg>`;
}

const MOOD_ICON = { happy: 'heart', alert: 'alert', sweat: 'drop', idle: null };

/**
 * A little partner character.
 * `avatar` is a saved look (see normalizeAvatar); `mood` happy|alert|sweat|idle;
 * `say` shows a speech bubble; `action` plays a one-off move (jump|spin|cheer).
 * `size` is the width in px; keep it a multiple of 18 so each pixel stays whole.
 */
export function Sprite({ avatar, look = 'a', mood = 'idle', name, delay = 0, say = '', action = '', actionKey = 0, size = 72 }) {
  const a = normalizeAvatar(avatar, look === 'a' ? 0 : 1);
  const icon = MOOD_ICON[mood];
  const style = `--delay:${delay}ms;${avatarStyle(a)};--sprite-w:${size}px`;
  return html`
    <div class=${`sprite mood-${mood}`} style=${style}>
      ${say ? html`<span class="speech" key=${actionKey} aria-live="polite">${say}</span>`
        : icon && html`<span class="bubble" aria-hidden="true"><${Icon} name=${icon} size=${12}/></span>`}
      <svg key=${`${action}${actionKey}`} class=${action ? `act-${action}` : ''} viewBox=${CROPS.full} shape-rendering="crispEdges" aria-hidden="true">
        ${spriteParts(a).map((p) => html`<path key=${p.c} class=${`px-${p.c}`} d=${p.d}/>`)}
      </svg>
      ${mood === 'sweat' && html`<i class="sweat" aria-hidden="true"></i>`}
      ${name && html`<span class="sprite-name">${name}</span>`}
    </div>`;
}
