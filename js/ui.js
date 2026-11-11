/* ═══════════════════════════════════════════
   SUPORTE MEGA – Auxiliares da interface
   (notificações, janelas modais, navegação, tema e barra lateral)
   ═══════════════════════════════════════════

   Para que serve este arquivo:
   Aqui ficam as "ferramentas de uso geral" da tela. Elas não falam
   com o banco de dados (Supabase); só cuidam do que o usuário vê:
     - toast: mensagens rápidas no canto da tela;
     - janelas modais (caixas que abrem por cima da página);
     - barra lateral e navegação entre as páginas;
     - tema claro / escuro;
     - formatação de datas e etiquetas coloridas (badges);
     - exportação de planilhas (CSV e Excel);
     - ordenação automática das tabelas ao clicar no título da coluna.

   Como é usado:
   O index.html carrega este arquivo logo depois do config.js e antes
   dos demais (auth.js, chamados.js etc.). Todas as funções daqui são
   "globais", ou seja, qualquer outro arquivo pode chamá-las direto.
   Algumas funções usadas aqui (hasAdminAccess, openDetalhe, etc.)
   são definidas em outros arquivos; isso funciona porque elas só são
   chamadas depois que todos os scripts já foram carregados.
   ═══════════════════════════════════════════ */

// ── Notificações ──
// toast: mostra uma mensagem curta (o "toast", como uma torrada que
// salta da torradeira) no canto da tela e some sozinha depois.
// Chamada por praticamente todos os arquivos (auth.js, chamados.js,
// equipamentos.js, internet.js...) para avisar sucesso ou erro.
// Recebe: msg = texto da mensagem; type = 'ok' (verde, padrão),
//         'err' (erro, vermelho) ou 'info' (informação).
// Devolve: nada.
function toast(msg, type = 'ok') {
  // Cria a caixinha da mensagem dentro do contêiner #toasts (do index.html).
  // O "role" avisa leitores de tela (usados por pessoas com deficiência
  // visual): 'alert' lê o erro na hora; 'status' lê sem interromper.
  const c  = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className  = `toast ${type}`;
  el.textContent = msg;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.title = 'Clique para fechar';
  c.appendChild(el);

  // Sai com animação; clicar fecha antes do tempo.
  // dismiss: adiciona a classe "hide" (que dispara a animação de saída
  // no CSS) e remove o elemento quando a animação termina. O setTimeout
  // de 400 ms é uma garantia, caso a animação não dispare o evento.
  // A primeira linha impede que a mensagem seja fechada duas vezes.
  const dismiss = () => {
    if (el.classList.contains('hide')) return;
    el.classList.add('hide');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.addEventListener('click', dismiss);
  // Erros ficam mais tempo na tela (5 s) para dar tempo de ler; os demais, 3,5 s.
  setTimeout(dismiss, type === 'err' ? 5000 : 3500);
}

// ── Janelas modais ──
// Uma "janela modal" é uma caixa que abre por cima da página e escurece
// o fundo (ex.: "Novo chamado", "Detalhes do chamado"). No index.html cada
// uma é um elemento com a classe "modal-overlay" e um id próprio.
// openModal / closeModal: mostram ou escondem a janela de id informado,
// apenas colocando ou tirando a classe "open" (o CSS faz o resto).
// Chamadas pelos botões do index.html (onclick) e por vários arquivos JS.
// Recebem: id do elemento da janela. Devolvem: nada.
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Fecha ao clicar na camada de sobreposição (o fundo escuro em volta da
// janela). Só fecha se o clique foi no fundo, não dentro da caixa.
document.addEventListener('click', ev => {
  if (ev.target.classList.contains('modal-overlay')) {
    ev.target.classList.remove('open');
  }
});

// Fecha a janela aberta (ou o menu do usuário) com a tecla Esc.
// Se houver mais de uma janela aberta, fecha só a última (a que está
// por cima). Se não houver janela, fecha o menu do usuário, se aberto.
// toggleUserMenu fica no auth.js.
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
  if (open) { open.classList.remove('open'); return; }
  if (document.getElementById('user-dropdown')?.classList.contains('open')) toggleUserMenu(false);
});

