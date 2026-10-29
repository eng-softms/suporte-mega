/* ═══════════════════════════════════════════
   SUPORTE MEGA – Autenticação e perfis
   ═══════════════════════════════════════════ */

let currentUser    = null;   // Objeto do usuário autenticado no Supabase
let currentProfile = null;   // Perfil: id, nome de exibição, função e e-mail
let isPasswordRecovery = false;

// ─────────────────────────────────────────
// Tela de acesso
// ─────────────────────────────────────────
function showLoginTab(tab) {
  document.getElementById('form-login').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('form-forgot-password').style.display = 'none';
  document.getElementById('form-reset-password').style.display = 'none';
  document.querySelector('.login-tabs').style.display = '';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  setLoginErr('l', '');
  setLoginErr('r', '');
  setLoginErr('f', '');
  setLoginErr('p', '');
  document.getElementById('f-note').classList.remove('show');
}

function showForgotPassword() {
  const email = document.getElementById('l-email').value.trim();
  document.getElementById('f-email').value = email;
  document.querySelector('.login-tabs').style.display = 'none';
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-register').style.display = 'none';
  document.getElementById('form-reset-password').style.display = 'none';
  document.getElementById('form-forgot-password').style.display = 'flex';
  setLoginErr('f', '');
  document.getElementById('f-note').classList.remove('show');
}

function showPasswordRecoveryForm() {
  const enteringRecovery = !isPasswordRecovery;
  isPasswordRecovery = true;
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-root').style.display = 'none';
  document.querySelector('.login-tabs').style.display = 'none';
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-register').style.display = 'none';
  document.getElementById('form-forgot-password').style.display = 'none';
  document.getElementById('form-reset-password').style.display = 'flex';
  if (enteringRecovery) {
    document.getElementById('p-senha').value = '';
    document.getElementById('p-senha-confirm').value = '';
    setLoginErr('p', '');
  }
}

function setLoginErr(form, msg) {
  const el = document.getElementById(form + '-err');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
}

async function sendPasswordRecovery() {
  const emailInput = document.getElementById('f-email');
  const email = emailInput.value.trim();
  const btn = document.getElementById('f-btn');
  const note = document.getElementById('f-note');
  setLoginErr('f', '');
  note.classList.remove('show');

  if (!email || !emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    note.textContent = 'Se esse e-mail estiver cadastrado, você receberá um link para redefinir a senha.';
    note.classList.add('show');
  } catch (e) {
    setLoginErr('f', 'Não foi possível enviar o e-mail: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar link de recuperação';
  }
}

async function updateRecoveredPassword() {
  const passwordInput = document.getElementById('p-senha');
  const confirmInput = document.getElementById('p-senha-confirm');
  const password = passwordInput.value;
  const btn = document.getElementById('p-btn');
  setLoginErr('p', '');

  if (password.length < 6) {
    setLoginErr('p', 'A senha deve ter ao menos 6 caracteres.');
    passwordInput.focus();
    return;
  }
  if (password !== confirmInput.value) {
    setLoginErr('p', 'As senhas não conferem.');
    confirmInput.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    const { error } = await supa.auth.updateUser({ password });
    if (error) throw error;
  } catch (e) {
    setLoginErr('p', 'Não foi possível atualizar a senha: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Salvar nova senha';
    return;
  }

  isPasswordRecovery = false;
  showLoginTab('login');
  try {
    const { error } = await supa.auth.signOut();
    if (error) throw error;
  } catch (e) {
    console.error('Senha atualizada, mas não foi possível encerrar a sessão de recuperação:', e);
  }
  toast('Senha atualizada com sucesso!', 'ok');
  btn.disabled = false;
  btn.textContent = 'Salvar nova senha';
}

// ── Acesso à conta ──
async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const senha = document.getElementById('l-senha').value;
  setLoginErr('l', '');
  if (!email || !senha) { setLoginErr('l', 'Preencha e-mail e senha.'); return; }

  const btn = document.getElementById('l-btn');
  btn.disabled = true; btn.textContent = 'Entrando…';

  const { error } = await supa.auth.signInWithPassword({ email, password: senha });

  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) {
    const msg = error.message.includes('Invalid login credentials')
      ? 'E-mail ou senha incorretos.'
      : error.message.includes('Email not confirmed')
      ? 'Confirme seu e-mail antes de entrar.'
      : error.message;
    setLoginErr('l', msg);
  }
  // Se der certo, onAuthStateChange chama showApp() automaticamente.
}

