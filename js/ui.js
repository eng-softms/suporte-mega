/* ═══════════════════════════════════════════
   SUPORTE MEGA – Auxiliares da interface
   (notificações, janelas modais, navegação, tema e barra lateral)
   ═══════════════════════════════════════════ */

// ── Notificações ──
function toast(msg, type = 'ok') {
  const c  = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className  = `toast ${type}`;
  el.textContent = msg;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.title = 'Clique para fechar';
  c.appendChild(el);

  // Sai com animação; clicar fecha antes do tempo
  const dismiss = () => {
    if (el.classList.contains('hide')) return;
    el.classList.add('hide');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, type === 'err' ? 5000 : 3500);
}

// ── Janelas modais ──
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Fecha ao clicar na camada de sobreposição
document.addEventListener('click', ev => {
  if (ev.target.classList.contains('modal-overlay')) {
    ev.target.classList.remove('open');
  }
});

// Fecha a janela aberta (ou o menu do usuário) com a tecla Esc
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
  if (open) { open.classList.remove('open'); return; }
  if (document.getElementById('user-dropdown')?.classList.contains('open')) toggleUserMenu(false);
});

// ── Reação ao clique: onda que parte do ponto tocado ──
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

// Linhas e itens clicáveis também abrem pelo teclado (Enter ou espaço)
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest?.('[data-open-id]');
  if (!el || ev.target !== el) return;
  ev.preventDefault();
  openDetalhe(el.dataset.openId);
});

// ── Barra lateral ──
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
const ADMIN_PAGES = ['equipamentos', 'internet', 'aquisicoes', 'tickets', 'relatorios', 'usuarios'];
const SUPERADMIN_PAGES = ['equipamentos', 'aquisicoes'];

function navigate(page) {
  if (ADMIN_PAGES.includes(page) && !hasAdminAccess()) {
    toast('Esta área é restrita a administradores.', 'err');
    return;
  }
  if (SUPERADMIN_PAGES.includes(page) && !isSuperAdmin()) {
    toast('Esta área é restrita ao super administrador.', 'err');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) return;

  pageEl.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  closeSidebar();

  // Ações executadas ao abrir cada página
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

  currentPage = page;
}

// Página atual; volta a null ao sair, para o próximo login abrir a página inicial
let currentPage = null;

// Página aberta após o login: administradores vão para Início, usuários comuns para Chamados
function homePage() {
  return hasAdminAccess() ? 'dashboard' : 'chamados';
}

// ── Tema ──
function toggleTheme() {
  const r    = document.documentElement;
  const cur  = r.dataset.theme || '';
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? '' : 'light';
  next ? (r.dataset.theme = next) : delete r.dataset.theme;
  try { localStorage.setItem('ti-theme', next); } catch (e) {}
  toast(`Tema: ${next === 'light' ? 'claro' : next === 'dark' ? 'escuro' : 'automático (sistema)'}`, 'info');
}