// ── Reação ao clique: onda que parte do ponto tocado ──
// Efeito "ripple" (ondulação): ao clicar num botão, aparece um círculo
// que cresce a partir do ponto clicado. É só visual.
// RIPPLE_TARGETS: lista (no formato de seletor CSS) dos elementos que
// ganham esse efeito.
// O código calcula a posição do clique dentro do botão, cria um <span>
// com a classe "ripple" (animada no CSS) e o apaga quando a animação acaba.
// Ignora botões desativados e cliques que não sejam do botão esquerdo.
const RIPPLE_TARGETS = '.btn, .nav-item, .login-tab, .user-dropdown-item, .theme-toggle, .stat-card.clickable, .modal-close';
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest(RIPPLE_TARGETS);
  if (!el || el.disabled || ev.button !== 0) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const wave = document.createElement('span');
  wave.className = 'ripple';
  wave.style.cssText = `width:${size}px;height:${size}px;left:${ev.clientX - rect.left - size / 2}px;top:${ev.clientY - rect.top - size / 2}px`;
  el.appendChild(wave);
  wave.addEventListener('animationend', () => wave.remove(), { once: true });
});

// Linhas e itens clicáveis também abrem pelo teclado (Enter ou espaço).
// Vale para elementos com o atributo data-open-id (ex.: linhas da tabela
// de chamados, montadas no chamados.js). Isso ajuda quem navega só pelo
// teclado. openDetalhe (no chamados.js) abre os detalhes do chamado.
// preventDefault impede que a tecla espaço role a página.
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest?.('[data-open-id]');
  if (!el || ev.target !== el) return;
  ev.preventDefault();
  openDetalhe(el.dataset.openId);
});

// ── Barra lateral ──
// No celular a barra lateral (menu) fica escondida e abre por cima da
// tela. "nav-overlay" é o fundo escuro que aparece atrás dela; clicar
// nele fecha o menu.
// toggleSidebar: abre se estiver fechada, fecha se estiver aberta.
// Chamada pelo botão de menu (☰) da barra do topo no index.html.
// closeSidebar: sempre fecha. Chamada pelo fundo escuro e pela navigate()
// (para o menu sumir depois de escolher uma página).
// Não recebem nem devolvem nada.
function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const o = document.getElementById('nav-overlay');
  s.classList.contains('open') ? closeSidebar() : (s.classList.add('open'), o.style.display = 'block');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('nav-overlay').style.display = 'none';
}

// ── Navegação ──
// O sistema é uma "página única": todas as telas já estão no index.html
// (seções com id "page-…") e só uma fica visível por vez.
// ADMIN_PAGES: páginas que só administradores podem abrir.
// SUPERADMIN_PAGES: páginas que só o super administrador pode abrir.
// Atenção: esconder a página é só uma proteção da tela. A proteção de
// verdade dos dados fica nas regras do banco (Supabase).
const ADMIN_PAGES = ['equipamentos', 'internet', 'aquisicoes', 'tickets', 'relatorios', 'usuarios'];
const SUPERADMIN_PAGES = ['equipamentos', 'aquisicoes'];

