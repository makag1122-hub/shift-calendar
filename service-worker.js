'use strict';

const ASSET_VERSION = '20260806e';
const CACHE_NAME = `shift-calendar-v${ASSET_VERSION}-cache-safe`;
const APP_SHELL = [
  './',
  './index.html',
  './privacy.html',
  `./style.css?v=${ASSET_VERSION}`,
  './qrcode.js?v=20260715a',
  `./sync-config.js?v=${ASSET_VERSION}`,
  `./sync.js?v=${ASSET_VERSION}`,
  `./app.js?v=${ASSET_VERSION}`,
  './manifest.json',
  './icons/icon-180-v2.png',
  './icons/icon-192-v2.png',
  './icons/icon-512-v2.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // GitHub Pages의 HTTP 캐시가 남아 있어도 설치 시 최신 파일을 다시 받습니다.
      .then((cache) => cache.addAll(
        APP_SHELL.map((url) => new Request(url, { cache:'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache:'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    // 버전 쿼리를 정확히 일치시켜 이전 CSS/JS가 새 화면에 섞이지 않게 합니다.
    caches.match(request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      })
  );
});
