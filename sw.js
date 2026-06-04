/* HÄTÄKESKUS — Service Worker (offline-tuki)
   Cachettaa sovelluskuoren (HTML + Leaflet + Firebase SDK + fontit) ja vieraillut karttalaatat,
   jotta peli toimii ilman nettiä ensimmäisen latauksen jälkeen.
   - HTML: network-first (verkossa aina tuorein, offline cachesta)
   - CDN-kuori + fontit + karttalaatat: cache-first (staattisia)
   - Firestore/Auth/OSRM: EI cachea (oltava live; Firestoren oma offline-jono hoitaa kirjoitukset)
   HUOM: nosta CACHE-versiota kun julkaiset uuden pelin, niin vanha kuori siivotaan. */
const CACHE = 'hk-v81';
const SHELL = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'
];
const TILE_CACHE = 'hk-tiles';          // erillinen, kestää version yli (laatat eivät vanhene)
const TILE_MAX = 1200;                   // raja ettei välimuisti kasva loputtomiin

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== TILE_CACHE && k.indexOf('hk-') === 0).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function trimCache(name, max) {
  caches.open(name).then(c => c.keys().then(keys => {
    if (keys.length > max) { for (let i = 0; i < keys.length - max; i++) c.delete(keys[i]); }
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Live-yhteydet: älä koske (tili/data/reititys). Firestore hoitaa offline-jononsa itse.
  if (/firestore\.googleapis|identitytoolkit|securetoken|firebaseinstallations|firebaseio|googleapis\.com\/identitytoolkit|router\.project-osrm|google-analytics|analytics\.google/.test(url.href)) return;

  const isTile = /tile\.openstreetmap\.org/.test(url.href);
  const isFont = /fonts\.gstatic\.com|fonts\.googleapis\.com/.test(url.href);
  const isShell = SHELL.indexOf(url.href) !== -1;
  const isNav = req.mode === 'navigate';

  // HTML-sivu: network-first → verkossa aina tuorein versio, offline viimeisin cachettu.
  if (isNav) {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
                .catch(() => caches.match(req).then(m => m || caches.match('./') || caches.match('index.html')))
    );
    return;
  }

  // Karttalaatat: cache-first, tallenna omaan cacheen + trimmaa.
  if (isTile) {
    e.respondWith(caches.open(TILE_CACHE).then(c => c.match(req).then(m => m || fetch(req).then(r => {
      // Laatat ladataan no-cors → opaque-vastaus (status 0). Cachetetaan myös ne, muuten offline-kartta jää tyhjäksi.
      if (r && (r.status === 200 || r.status === 0 || r.type === 'opaque')) { c.put(req, r.clone()); trimCache(TILE_CACHE, TILE_MAX); }
      return r;
    }).catch(() => m))));
    return;
  }

  // Kuori (Leaflet/Firebase SDK) + fontit: cache-first.
  if (isShell || isFont) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r;
    }).catch(() => m)));
    return;
  }

  // Muu samanoriginen (esim. firebase-config.js, ikonit): cache-first, fallback verkko.
  e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => {
    if (r && r.status === 200 && url.origin === self.location.origin) {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp));
    }
    return r;
  }).catch(() => m)));
});
