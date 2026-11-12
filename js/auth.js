/* ═══════════════════════════════════════════
   SUPORTE MEGA – Autenticação e perfis

   Para que serve este arquivo:
   - Tudo o que envolve QUEM está usando o sistema:
     • tela de acesso: entrar (login), cadastrar, "esqueci a senha",
       redefinir senha e a mensagem de "e-mail confirmado";
     • observador da sessão: percebe quando a pessoa entra ou sai e mostra
       o sistema ou a tela de login;
     • perfil da pessoa (nome, função) e menu do usuário (canto superior);
     • alterar nome e senha;
     • página "Gerenciar Usuários" (admin vê; super admin altera funções,
       exclui contas e cuida da lista de e-mails autorizados).

   Perfis de acesso (campo "role" da tabela profiles):
   - 'user'       → Usuário comum: abre e acompanha os próprios chamados.
   - 'admin'      → Admin: acessa a área administrativa.
   - 'superadmin' → Super Admin: tudo do admin + equipamentos, prioridade,
                    funções dos usuários e e-mails autorizados.
   A função de cada pessoa é definida no BANCO (gatilho SQL), nunca pela tela.

   Tabelas e funções do Supabase usadas aqui:
   - supa.auth (login, cadastro, sessão, troca de senha);
   - tabela "profiles" (perfil de cada pessoa);
   - tabela "allowed_emails" (e-mails autorizados a se cadastrar);
   - funções SQL "is_authorized" e "delete_user" (chamadas via supa.rpc).

   Com quem conversa:
   - app.js: cria "supa" e chama initAuth(); showApp() daqui chama initDb().
   - ui.js: toast, openModal/closeModal, esc, currentPage e a navegação
     (que chama loadUsuarios/loadAllowedEmails e usa hasAdminAccess/isSuperAdmin).
   - chamados.js, equipamentos.js, internet.js, aquisicoes.js, tickets.js:
     usam currentUser, currentProfile, hasAdminAccess() e isSuperAdmin();
     hideApp() daqui limpa as listas globais desses arquivos.
   - install.js: showApp() chama maybeOfferInstall().
   - index.html: os botões da tela chamam várias funções daqui (onclick).
   ═══════════════════════════════════════════ */

// ── Variáveis globais (valem para todo o sistema) ──
let currentUser    = null;   // Objeto do usuário autenticado no Supabase
let currentProfile = null;   // Perfil: id, nome de exibição, função e e-mail
// Verdadeiro enquanto a pessoa está no meio da redefinição de senha (veio do
// link "esqueci a senha"). Enquanto isso, o sistema NÃO é aberto: só a tela
// de nova senha.
let isPasswordRecovery = false;
let pendingLoginErr = null;  // Mensagem a exibir na tela de acesso após encerrar a sessão
let usuariosById = {};       // Perfis listados em "Gerenciar Usuários", por id

// Retorno do link enviado por e-mail no cadastro ('ok' ou mensagem de erro).
// Lido antes de o Supabase ser criado (app.js): o hash é removido para que o
// link não abra uma sessão; a pessoa entra depois pela tela de login.
// (Hash é a parte do endereço depois do "#".)
let emailConfirmation = readEmailConfirmation();

// readEmailConfirmation: lê o endereço da página para saber se a pessoa
// chegou clicando no link de confirmação de cadastro enviado por e-mail.
// - Chamada por: a linha acima, uma vez, assim que este arquivo carrega.
// - Devolve: 'ok' (link válido), uma mensagem de erro (link vencido ou
//   inválido) ou null (a pessoa não veio de um link de confirmação).
function readEmailConfirmation() {
  // O Supabase coloca as informações depois do "#", ex.: #type=signup&...
  const params = new URLSearchParams(window.location.hash.slice(1));
  let result = null;
  if (params.get('type') === 'signup') {
    // Link de cadastro válido
    result = 'ok';
  } else if (params.get('error_code') || params.get('error_description')) {
    // O Supabase devolveu erro; "otp_expired" = link vencido ou já usado
    result = params.get('error_code') === 'otp_expired'
      ? 'Este link de confirmação expirou ou já foi usado.'
      : 'Não foi possível validar o link de confirmação.';
  }
  // Limpa o "#..." do endereço sem recarregar a página, para o Supabase não
  // abrir uma sessão sozinho com esse link.
  if (result) history.replaceState(null, '', window.location.pathname + window.location.search);
  return result;
}