// ── Cadastro de conta ──
async function doRegister() {
  const nome  = document.getElementById('r-nome').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const senha = document.getElementById('r-senha').value;
  setLoginErr('r', '');

  if (!nome)           { setLoginErr('r', 'Informe seu nome ou apelido.'); return; }
  if (!email)          { setLoginErr('r', 'Informe um e-mail válido.'); return; }
  if (senha.length < 6){ setLoginErr('r', 'Senha deve ter ao menos 6 caracteres.'); return; }

  const btn = document.getElementById('r-btn');
  btn.disabled = true; btn.textContent = 'Criando conta…';

  const { data, error } = await supa.auth.signUp({
    email, password: senha,
    options: { data: { display_name: nome } }
  });

  btn.disabled = false; btn.textContent = 'Criar conta';

  if (error) { setLoginErr('r', error.message); return; }

  // Cria o perfil imediatamente (o gatilho SQL faz o mesmo, mas garantimos aqui).
  if (data?.user) {
    await supa.from('profiles').upsert({
      id:           data.user.id,
      display_name: nome,
      role:         'user',
      email:        email,
    });
  }

  // O Supabase pode exigir confirmação de e-mail (depende das configurações do projeto).
  if (!data?.session) {
    toast('Conta criada! Verifique seu e-mail para confirmar.', 'info');
    showLoginTab('login');
  }
  // Se a confirmação não for necessária, onAuthStateChange já inicia a sessão.
}

// ── Encerrar sessão ──
async function doLogout() {
  toggleUserMenu(false);
  await supa.auth.signOut();
}

// ─────────────────────────────────────────
// Observador da sessão (dispara ao entrar ou sair)
// ─────────────────────────────────────────
function initAuth() {
  supa.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user) {
      currentUser = session.user;
      showPasswordRecoveryForm();
      return;
    }

    if (isPasswordRecovery) {
      showPasswordRecoveryForm();
      return;
    }

    if (session?.user) {
      currentUser = session.user;
      await loadProfile();
      if (isPasswordRecovery) return;
      showApp();
    } else {
      currentUser    = null;
      currentProfile = null;
      hideApp();
    }
  });
}

// ─────────────────────────────────────────
// Perfil
// ─────────────────────────────────────────
async function loadProfile() {
  const { data } = await supa
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    currentProfile = data;
  } else {
    // Cria perfil se ainda não existir
    const nome = currentUser.user_metadata?.display_name
              || currentUser.email.split('@')[0];
    const profile = { id: currentUser.id, display_name: nome, role: 'user', email: currentUser.email };
    await supa.from('profiles').insert(profile);
    currentProfile = profile;
  }

  // Garante e-mail sincronizado
  if (!currentProfile.email) {
    currentProfile.email = currentUser.email;
  }

  updateUserMenuUI();
}

function updateUserMenuUI() {
  const p = currentProfile;
  if (!p) return;

  // Avatar com iniciais
  const initials = (p.display_name || '?').charAt(0).toUpperCase();
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) avatarEl.textContent = initials;

  document.getElementById('user-display-name').textContent = p.display_name;
  document.getElementById('dd-name').textContent  = p.display_name;
  document.getElementById('dd-email').textContent = p.email || currentUser?.email || '';

  // Selo de administrador no menu suspenso
  const badge = document.getElementById('dd-role-badge');
  if (badge) {
    badge.className  = `role-badge ${p.role === 'admin' ? 'role-admin' : 'role-user'}`;
    badge.textContent = p.role === 'admin' ? 'Admin' : 'Usuário';
  }

  // Mostrar ou ocultar a seção de administração na barra lateral
  const adminSection = document.getElementById('nav-admin-section');
  if (adminSection) adminSection.style.display = p.role === 'admin' ? '' : 'none';

  // Pré-preenche nome no formulário de novo chamado
  const nomeField = document.getElementById('c-nome');
  if (nomeField && !nomeField.value) nomeField.value = p.display_name;
}

// ─────────────────────────────────────────
// Mostrar ou ocultar o aplicativo
// ─────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-root').style.display     = '';
  initDb();
}

function hideApp() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-root').style.display     = 'none';
  allChamados    = [];
  allEquipamentos = [];
  setLoginErr('l', '');
  setLoginErr('r', '');
}

