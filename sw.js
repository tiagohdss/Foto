const CACHE_NAME = 'tobace-relatorio-v34';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-mark-color.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

/* Guarda cada arquivo separadamente — se um falhar (ex: instabilidade
   de rede bem na hora da instalação), os outros continuam sendo
   guardados normalmente. Antes, usava cache.addAll() que é "tudo ou
   nada": se UM arquivo falhasse, NENHUM ficava guardado, e o app não
   funcionava offline depois — mesmo sendo só uma falha pontual. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(ASSETS.map(async (url) => {
        try{ await cache.add(url); }
        catch(e){ /* esse arquivo específico falhou — segue tentando os outros */ }
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* network-first: sempre tenta buscar a versao mais nova primeiro.
   So usa o cache se estiver sem internet (modo offline em campo). */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(()=>{});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