// showEmailConfirmed: mostra na tela de acesso o quadro "E-mail confirmado"
// (ou "Não foi possível confirmar"), escondendo todos os outros formulários.
// - Chamada por: handleAuthChange(), quando emailConfirmation tem valor.
// - Usa a variável global emailConfirmation; não recebe nem devolve nada.
function showEmailConfirmed() {
  const ok = emailConfirmation === 'ok';
  // Tira a tela de abertura ("booting") e mostra a tela de login no lugar do sistema
  document.documentElement.classList.remove('booting');
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-root').style.display = 'none';
  document.querySelector('.login-tabs').style.display = 'none';
  ['form-login', 'form-register', 'form-forgot-password', 'form-reset-password']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });

  // Em caso de erro: ícone vermelho com "X", título e texto explicando o que fazer.
  // Em caso de sucesso, o quadro já vem pronto no index.html (ícone de "certo").
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
// - Chamada por: botão do quadro "E-mail confirmado" (index.html).
// - Limpa o aviso, volta para a aba "Entrar" e pergunta ao Supabase se já
//   existe sessão aberta; o resultado segue para handleAuthChange(), que
//   decide entre abrir o sistema ou manter a tela de login.
async function leaveEmailConfirmed() {
  emailConfirmation = null;
  document.getElementById('form-email-confirmed').style.display = 'none';
  showLoginTab('login');
  const { data } = await supa.auth.getSession();
  handleAuthChange('INITIAL_SESSION', data?.session);
}

// ROLE_LABELS: nome amigável de cada função (perfil de acesso), exibido nos
// selos coloridos e nas confirmações de "Gerenciar Usuários".
const ROLE_LABELS ={ superadmin: 'Super Admin', admin: 'Admin', user: 'Usuário' };

// Administrador e super administrador acessam a área administrativa
// hasAdminAccess: devolve true se a pessoa logada for admin OU super admin.
// - Chamada por muitos arquivos (ui.js, chamados.js…) para decidir o que
//   mostrar. O "?." evita erro quando o perfil ainda não foi carregado.
function hasAdminAccess() {
  return currentProfile?.role === 'admin' || currentProfile?.role === 'superadmin';
}

// Somente o super administrador altera funções e e-mails autorizados
// isSuperAdmin: devolve true apenas para o super admin. Também libera
// equipamentos e a troca de prioridade (app.js, chamados.js, ui.js).
// Atenção: esconder botões na tela é só conforto; quem realmente bloqueia é
// o banco de dados (políticas de segurança do Supabase).
function isSuperAdmin() {
  return currentProfile?.role === 'superadmin';
}

// roleBadge: monta o HTML do selo colorido com o nome da função.
// - Recebe: role ('user', 'admin' ou 'superadmin').
// - Devolve: texto HTML (<span>). Função desconhecida vira "Usuário".
// - Chamada por: updateUserMenuUI() (menu do usuário) e loadUsuarios() (tabela).
function roleBadge(role) {
  const cls = role === 'superadmin' ? 'role-superadmin' : role === 'admin' ? 'role-admin' : 'role-user';
  return `<span class="role-badge ${cls}">${ROLE_LABELS[role] || ROLE_LABELS.user}</span>`;
}

// ─────────────────────────────────────────
// Tela de acesso
// ─────────────────────────────────────────
// A tela de acesso tem vários formulários no mesmo lugar (entrar, cadastrar,
// esqueci a senha, nova senha, e-mail confirmado). As funções abaixo
// mostram um e escondem os outros, mudando o estilo "display".

