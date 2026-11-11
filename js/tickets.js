/* ═══════════════════════════════════════════
   SUPORTE MEGA – Tickets abertos no suporte da Data System

   Para que serve:
   - Esta é a tela "Tickets" do menu lateral (área de administradores).
   - Aqui a equipe de TI registra os tickets (chamados) que ela mesma abriu
     no suporte da Data System, que é um fornecedor externo. Assim dá para
     acompanhar se cada problema levado ao fornecedor foi resolvido.

   O que contém:
   - Lista de situações possíveis e a cor (etiqueta) de cada uma.
   - Carregamento dos tickets do banco (Supabase, tabela "tickets").
   - Filtros (busca por texto e por situação) e os cartões de contagem.
   - Janela (modal) para criar, editar e excluir um ticket.

   Com quem conversa:
   - ui.js: navigate('tickets') chama loadTickets() ao abrir a tela;
     também fornece esc, setText, toast, openModal e closeModal.
   - app.js: cria "supa", a conexão com o Supabase (o banco de dados na nuvem).
   - auth.js: fornece "currentUser" (usuário logado) e esconde os itens com a
     classe "superadmin-only" para quem não é super administrador.
   - index.html: botões, filtros e o formulário "form-ticket" chamam as
     funções deste arquivo (onclick, oninput, onchange, onsubmit).
   ═══════════════════════════════════════════ */

// Situações que um ticket pode ter. A ordem aqui é a mesma dos cartões
// de contagem no topo da tela. Usada em renderTickets() para zerar os contadores.
const SITUACOES_TICKET = ['Resolvido', 'Não resolvido', 'Em andamento', 'Não informado'];
// Classe CSS da etiqueta colorida ("badge") de cada situação.
// Ex.: "Resolvido" usa a cor de chamado fechado; "Não resolvido", a cor de urgente.
const TICKET_BADGE = {
  'Resolvido': 'badge-fechado',
  'Não resolvido': 'badge-urgente',
  'Em andamento': 'badge-andamento',
  'Não informado': 'badge-baixa',
};

// Cópia na memória de todos os tickets vindos do banco.
// Os filtros trabalham sobre esta lista, sem precisar buscar no servidor de novo.
let allTickets = [];

// ─────────────────────────────────────────
// loadTickets(): busca todos os tickets no Supabase e redesenha a tela.
// Chamada por: navigate('tickets') em ui.js (ao abrir a tela) e, aqui
// mesmo, depois de salvar (submitTicket) ou excluir (deleteTicket).
// Recebe: nada. Devolve: nada (atualiza allTickets e a tabela).
// "async/await": a função espera a resposta do servidor antes de continuar.
// ─────────────────────────────────────────
async function loadTickets() {
  const body = document.getElementById('ticket-table-body');
  // Mostra o ícone de "carregando" só na primeira vez (lista ainda vazia).
  // Nas próximas, a tabela antiga fica visível até a nova chegar, sem piscar.
  if (body && !allTickets.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--fg3)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  }

  // Busca todas as colunas (*) da tabela "tickets" do Supabase.
  // Mais recentes primeiro; sem data vão para o fim
  // (nullsFirst: false). Empate na data: o cadastrado por último vem antes.
  const { data, error } = await supa
    .from('tickets')
    .select('*')
    .order('data_atendimento', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  // Erro na busca: avisa na própria tabela e num aviso flutuante (toast).
  // O motivo mais comum é a tabela ainda não ter sido criada no Supabase.
  if (error) {
    console.error('loadTickets:', error);
    if (body) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar os tickets. Verifique se o script SQL de tickets foi executado no Supabase.</td></tr>';
    }
    setText('ticket-count', '');
    toast('Erro ao carregar tickets: ' + error.message, 'err');
    return;
  }

  // Deu certo: guarda a lista (ou lista vazia, se veio nada) e desenha a tela.
  allTickets = data || [];
  renderTickets();
}

