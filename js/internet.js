/* SUPORTE MEGA - Cadastro de planos de internet das unidades */

let allPlanosInternet = [];

async function loadPlanosInternet() {
  const body = document.getElementById('internet-table-body');
  if (body) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  }

  const { data, error } = await supa
    .from('internet_planos')
    .select('*')
    .order('unidade', { ascending: true })
    .order('fornecedor', { ascending: true });

  if (error) {
    console.error('loadPlanosInternet:', error);
    if (body) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar os cadastros. Verifique se o script SQL de internet foi executado no Supabase.</td></tr>';
    }
    setText('internet-count', '');
    toast('Erro ao carregar internet das lojas: ' + error.message, 'err');
    return;
  }

  allPlanosInternet = data || [];
  populateInternetUnitFilters();
  renderPlanosInternet();
}

function populateInternetUnitFilters() {
  const units = [...new Set(allPlanosInternet.map(item => item.unidade).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const filter = document.getElementById('internet-unidade');
  const datalist = document.getElementById('internet-unidades');

  if (filter) {
    const selected = filter.value;
    filter.replaceChildren(new Option('Todas as unidades', ''));
    units.forEach(unit => filter.add(new Option(unit, unit)));
    filter.value = units.includes(selected) ? selected : '';
  }
  if (datalist) {
    datalist.replaceChildren(...units.map(unit => new Option(unit, unit)));
  }
}

function formatInternetMoney(value) {
  if (value === null || value === undefined || value === '') return '–';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderPlanosInternet() {
  const body = document.getElementById('internet-table-body');
  if (!body) return;

  const search = (document.getElementById('internet-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const unit = document.getElementById('internet-unidade')?.value || '';
  const filtered = allPlanosInternet.filter(item => {
    if (unit && item.unidade !== unit) return false;
    if (!search) return true;
    return [
      item.unidade, item.fornecedor, item.plano, item.titular,
      item.links, item.observacoes, item.uso, item.ip,
    ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(search));
  });

  setText('internet-count', `${filtered.length} de ${allPlanosInternet.length} cadastro(s)`);
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum cadastro encontrado.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(item => `
    <tr>
      <td>${esc(item.unidade)}</td>
      <td>${esc(item.fornecedor)}</td>
      <td>${esc(item.plano || '–')}</td>
      <td>${esc(item.titular || '–')}</td>
      <td style="white-space:nowrap">${formatInternetMoney(item.valor_mensal)}</td>
      <td>${esc(item.links || '–')}</td>
      <td class="wrap">${esc(item.observacoes || '–')}</td>
      <td>${esc(item.uso || '–')}</td>
      <td>${esc(item.ip || '–')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editPlanoInternet('${item.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deletePlanoInternet('${item.id}')">Excluir</button>
      </td>
    </tr>`).join('');
}

function clearPlanoInternetForm() {
  document.getElementById('form-internet').reset();
  document.getElementById('internet-id').value = '';
}

function openNovoPlanoInternet() {
  clearPlanoInternetForm();
  document.getElementById('internet-modal-title').textContent = 'Novo cadastro de internet';
  openModal('modal-internet');
}

function editPlanoInternet(id) {
  const item = allPlanosInternet.find(record => record.id === id);
  if (!item) {
    toast('Cadastro de internet não encontrado.', 'err');
    return;
  }

  document.getElementById('internet-modal-title').textContent = 'Editar cadastro de internet';
  document.getElementById('internet-id').value = item.id;
  document.getElementById('internet-form-unidade').value = item.unidade || '';
  document.getElementById('internet-form-fornecedor').value = item.fornecedor || '';
  document.getElementById('internet-form-plano').value = item.plano || '';
  document.getElementById('internet-form-titular').value = item.titular || '';
  document.getElementById('internet-form-valor').value = item.valor_mensal ?? '';
  document.getElementById('internet-form-links').value = item.links || '';
  document.getElementById('internet-form-observacoes').value = item.observacoes || '';
  document.getElementById('internet-form-uso').value = item.uso || '';
  document.getElementById('internet-form-ip').value = item.ip || '';
  openModal('modal-internet');
}

async function submitPlanoInternet(event) {
  event.preventDefault();
  const button = document.getElementById('btn-save-internet');
  const id = document.getElementById('internet-id').value;
  const amountValue = document.getElementById('internet-form-valor').value;
  const payload = {
    unidade: document.getElementById('internet-form-unidade').value.trim(),
    fornecedor: document.getElementById('internet-form-fornecedor').value.trim(),
    plano: document.getElementById('internet-form-plano').value.trim() || null,
    titular: document.getElementById('internet-form-titular').value.trim() || null,
    valor_mensal: amountValue === '' ? null : Number(amountValue),
    links: document.getElementById('internet-form-links').value.trim() || null,
    observacoes: document.getElementById('internet-form-observacoes').value.trim() || null,
    uso: document.getElementById('internet-form-uso').value.trim() || null,
    ip: document.getElementById('internet-form-ip').value.trim() || null,
    atualizado_em: new Date().toISOString(),
  };

  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const query = id
      ? supa.from('internet_planos').update(payload).eq('id', id)
      : supa.from('internet_planos').insert({
        ...payload,
        criado_por: currentUser?.id || null,
      });
    const { error } = await query;
    if (error) throw error;

    toast(id ? 'Cadastro atualizado!' : 'Cadastro adicionado!', 'ok');
    closeModal('modal-internet');
    await loadPlanosInternet();
  } catch (error) {
    console.error('submitPlanoInternet:', error);
    toast('Erro ao salvar cadastro: ' + error.message, 'err');
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar cadastro';
  }
}

async function deletePlanoInternet(id) {
  const item = allPlanosInternet.find(record => record.id === id);
  if (!item || !confirm(`Excluir o plano de internet de ${item.unidade} (${item.fornecedor})?`)) return;

  try {
    const { error } = await supa.from('internet_planos').delete().eq('id', id);
    if (error) throw error;
    toast('Cadastro excluído.', 'ok');
    await loadPlanosInternet();
  } catch (error) {
    console.error('deletePlanoInternet:', error);
    toast('Erro ao excluir cadastro: ' + error.message, 'err');
  }
}
