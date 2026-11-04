/* ═══════════════════════════════════════════
   SUPORTE MEGA – Instalação do aplicativo (PWA)
   Registra o service worker e oferece a instalação após o login
   ═══════════════════════════════════════════ */

const INSTALL_DISMISS_KEY = 'install-dismissed-at';
const INSTALL_DISMISS_DAYS = 7;   // "Agora não" adia o convite por uma semana

let deferredInstallPrompt = null; // Evento guardado para abrir a instalação do navegador
let installOfferShown = false;    // Mostra o convite no máximo uma vez por sessão

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('Service worker:', e));
  });
}

// O navegador avisa quando o app pode ser instalado; guardamos o evento para usar no botão
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  maybeOfferInstall(); // se o login já aconteceu, o convite aparece agora
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  closeModal('modal-install');
  toast('Aplicativo instalado! Procure o ícone Suporte TI na área de trabalho.', 'ok');
});

function isRunningAsApp() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function installDismissedRecently() {
  try {
    const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    return at && Date.now() - at < INSTALL_DISMISS_DAYS * 864e5;
  } catch { return false; }
}

// Chamado após o login (showApp) e quando o navegador libera a instalação
function maybeOfferInstall() {
  if (installOfferShown || !deferredInstallPrompt || !currentUser) return;
  if (isRunningAsApp() || installDismissedRecently()) return;
  installOfferShown = true;
  openModal('modal-install');
}

async function installApp() {
  if (!deferredInstallPrompt) { closeModal('modal-install'); return; }
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  closeModal('modal-install');
  if (outcome !== 'accepted') dismissInstall();
}

function dismissInstall() {
  try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch {}
  closeModal('modal-install');
}