// ─────────────────────────────────────────
// filteredTickets(): devolve só os tickets que passam nos filtros da tela.
// Chamada por: renderTickets().
// Recebe: nada (lê a caixa de busca e o seletor de situação).
// Devolve: uma lista (array) de tickets.
// ─────────────────────────────────────────
function filteredTickets() {
  // Texto digitado na busca, sem espaços nas pontas e em letras minúsculas,
  // para que "ABC" e "abc" sejam encontrados do mesmo jeito.
  // O "?." evita erro se o campo não existir na página.
  const search = (document.getElementById('ticket-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const situacao = document.getElementById('ticket-situacao')?.value || '';

  return allTickets.filter(t => {
    // Se uma situação foi escolhida, descarta os tickets de outra situação.
    if (situacao && t.situacao !== situacao) return false;
    // Sem texto de busca, o ticket fica na lista.
    if (!search) return true;
    // Com texto: mantém o ticket se o número, a descrição ou a situação
    // contiverem o texto buscado.
    return [t.numero, t.descricao, t.situacao]
      .some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(search));
  });
}

// ─────────────────────────────────────────
// fmtTicketDate(d): transforma a data do banco ("2026-03-15") em "15/03/2026".
// Chamada por: renderTickets(), na coluna de data.
// Recebe: texto AAAA-MM-DD (ou vazio). Devolve: data no formato brasileiro, ou "–".
// O "T00:00:00" força o horário local; sem ele, o navegador leria a data em
// UTC (horário universal) e ela poderia aparecer um dia antes.
// ─────────────────────────────────────────
function fmtTicketDate(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '–';
}

// ─────────────────────────────────────────
// renderTickets(): desenha os cartões de contagem e a tabela de tickets.
// Chamada por: loadTickets(), filterTicketSituacao() e pelos filtros da tela
// (caixa de busca "ticket-busca" e seletor "ticket-situacao" no index.html).
// Recebe: nada. Devolve: nada (altera o HTML da página).
// ─────────────────────────────────────────
function renderTickets() {
  const body = document.getElementById('ticket-table-body');
  // Se a tabela não está na página, não há o que desenhar.
  if (!body) return;

  // ── Cartões de contagem ──
  // Conta quantos tickets existem em cada situação. Usa TODOS os tickets
  // (não só os filtrados), para os cartões mostrarem o total geral.
  // Começa com todas as situações valendo 0 e soma 1 para cada ticket.
  const counts = Object.fromEntries(SITUACOES_TICKET.map(s => [s, 0]));
  allTickets.forEach(t => { counts[t.situacao] = (counts[t.situacao] || 0) + 1; });
  setText('tk-stat-resolvido', counts['Resolvido']);
  setText('tk-stat-nao-resolvido', counts['Não resolvido']);
  setText('tk-stat-andamento', counts['Em andamento']);
  setText('tk-stat-nao-informado', counts['Não informado']);

  // ── Tabela ──
  // Aplica os filtros e mostra o resumo "X de Y ticket(s)".
  const list = filteredTickets();
  setText('ticket-count', `${list.length} de ${allTickets.length} ticket(s)`);

  // Nenhum ticket passou nos filtros: mostra uma linha de aviso.
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum ticket encontrado.</td></tr>';
    return;
  }

  // Monta uma linha <tr> por ticket: número, descrição, data, situação
  // (etiqueta colorida) e os botões Editar/Excluir.
  // esc() (de ui.js) "escapa" o texto: impede que algo digitado vire HTML.
  // A coluna de botões tem a classe "superadmin-only": só o super
  // administrador a vê (regra no CSS e em auth.js).
  body.innerHTML = list.map(t => `
    <tr>
      <td><span style="font-family:var(--mono);font-size:12px;font-weight:600">${esc(t.numero)}</span></td>
      <td class="wrap" style="min-width:280px">${esc(t.descricao || '–')}</td>
      <td style="white-space:nowrap">${fmtTicketDate(t.data_atendimento)}</td>
      <td><span class="badge ${TICKET_BADGE[t.situacao] || ''}">${esc(t.situacao)}</span></td>
      <td class="superadmin-only" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editTicket('${t.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteTicket('${t.id}')">Excluir</button>
      </td>
    </tr>`).join('');
}

// ─────────────────────────────────────────
// filterTicketSituacao(situacao): filtra a tabela por uma situação.
// Chamada por: clique num dos cartões de contagem no topo da tela.
// Recebe: o nome da situação (ex.: 'Resolvido'). Devolve: nada.
// Coloca o valor no seletor de situação e redesenha a tabela.
// ─────────────────────────────────────────
function filterTicketSituacao(situacao) {
  document.getElementById('ticket-situacao').value = situacao;
  renderTickets();
}

// ─────────────────────────────────────────
// openNovoTicket(): abre a janela (modal) para cadastrar um ticket novo.
// Chamada por: botão "Novo ticket" (visível só para o super administrador).
// Recebe: nada. Devolve: nada.
// ─────────────────────────────────────────
function openNovoTicket() {
  // Limpa o formulário. O campo escondido "ticket-id" vazio indica
  // "ticket novo" (em submitTicket isso decide entre criar e atualizar).
  document.getElementById('form-ticket').reset();
  document.getElementById('ticket-id').value = '';
  // Já sugere a data de hoje e a situação "Em andamento".
  // O formato 'en-CA' gera AAAA-MM-DD, que é o que o campo de data aceita.
  document.getElementById('ticket-form-data').value = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD local
  document.getElementById('ticket-form-situacao').value = 'Em andamento';
  document.getElementById('ticket-modal-title').textContent = 'Novo ticket';
  openModal('modal-ticket');
}

