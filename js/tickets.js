/* SUPORTE MEGA - Tickets abertos no suporte da Data System */

const SITUACOES_TICKET = ['Resolvido', 'Não resolvido', 'Em andamento', 'Não informado'];
const TICKET_BADGE = {
  'Resolvido': 'badge-fechado',
  'Não resolvido': 'badge-urgente',
  'Em andamento': 'badge-andamento',
  'Não informado': 'badge-baixa',
};

let allTickets = [];

async function loadTickets() {
  const body = document.getElementById('ticket-table-body');
  if (body && !allTickets.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--fg3)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  }

  // Mais recentes primeiro; sem data vão para o fim
  const { data, error } = await supa
    .from('tickets')
    .select('*')
    .order('data_atendimento', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('loadTickets:', error);
    if (body) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar os tickets. Verifique se o script SQL de tickets foi executado no Supabase.</td></tr>';
    }
    setText('ticket-count', '');
    toast('Erro ao carregar tickets: ' + error.message, 'err');
    return;
  }

  allTickets = data || [];
  renderTickets();
}

function filteredTickets() {
  const search = (document.getElementById('ticket-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const situacao = document.getElementById('ticket-situacao')?.value || '';

  return allTickets.filter(t => {
    if (situacao && t.situacao !== situacao) return false;
    if (!search) return true;
    return [t.numero, t.descricao, t.situacao]
      .some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(search));
  });
}

function fmtTicketDate(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '–';
}

function renderTickets() {
  const body = document.getElementById('ticket-table-body');
  if (!body) return;

  const counts = Object.fromEntries(SITUACOES_TICKET.map(s => [s, 0]));
  allTickets.forEach(t => { counts[t.situacao] = (counts[t.situacao] || 0) + 1; });
  setText('tk-stat-resolvido', counts['Resolvido']);
  setText('tk-stat-nao-resolvido', counts['Não resolvido']);
  setText('tk-stat-andamento', counts['Em andamento']);
  setText('tk-stat-nao-informado', counts['Não informado']);

  const list = filteredTickets();
  setText('ticket-count', `${list.length} de ${allTickets.length} ticket(s)`);

  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum ticket encontrado.</td></tr>';
    return;
  }

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

function filterTicketSituacao(situacao) {
  document.getElementById('ticket-situacao').value = situacao;
  renderTickets();
}

function openNovoTicket() {
  document.getElementById('form-ticket').reset();
  document.getElementById('ticket-id').value = '';
  document.getElementById('ticket-form-data').value = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD local
  document.getElementById('ticket-form-situacao').value = 'Em andamento';
  document.getElementById('ticket-modal-title').textContent = 'Novo ticket';
  openModal('modal-ticket');
}

function editTicket(id) {
  const t = allTickets.find(x => x.id === id);
  if (!t) { toast('Ticket não encontrado.', 'err'); return; }

  document.getElementById('ticket-modal-title').textContent = `Editar ticket ${t.numero}`;
  document.getElementById('ticket-id').value = t.id;
  document.getElementById('ticket-form-numero').value = t.numero || '';
  document.getElementById('ticket-form-descricao').value = t.descricao || '';
  document.getElementById('ticket-form-data').value = t.data_atendimento || '';
  document.getElementById('ticket-form-situacao').value = t.situacao || 'Não informado';
  openModal('modal-ticket');
}

async function submitTicket(event) {
  event.preventDefault();
  const button = document.getElementById('btn-save-ticket');
  const id = document.getElementById('ticket-id').value;
  const payload = {
    numero: document.getElementById('ticket-form-numero').value.trim(),
    descricao: document.getElementById('ticket-form-descricao').value.trim() || null,
    data_atendimento: document.getElementById('ticket-form-data').value || null,
    situacao: document.getElementById('ticket-form-situacao').value,
    atualizado_em: new Date().toISOString(),
  };
  if (!payload.numero) { toast('Informe o número do ticket.', 'err'); return; }

  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const query = id
      ? supa.from('tickets').update(payload).eq('id', id)
      : supa.from('tickets').insert({ ...payload, criado_por: currentUser?.id || null });
    const { error } = await query;
    if (error) throw error;

    toast(id ? 'Ticket atualizado!' : 'Ticket adicionado!', 'ok');
    closeModal('modal-ticket');
    await loadTickets();
  } catch (error) {
    console.error('submitTicket:', error);
    toast('Erro ao salvar ticket: ' + error.message, 'err');
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar ticket';
  }
}

async function deleteTicket(id) {
  const t = allTickets.find(x => x.id === id);
  if (!t || !confirm(`Excluir o ticket ${t.numero}?\n\n${t.descricao || ''}`)) return;

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