// navigate: troca a página visível.
// Chamada pelos itens da barra lateral (onclick no index.html), pelos
// cartões do painel inicial, pela initUI() e por outros arquivos JS.
// Recebe: page = nome da página (ex.: 'chamados', 'relatorios').
// Devolve: nada.
function navigate(page) {
  // 1) Confere a permissão. hasAdminAccess e isSuperAdmin ficam no auth.js.
  if (ADMIN_PAGES.includes(page) && !hasAdminAccess()) {
    toast('Esta área é restrita a administradores.', 'err');
    return;
  }
  if (SUPERADMIN_PAGES.includes(page) && !isSuperAdmin()) {
    toast('Esta área é restrita ao super administrador.', 'err');
    return;
  }

  // 2) Esconde todas as páginas e desmarca todos os itens do menu.
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) return;

  // 3) Mostra a página pedida, marca o item do menu, troca o título da
  //    barra do topo (PAGE_TITLES fica no config.js) e fecha o menu no celular.
  pageEl.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  closeSidebar();

  // 4) Ações executadas ao abrir cada página: carrega ou redesenha os
  //    dados daquela tela (cada função fica no arquivo JS da página).
  if (page === 'relatorios')   renderRelatorios();
  if (page === 'chamados')     populateLojaFilter();
  if (page === 'equipamentos') {
    populateLojaFilterEquip();
    // Busca de novo ao abrir a aba, para mostrar o que outros administradores cadastraram
    loadEquipamentos().catch(e => toast('Erro ao carregar equipamentos: ' + e.message, 'err'));
  }
  if (page === 'tickets')      loadTickets();
  if (page === 'usuarios')     { loadUsuarios(); loadAllowedEmails(); }
  if (page === 'internet')     loadPlanosInternet();
  if (page === 'aquisicoes')   loadAquisicoes();

  // 5) Guarda qual página está aberta (usada pela initUI para reabri-la).
  currentPage = page;
}

// Página atual; volta a null ao sair, para o próximo login abrir a página inicial
// (quem zera é o logout, no auth.js).
let currentPage = null;

// Página aberta após o login: administradores vão para Início, usuários comuns para Chamados.
// Chamada pela initUI(). Devolve o nome da página ('dashboard' ou 'chamados').
function homePage() {
  return hasAdminAccess() ? 'dashboard' : 'chamados';
}

// ── Tema ──
// toggleTheme: alterna o tema em três passos:
//   automático (segue o sistema) → claro → escuro → automático...
// O tema fica no atributo data-theme da tag <html>; o styles.css lê esse
// atributo para trocar as cores. Sem o atributo, vale o tema do sistema.
// A escolha é salva no localStorage (memória do navegador que não se
// apaga ao fechar a página), na chave 'ti-theme'.
// Chamada pelo botão de tema no index.html. Não recebe nem devolve nada.
function toggleTheme() {
  const r    = document.documentElement;
  const cur  = r.dataset.theme || '';
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? '' : 'light';
  next ? (r.dataset.theme = next) : delete r.dataset.theme;
  // O try/catch evita erro em navegadores que bloqueiam o localStorage
  // (ex.: janela anônima); nesse caso só não salva a escolha.
  try { localStorage.setItem('ti-theme', next); } catch (e) {}
  toast(`Tema: ${next === 'light' ? 'claro' : next === 'dark' ? 'escuro' : 'automático (sistema)'}`, 'info');
}