// ─────────────────────────────────────────
// editTicket(id): abre a janela já preenchida com os dados de um ticket.
// Chamada por: botão "Editar" de cada linha da tabela (montado em renderTickets).
// Recebe: o id (identificador único) do ticket. Devolve: nada.
// ─────────────────────────────────────────
function editTicket(id) {
  // Procura o ticket na lista da memória; se sumiu (ex.: excluído), avisa.
  const t = allTickets.find(x => x.id === id);
  if (!t) { toast('Ticket não encontrado.', 'err'); return; }

  // Copia cada dado do ticket para o campo correspondente do formulário.
  // Guardar o id no campo escondido faz o salvamento atualizar este ticket.
  document.getElementById('ticket-modal-title').textContent = `Editar ticket ${t.numero}`;
  document.getElementById('ticket-id').value = t.id;
  document.getElementById('ticket-form-numero').value = t.numero || '';
  document.getElementById('ticket-form-descricao').value = t.descricao || '';
  document.getElementById('ticket-form-data').value = t.data_atendimento || '';
  document.getElementById('ticket-form-situacao').value = t.situacao || 'Não informado';
  openModal('modal-ticket');
}

// ─────────────────────────────────────────
// submitTicket(event): salva o ticket (novo ou editado) no Supabase.
// Chamada por: envio do formulário "form-ticket" (botão "Salvar ticket").
// Recebe: o evento de envio do formulário. Devolve: nada.
// ─────────────────────────────────────────
async function submitTicket(event) {
  // Impede o comportamento padrão do navegador, que recarregaria a página.
  event.preventDefault();
  const button = document.getElementById('btn-save-ticket');
  // id preenchido = edição; id vazio = ticket novo.
  const id = document.getElementById('ticket-id').value;
  // "payload": o pacote de dados que será gravado na tabela "tickets".
  // Campos opcionais vazios viram null (vazio no banco).
  const payload = {
    numero: document.getElementById('ticket-form-numero').value.trim(),
    descricao: document.getElementById('ticket-form-descricao').value.trim() || null,
    data_atendimento: document.getElementById('ticket-form-data').value || null,
    situacao: document.getElementById('ticket-form-situacao').value,
    atualizado_em: new Date().toISOString(),
  };
  // Validação: o número do ticket é obrigatório.
  if (!payload.numero) { toast('Informe o número do ticket.', 'err'); return; }

  // Desativa o botão enquanto salva, para evitar clique duplo (gravar duas vezes).
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    // Edição: atualiza (update) a linha com este id.
    // Novo: insere (insert) uma linha e registra quem criou (criado_por).
    const query = id
      ? supa.from('tickets').update(payload).eq('id', id)
      : supa.from('tickets').insert({ ...payload, criado_por: currentUser?.id || null });
    const { error } = await query;
    if (error) throw error;

    // Sucesso: avisa, fecha a janela e recarrega a lista do banco.
    toast(id ? 'Ticket atualizado!' : 'Ticket adicionado!', 'ok');
    closeModal('modal-ticket');
    await loadTickets();
  } catch (error) {
    // Qualquer falha (rede, permissão, etc.) cai aqui e é mostrada ao usuário.
    console.error('submitTicket:', error);
    toast('Erro ao salvar ticket: ' + error.message, 'err');
  } finally {
    // "finally" roda sempre, com sucesso ou erro: reativa o botão.
    button.disabled = false;
    button.textContent = 'Salvar ticket';
  }
}

// ─────────────────────────────────────────
// deleteTicket(id): exclui um ticket do banco, após confirmação.
// Chamada por: botão "Excluir" de cada linha da tabela.
// Recebe: o id do ticket. Devolve: nada.
// ─────────────────────────────────────────
async function deleteTicket(id) {
  // Pede confirmação mostrando número e descrição. Se o ticket não existir
  // ou o usuário clicar em "Cancelar", não faz nada.
  const t = allTickets.find(x => x.id === id);
  if (!t || !confirm(`Excluir o ticket ${t.numero}?\n\n${t.descricao || ''}`)) return;

  // Apaga a linha da tabela "tickets" com este id e recarrega a lista.
  try {
    const { error } = await supa.from('tickets').delete().eq('id', id);
    if (error) throw error;
    toast('Ticket excluído.', 'ok');
    await loadTickets();
  } catch (error) {
    console.error('deleteTicket:', error);
    toast('Erro ao excluir ticket: ' + error.message, 'err');
  }
}
