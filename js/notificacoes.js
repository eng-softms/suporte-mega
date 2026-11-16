/* ═══════════════════════════════════════════
   SUPORTE MEGA – Alerta sonoro de chamado novo

   Para que serve este arquivo:
   - Quando um chamado novo é aberto, toca um som suave e mostra um quadro
     no canto da tela com dois botões:
       • Aceitar   → muda o status para "Em Andamento" e abre o chamado;
       • Silenciar → só para o som e fecha o quadro (o chamado continua "Aberto").
   - O som se repete de tempos em tempos até alguém clicar em um dos botões
     (ou até o limite de ALERTA_MAX_MS, para não tocar para sempre).
   - Só toca para os e-mails da lista EMAILS_ALERTA_CHAMADO (config.js).
   - Se outra pessoa aceitar o chamado (status deixa de ser "Aberto"), o
     alerta some sozinho.

   O som é gerado pelo próprio navegador (Web Audio API), sem arquivo de áudio.
   Atenção: os navegadores só deixam tocar som depois que a pessoa clicou ou
   digitou algo na página ao menos uma vez. Ao abrir o sistema já logado, o
   som fica "destravado" no primeiro clique em qualquer lugar.

   Com quem conversa:
   - chamados.js: subscribeChamados() chama alertaChamadoRealtime() a cada
     mudança recebida em tempo real.
   - ui.js: esc, prioBadge, protocoloChamado, toast.
   - chamados.js: openDetalhe (abre o chamado depois de aceitar).
   ═══════════════════════════════════════════ */

// Intervalo entre as repetições do som e tempo máximo tocando
const ALERTA_REPETE_MS = 6000;
const ALERTA_MAX_MS    = 3 * 60 * 1000;

// Chamados com alerta na tela, por id: { el (quadro), timer, inicio }
const alertasAtivos = new Map();
let alertaAudioCtx = null;

// alertaPodeTocar: true se o usuário logado está na lista de quem recebe o alerta
function alertaPodeTocar() {
  const email = (currentUser?.email || '').toLowerCase();
  return !!email && EMAILS_ALERTA_CHAMADO.includes(email);
}

// Cria (ou reaproveita) o "motor de som" do navegador
function alertaAudio() {
  if (!alertaAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    alertaAudioCtx = new Ctx();
  }
  if (alertaAudioCtx.state === 'suspended') alertaAudioCtx.resume().catch(() => {});
  return alertaAudioCtx;
}

// Destrava o som no primeiro clique/tecla (exigência dos navegadores)
['pointerdown', 'keydown'].forEach(ev =>
  document.addEventListener(ev, () => { if (alertaPodeTocar()) alertaAudio(); }, { once: true, capture: true }));

// tocarSomChamado: toca um "plim-plom" curto e suave (duas notas, volume baixo,
// entrada e saída gradual para não assustar).
function tocarSomChamado() {
  const ctx = alertaAudio();
  if (!ctx) return;
  const notas = [[659.25, 0], [880, 0.18]]; // Mi5 e Lá5
  notas.forEach(([freq, atraso]) => {
    const t0 = ctx.currentTime + atraso;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.03); // volume máximo bem baixo
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1);
  });
}

// alertaChamadoRealtime: recebe cada mudança da tabela "chamados" vinda do
// tempo real e decide se abre ou fecha um alerta.
// - Chamada por: subscribeChamados() (chamados.js).
// - Recebe: payload do Supabase ({ eventType, new, old }).
function alertaChamadoRealtime(payload) {
  if (!alertaPodeTocar()) return;
  const { eventType, new: novo, old: antigo } = payload || {};

  if (eventType === 'INSERT' && novo?.id) {
    // Não alerta o chamado que eu mesmo abri
    if (novo.user_id && novo.user_id === currentUser?.id) return;
    if (novo.status && novo.status !== 'Aberto') return;
    abrirAlertaChamado(novo);
  } else if (eventType === 'UPDATE' && novo?.id && novo.status !== 'Aberto') {
    // Alguém já pegou o chamado: o alerta perde o sentido
    fecharAlertaChamado(novo.id);
  } else if (eventType === 'DELETE' && antigo?.id) {
    fecharAlertaChamado(antigo.id);
  }
}

// abrirAlertaChamado: mostra o quadro do chamado novo e começa a tocar
function abrirAlertaChamado(c) {
  if (alertasAtivos.has(c.id)) return;

  let box = document.getElementById('alertas-chamado');
  if (!box) {
    box = document.createElement('div');
    box.id = 'alertas-chamado';
    box.className = 'alertas-chamado';
    document.body.appendChild(box);
  }

  const el = document.createElement('div');
  el.className = 'alerta-chamado';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="alerta-chamado-topo">
      <span class="alerta-chamado-pulso" aria-hidden="true"></span>
      <strong>Novo chamado</strong>
      <span class="alerta-chamado-prot">#${esc(protocoloChamado(c))}</span>
    </div>
    <div class="alerta-chamado-assunto">${esc(c.assunto || '(sem assunto)')}</div>
    <div class="alerta-chamado-info">
      ${esc(c.nome || '')}${c.loja ? ' · ' + esc(c.loja) : ''} ${c.prioridade ? prioBadge(c.prioridade) : ''}
    </div>
    <div class="alerta-chamado-acoes">
      <button type="button" class="btn btn-primary btn-sm" data-acao="aceitar">Aceitar</button>
      <button type="button" class="btn btn-ghost btn-sm" data-acao="silenciar">Silenciar</button>
    </div>`;
  el.querySelector('[data-acao="aceitar"]').addEventListener('click', () => aceitarChamadoAlerta(c.id, el));
  el.querySelector('[data-acao="silenciar"]').addEventListener('click', () => fecharAlertaChamado(c.id));
  box.appendChild(el);

  const inicio = Date.now();
  tocarSomChamado();
  const timer = setInterval(() => {
    // Passou do tempo máximo: para o som, mas deixa o quadro na tela
    if (Date.now() - inicio > ALERTA_MAX_MS) { clearInterval(timer); return; }
    tocarSomChamado();
  }, ALERTA_REPETE_MS);

  alertasAtivos.set(c.id, { el, timer });
}

// fecharAlertaChamado: para o som e remove o quadro de um chamado
function fecharAlertaChamado(id) {
  const a = alertasAtivos.get(id);
  if (!a) return;
  clearInterval(a.timer);
  a.el.remove();
  alertasAtivos.delete(id);
}

// pararTodosAlertas: limpa tudo (usada ao sair do sistema)
function pararTodosAlertas() {
  [...alertasAtivos.keys()].forEach(fecharAlertaChamado);
}

// aceitarChamadoAlerta: muda o status para "Em Andamento", para o alerta e
// abre os detalhes do chamado.
async function aceitarChamadoAlerta(id, el) {
  el.querySelectorAll('button').forEach(b => { b.disabled = true; });
  // Para o som na hora, mesmo antes da resposta do servidor
  const a = alertasAtivos.get(id);
  if (a) clearInterval(a.timer);
  try {
    const { error } = await supa.from('chamados')
      .update({ status: 'Em Andamento', atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    fecharAlertaChamado(id);
    toast('Chamado aceito!', 'ok');
    openDetalhe(id);
  } catch (e) {
    el.querySelectorAll('button').forEach(b => { b.disabled = false; });
    toast('Erro ao aceitar o chamado: ' + (e?.message || e), 'err');
  }
}
