// Service worker for Liam's Day.
//
// The problem it solves: the page itself has to come down from the internet
// before any of the app's code runs. So with no connection, a reload gave
// the browser's "no connection" error page — Melody taps the icon in the
// morning, the wifi is still waking up, and she gets a dinosaur instead of
// Liam's breakfast. Paper doesn't do that, and paper is the bar.
//
// With this installed, the browser keeps its own copy of the page. It opens
// offline, and the app's own localStorage cache fills in the last plan.
//
// Deliberately network-first for pages: a fresh deploy always wins when
// online. The cache is a safety net, never the source of truth — the classic
// service-worker failure is pinning people to a stale version forever.

const VERSION = 'liams-day-v1';
const SHELL = ['/', '/index.html', '/edit.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      // A failed precache must not block installation — better a working
      // online app with no offline safety net than no app at all.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The API is never cached. Today's plan must always be the real one, and
  // the page already handles a failed call by showing its stored copy with
  // a "last updated" line. A cached API response could quietly show Melody
  // yesterday's meals as though they were today's — worse than an honest
  // "no connection right now".
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request)
        .then((hit) => hit || caches.match('/index.html'))),
  );
});
