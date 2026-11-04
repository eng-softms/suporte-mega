/* ═══════════════════════════════════════════
   SUPORTE MEGA – Autenticação e perfis
   ═══════════════════════════════════════════ */

let currentUser    = null;   // Objeto do usuário autenticado no Supabase
let currentProfile = null;   // Perfil: id, nome de exibição, função e e-mail
let isPasswordRecovery = false;
let pendingLoginErr = null;  // Mensagem a exibir na tela de acesso após encerrar a sessão
let usuariosById = {};       // Perfis listados em "Gerenciar Usuários", por id

// Retorno do link enviado por e-mail no cadastro ('ok' ou mensagem de erro).
// Lido antes de o Supabase ser criado (app.js): o hash é removido para que o
// link não abra uma sessão; a pessoa entra depois pela tela de login.
let emailConfirmation = readEmailConfirmation();

function readEmailConfirmation() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  let result = null;
  if (params.get('type') === 'signup') {
    result = 'ok';
  } else if (params.get('error_code') || params.get('error_description')) {
    result = params.get('error_code') === 'otp_expired'
      ? 'Este link de confirmação expirou ou já foi usado.'
      : 'Não foi possível validar o link de confirmação.';
  }
  if (result) history.replaceState(null, '', window.location.pathname + window.location.search);
  return result;
}

function showEmailConfirmed() {
  const ok = emailConfirmation === 'ok';
  document.documentElement.classList.remove('booting');
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-root').style.display = 'none';
  document.querySelector('.login-tabs').style.display = 'none';
  ['form-login', 'form-register', 'form-forgot-password', 'form-reset-password']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });

  document.getElementById('ec-icon').classList.toggle('err', !ok);
  if (!ok) {
    document.getElementById('ec-icon').innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    document.getElementById('ec-title').textContent = 'Não foi possível confirmar';
    document.getElementById('ec-text').textContent = emailConfirmation +
      ' Vá para a página de login e tente entrar; se não conseguir, faça o cadastro novamente para receber um novo link.';
  }
  document.getElementById('form-email-confirmed').style.display = 'flex';
}

// Sai da tela de confirmação e retoma o fluxo normal de acesso
async function leaveEmailConfirmed() {
  emailConfirmation = null;
  document.getElementById('form-email-confirmed').style.display = 'none';
  showLoginTab('login');
  const { data } = await supa.auth.getSession();
  handleAuthChange('INITIAL_SESSION', data?.session);
}

const ROLE_LABELS ={ superadmin: 'Super Admin', admin: 'Admin', user: 'Usuário' };

// Administrador e super administrador acessam a área administrativa
function hasAdminAccess() {
  return currentProfile?.role === 'admin' || currentProfile?.role === 'superadmin';
}

// Somente o super administrador altera funções e e-mails autorizados
function isSuperAdmin() {
  return currentProfile?.role === 'superadmin';
}

function roleBadge(role) {
  const cls = role === 'superadmin' ? 'role-superadmin' : role === 'admin' ? 'role-admin' : 'role-user';
  return `<span class="role-badge ${cls}">${ROLE_LABELS[role] || ROLE_LABELS.user}</span>`;
}

// ─────────────────────────────────────────
// Tela de acesso
// ─────────────────────────────────────────
function showLoginTab(tab) {
  // 'flex' (e não '') para manter o espaçamento entre os campos
  document.getElementById('form-login').style.display    = tab === 'login'    ? 'flex' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'flex' : 'none';
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
  document.documentElement.classList.remove('booting');
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

  let error;
  try {
    ({ error } = await supa.auth.signInWithPassword({ email, password: senha }));
  } catch (e) {
    error = { message: 'Falha de conexão com o servidor. Tente novamente.' };
  }

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
  const email = document.getElementById('r-email').value.trim().toLowerCase();
  const senha = document.getElementById('r-senha').value;
  setLoginErr('r', '');

  if (!nome)           { setLoginErr('r', 'Informe seu nome ou apelido.'); return; }
  if (!email)          { setLoginErr('r', 'Informe um e-mail válido.'); return; }
  if (senha.length < 6){ setLoginErr('r', 'Senha deve ter ao menos 6 caracteres.'); return; }

  const btn = document.getElementById('r-btn');
  btn.disabled = true; btn.textContent = 'Criando conta…';

  // O link de confirmação volta para esta mesma página, que mostra a mensagem de sucesso
  const { data, error } = await supa.auth.signUp({
    email, password: senha,
    options: {
      data: { display_name: nome },
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    }
  });

  btn.disabled = false; btn.textContent = 'Criar conta';

  if (error) {
    // O gatilho do banco recusa e-mails fora da lista; o Supabase devolve um erro genérico
    const msg = error.message.includes('Database error saving new user')
      ? 'Este e-mail não está autorizado a se cadastrar. Procure o suporte de TI.'
      : error.message;
    setLoginErr('r', msg);
    return;
  }

  // O perfil é criado pelo gatilho SQL; a função (role) é sempre definida pelo banco.

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
  // O callback não pode aguardar chamadas ao Supabase: isso trava o login (deadlock
  // no lock da sessão). Por isso o tratamento roda fora dele, com setTimeout.
  supa.auth.onAuthStateChange((event, session) => {
    setTimeout(() => handleAuthChange(event, session), 0);
  });
}

