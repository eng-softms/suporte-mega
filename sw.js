// ═══════════════════════════════════════════════════════
//  SUPORTE MEGA – Trabalhador de serviço (PWA)
//  Permite instalar o aplicativo e mantém recursos básicos em cache
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'suporte-mega-v8';

// Arquivos que serão armazenados em cache para acesso básico sem conexão
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/ui.js',
  './js/auth.js',
  './js/chamados.js',
  './js/equipamentos.js',
  './js/internet.js',
  './js/aquisicoes.js',
  './js/relatorios.js',
  './js/app.js',
  './manifest.json',
  './img/bg-waves.svg',
  './icon-192.png',
  './icon-512.png'
];

// ── Instalação: armazena os recursos estáticos em cache ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Ativação: remove os caches antigos ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Busca: prioriza a rede para o Supabase e o cache para os recursos ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // As requisições ao Supabase sempre usam a rede (dados em tempo real).
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para recursos estáticos: tenta a rede primeiro e usa o cache se estiver sem conexão.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza o cache com a versão mais recente.
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
