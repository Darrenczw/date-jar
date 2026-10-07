// Pixel sprites: the honey jar (the party's HP), the two partner characters, the scene and HP bar.
import { html, useEffect, useRef, useState } from './ui.js';
import { Icon } from './icons.js';

// ---------------------------------------------------------------- pixel helpers

/** Turn a list of [x, y, color] cells into merged horizontal runs per colour. */
function runs(cells) {
  const byColor = new Map();
  cells.forEach(([x, y, c]) => {
    if (!byColor.has(c)) byColor.set(c, new Map());
    const rows = byColor.get(c);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  });
  const out = [];
  byColor.forEach((rows, c) => {
    let d = '';
    rows.forEach((xs, y) => {
      xs.sort((a, b) => a - b);
      let i = 0;
      while (i < xs.length) {
        let j = i;
        while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j += 1;
        d += `M${xs[i]} ${y}h${xs[j] - xs[i] + 1}v1h${xs[i] - xs[j] - 1}z`;
        i = j + 1;
      }
    });
    out.push({ c, d });
  });
  return out;
}

function addOutline(cells, w, h) {
  const filled = new Set(cells.map(([x, y]) => `${x},${y}`));
  const outline = [];
  for (let y = -1; y <= h; y += 1) {
    for (let x = -1; x <= w; x += 1) {
      if (filled.has(`${x},${y}`)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled.has(`${x + dx},${y + dy}`))) outline.push([x, y, 'line']);
    }
  }
  return outline;
}

// ---------------------------------------------------------------- the jar

const W = 22;
const H = 27;
// Interior spans per row [from, to] (inclusive), lid excluded.
const SPANS = { 4: [8, 13], 5: [8, 13], 6: [6, 15], 7: [4, 17], 8: [3, 18], 25: [3, 18] };
for (let y = 9; y <= 24; y += 1) SPANS[y] = [2, 19];
// Honey fills these rows from the bottom up; 20 rows = a full month's budget.
const FILL_ROWS = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6];
export const JAR_ROWS = FILL_ROWS.length;

const interior = [];
Object.entries(SPANS).forEach(([y, [a, b]]) => { for (let x = a; x <= b; x += 1) interior.push([x, Number(y)]); });
const lid = [];
for (let y = 0; y <= 3; y += 1) for (let x = 5; x <= 16; x += 1) {
  const edge = y === 0 || y === 3 || x === 5 || x === 16;
  lid.push([x, y, edge ? 'line' : y === 1 ? 'lid-hi' : 'lid']);
}
const glassOutline = addOutline(interior.map(([x, y]) => [x, y]), W, H).filter(([x, y]) => y > 3 || x < 5 || x > 16);

function jarCells(rows, paceRows) {
  const honeyRows = new Set(FILL_ROWS.slice(0, rows));
  const top = rows > 0 ? FILL_ROWS[rows - 1] : null;
  const paceY = paceRows != null && paceRows > 0 && paceRows <= JAR_ROWS ? FILL_ROWS[paceRows - 1] : null;
  const cells = [];
  interior.forEach(([x, y]) => {
    let c = 'glass';
    if (honeyRows.has(y)) {
      c = y === top ? 'honey-hi' : 'honey';
      if (x === SPANS[y][0] + 1 && y !== top) c = 'honey-hi';
    } else if (x === 4 && y >= 10 && y <= 15) {
      c = 'shine';
    }
    if (paceY === y && x % 2 === 0) c = 'pace';
    cells.push([x, y, c]);
  });
  // a few bubbles in the honey
  [[7, 21], [14, 18], [11, 23], [16, 13], [6, 15]].forEach(([x, y]) => {
    if (honeyRows.has(y) && y !== top) cells.push([x, y, 'bubble']);
  });
  return [...cells, ...glassOutline, ...lid];
}

/**
 * The jar holds the month's budget; honey drains a row at a time as you spend.
 * `left` = fraction of budget remaining (0..1), `pace` = fraction that should remain today.
 */
export function PixelJar({ left, pace = null, dayLabel = '', dropKey = null, summary, size = 'lg' }) {
  const target = left <= 0 ? 0 : Math.max(1, Math.round(Math.min(left, 1) * JAR_ROWS));
  const [rows, setRows] = useState(target);
  const timer = useRef(null);

  useEffect(() => {
    clearInterval(timer.current);
    if (rows === target) return undefined;
    const start = setTimeout(() => {
      timer.current = setInterval(() => {
        setRows((r) => {
          const next = r + Math.sign(target - r);
          if (next === target) clearInterval(timer.current);
          return next;
        });
      }, 90);
    }, dropKey ? 450 : 0);
    return () => { clearTimeout(start); clearInterval(timer.current); };
  }, [target, dropKey]);

  const paceRows = pace == null ? null : Math.round(Math.min(Math.max(pace, 0), 1) * JAR_ROWS);
  const parts = runs(jarCells(rows, paceRows));
  const paceTop = paceRows ? ((FILL_ROWS[Math.max(paceRows, 1) - 1] + 0.5) / H) * 100 : null;

  return html`
    <div class=${`pjar pjar-${size}`} role="img" aria-label=${summary}>
      <svg viewBox=${`-1 -1 ${W + 2} ${H + 2}`} shape-rendering="crispEdges" aria-hidden="true">
        ${parts.map((p) => html`<path key=${p.c} class=${`px-${p.c}`} d=${p.d}/>`)}
      </svg>
      ${paceTop != null && dayLabel && html`<span class="pace-tag" style=${`top:${paceTop}%`}>${dayLabel}</span>`}
      ${dropKey != null && html`<span key=${dropKey} class="coin-hop" aria-hidden="true"></span>`}
    </div>`;
}