// Restaura tema salvo.
// Roda assim que o arquivo é carregado, para a página já abrir com o
// tema que a pessoa escolheu da última vez.
try {
  const t = localStorage.getItem('ti-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}

// ── Funções auxiliares de formatação ──
// As datas do sistema ficam guardadas como "timestamp": um número de
// milissegundos contados desde 01/01/1970. Estas funções transformam
// esse número em texto legível. Se não houver data, mostram "–".

// fmtDate: data e hora no padrão brasileiro (ex.: "05/03/2026 14:30").
// Usada nas tabelas, detalhes e exportações (chamados.js, equipamentos.js...).
// Recebe: ts (timestamp). Devolve: texto.
function fmtDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
// fmtDateShort: só a data, sem hora (ex.: "05/03/2026").
// Recebe: ts (timestamp). Devolve: texto.
function fmtDateShort(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('pt-BR');
}
// fmtRelTime: tempo relativo, como "agora", "5min atrás", "3h atrás",
// "2d atrás". Depois de 7 dias mostra a data normal.
// Usada nas listas de chamados recentes e nos detalhes (chamados.js).
// Recebe: ts (timestamp). Devolve: texto.
function fmtRelTime(ts) {
  if (!ts) return '–';
  // Diferença em milissegundos; 60000 ms = 1 minuto.
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'agora';
  if (m < 60)  return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d atrás`;
  return fmtDateShort(ts);
}

// statusBadge: monta a "etiqueta" colorida (badge) do status do chamado.
// O objeto "map" liga cada status a uma classe CSS de cor (ver styles.css).
// Usada nas tabelas e detalhes de chamados e tickets.
// Recebe: s = status (ex.: 'Aberto'). Devolve: texto HTML de um <span>.
function statusBadge(s) {
  const map = {
    'Aberto':             'badge-aberto',
    'Em Andamento':       'badge-andamento',
    'Aguardando usuário': 'badge-andamento',
    'Resolvido':          'badge-fechado',
    'Fechado':            'badge-fechado',
    'Cancelado':          'badge-cancelado',
  };
  return `<span class="badge ${map[s] || ''}">${esc(s)}</span>`;
}
// prioBadge: igual à anterior, mas para a prioridade (Urgente, Alta,
// Média, Baixa). Recebe: p = prioridade. Devolve: texto HTML.
function prioBadge(p) {
  const map = { 'Urgente':'badge-urgente','Alta':'badge-alta','Média':'badge-media','Baixa':'badge-baixa' };
  return `<span class="badge ${map[p] || ''}">${esc(p)}</span>`;
}
// esc: "escapa" um texto antes de colocá-lo dentro de HTML.
// Troca os caracteres especiais (& < > ") por códigos seguros. Assim, se
// alguém digitar algo como <script> num chamado, isso aparece como texto
// e não é executado pelo navegador (proteção contra ataque XSS, que é a
// injeção de código malicioso na página).
// Usada em quase todos os arquivos que montam HTML com dados do usuário.
// Recebe: s = qualquer valor. Devolve: texto seguro (vazio se não houver valor).
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// setText: coloca um texto dentro do elemento de id informado, se ele
// existir (não dá erro se não existir). Usada para preencher números e
// rótulos (ex.: contadores do painel).
// Recebe: id do elemento e val (o texto). Devolve: nada.
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Exportação de planilhas (CSV e Excel) ──
// CSV é um arquivo de texto simples com valores separados por vírgula.
// XLSX é o formato de planilha do Excel.
// XLSX_SRC: endereço da biblioteca SheetJS (código pronto de terceiros
// que monta arquivos do Excel), baixada de uma CDN (servidor público de
// arquivos).
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// Carrega a biblioteca do Excel só quando alguém exporta.
// Assim a página abre mais rápido, pois a biblioteca é grande.
// Chamada pela downloadXLSX().
// Devolve: uma Promise (uma "promessa" de resultado que chega depois)
// com o objeto XLSX da biblioteca. Se já estiver carregada, devolve na hora.
// Se o download falhar, a Promise dá erro (reject).
function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_SRC;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('não foi possível carregar a biblioteca do Excel'));
    document.head.appendChild(script);
  });
}

// downloadBlob: faz o navegador baixar um arquivo gerado na própria página.
// Um "Blob" é um bloco de dados (o conteúdo do arquivo) na memória.
// Truque usado: cria um link <a> invisível apontando para esse bloco,
// clica nele via código e depois apaga o link e libera a memória.
// Chamada pela downloadCSV(). Recebe: blob (conteúdo) e name (nome do
// arquivo). Devolve: nada.
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Data/hora (ms) → número de série do Excel no horário local.
// Calculado à mão para evitar o deslocamento de fuso da biblioteca.
// O Excel guarda datas como "número de dias desde 30/12/1899"
// (ex.: 46000,5 = um dia ao meio-dia). Aqui a data local é tratada
// como se fosse UTC (horário universal) para a conta não somar nem
// subtrair as horas do fuso de Brasília. 86400000 ms = 1 dia.
// Usada nas exportações para Excel (chamados.js, equipamentos.js...).
// Recebe: ts (timestamp). Devolve: número (ou '' se não houver data).
function excelDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

// Gera um CSV (com BOM para o Excel abrir os acentos corretamente).
// BOM é um caractere invisível no início do arquivo que avisa ao Excel
// que o texto está em UTF-8 (padrão que inclui acentos).
// Cada célula vai entre aspas; quebras de linha viram espaço e aspas
// internas são duplicadas (regra do formato CSV).
// Chamada pelas exportações de chamados.js, equipamentos.js, internet.js
// e relatorios.js.
// Recebe: name (nome do arquivo), header (lista com os títulos das
// colunas) e rows (lista de linhas; cada linha é uma lista de valores).
// Devolve: nada (dispara o download).
function downloadCSV(name, header, rows) {
  const cell = v => `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
  const csv  = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name);
}

// Gera um .xlsx com uma ou mais abas.
// sheets: [{ name, header, rows, widths?, money?: ['F'], dates?: ['B'] ou { B: 'dd/mm/yyyy' } }]
// Nas colunas de "dates" os valores devem vir de excelDate(); padrão: data e hora.
// Explicando os campos de cada aba:
//   name   = nome da aba;  header = títulos das colunas;  rows = linhas;
//   widths = largura de cada coluna (opcional);
//   money  = letras das colunas em reais (formato R$);
//   dates  = colunas de data, com o formato desejado;
//   footer = linhas de total no fim (opcional).
// Chamada pelas exportações de chamados.js, equipamentos.js, internet.js
// e relatorios.js. É "async" (assíncrona): espera a biblioteca carregar.
// Devolve: nada (dispara o download do arquivo .xlsx).
async function downloadXLSX(name, sheets) {
  // Carrega a biblioteca e cria uma pasta de trabalho (workbook) vazia.
  const XLSX = await loadXlsxLib();
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    // "dates" pode vir como lista (['B']) ou como objeto ({ B: 'dd/mm/yyyy' }).
    // Aqui tudo vira objeto "coluna → formato" para facilitar o uso abaixo.
    const dates = Array.isArray(sh.dates)
      ? Object.fromEntries(sh.dates.map(col => [col, 'dd/mm/yyyy hh:mm']))
      : (sh.dates || {});
    // "footer": linhas de total, fora do autofiltro
    const footer = sh.footer || [];
    // Monta a aba a partir de uma lista de linhas (aoa = "array of arrays").
    const ws = XLSX.utils.aoa_to_sheet([sh.header, ...sh.rows, ...footer]);
    // Largura das colunas: a informada ou, se não houver, o tamanho do
    // título + 2 (mínimo 12 caracteres).
    ws['!cols'] = (sh.widths || sh.header.map(h => Math.max(12, String(h).length + 2))).map(wch => ({ wch }));
    // Liga o autofiltro do Excel (setinhas no título de cada coluna),
    // do cabeçalho até a última linha de dados (sem o rodapé de totais).
    if (sh.rows.length) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.rows.length, c: sh.header.length - 1 } }) };
    }
    // Percorre as linhas (a partir da 2, pois a 1 é o cabeçalho) e aplica
    // o formato de dinheiro e de data nas células numéricas (c.t === 'n').
    // c.z é o "formato de exibição" da célula no Excel.
    for (let r = 2; r <= sh.rows.length + footer.length + 1; r++) {
      (sh.money || []).forEach(col => {
        const c = ws[`${col}${r}`];
        if (c && c.t === 'n') c.z = '"R$" #,##0.00';
      });
      Object.entries(dates).forEach(([col, fmt]) => {
        const c = ws[`${col}${r}`];
        if (c && c.t === 'n') c.z = fmt;
      });
    }
    // Nome de aba: máx. 31 caracteres e sem : \ / ? * [ ]
    XLSX.utils.book_append_sheet(wb, ws, String(sh.name).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
  });
  // Gera o arquivo e faz o navegador baixá-lo.
  XLSX.writeFile(wb, name);
}