// showLoginTab: mostra a aba "Entrar" ou a aba "Cadastrar".
// - Recebe: tab = 'login' ou 'register'.
// - Chamada por: abas e links da tela de acesso (index.html) e por várias
//   funções deste arquivo depois de cadastrar, sair ou trocar a senha.
// Também apaga mensagens de erro antigas de todos os formulários.
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

// showForgotPassword: mostra o formulário "Esqueci minha senha".
// - Chamada por: link "Esqueci minha senha" na aba Entrar (index.html).
// Copia o e-mail já digitado no login, para a pessoa não digitar de novo.
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

// showPasswordRecoveryForm: mostra o formulário "Criar nova senha".
// - Chamada por: handleAuthChange(), quando a pessoa chega pelo link de
//   recuperação de senha recebido por e-mail.
// Liga o modo de recuperação (isPasswordRecovery) para o sistema não abrir
// antes de a senha ser trocada. Só limpa os campos na PRIMEIRA vez, para
// não apagar o que a pessoa está digitando se o Supabase repetir o evento.
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

// setLoginErr: mostra (ou apaga) a mensagem de erro de um formulário da tela de acesso.
// - Recebe: form = letra do formulário ('l' login, 'r' cadastro,
//   'f' esqueci a senha, 'p' nova senha) e msg = texto do erro ('' apaga).
// - O elemento procurado tem o id "<letra>-err", ex.: "l-err".
function setLoginErr(form, msg) {
  const el = document.getElementById(form + '-err');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
}

// sendPasswordRecovery: pede ao Supabase que envie o e-mail com o link de
// redefinição de senha.
// - Chamada por: botão "Enviar link de recuperação" ou Enter no campo de
//   e-mail do formulário "Esqueci minha senha".
async function sendPasswordRecovery() {
  const emailInput = document.getElementById('f-email');
  const email = emailInput.value.trim();
  const btn = document.getElementById('f-btn');
  const note = document.getElementById('f-note');
  setLoginErr('f', '');
  note.classList.remove('show');

  // Validação: e-mail vazio ou mal escrito → o navegador mostra o aviso no campo
  if (!email || !emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }

  // Desativa o botão enquanto envia, para evitar cliques repetidos
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    // redirectTo: o link do e-mail traz a pessoa de volta a esta mesma página
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    // A mensagem é propositalmente vaga ("se esse e-mail estiver cadastrado")
    // para não revelar a estranhos quais e-mails existem no sistema.
    note.textContent = 'Se esse e-mail estiver cadastrado, você receberá um link para redefinir a senha.';
    note.classList.add('show');
  } catch (e) {
    setLoginErr('f', 'Não foi possível enviar o e-mail: ' + e.message);
  } finally {
    // Com ou sem erro, reativa o botão
    btn.disabled = false;
    btn.textContent = 'Enviar link de recuperação';
  }
}

