const CACHE = 'bunnygame-v58';
const ASSETS = [
  '/',
  '/index.html',
  '/classic.html',
  '/hare-trigger.html',
  '/hare-brain.html',
  '/bomb-mode.html',
  '/86-bunnies.html',
  '/hare-line.html',
  '/shroom-mode.html',
  '/bunny-hop.html',
  '/cabbage-drop.html',
  '/cubrick.html',
  '/cubrick-puzzles.json',
  '/hexflip.html',
  '/cropped.html',
  '/flagged.html',
  '/wave.html',
  '/mascot-wave.html',
  '/manifest.json',
  '/assets/css/shared.css',
  '/assets/css/classic.css',
  '/assets/css/bomb-mode.css',
  '/assets/css/86-bunnies.css',
  '/assets/css/hare-line.css',
  '/assets/css/shroom-mode.css',
  '/assets/css/bunny-hop.css',
  '/assets/css/cabbage-drop.css',
  '/assets/css/hare-trigger.css',
  '/assets/css/hare-brain.css',
  '/assets/css/cropped.css',
  '/assets/css/flagged.css',
  '/assets/css/wave.css',
  '/assets/css/mascot-wave.css',
  '/assets/css/cubrick.css',
  '/assets/logos/cubrick_logo.svg',
  '/assets/logos/cropped_logo.svg',
  '/assets/logos/flagged_logo.svg',
  '/assets/logos/wave_logo.svg',
  '/assets/css/hexflip.css',
  '/assets/js/nav.js',
  '/assets/js/shared.js',
  '/assets/js/classic.js',
  '/assets/js/bomb-mode.js',
  '/assets/js/86-bunnies.js',
  '/assets/js/hare-line.js',
  '/assets/js/shroom-mode.js',
  '/assets/js/bunny-hop.js',
  '/assets/js/cabbage-drop.js',
  '/assets/js/hare-trigger.js',
  '/assets/js/hare-brain.js',
  '/assets/js/cropped.js',
  '/assets/js/flagged.js',
  '/assets/js/wave.js',
  '/assets/js/mascot-wave.js',
  '/assets/data/schools.json',
  '/assets/data/capitals.json',
  '/assets/js/cubrick.js',
  '/assets/js/hexflip.js',
  '/assets/icons/hexflip-logo.svg',
  '/assets/logos/Hexflip_Logo.svg',
  '/assets/logos/noon_logo.svg',
  '/assets/logos/POISE_LOGO.svg',
  '/assets/icons/blue-bunny.svg',
  '/assets/icons/red-bunny.svg',
  '/assets/icons/mushroom.svg',
  '/assets/icons/cabbage.svg',
  '/assets/icons/carrot.svg',
  '/Icons/BunnyGameLogo.svg',
  '/Icons/icon-192.png',
  '/Icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Remove old caches on update
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