async function handleAuthChange(event, session) {
  if (emailConfirmation) {
    showEmailConfirmed();
    return;
  }

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
    if (!(await checkAuthorized())) return;
    if (isPasswordRecovery) return;
    showApp();
  } else {
    currentUser    = null;
    currentProfile = null;
    hideApp();
  }
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
    const profile = { id: currentUser.id, display_name: nome, email: currentUser.email };
    await supa.from('profiles').insert(profile);
    currentProfile = { ...profile, role: 'user' };
  }

  // Garante e-mail sincronizado
  if (!currentProfile.email) {
    currentProfile.email = currentUser.email;
  }

  updateUserMenuUI();
}

// Contas com e-mail fora da lista de autorizados não entram no sistema.
// Administradores passam sempre, para nunca ficarem trancados do lado de fora.
async function checkAuthorized() {
  if (hasAdminAccess()) return true;
  const { data, error } = await supa.rpc('is_authorized');
  if (error || data) return true; // falha de rede: as políticas do banco continuam protegendo os dados
  // hideApp() limpa os erros ao receber o evento de saída; a mensagem é exibida depois disso
  pendingLoginErr = 'Seu e-mail não está autorizado a acessar o sistema. Procure o suporte de TI.';
  await supa.auth.signOut();
  return false;
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

  // Selo da função no menu suspenso
  const badge = document.getElementById('dd-role-badge');
  if (badge) badge.outerHTML = roleBadge(p.role).replace('<span ', '<span id="dd-role-badge" ');

  // Mostrar ou ocultar a seção de administração na barra lateral
  const adminSection = document.getElementById('nav-admin-section');
  if (adminSection) adminSection.style.display = hasAdminAccess() ? '' : 'none';

  // Pré-preenche nome no formulário de novo chamado
  const nomeField = document.getElementById('c-nome');
  if (nomeField && !nomeField.value) nomeField.value = p.display_name;
}

// ─────────────────────────────────────────
// Mostrar ou ocultar o aplicativo
// ─────────────────────────────────────────
// Usuário para o qual o app já foi iniciado: o Supabase repete o evento de login
// (ao abrir a página e ao voltar para a aba) e não queremos recarregar tudo a cada vez.
let appStartedFor = null;

function showApp() {
  document.documentElement.classList.remove('booting');
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-root').style.display     = '';
  if (appStartedFor === currentUser?.id) return;
  appStartedFor = currentUser?.id;
  initDb();
  maybeOfferInstall(); // install.js — convite para instalar o aplicativo
}

function hideApp() {
  document.documentElement.classList.remove('booting');
  appStartedFor = null;
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-root').style.display     = 'none';
  allChamados    = [];
  allEquipamentos = [];
  allPlanosInternet = [];
  allAquisicoes = [];
  setLoginErr('l', '');
  setLoginErr('r', '');
  if (pendingLoginErr) {
    showLoginTab('login');
    setLoginErr('l', pendingLoginErr);
    pendingLoginErr = null;
  }
}