// ---------------------------------------------------------------- characters

const BODY_A = [
  '..hhhhhh..', '.hhhhhhhh.', '.hssssssh.', '.sesssses.', '.ssssssss.', '.srssssrs.', '..ssssss..',
  '..cccccc..', '.cccccccc.', 'sccccccccs', '.cccccccc.', '..pppppp..', '..pp..pp..', '..kk..kk..'];
const BODY_B = [
  '..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hsessssesh', 'hssssssssh', 'hsrssssrsh', 'h.ssssss.h',
  '..cccccc..', '.cccccccc.', 'sccccccccs', '.cccccccc.', '..pppppp..', '..pp..pp..', '..kk..kk..'];
const CODES = { h: 'hair', s: 'skin', e: 'line', r: 'blush', c: 'shirt', p: 'pants', k: 'line' };

function spriteParts(rowsDef) {
  const cells = [];
  rowsDef.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') cells.push([x, y, CODES[ch]]); }));
  return runs([...cells, ...addOutline(cells, 10, 14)]);
}
const PARTS = { a: spriteParts(BODY_A), b: spriteParts(BODY_B) };

const MOOD_ICON = { happy: 'heart', alert: 'alert', sweat: 'drop', idle: null };

/** A little partner character. `look` a|b, `tone` you|partner, `mood` happy|alert|sweat|idle. */
export function Sprite({ look = 'a', tone = 'you', mood = 'idle', name, delay = 0 }) {
  const icon = MOOD_ICON[mood];
  return html`
    <div class=${`sprite sprite-${tone} mood-${mood}`} style=${`--delay:${delay}ms`}>
      ${icon && html`<span class="bubble" aria-hidden="true"><${Icon} name=${icon} size=${12}/></span>`}
      <svg viewBox="-1 -1 12 16" shape-rendering="crispEdges" aria-hidden="true">
        ${PARTS[look].map((p) => html`<path key=${p.c} class=${`px-${p.c}`} d=${p.d}/>`)}
      </svg>
      ${mood === 'sweat' && html`<i class="sweat" aria-hidden="true"></i>`}
      ${name && html`<span class="sprite-name">${name}</span>`}
    </div>`;
}

// ---------------------------------------------------------------- scene + HP bar

const CLOUD = runs(addOutline(
  [[2, 0], [3, 0], [4, 0], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2]].map(([x, y]) => [x, y, 'cloud']),
  9, 3,
).map(([x, y]) => [x, y, 'cloud-edge']).concat(
  [[2, 0], [3, 0], [4, 0], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2]].map(([x, y]) => [x, y, 'cloud']),
));

function Cloud({ x, y, s = 1, slow = false }) {
  return html`<svg class=${`cloud ${slow ? 'slow' : ''}`} style=${`left:${x}%;top:${y}%;width:${36 * s}px`} viewBox="-1 -1 11 5" shape-rendering="crispEdges" aria-hidden="true">
    ${CLOUD.map((p) => html`<path key=${p.c} class=${`px-${p.c}`} d=${p.d}/>`)}</svg>`;
}

/** The little world the jar lives in: sky, clouds (stars at night), grass. */
export function Scene({ children, compact = false }) {
  return html`
    <div class=${`scene ${compact ? 'compact' : ''}`}>
      <div class="sky" aria-hidden="true">
        <${Cloud} x=${6} y=${14} s=${1.1}/>
        <${Cloud} x=${70} y=${8} s=${0.8} slow/>
        <i class="star" style="left:18%;top:12%"></i><i class="star" style="left:84%;top:30%"></i>
        <i class="star" style="left:48%;top:8%"></i><i class="star" style="left:64%;top:20%"></i>
        <i class="moon"></i>
      </div>
      <div class="ground" aria-hidden="true"></div>
      <div class="scene-stage">${children}</div>
    </div>`;
}

/** Budget left as an RPG HP bar that drains in segments and shifts green → yellow → red. */
export function HPBar({ left, budgetLeftLabel, pace = null, paceLabel = '' }) {
  const pct = Math.max(0, Math.min(1, left));
  const stepped = Math.ceil(pct * 20) / 20; // 5% segments
  const tone = pct > 0.5 ? 'good' : pct > 0.2 ? 'warn' : 'low';
  return html`
    <div class="hp" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(pct * 100)} aria-label=${`Budget left: ${budgetLeftLabel}`}>
      <span class="hp-tag">Budget</span>
      <div class="hp-track">
        <div class=${`hp-fill hp-${tone}`} style=${`transform:scaleX(${stepped})`}></div>
        ${pace != null && html`<span class="hp-pace" style=${`left:${Math.max(0, Math.min(1, pace)) * 100}%`} title=${paceLabel}></span>`}
      </div>
    </div>`;
}

// The A button: a stepped pixel circle (outline, tomato face, highlight, shaded lower rows).
const ABTN = (() => {
  const cells = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d > 8) continue;
      if (d > 6.9) { cells.push([x, y, 'line']); continue; }
      let c = 'abtn';
      if (y >= 11) c = 'abtn-shade';
      if ((y === 3 && x >= 4 && x <= 6) || (y === 4 && x === 3) || (y === 5 && x === 3)) c = 'abtn-hi';
      cells.push([x, y, c]);
    }
  }
  return runs(cells);
})();

export function ABtnFace() {
  return html`<svg class="abtn-face" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
    ${ABTN.map((p) => html`<path key=${p.c} class=${`px-${p.c}`} d=${p.d}/>`)}</svg>`;
}

export function moodFor(status) {
  return { empty: 'happy', 'on-track': 'happy', ahead: 'alert', hot: 'sweat', over: 'sweat' }[status] ?? 'idle';
}