// updateRecoveredPassword: grava a nova senha escolhida no formulário
// "Criar nova senha" (pessoa que veio pelo link de recuperação).
// - Chamada por: botão "Salvar nova senha" ou Enter no último campo.
// Depois de salvar, encerra a sessão de recuperação e manda a pessoa para a
// tela de login, para ela entrar com a senha nova.
async function updateRecoveredPassword() {
  const passwordInput = document.getElementById('p-senha');
  const confirmInput = document.getElementById('p-senha-confirm');
  const password = passwordInput.value;
  const btn = document.getElementById('p-btn');
  setLoginErr('p', '');

  // Validações: mínimo de 6 caracteres e as duas senhas iguais
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
    // Supabase: troca a senha da conta da sessão de recuperação aberta pelo link
    const { error } = await supa.auth.updateUser({ password });
    if (error) throw error;
  } catch (e) {
    // Falhou: mostra o erro e devolve o botão para nova tentativa
    setLoginErr('p', 'Não foi possível atualizar a senha: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Salvar nova senha';
    return;
  }

  // Deu certo: sai do modo de recuperação e encerra a sessão aberta pelo
  // link. Se o encerramento falhar, a senha já foi trocada mesmo assim;
  // só registramos o problema no console.
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
// doLogin: faz o login com e-mail e senha.
// - Chamada por: botão "Entrar" ou Enter no campo de senha (tela de acesso).
// - Não abre o sistema diretamente: se o login der certo, o Supabase avisa
//   o observador da sessão (initAuth → handleAuthChange → showApp).
async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const senha = document.getElementById('l-senha').value;
  setLoginErr('l', '');
  // Validação: os dois campos são obrigatórios
  if (!email || !senha) { setLoginErr('l', 'Preencha e-mail e senha.'); return; }

  const btn = document.getElementById('l-btn');
  btn.disabled = true; btn.textContent = 'Entrando…';

  // Supabase: confere e-mail e senha. O try/catch cobre falta de internet
  // (nesse caso o Supabase nem responde, e montamos a mensagem nós mesmos).
  let error;
  try {
    ({ error } = await supa.auth.signInWithPassword({ email, password: senha }));
  } catch (e) {
    error = { message: 'Falha de conexão com o servidor. Tente novamente.' };
  }

  btn.disabled = false; btn.textContent = 'Entrar';
  // Traduz para português as mensagens mais comuns do Supabase (que vêm em inglês)
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
// doRegister: cria uma conta nova no Supabase.
// - Chamada por: botão "Criar conta" ou Enter no último campo da aba Cadastrar.
// - Regra de negócio: só e-mails da lista de autorizados (tabela
//   allowed_emails) conseguem se cadastrar; quem barra é o banco de dados.
async function doRegister() {
  const nome  = document.getElementById('r-nome').value.trim();
  // E-mail sempre em minúsculas, para bater com a lista de autorizados
  const email = document.getElementById('r-email').value.trim().toLowerCase();
  const senha = document.getElementById('r-senha').value;
  setLoginErr('r', '');

  // Validações: nome, e-mail e senha com no mínimo 6 caracteres
  if (!nome)           { setLoginErr('r', 'Informe seu nome ou apelido.'); return; }
  if (!email)          { setLoginErr('r', 'Informe um e-mail válido.'); return; }
  if (senha.length < 6){ setLoginErr('r', 'Senha deve ter ao menos 6 caracteres.'); return; }

  const btn = document.getElementById('r-btn');
  btn.disabled = true; btn.textContent = 'Criando conta…';

  // O link de confirmação volta para esta mesma página, que mostra a mensagem de sucesso
  // Supabase: cria a conta. O nome vai em "data.display_name" e depois é
  // copiado para a tabela profiles pelo gatilho do banco.
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
// doLogout: sai do sistema.
// - Chamada por: item "Sair" do menu do usuário (index.html).
// Fecha o menu e encerra a sessão no Supabase; o observador da sessão
// percebe a saída e chama hideApp(), que volta para a tela de login.
async function doLogout() {
  toggleUserMenu(false);
  await supa.auth.signOut();
}

// ─────────────────────────────────────────
// Observador da sessão (dispara ao entrar ou sair)
// ─────────────────────────────────────────
// initAuth: liga o "observador" da sessão do Supabase.
// - Chamada por: app.js, uma vez, quando a página termina de carregar.
// - Daí em diante, o Supabase avisa a cada mudança (abriu a página com
//   sessão salva, entrou, saiu, chegou pelo link de senha…), e cada aviso
//   é tratado por handleAuthChange().
function initAuth() {
  // O callback não pode aguardar chamadas ao Supabase: isso trava o login (deadlock
  // no lock da sessão). Por isso o tratamento roda fora dele, com setTimeout.
  supa.auth.onAuthStateChange((event, session) => {
    setTimeout(() => handleAuthChange(event, session), 0);
  });
}

// handleAuthChange: decide o que mostrar conforme a situação da sessão.
// - Chamada por: initAuth() (a cada aviso do Supabase) e leaveEmailConfirmed().
// - Recebe: event = nome do evento do Supabase (ex.: 'SIGNED_IN',
//   'SIGNED_OUT', 'PASSWORD_RECOVERY', 'INITIAL_SESSION') e session = dados
//   da sessão (ou null, se ninguém estiver logado).
// As verificações abaixo estão em ordem de prioridade.
async function handleAuthChange(event, session) {
  // 1) Veio do link de confirmação de cadastro: mostra o aviso e para aqui
  if (emailConfirmation) {
    showEmailConfirmed();
    return;
  }

  // 2) Veio do link de "esqueci a senha": mostra o formulário de nova senha
  if (event === 'PASSWORD_RECOVERY' && session?.user) {
    currentUser = session.user;
    showPasswordRecoveryForm();
    return;
  }

  // 3) Ainda está no meio da troca de senha (outro evento chegou depois):
  //    continua na tela de nova senha, sem abrir o sistema
  if (isPasswordRecovery) {
    showPasswordRecoveryForm();
    return;
  }

  // 4) Há alguém logado: carrega o perfil, confere se o e-mail é
  //    autorizado e abre o sistema. 5) Ninguém logado: limpa tudo e
  //    mostra a tela de login.
  if (session?.user) {
    currentUser = session.user;
    await loadProfile();
    if (!(await checkAuthorized())) return;
    // Confere de novo: o modo de recuperação pode ter começado enquanto
    // esperávamos as respostas acima
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
// loadProfile: busca o perfil da pessoa logada e guarda em currentProfile.
// - Chamada por: handleAuthChange(), logo após o login.
// - Supabase: lê a tabela "profiles" pela linha cujo id é o da pessoa
//   (.single() = esperamos exatamente uma linha).
// Ao final, atualiza o menu do usuário na tela.
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
    // (caso raro: normalmente o gatilho do banco já criou). O nome vem do
    // cadastro ou, na falta dele, da parte do e-mail antes do "@".
    // A função NÃO é enviada: o banco define; aqui assumimos 'user'.
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
// - Chamada por: handleAuthChange(), depois de loadProfile().
// - Devolve: true (pode entrar) ou false (foi desconectado).
// - Supabase: chama a função SQL "is_authorized", que confere se o e-mail
//   da pessoa está na tabela allowed_emails.
async function checkAuthorized() {
  if (hasAdminAccess()) return true;
  const { data, error } = await supa.rpc('is_authorized');
  if (error || data) return true; // falha de rede: as políticas do banco continuam protegendo os dados
  // hideApp() limpa os erros ao receber o evento de saída; a mensagem é exibida depois disso
  pendingLoginErr = 'Seu e-mail não está autorizado a acessar o sistema. Procure o suporte de TI.';
  await supa.auth.signOut();
  return false;
}

// updateUserMenuUI: escreve os dados do perfil na tela (menu do usuário no
// topo, selo da função, seções visíveis conforme o perfil de acesso).
// - Chamada por: loadProfile() (após o login) e saveProfile() (ao mudar o nome).
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
  // Troca o selo inteiro pelo novo, mantendo o id para poder trocar de novo depois
  const badge = document.getElementById('dd-role-badge');
  if (badge) badge.outerHTML = roleBadge(p.role).replace('<span ', '<span id="dd-role-badge" ');

  // Mostrar ou ocultar a seção de administração na barra lateral
  const adminSection = document.getElementById('nav-admin-section');
  if (adminSection) adminSection.style.display = hasAdminAccess() ? '' : 'none';

  // Itens com a classe .superadmin-only somem para quem não é super administrador
  document.documentElement.classList.toggle('is-superadmin', isSuperAdmin());

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

// showApp: esconde a tela de login e mostra o sistema.
// - Chamada por: handleAuthChange(), quando há alguém logado e autorizado.
// - Na primeira vez para cada pessoa, carrega os dados (initDb, em app.js)
//   e oferece a instalação do aplicativo (install.js).
function showApp() {
  document.documentElement.classList.remove('booting');
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-root').style.display     = '';
  // Já iniciado para esta mesma pessoa: só mostra, sem recarregar os dados
  if (appStartedFor === currentUser?.id) return;
  appStartedFor = currentUser?.id;
  initDb();
  maybeOfferInstall(); // install.js — convite para instalar o aplicativo
}

// hideApp: esconde o sistema e mostra a tela de login.
// - Chamada por: handleAuthChange() (ninguém logado / saiu) e por app.js
//   (se o Supabase demorar mais de 10 segundos para responder).
function hideApp() {
  document.documentElement.classList.remove('booting');
  // Zera o controle de "já iniciado" e a página atual (currentPage, de ui.js),
  // para que o próximo login comece do zero
  appStartedFor = null;
  currentPage = null;
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-root').style.display     = 'none';
  // Segurança/privacidade: apaga da memória os dados da pessoa anterior
  // (listas globais de chamados.js, equipamentos.js, internet.js,
  // aquisicoes.js e tickets.js), para o próximo usuário não vê-los
  allChamados    = [];
  allEquipamentos = [];
  allPlanosInternet = [];
  allAquisicoes = [];
  allTickets = [];
  // Mural de avisos (avisos.js)
  allAvisos = [];
  avisoCurtidas = new Map();
  avisoComentarios = new Map();
  avisosSalvos = new Set();
  avisosCarregados = false;
  setLoginErr('l', '');
  setLoginErr('r', '');
  // Se a saída foi forçada (ex.: e-mail não autorizado em checkAuthorized),
  // mostra o motivo agora, na aba Entrar, e esquece a mensagem
  if (pendingLoginErr) {
    showLoginTab('login');
    setLoginErr('l', pendingLoginErr);
    pendingLoginErr = null;
  }
}

// ─────────────────────────────────────────
// Menu do usuário (lista suspensa)
// ─────────────────────────────────────────
// toggleUserMenu: abre ou fecha o menu do usuário (nome no canto superior).
// - Recebe: force (opcional). true = abrir, false = fechar; sem valor =
//   inverte (se está aberto fecha, se está fechado abre).
// - Chamada por: botão do menu (index.html), pelas opções do próprio menu
//   (perfil, senha, sair) e por ui.js (fecha o menu ao trocar de página).
function toggleUserMenu(force) {
  const dd   = document.getElementById('user-dropdown');
  const open = force !== undefined ? force : !dd.classList.contains('open');
  dd.classList.toggle('open', open);
  // aria-expanded: informa a leitores de tela (acessibilidade) se o menu está aberto
  document.querySelector('.user-menu-btn')?.setAttribute('aria-expanded', String(open));

  // Ao abrir, passa a "escutar" cliques na página: clique fora do menu o fecha.
  // O setTimeout(…, 0) adia esse ouvinte para depois do clique atual, senão
  // o próprio clique que abriu o menu já o fecharia.
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
// openEditProfile: abre a janela "Editar perfil" já com o nome atual.
// - Chamada por: opção "Editar perfil" do menu do usuário.
function openEditProfile() {
  toggleUserMenu(false);
  document.getElementById('perfil-nome').value = currentProfile?.display_name || '';
  openModal('modal-perfil');
}

// saveProfile: grava o novo nome de exibição.
// - Chamada por: botão "Salvar" da janela "Editar perfil".
// - Supabase: atualiza a coluna display_name da tabela "profiles", somente
//   na linha da própria pessoa (id = currentUser.id).
async function saveProfile() {
  const nome = document.getElementById('perfil-nome').value.trim();
  // Validação: o nome não pode ficar vazio
  if (!nome) { toast('Nome não pode estar vazio.', 'err'); return; }

  const btn = document.getElementById('btn-save-profile');
  btn.disabled = true; btn.textContent = 'Salvando…';

  const { error } = await supa
    .from('profiles')
    .update({ display_name: nome })
    .eq('id', currentUser.id);

  btn.disabled = false; btn.textContent = 'Salvar';

  if (error) { toast('Erro: ' + error.message, 'err'); return; }

  // Sucesso: atualiza o nome também na memória e na tela, sem recarregar
  currentProfile.display_name = nome;
  updateUserMenuUI();
  closeModal('modal-perfil');
  toast('Perfil atualizado!', 'ok');
}

// ── Alterar senha ──
// openChangePassword: abre a janela "Alterar senha" com os campos vazios.
// - Chamada por: opção "Alterar senha" do menu do usuário.
// (Diferente da recuperação de senha: aqui a pessoa já está logada.)
function openChangePassword() {
  toggleUserMenu(false);
  document.getElementById('senha-nova').value    = '';
  document.getElementById('senha-confirm').value = '';
  openModal('modal-senha');
}

// savePassword: grava a nova senha da pessoa logada.
// - Chamada por: botão "Salvar" da janela "Alterar senha".
// - Validações: mínimo de 6 caracteres e as duas senhas iguais.
// - Supabase: supa.auth.updateUser troca a senha da conta atual.
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
// loadUsuarios: monta a tabela de usuários da página "Gerenciar Usuários".
// - Chamada por: ui.js, ao abrir a página "usuarios" (só admin entra nela),
//   e por setRole()/deleteUser() para atualizar a lista após uma mudança.
// - Supabase: lê todas as linhas da tabela "profiles", em ordem de nome.
// - Perfis de acesso: admin só VÊ a lista; super admin também vê os botões
//   para mudar a função e excluir a conta.
async function loadUsuarios() {
  const el = document.getElementById('usuarios-list');
  if (!el) return;
  // Mostra "Carregando…" enquanto a resposta não chega
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
  // Guarda os perfis por id para deleteUser() mostrar nome e e-mail na confirmação
  usuariosById = Object.fromEntries(data.map(u => [u.id, u]));
  // Monta uma linha (<tr>) da tabela para cada usuário
  const rows = data.map(u => {
    const isSelf = u.id === currentUser?.id;

    // O super administrador não altera a própria função, para não se trancar fora
    // Botões de ação: um para cada função diferente da atual (ex.: um
    // admin recebe "Tornar usuário comum" e "Tornar super admin") e o
    // botão "Excluir". Quem não é super admin recebe '' (nenhum botão).
    const actions = canManage && !isSelf
      ? ['user', 'admin', 'superadmin']
          .filter(r => r !== u.role)
          .map(r => `<button class="btn btn-ghost btn-sm" onclick="setRole('${u.id}','${r}')">
              ${r === 'user' ? 'Tornar usuário comum' : r === 'admin' ? 'Tornar admin' : 'Tornar super admin'}
            </button>`)
          .join('') +
        `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Excluir</button>`
      : '';

    // Linha da tabela: avatar com a inicial, nome (com "(você)" se for a
    // própria pessoa), e-mail, selo da função, início do id e ações.
    // esc() (ui.js) protege contra textos que poderiam virar HTML/código.
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

  // Coloca a tabela completa na tela, com o total de usuários no rodapé
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

// setRole: muda a função (perfil de acesso) de um usuário.
// - Chamada por: botões "Tornar usuário comum / admin / super admin" da
//   tabela de usuários (só aparecem para o super admin).
// - Recebe: userId (id do usuário) e newRole ('user', 'admin' ou 'superadmin').
// - Pede confirmação, atualiza a coluna "role" da tabela "profiles" e
//   recarrega a lista. O banco recusa se quem pediu não for super admin.
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
// - Chamada por: botão "Excluir" da tabela de usuários.
// - Recebe: userId (id do usuário). Pede confirmação mostrando nome e e-mail.
// - Supabase: chama a função SQL "delete_user", que apaga a conta.
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
// Lista de e-mails que podem criar conta e entrar no sistema (tabela
// "allowed_emails"). Quem não está nela é barrado no cadastro (pelo banco)
// e no login (checkAuthorized).

// loadAllowedEmails: monta a tabela de e-mails autorizados.
// - Chamada por: ui.js, ao abrir "Gerenciar Usuários", e após adicionar
//   ou remover um e-mail.
// - Perfil de acesso: a seção inteira só aparece para o super admin.
// - Supabase: lê a coluna "email" da tabela allowed_emails, em ordem alfabética.
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

  // Uma linha por e-mail, com o botão "Remover"; depois, a tabela e o total
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

// addAllowedEmail: inclui um e-mail na lista de autorizados.
// - Chamada por: botão "Autorizar e-mail" ou Enter no campo (index.html).
// - Validação: campo preenchido e com formato de e-mail; gravado em minúsculas.
// - Supabase: insere uma linha na tabela allowed_emails.
async function addAllowedEmail() {
  const input = document.getElementById('allowed-email-input');
  const email = input.value.trim().toLowerCase();
  if (!email || !input.checkValidity()) { input.reportValidity(); return; }

  const { error } = await supa.from('allowed_emails').insert({ email });
  // Erro 23505 do banco = valor repetido (o e-mail já estava na lista)
  if (error) {
    toast(error.code === '23505' ? 'Este e-mail já está autorizado.' : 'Erro: ' + error.message, 'err');
    return;
  }
  input.value = '';
  toast('E-mail autorizado!', 'ok');
  loadAllowedEmails();
}

// removeAllowedEmail: tira um e-mail da lista de autorizados.
// - Chamada por: botão "Remover" de cada linha da tabela de e-mails.
// - Recebe: email (texto). Pede confirmação antes.
// - Supabase: apaga a linha da tabela allowed_emails com esse e-mail.
// A conta da pessoa (se existir) continua, mas ela fica sem acesso.
async function removeAllowedEmail(email) {
  if (!confirm(`Remover "${email}" da lista? Essa pessoa não poderá mais se cadastrar nem acessar o sistema.`)) return;

  const { error } = await supa.from('allowed_emails').delete().eq('email', email);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('E-mail removido.', 'ok');
  loadAllowedEmails();
}

// Tecla Enter nos campos de login
// Ouvinte de teclado da página inteira: roda a cada tecla pressionada, mas
// só age no Enter. Primeiro descobre qual formulário da tela de acesso está
// visível (o formulário e a própria tela de login precisam estar à mostra).
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

  // Enter avança para o próximo campo; no último campo, envia o formulário
  // Recebe: ids = campos do formulário em ordem; enviar = função a chamar no fim.
  // Se o foco não estiver em nenhum desses campos, não faz nada.
  const enterAvancaOuEnvia = (ids, enviar) => {
    const idx = ids.indexOf(document.activeElement?.id);
    if (idx === -1) return;
    e.preventDefault();
    const proximo = idx < ids.length - 1 ? document.getElementById(ids[idx + 1]) : null;
    if (proximo) proximo.focus();
    else enviar();
  };

  if (loginVisible) enterAvancaOuEnvia(['l-email', 'l-senha'], doLogin);

  if (regVisible) enterAvancaOuEnvia(['r-nome', 'r-email', 'r-senha'], doRegister);

  // "Esqueci a senha" tem um campo só: Enter nele já envia
  if (forgotVisible && document.activeElement === document.getElementById('f-email')) {
    sendPasswordRecovery();
  }

  if (resetVisible) enterAvancaOuEnvia(['p-senha', 'p-senha-confirm'], updateRecoveredPassword);
});
