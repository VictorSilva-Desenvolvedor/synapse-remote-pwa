// Service Worker para Synapse Remote PWA (App Shell Cache)
const CACHE_NAME = 'synapse-remote-shell-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora chamadas para api.github.com ou externas
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Rede primeiro, cache so como reserva offline: o app shell (app.js, index.html)
  // e atualizado com frequencia durante o desenvolvimento ativo do Synapse Remote.
  // A estrategia anterior (cache primeiro, para sempre) prendia cada instalacao na
  // PRIMEIRA versao baixada permanentemente - nenhuma correcao publicada aqui depois
  // chegava no celular do usuario sem ele limpar o cache manualmente. Isso escondeu
  // um diagnostico real por dias: o codigo no repositorio parecia correto, mas o
  // dispositivo continuava rodando uma versao antiga travada no cache.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