// ─────────────────────────────────────────
// Menu do usuário (lista suspensa)
// ─────────────────────────────────────────
function toggleUserMenu(force) {
  const dd   = document.getElementById('user-dropdown');
  const open = force !== undefined ? force : !dd.classList.contains('open');
  dd.classList.toggle('open', open);
  document.querySelector('.user-menu-btn')?.setAttribute('aria-expanded', String(open));

  if (open) {
    const close = e => {
      if (!document.getElementById('user-menu-wrap').contains(e.target)) {
        dd.classList.remove('open');
        document.querySelector('.user-menu-btn')?.setAttribute('aria-expanded', 'false');
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

  const canManage = isSuperAdmin();
  usuariosById = Object.fromEntries(data.map(u => [u.id, u]));
  const rows = data.map(u => {
    const isSelf = u.id === currentUser?.id;

    // O super administrador não altera a própria função, para não se trancar fora
    const actions = canManage && !isSelf
      ? ['user', 'admin', 'superadmin']
          .filter(r => r !== u.role)
          .map(r => `<button class="btn btn-ghost btn-sm" onclick="setRole('${u.id}','${r}')">
              ${r === 'user' ? 'Tornar usuário comum' : r === 'admin' ? 'Tornar admin' : 'Tornar super admin'}
            </button>`)
          .join('') +
        `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Excluir</button>`
      : '';

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
      <td>${roleBadge(u.role)}</td>
      <td><span style="font-size:11px;color:var(--fg3);font-family:var(--mono)">${u.id.substring(0,8)}…</span></td>
      <td><div style="display:flex;flex-wrap:wrap;gap:4px">${actions}</div></td>
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

async function setRole(userId, newRole) {
  if (!confirm(`Alterar a função deste usuário para "${ROLE_LABELS[newRole]}"?`)) return;

  const { error } = await supa
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Função atualizada!', 'ok');
  loadUsuarios();
}

// Exclui a conta de vez (somente super administrador; a função SQL confere isso).
// Os chamados abertos pela pessoa continuam no sistema, sem o vínculo com a conta.
async function deleteUser(userId) {
  const u = usuariosById[userId];
  const quem = u ? `${u.display_name} (${u.email || 'sem e-mail'})` : 'este usuário';
  if (!confirm(`Excluir a conta de ${quem}?\n\nEssa ação não pode ser desfeita. ` +
    'Para impedir um novo cadastro, remova também o e-mail da lista de autorizados.')) return;

  const { error } = await supa.rpc('delete_user', { target: userId });
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Usuário excluído.', 'ok');
  loadUsuarios();
}

// ─────────────────────────────────────────
// E-mails autorizados a se cadastrar (somente super administrador)
// ─────────────────────────────────────────
async function loadAllowedEmails() {
  const section = document.getElementById('allowed-emails-section');
  if (!section) return;
  section.style.display = isSuperAdmin() ? '' : 'none';
  if (!isSuperAdmin()) return;

  const el = document.getElementById('allowed-emails-list');
  el.innerHTML = '<div class="loading-row"><div class="spinner"></div> Carregando e-mails…</div>';

  const { data, error } = await supa
    .from('allowed_emails')
    .select('email')
    .order('email');

  if (error) {
    el.innerHTML = '<div class="empty-state"><p>Erro ao carregar e-mails autorizados.</p></div>';
    return;
  }

  const rows = data.map(a => `<tr>
      <td>${esc(a.email)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="removeAllowedEmail('${esc(a.email)}')">Remover</button></td>
    </tr>`).join('');

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>E-mail</th><th>Ações</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:12px;color:var(--fg3);margin-top:12px">
      ${data.length} e-mail(s) autorizado(s)
    </p>`;
}

async function addAllowedEmail() {
  const input = document.getElementById('allowed-email-input');
  const email = input.value.trim().toLowerCase();
  if (!email || !input.checkValidity()) { input.reportValidity(); return; }

  const { error } = await supa.from('allowed_emails').insert({ email });
  if (error) {
    toast(error.code === '23505' ? 'Este e-mail já está autorizado.' : 'Erro: ' + error.message, 'err');
    return;
  }
  input.value = '';
  toast('E-mail autorizado!', 'ok');
  loadAllowedEmails();
}

async function removeAllowedEmail(email) {
  if (!confirm(`Remover "${email}" da lista? Essa pessoa não poderá mais se cadastrar nem acessar o sistema.`)) return;

  const { error } = await supa.from('allowed_emails').delete().eq('email', email);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('E-mail removido.', 'ok');
  loadAllowedEmails();
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
