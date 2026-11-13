/* Service Worker básico — Instituto Patas do Bairro
 * - Pré-carrega o "app shell" para abrir rápido em 4G instável.
 * - Arquivos estáticos: cache primeiro, atualizando em segundo plano.
 * - API (/api/*): sempre rede — dados operacionais nunca vêm do cache.
 */
'use strict';

const VERSAO = 'patas-v2';
const APP_SHELL = ['/', '/index.html', '/css/styles.css', '/js/app.js', '/manifest.json', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // rede direto

  // Navegação: rede primeiro, cache como reserva offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSAO).then((cache) => cache.put('/', copia));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Estáticos: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((emCache) => {
      const daRede = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(VERSAO).then((cache) => cache.put(request, copia));
          }
          return res;
        })
        .catch(() => emCache);
      return emCache || daRede;
    })
  );
});
