// Offline shell: app files are cached on first load and refreshed in the background.
// Bump VERSION whenever you publish a new build so phones pick it up.
const VERSION = 'v8';
const CACHE = `date-jar-${VERSION}`;
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg',
  'vendor/preact-htm.js', 'src/app.js', 'src/ui.js', 'src/icons.js', 'src/components.js', 'src/add.js',
  'src/screens.js', 'src/sprites.js', 'src/pixels.js', 'src/avatar.js', 'src/character.js', 'fonts/pixelify-sans-latin.woff2', 'fonts/dotgothic16-latin.woff2', 'src/onboarding.js', 'src/store.js', 'src/money.js', 'src/fx.js', 'src/config.js',
  'src/backend-supabase.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('date-jar-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The Supabase client library is a big static file: cache it. Live data and rates always go to the network.
  if (url.hostname === 'esm.sh') {
    event.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;

  // Same-origin: serve cached copy immediately, refresh it in the background.
  event.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => cached);
      return cached ?? fresh;
    }),
  );
});
