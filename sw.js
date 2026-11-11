// ═══════════════════════════════════════════════════════
//  SUPORTE MEGA – Trabalhador de serviço (PWA)
//  Permite instalar o aplicativo e mantém recursos básicos em cache
//
//  O que é: service worker (trabalhador de serviço) é um programa que roda
//  em segundo plano no navegador, separado da página. Ele fica "no meio do
//  caminho" entre a página e a internet e pode responder aos pedidos de
//  arquivos usando cópias guardadas (cache = cópia local de arquivos).
//
//  Para que serve aqui:
//  - Sem service worker, o navegador não oferece "Instalar aplicativo" (PWA).
//  - Guarda cópias dos arquivos do sistema (HTML, CSS, JS, ícones) para que
//    a tela abra mesmo com a internet instável.
//  - NUNCA guarda os dados do Supabase (chamados, usuários…): esses sempre
//    vêm da internet, para estarem atualizados.
//
//  Com quem conversa:
//  - js/install.js registra (ativa) este arquivo.
//  - Não acessa as funções dos outros scripts: roda em um ambiente separado,
//    onde "self" representa o próprio service worker.
//
//  IMPORTANTE: ao publicar uma nova versão do sistema, aumente o número em
//  CACHE_NAME (ex.: v24 → v25). Isso faz o navegador apagar o cache antigo.
// ═══════════════════════════════════════════════════════

// CACHE_NAME: nome (com número de versão) da "caixa" de cache atual.
const CACHE_NAME = 'suporte-mega-v24';

// Arquivos que serão armazenados em cache para acesso básico sem conexão
// Se um arquivo novo for criado no sistema (ex.: um novo js), inclua-o aqui.
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
  './js/tickets.js',
  './js/relatorios.js',
  './js/install.js',
  './js/app.js',
  './manifest.json',
  './img/bg-waves.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './favicon-48.png'
];

// ── Instalação: armazena os recursos estáticos em cache ──────────────
// Evento "install": acontece quando o navegador encontra uma versão nova
// deste arquivo. event.waitUntil faz o navegador esperar até todos os
// arquivos da lista ASSETS serem baixados e guardados.
// self.skipWaiting(): ativa a nova versão na hora, sem esperar a pessoa
// fechar todas as abas do sistema.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Ativação: remove os caches antigos ─────────────────────
// Evento "activate": a nova versão assumiu. Apaga todas as caixas de cache
// cujo nome seja diferente do CACHE_NAME atual (versões anteriores).
// self.clients.claim(): passa a controlar imediatamente as abas já abertas.
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
// Evento "fetch": disparado a CADA pedido de arquivo ou dado feito pela
// página. Aqui decidimos de onde vem a resposta (internet ou cache).
self.addEventListener('fetch', event => {
  // Só leituras vão para o cache; envios seguem direto para a rede
  // (GET = buscar algo; POST/PATCH/DELETE = gravar, alterar ou apagar).
  // O "return" sem respondWith deixa o navegador agir normalmente.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // As requisições ao Supabase sempre usam a rede (dados em tempo real).
  // Nada do banco de dados é guardado no cache.
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para recursos estáticos: tenta a rede primeiro e usa o cache se estiver sem conexão.
  // 'no-cache' faz o navegador confirmar com o servidor se há versão nova
  // (evita continuar usando um JS antigo guardado no cache HTTP).
  // Exceção: a abertura da página em si (mode "navigate") não pode ser
  // recriada com outras opções, então vai do jeito que veio.
  const req = event.request.mode === 'navigate'
    ? event.request
    : new Request(event.request, { cache: 'no-cache' });

  event.respondWith(
    fetch(req)
      .then(response => {
        // Atualiza o cache com a versão mais recente.
        // clone(): a resposta só pode ser lida uma vez; fazemos uma cópia
        // para o cache e entregamos a original à página.
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      // Sem internet: devolve a cópia guardada no cache (se houver).
      .catch(() => caches.match(event.request))
  );
});