// Restaura tema salvo
try {
  const t = localStorage.getItem('ti-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}

// ── Funções auxiliares de formatação ──
function fmtDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtDateShort(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('pt-BR');
}
function fmtRelTime(ts) {
  if (!ts) return '–';
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
function prioBadge(p) {
  const map = { 'Urgente':'badge-urgente','Alta':'badge-alta','Média':'badge-media','Baixa':'badge-baixa' };
  return `<span class="badge ${map[p] || ''}">${esc(p)}</span>`;
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Exportação de planilhas (CSV e Excel) ──
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// Carrega a biblioteca do Excel só quando alguém exporta
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

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Data/hora (ms) → número de série do Excel no horário local.
// Calculado à mão para evitar o deslocamento de fuso da biblioteca.
function excelDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

// Gera um CSV (com BOM para o Excel abrir os acentos corretamente)
function downloadCSV(name, header, rows) {
  const cell = v => `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
  const csv  = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name);
}

// Gera um .xlsx com uma ou mais abas.
// sheets: [{ name, header, rows, widths?, money?: ['F'], dates?: ['B'] ou { B: 'dd/mm/yyyy' } }]
// Nas colunas de "dates" os valores devem vir de excelDate(); padrão: data e hora.
async function downloadXLSX(name, sheets) {
  const XLSX = await loadXlsxLib();
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const dates = Array.isArray(sh.dates)
      ? Object.fromEntries(sh.dates.map(col => [col, 'dd/mm/yyyy hh:mm']))
      : (sh.dates || {});
    // "footer": linhas de total, fora do autofiltro
    const footer = sh.footer || [];
    const ws = XLSX.utils.aoa_to_sheet([sh.header, ...sh.rows, ...footer]);
    ws['!cols'] = (sh.widths || sh.header.map(h => Math.max(12, String(h).length + 2))).map(wch => ({ wch }));
    if (sh.rows.length) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.rows.length, c: sh.header.length - 1 } }) };
    }
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
  XLSX.writeFile(wb, name);
}

// Data local AAAA-MM-DD para nomes de arquivo
function fileDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Protocolo do chamado (ex.: 2026-00042). Se o script SQL do protocolo
// ainda não foi executado, usa o início do ID como antes.
function protocoloChamado(c) {
  return c?.protocolo || (c?.id ? String(c.id).substring(0, 6) : '');
}

// ── Indicador de carregamento ──
function setLoading(on) {
  document.getElementById('loading-indicator').style.display = on ? 'flex' : 'none';
}

// ── Inicialização da interface ──
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
const tableSortState = {};          // chave da tabela → { col, dir }
const SORT_SKIP_HEADERS = ['', 'ações'];
const sortCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function tableSortKey(table) {
  const tbody = table.tBodies[0];
  if (tbody?.id) return tbody.id;
  const owner = table.parentElement?.closest('[id]');
  const idx = owner ? [...owner.querySelectorAll('table')].indexOf(table) : 0;
  return `${owner?.id || 'tabela'}:${idx}`;
}

// Converte o conteúdo da célula em algo comparável: número ou texto (null = vazio)
function cellSortValue(td) {
  if (!td) return null;
  if (td.dataset.sortValue !== undefined) {
    const n = Number(td.dataset.sortValue);
    return td.dataset.sortValue === '' ? null : (Number.isNaN(n) ? td.dataset.sortValue : n);
  }
  const txt = td.textContent.replace(/\s+/g, ' ').trim();
  if (!txt || txt === '–' || txt === '-') return null;

  // Data dd/mm/aaaa (com hora opcional)
  const d = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s*(\d{2}):(\d{2}))?/);
  if (d) return new Date(+d[3], +d[2] - 1, +d[1], +(d[4] || 0), +(d[5] || 0)).getTime();

  // Valor em reais ou número no formato brasileiro (1.234,56)
  const num = txt.replace(/^R\$\s*/, '');
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(num) || /^-?\d+(,\d+)?$/.test(num)) {
    return Number(num.replace(/\./g, '').replace(',', '.'));
  }
  return txt;
}

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
function applyTableSort(table) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = [...tbody.rows];
  // Linha única de aviso ("Nenhum item…", carregando) não é ordenada
  if (rows.length < 2 || rows.some(r => [...r.cells].some(c => c.colSpan > 1))) return;

  // Guarda a ordem em que a tabela foi montada
  rows.forEach((r, i) => { if (r.dataset.origIdx === undefined) r.dataset.origIdx = i; });

  const st = tableSortState[tableSortKey(table)];
  const items = rows.map(r => ({ r, v: st ? cellSortValue(r.cells[st.col]) : null, o: +r.dataset.origIdx }));
  items.sort((a, b) => {
    if (st) {
      const c = compareSortValues(a.v, b.v);
      // Vazios ficam no fim nos dois sentidos
      if (c) return (a.v === null || b.v === null || st.dir === 'asc') ? c : -c;
    }
    return a.o - b.o;
  });
  if (items.every((it, i) => it.r === rows[i])) return;
  tbody.append(...items.map(it => it.r));
}

// Marca os cabeçalhos ordenáveis e mostra a seta da coluna ativa
function decorateSortableTable(table) {
  const ths = table.tHead ? [...table.tHead.rows[0]?.cells || []] : [];
  if (!ths.length || ths.some(th => th.hasAttribute('onclick'))) return false;

  const st = tableSortState[tableSortKey(table)];
  ths.forEach((th, i) => {
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
  table.dataset.autoSort = '1';
  return true;
}

let tableSortObserver = null;

function refreshTableSorting() {
  document.querySelectorAll('table').forEach(table => {
    if (decorateSortableTable(table)) applyTableSort(table);
  });
  // Descarta as mudanças feitas pela própria ordenação (evita repetir)
  tableSortObserver?.takeRecords();
}

function onSortHeader(th) {
  const table = th.closest('table');
  if (!table?.dataset.autoSort || !th.classList.contains('sortable')) return;
  const key = tableSortKey(table);
  const col = th.cellIndex;
  const st  = tableSortState[key];
  if (!st || st.col !== col) tableSortState[key] = { col, dir: 'asc' };
  else if (st.dir === 'asc')  st.dir = 'desc';
  else delete tableSortState[key];          // terceiro clique: ordem original
  decorateSortableTable(table);
  applyTableSort(table);
  tableSortObserver?.takeRecords();
}

function initTableSorting() {
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
  let agendado = false;
  tableSortObserver = new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; refreshTableSorting(); });
  });
  tableSortObserver.observe(document.body, { childList: true, subtree: true });
  refreshTableSorting();
}

initTableSorting();
