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
const ADMIN_PAGES = ['equipamentos', 'internet', 'relatorios', 'usuarios'];

function navigate(page) {
  if (ADMIN_PAGES.includes(page) && currentProfile?.role !== 'admin') {
    toast('Esta área é restrita a administradores.', 'err');
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
  if (page === 'equipamentos') populateLojaFilterEquip();
  if (page === 'usuarios')     loadUsuarios();
  if (page === 'internet')     loadPlanosInternet();

  try { localStorage.setItem('ti-page', page); } catch (e) {}
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

// ── Indicador de carregamento ──
function setLoading(on) {
  document.getElementById('loading-indicator').style.display = on ? 'flex' : 'none';
}

// ── Inicialização da interface ──
function initUI() {
  // Restaura página
  try {
    const saved = localStorage.getItem('ti-page');
    const valid = Object.keys(PAGE_TITLES)
      .filter(p => currentProfile?.role === 'admin' || !ADMIN_PAGES.includes(p));
    if (saved && valid.includes(saved)) {
      navigate(saved);
    } else {
      navigate('dashboard');
    }
  } catch (e) { navigate('dashboard'); }
}
