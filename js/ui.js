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
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
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
function navigate(page) {
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

  try { localStorage.setItem('ti-page', page); } catch (e) {}
}

// ── Tema ──
function toggleTheme() {
  const r    = document.documentElement;
  const cur  = r.dataset.theme || '';
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? '' : 'light';
  next ? (r.dataset.theme = next) : delete r.dataset.theme;
  try { localStorage.setItem('ti-theme', next); } catch (e) {}
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
    'Cancelado':          '',
  };
  return `<span class="badge ${map[s] || ''}">${s}</span>`;
}
function prioBadge(p) {
  const map = { 'Urgente':'badge-urgente','Alta':'badge-alta','Média':'badge-media','Baixa':'badge-baixa' };
  return `<span class="badge ${map[p] || ''}">${p}</span>`;
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
    const valid = Object.keys(PAGE_TITLES);
    if (saved && valid.includes(saved)) {
      navigate(saved);
    } else {
      navigate('dashboard');
    }
  } catch (e) { navigate('dashboard'); }
}