// ─────────────────────────────────────────
// Menu do usuário (lista suspensa)
// ─────────────────────────────────────────
function toggleUserMenu(force) {
  const dd   = document.getElementById('user-dropdown');
  const open = force !== undefined ? force : !dd.classList.contains('open');
  dd.classList.toggle('open', open);

  if (open) {
    const close = e => {
      if (!document.getElementById('user-menu-wrap').contains(e.target)) {
        dd.classList.remove('open');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

// ── Editar perfil ──
function openEditProfile() {
  toggleUserMenu(false);
  document.getElementById('perfil-nome').value = currentProfile?.display_name || '';
  openModal('modal-perfil');
}

async function saveProfile() {
  const nome = document.getElementById('perfil-nome').value.trim();
  if (!nome) { toast('Nome não pode estar vazio.', 'err'); return; }

  const btn = document.getElementById('btn-save-profile');
  btn.disabled = true; btn.textContent = 'Salvando…';

  const { error } = await supa
    .from('profiles')
    .update({ display_name: nome })
    .eq('id', currentUser.id);

  btn.disabled = false; btn.textContent = 'Salvar';

  if (error) { toast('Erro: ' + error.message, 'err'); return; }

  currentProfile.display_name = nome;
  updateUserMenuUI();
  closeModal('modal-perfil');
  toast('Perfil atualizado!', 'ok');
}

// ── Alterar senha ──
function openChangePassword() {
  toggleUserMenu(false);
  document.getElementById('senha-nova').value    = '';
  document.getElementById('senha-confirm').value = '';
  openModal('modal-senha');
}

async function savePassword() {
  const nova    = document.getElementById('senha-nova').value;
  const confirm = document.getElementById('senha-confirm').value;
  if (nova.length < 6) { toast('Senha deve ter ao menos 6 caracteres.', 'err'); return; }
  if (nova !== confirm)  { toast('As senhas não coincidem.', 'err'); return; }

  const btn = document.getElementById('btn-save-senha');
  btn.disabled = true; btn.textContent = 'Salvando…';

  const { error } = await supa.auth.updateUser({ password: nova });

  btn.disabled = false; btn.textContent = 'Salvar';

  if (error) { toast('Erro: ' + error.message, 'err'); return; }

  closeModal('modal-senha');
  toast('Senha alterada com sucesso!', 'ok');
}

// ─────────────────────────────────────────
// Gerenciar usuários (somente administrador)
// ─────────────────────────────────────────
async function loadUsuarios() {
  const el = document.getElementById('usuarios-list');
  if (!el) return;
  el.innerHTML = '<div class="loading-row"><div class="spinner"></div> Carregando usuários…</div>';

  const { data, error } = await supa
    .from('profiles')
    .select('*')
    .order('display_name');

  if (error) {
    el.innerHTML = '<div class="empty-state"><p>Erro ao carregar usuários.</p></div>';
    return;
  }

  if (!data || !data.length) {
    el.innerHTML = '<div class="empty-state"><p>Nenhum usuário encontrado.</p></div>';
    return;
  }

  const rows = data.map(u => {
    const isSelf   = u.id === currentUser?.id;
    const isAdmin  = currentProfile?.role === 'admin';
    const badge    = u.role === 'admin'
      ? '<span class="role-badge role-admin">Admin</span>'
      : '<span class="role-badge role-user">Usuário</span>';

    const actions = isAdmin && !isSelf ? `
      <button class="btn btn-ghost btn-sm" onclick="toggleRole('${u.id}','${u.role}')">
        ${u.role === 'admin' ? 'Revogar admin' : 'Tornar admin'}
      </button>` : '';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:12px">${(u.display_name||'?').charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:500">${esc(u.display_name)}${isSelf ? ' <span style="color:var(--fg3);font-size:11px">(você)</span>' : ''}</div>
            <div style="font-size:11px;color:var(--fg3)">${esc(u.email || '')}</div>
          </div>
        </div>
      </td>
      <td>${badge}</td>
      <td><span style="font-size:11px;color:var(--fg3);font-family:var(--mono)">${u.id.substring(0,8)}…</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Usuário</th><th>Perfil</th><th>ID</th><th>Ações</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:12px;color:var(--fg3);margin-top:12px">
      ${data.length} usuário(s) cadastrado(s)
    </p>`;
}

async function toggleRole(userId, currentRole) {
  if (!confirm(currentRole === 'admin'
    ? 'Revogar permissão de admin deste usuário?'
    : 'Conceder permissão de admin a este usuário?')) return;

  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  const { error } = await supa
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Permissão atualizada!', 'ok');
  loadUsuarios();
}

// Tecla Enter nos campos de login
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const loginVisible = document.getElementById('form-login')?.style.display !== 'none'
    && document.getElementById('login-screen')?.style.display !== 'none';
  const regVisible   = document.getElementById('form-register')?.style.display !== 'none'
    && document.getElementById('login-screen')?.style.display !== 'none';
  const forgotVisible = document.getElementById('form-forgot-password')?.style.display !== 'none'
    && document.getElementById('login-screen')?.style.display !== 'none';
  const resetVisible = document.getElementById('form-reset-password')?.style.display !== 'none'
    && document.getElementById('login-screen')?.style.display !== 'none';

  if (loginVisible && (
    document.activeElement === document.getElementById('l-email') ||
    document.activeElement === document.getElementById('l-senha')
  )) doLogin();

  if (regVisible && (
    document.activeElement === document.getElementById('r-nome')  ||
    document.activeElement === document.getElementById('r-email') ||
    document.activeElement === document.getElementById('r-senha')
  )) doRegister();

  if (forgotVisible && document.activeElement === document.getElementById('f-email')) {
    sendPasswordRecovery();
  }

  if (resetVisible && (
    document.activeElement === document.getElementById('p-senha') ||
    document.activeElement === document.getElementById('p-senha-confirm')
  )) updateRecoveredPassword();
});
