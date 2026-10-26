/* ═══════════════════════════════════════════
   SUPORTE MEGA – Inicialização principal
   Conecta ao Supabase e inicia a autenticação e as atualizações em tempo real
   ═══════════════════════════════════════════ */

// ── Instância global do Supabase ──
const supa = supabase.createClient(SUPA_URL, SUPA_ANON);

// ── Carrega o banco de dados e assina as atualizações em tempo real ──
async function initDb() {
  setLoading(true);
  try {
    await Promise.all([loadChamados(), loadEquipamentos()]);
    subscribeChamados();
    subscribeEquipamentos();
    initFormNovo();
    updateChamadosTableHeader();
  } catch (e) {
    const msg = e?.message || e?.details || e?.hint || JSON.stringify(e);
    console.error('initDb error:', msg, e);
    toast('Erro ao carregar dados: ' + msg, 'err');
  } finally {
    setLoading(false);
  }
}

// ── Após o carregamento do documento ──
window.addEventListener('DOMContentLoaded', () => {
  // A interface é inicializada depois do login (showApp → initDb → initUI),
  // mas preparamos o tema e os ouvintes desde já.
  initAuth();   // auth.js — monitora a sessão do Supabase e chama showApp/hideApp
});
