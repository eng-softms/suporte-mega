/* ═══════════════════════════════════════════
   SUPORTE MEGA – Instalação do aplicativo (PWA)
   Registra o service worker e oferece a instalação após o login

   Termos usados aqui:
   - PWA (Progressive Web App): site que pode ser "instalado" no computador
     ou celular e abre em janela própria, com ícone, como um aplicativo.
   - Service worker: programa que roda em segundo plano no navegador. Aqui
     ele fica no arquivo sw.js e guarda cópias dos arquivos do sistema (cache).

   Para que serve este arquivo:
   - Registra (ativa) o service worker sw.js.
   - Guarda o "convite de instalação" que o navegador oferece e mostra a
     janela "Instalar aplicativo" (modal-install, no index.html) depois que
     a pessoa faz login.
   - Lembra por 7 dias quando a pessoa clica em "Agora não".

   Com quem conversa:
   - sw.js: o service worker registrado aqui.
   - auth.js: showApp() chama maybeOfferInstall() logo após o login; também
     usamos a variável currentUser (pessoa logada).
   - ui.js: openModal, closeModal (abrir/fechar janelas) e toast (avisos).
   - index.html: botões "Instalar aplicativo" (installApp) e "Agora não" /
     "✕" (dismissInstall) da janela modal-install.
   ═══════════════════════════════════════════ */

// Nome da "gaveta" no localStorage (memória do navegador que sobrevive ao
// fechar a página) onde guardamos QUANDO a pessoa recusou a instalação.
const INSTALL_DISMISS_KEY = 'install-dismissed-at';
const INSTALL_DISMISS_DAYS = 7;   // "Agora não" adia o convite por uma semana

let deferredInstallPrompt = null; // Evento guardado para abrir a instalação do navegador
let installOfferShown = false;    // Mostra o convite no máximo uma vez por sessão

// Registro do service worker.
// Só tenta se o navegador tiver suporte. Espera a página carregar por
// completo ("load") para não atrasar a abertura do sistema. Se falhar, só
// registra o erro no console (o sistema continua funcionando normalmente).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('Service worker:', e));
  });
}

// O navegador avisa quando o app pode ser instalado; guardamos o evento para usar no botão
// e.preventDefault() impede o navegador de mostrar o aviso dele mesmo na
// hora errada (por exemplo, ainda na tela de login).
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  maybeOfferInstall(); // se o login já aconteceu, o convite aparece agora
});

// Disparado pelo navegador quando a instalação termina com sucesso:
// descarta o convite guardado, fecha a janela e avisa a pessoa.
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  closeModal('modal-install');
  toast('Aplicativo instalado! Procure o ícone Suporte TI na área de trabalho.', 'ok');
});

// isRunningAsApp: diz se o sistema já está aberto como aplicativo instalado
// (janela própria) em vez de numa aba do navegador.
// - Chamada por: maybeOfferInstall(), logo abaixo.
// - Devolve: true (verdadeiro) ou false (falso).
// "display-mode: standalone" vale para Chrome/Edge/Android;
// navigator.standalone vale para iPhone/iPad (Safari).
function isRunningAsApp() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// installDismissedRecently: diz se a pessoa clicou em "Agora não" há menos
// de 7 dias (INSTALL_DISMISS_DAYS).
// - Chamada por: maybeOfferInstall().
// - Devolve: verdadeiro se ainda está no prazo de espera.
// 864e5 = 86.400.000 milissegundos = 1 dia.
// O try/catch evita erro em navegadores que bloqueiam o localStorage
// (ex.: janela anônima); nesse caso, consideramos que não houve recusa.
function installDismissedRecently() {
  try {
    const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    return at && Date.now() - at < INSTALL_DISMISS_DAYS * 864e5;
  } catch { return false; }
}

// Chamado após o login (showApp) e quando o navegador libera a instalação
// maybeOfferInstall: abre a janela "Instalar aplicativo" SE todas as
// condições forem atendidas. Recebe e devolve nada.
function maybeOfferInstall() {
  // Não mostra se: já mostrou nesta sessão, o navegador ainda não liberou a
  // instalação, ou ninguém fez login ainda.
  if (installOfferShown || !deferredInstallPrompt || !currentUser) return;
  // Não mostra se o app já está instalado ou se a pessoa recusou há pouco.
  if (isRunningAsApp() || installDismissedRecently()) return;
  installOfferShown = true;
  openModal('modal-install');
}

// installApp: abre a janela de instalação do próprio navegador.
// - Chamada por: botão "Instalar aplicativo" da janela modal-install.
// - Recebe e devolve nada.
async function installApp() {
  // Se o convite do navegador não estiver mais disponível, só fecha a janela
  if (!deferredInstallPrompt) { closeModal('modal-install'); return; }
  // O convite só pode ser usado uma vez: copiamos e já limpamos a variável
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  prompt.prompt();
  // Espera a pessoa responder na janela do navegador ("accepted" = aceitou)
  const { outcome } = await prompt.userChoice;
  closeModal('modal-install');
  // Se cancelou na janela do navegador, conta como "Agora não" (espera 7 dias)
  if (outcome !== 'accepted') dismissInstall();
}

// dismissInstall: registra a recusa ("Agora não") e fecha a janela.
// - Chamada por: botões "Agora não" e "✕" da janela modal-install, e por
//   installApp() quando a pessoa cancela a instalação.
// Grava a data/hora atual no localStorage; o try/catch ignora navegadores
// que não permitem gravar (o convite só voltará na próxima sessão).
function dismissInstall() {
  try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch {}
  closeModal('modal-install');
}
