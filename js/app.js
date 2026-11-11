/* ═══════════════════════════════════════════
   SUPORTE MEGA – Inicialização principal
   Conecta ao Supabase e inicia a autenticação e as atualizações em tempo real

   Para que serve este arquivo:
   - É o ÚLTIMO script carregado no index.html: quando ele roda, todas as
     funções dos outros arquivos já existem.
   - Cria a conexão com o Supabase (variável global "supa"), usada por todos
     os outros arquivos para ler e gravar dados.
   - Dá a "partida" no sistema quando a página termina de carregar.

   Com quem conversa:
   - config.js: usa SUPA_URL e SUPA_ANON para criar a conexão.
   - auth.js: chama initAuth() ao abrir a página; depois do login, auth.js
     (função showApp) chama initDb(), que está aqui.
   - chamados.js e equipamentos.js: carrega os dados (loadChamados,
     loadEquipamentos) e liga o tempo real (subscribeChamados,
     subscribeEquipamentos).
   - ui.js: setLoading (tela "carregando"), initUI (abre a página certa) e
     toast (aviso flutuante no canto da tela).

   Ordem de funcionamento resumida:
   página carrega → initAuth() → Supabase informa se há sessão →
   showApp() (auth.js) → initDb() → dados na tela.
   ═══════════════════════════════════════════ */

// ── Instância global do Supabase ──
// "supa" é o objeto usado em TODO o sistema para falar com o Supabase:
// supa.auth (login, cadastro, senha), supa.from('tabela') (ler e gravar
// dados), supa.rpc('função') (chamar funções do banco) e supa.channel
// (tempo real). A biblioteca "supabase" vem de um <script> no index.html.
const supa = supabase.createClient(SUPA_URL, SUPA_ANON);

// ── Carrega o banco de dados e assina as atualizações em tempo real ──
// initDb: prepara a tela e busca os dados iniciais depois do login.
// - Chamada por: showApp() em auth.js, uma única vez por usuário logado.
// - Recebe: nada. Devolve: nada (é async, mas ninguém espera o resultado).
// async/await: "async" marca uma função que espera respostas do servidor;
// "await" faz o código esperar a resposta antes de seguir para a próxima linha.
async function initDb() {
  // Mostra o indicador de "carregando" enquanto os dados não chegam
  setLoading(true);
  // Perfil de acesso: só o super admin vê a página de equipamentos.
  // Guardamos a resposta aqui para não perguntar duas vezes.
  const canSeeEquip = isSuperAdmin();
  // O formulário não depende dos dados: prepara antes para não ficar vazio se a carga falhar
  initFormNovo();
  // Ajusta o título de uma coluna da tabela de chamados conforme o perfil
  // (admin vê "Solicitante"; usuário comum vê "Nome") — chamados.js
  updateChamadosTableHeader();
  initUI(); // abre logo a última página, sem esperar os dados
  try {
    // Equipamentos são exclusivos do super administrador
    // Promise.all: dispara as duas buscas AO MESMO TEMPO e espera ambas
    // terminarem (mais rápido do que buscar uma depois da outra).
    // Promise.resolve() é uma "tarefa vazia" para quem não vê equipamentos.
    await Promise.all([loadChamados(), canSeeEquip ? loadEquipamentos() : Promise.resolve()]);
    // Tempo real: a partir daqui, qualquer chamado criado ou alterado por
    // outra pessoa aparece na tela sozinho, sem recarregar a página.
    subscribeChamados();
    if (canSeeEquip) subscribeEquipamentos();
  } catch (e) {
    // Se algo der errado, monta a mensagem mais útil que o erro tiver
    // (o Supabase às vezes usa "message", às vezes "details" ou "hint")
    // e mostra um aviso vermelho na tela.
    const msg = e?.message || e?.details || e?.hint || JSON.stringify(e);
    console.error('initDb error:', msg, e);
    toast('Erro ao carregar dados: ' + msg, 'err');
  } finally {
    // "finally" roda sempre, com ou sem erro: esconde o "carregando".
    setLoading(false);
    initUI(); // reabre a página atual já com os dados carregados
  }
}

// ── Após o carregamento do documento ──
// DOMContentLoaded: evento do navegador disparado quando todo o HTML da
// página já foi lido. É o ponto de partida do sistema.
window.addEventListener('DOMContentLoaded', () => {
  // A interface é inicializada depois do login (showApp → initDb → initUI),
  // mas preparamos o tema e os ouvintes desde já.
  initAuth();   // auth.js — monitora a sessão do Supabase e chama showApp/hideApp

  // Segurança: se a sessão não responder, mostra o login em vez de travar na tela de carregamento
  // A classe "booting" (no <html>) mantém a tela de abertura visível. Se depois
  // de 10 segundos (10000 milissegundos) ela ainda estiver lá, o Supabase não
  // respondeu: então mostramos a tela de login (hideApp, em auth.js).
  setTimeout(() => {
    if (document.documentElement.classList.contains('booting')) hideApp();
  }, 10000);
});
