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