// Data local AAAA-MM-DD para nomes de arquivo (ex.: "chamados_2026-03-05.csv").
// padStart(2, '0') coloca zero à esquerda (3 → "03").
// Chamada pelas exportações. Devolve: texto com a data de hoje.
function fileDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Protocolo do chamado (ex.: 2026-00042). Se o script SQL do protocolo
// ainda não foi executado, usa o início do ID como antes.
// O "?." evita erro se o chamado vier vazio.
// Chamada pelo chamados.js (tabela, busca, detalhes e exportação).
// Recebe: c = objeto do chamado. Devolve: texto do protocolo.
function protocoloChamado(c) {
  return c?.protocolo || (c?.id ? String(c.id).substring(0, 6) : '');
}

// ── Indicador de carregamento ──
// setLoading: mostra (true) ou esconde (false) o aviso de "carregando"
// (#loading-indicator no index.html).
// Chamada pelo app.js (ao buscar os dados) e pelo chamados.js (ao abrir
// anexos). Recebe: on (verdadeiro/falso). Devolve: nada.
function setLoading(on) {
  document.getElementById('loading-indicator').style.display = on ? 'flex' : 'none';
}

// ── Inicialização da interface ──
// initUI: abre a página certa depois do login.
// Chamada duas vezes pelo app.js: logo após o login (antes dos dados
// chegarem) e de novo quando os dados terminam de carregar.
// Não recebe nem devolve nada.
function initUI() {
  // Na primeira chamada abre a página inicial; depois reabre a atual já com os dados
  navigate(currentPage || homePage());
}

