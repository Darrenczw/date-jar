// Pixel-art helpers shared by the jar, the characters and the scenery.

/** Turn a list of [x, y, color] cells into merged horizontal runs per colour. */
export function runs(cells) {
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

export function addOutline(cells, w, h) {
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