// ─────────────────────────────────────────
// Ordenação das tabelas pelo cabeçalho
// Vale para todas as tabelas, inclusive as montadas depois pelo JS.
// Clique no título: crescente → decrescente → ordem original.
// Reconhece datas (dd/mm/aaaa), valores em R$, números e texto.
// Uma célula pode definir o próprio valor com data-sort-value.
// Tabelas com ordenação própria (th com onclick, como Chamados) ficam de fora.
// ─────────────────────────────────────────
// tableSortState: guarda, para cada tabela, qual coluna está ordenada
// (col = número da coluna, começando em 0) e o sentido (dir = 'asc'
// crescente ou 'desc' decrescente). Fica na memória enquanto a página
// estiver aberta.
// SORT_SKIP_HEADERS: títulos de coluna que nunca são ordenáveis
// (coluna sem título e a coluna "Ações", que só tem botões).
// sortCollator: comparador de textos do português. Ignora maiúsculas e
// acentos ("sensitivity: base") e entende números dentro do texto
// ("numeric": "Loja 2" vem antes de "Loja 10").
const tableSortState = {};          // chave da tabela → { col, dir }
const SORT_SKIP_HEADERS = ['', 'ações'];
const sortCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

// tableSortKey: cria um "nome" fixo para identificar a tabela, mesmo que
// ela seja redesenhada pelo JS. Usa o id do <tbody>; se não houver, usa o
// id do elemento pai mais próximo + a posição da tabela dentro dele.
// Chamada pelas funções de ordenação abaixo.
// Recebe: table (elemento <table>). Devolve: texto (a chave).
function tableSortKey(table) {
  const tbody = table.tBodies[0];
  if (tbody?.id) return tbody.id;
  const owner = table.parentElement?.closest('[id]');
  const idx = owner ? [...owner.querySelectorAll('table')].indexOf(table) : 0;
  return `${owner?.id || 'tabela'}:${idx}`;
}

// Converte o conteúdo da célula em algo comparável: número ou texto (null = vazio)
// Chamada pela applyTableSort(). Recebe: td (a célula). Devolve: número,
// texto ou null.
function cellSortValue(td) {
  if (!td) return null;
  // Se a célula tiver data-sort-value, esse valor manda (vira número se
  // possível). Útil quando o texto mostrado não ordena bem sozinho.
  if (td.dataset.sortValue !== undefined) {
    const n = Number(td.dataset.sortValue);
    return td.dataset.sortValue === '' ? null : (Number.isNaN(n) ? td.dataset.sortValue : n);
  }
  // Senão, usa o texto visível (com espaços extras removidos).
  // Traço ou vazio contam como "sem valor".
  const txt = td.textContent.replace(/\s+/g, ' ').trim();
  if (!txt || txt === '–' || txt === '-') return null;

  // Data dd/mm/aaaa (com hora opcional)
  // Vira timestamp (número), para ordenar por data e não por texto.
  const d = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s*(\d{2}):(\d{2}))?/);
  if (d) return new Date(+d[3], +d[2] - 1, +d[1], +(d[4] || 0), +(d[5] || 0)).getTime();

  // Valor em reais ou número no formato brasileiro (1.234,56)
  // Tira o "R$", os pontos de milhar e troca a vírgula por ponto, que é o
  // formato de número que o JavaScript entende. Se não for número, fica
  // como texto.
  const num = txt.replace(/^R\$\s*/, '');
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(num) || /^-?\d+(,\d+)?$/.test(num)) {
    return Number(num.replace(/\./g, '').replace(',', '.'));
  }
  return txt;
}

// compareSortValues: compara dois valores vindos da cellSortValue().
// Regras: vazios vão para o fim; números vêm antes de textos; números
// são comparados pela conta; textos pelo sortCollator.
// Devolve: número negativo (a vem antes), positivo (b vem antes) ou 0.
function compareSortValues(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;                 // vazios sempre no fim
  if (b === null) return -1;
  const na = typeof a === 'number', nb = typeof b === 'number';
  if (na && nb) return a - b;
  if (na !== nb) return na ? -1 : 1;        // números antes de texto
  return sortCollator.compare(a, b);
}

// Aplica a ordenação guardada a uma tabela (ou volta à ordem original)
// Chamada pela refreshTableSorting() e pela onSortHeader().
// Recebe: table (elemento <table>). Devolve: nada (reorganiza as linhas).
function applyTableSort(table) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = [...tbody.rows];
  // Linha única de aviso ("Nenhum item…", carregando) não é ordenada
  if (rows.length < 2 || rows.some(r => [...r.cells].some(c => c.colSpan > 1))) return;

  // Guarda a ordem em que a tabela foi montada
  rows.forEach((r, i) => { if (r.dataset.origIdx === undefined) r.dataset.origIdx = i; });

  // Para cada linha, guarda: r = a linha, v = valor da coluna ordenada,
  // o = posição original. Sem ordenação ativa, ordena só pela posição
  // original (ou seja, desfaz a ordenação).
  const st = tableSortState[tableSortKey(table)];
  const items = rows.map(r => ({ r, v: st ? cellSortValue(r.cells[st.col]) : null, o: +r.dataset.origIdx }));
  items.sort((a, b) => {
    if (st) {
      const c = compareSortValues(a.v, b.v);
      // Vazios ficam no fim nos dois sentidos
      if (c) return (a.v === null || b.v === null || st.dir === 'asc') ? c : -c;
    }
    // Empate (ou sem ordenação): mantém a ordem original.
    return a.o - b.o;
  });
  // Se a ordem não mudou, não mexe na página (evita trabalho à toa).
  // Senão, move as linhas para a nova ordem dentro do <tbody>.
  if (items.every((it, i) => it.r === rows[i])) return;
  tbody.append(...items.map(it => it.r));
}

// Marca os cabeçalhos ordenáveis e mostra a seta da coluna ativa
// Chamada pela refreshTableSorting() e pela onSortHeader().
// Recebe: table. Devolve: true se a tabela usa a ordenação automática;
// false se não tem cabeçalho ou já tem ordenação própria (onclick).
function decorateSortableTable(table) {
  const ths = table.tHead ? [...table.tHead.rows[0]?.cells || []] : [];
  if (!ths.length || ths.some(th => th.hasAttribute('onclick'))) return false;

  const st = tableSortState[tableSortKey(table)];
  ths.forEach((th, i) => {
    // Pula colunas marcadas com data-no-sort e as da lista SORT_SKIP_HEADERS.
    // Nas demais: adiciona a classe "sortable" (cursor e seta no CSS),
    // tabIndex = 0 (permite chegar pelo Tab do teclado) e uma dica.
    // As classes sorted-asc / sorted-desc mostram a seta da coluna ativa;
    // aria-sort informa a ordenação aos leitores de tela.
    if (th.dataset.noSort !== undefined || SORT_SKIP_HEADERS.includes(th.textContent.trim().toLowerCase())) return;
    if (!th.classList.contains('sortable')) {
      th.classList.add('sortable');
      th.tabIndex = 0;
      th.title = 'Clique para ordenar';
    }
    const dir = st && st.col === i ? st.dir : '';
    th.classList.toggle('sorted-asc',  dir === 'asc');
    th.classList.toggle('sorted-desc', dir === 'desc');
    th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none');
  });
  // Marca a tabela como "ordenação automática ligada" (data-auto-sort="1").
  table.dataset.autoSort = '1';
  return true;
}

// tableSortObserver: o "vigia" (MutationObserver) que percebe quando
// alguma tabela da página é criada ou alterada. É criado na initTableSorting().
let tableSortObserver = null;

// refreshTableSorting: passa por todas as tabelas da página, prepara os
// cabeçalhos e reaplica a ordenação escolhida.
// Chamada pelo vigia (quando a página muda) e uma vez no início.
function refreshTableSorting() {
  document.querySelectorAll('table').forEach(table => {
    if (decorateSortableTable(table)) applyTableSort(table);
  });
  // Descarta as mudanças feitas pela própria ordenação (evita repetir)
  tableSortObserver?.takeRecords();
}

// onSortHeader: reage ao clique (ou Enter) no título de uma coluna.
// Avança o ciclo: 1º clique crescente, 2º decrescente, 3º ordem original.
// Clicar em outra coluna recomeça pelo crescente.
// Chamada pelos ouvintes de clique e teclado da initTableSorting().
// Recebe: th (a célula de título clicada). Devolve: nada.
function onSortHeader(th) {
  const table = th.closest('table');
  if (!table?.dataset.autoSort || !th.classList.contains('sortable')) return;
  const key = tableSortKey(table);
  const col = th.cellIndex;
  const st  = tableSortState[key];
  if (!st || st.col !== col) tableSortState[key] = { col, dir: 'asc' };
  else if (st.dir === 'asc')  st.dir = 'desc';
  else delete tableSortState[key];          // terceiro clique: ordem original
  // Atualiza as setas, reordena e descarta os avisos do vigia gerados
  // por esta própria reordenação.
  decorateSortableTable(table);
  applyTableSort(table);
  tableSortObserver?.takeRecords();
}

// initTableSorting: liga a ordenação automática de tabelas.
// Chamada uma única vez, no fim deste arquivo.
function initTableSorting() {
  // Um único ouvinte no documento inteiro atende todas as tabelas,
  // inclusive as que forem criadas depois (técnica chamada "delegação
  // de eventos"). O segundo ouvinte permite ordenar pelo teclado.
  document.addEventListener('click', ev => {
    const th = ev.target.closest('thead th.sortable');
    if (th) onSortHeader(th);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const th = ev.target.closest?.('thead th.sortable');
    if (th && th.closest('table')?.dataset.autoSort) { ev.preventDefault(); onSortHeader(th); }
  });

  // Reaplica a ordenação sempre que uma tabela é montada ou atualizada
  // O MutationObserver avisa a cada mudança na página. Como podem vir
  // muitos avisos seguidos, a variável "agendado" junta todos e roda a
  // atualização uma vez só, no próximo quadro de desenho da tela
  // (requestAnimationFrame).
  let agendado = false;
  tableSortObserver = new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; refreshTableSorting(); });
  });
  tableSortObserver.observe(document.body, { childList: true, subtree: true });
  refreshTableSorting();
}

// Liga a ordenação assim que o arquivo é carregado.
initTableSorting();
