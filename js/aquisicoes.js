/* SUPORTE MEGA - Aquisição de equipamentos (itens a comprar) */

const STATUS_AQUISICAO = ['Pendente', 'Aprovado', 'Comprado', 'Cancelado'];
const AQUISICAO_BADGE = {
  'Pendente': 'badge-andamento',
  'Aprovado': 'badge-aberto',
  'Comprado': 'badge-fechado',
  'Cancelado': 'badge-cancelado',
};
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

let allAquisicoes = [];

async function loadAquisicoes() {
  const body = document.getElementById('aquisicao-table-body');
  if (body) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  }

  const { data, error } = await supa
    .from('aquisicoes')
    .select('*')
    .order('criado_em', { ascending: true });

  if (error) {
    console.error('loadAquisicoes:', error);
    if (body) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar as aquisições. Verifique se o script SQL de aquisições foi executado no Supabase.</td></tr>';
    }
    setText('aquisicao-count', '');
    toast('Erro ao carregar aquisições: ' + error.message, 'err');
    return;
  }

  allAquisicoes = data || [];
  populateAquisicaoFilters();
  renderAquisicoes();
}

function populateAquisicaoFilters() {
  const setores = [...new Set(allAquisicoes.map(item => item.loja_setor).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const filter = document.getElementById('aquisicao-setor');
  const datalist = document.getElementById('aquisicao-setores');

  if (filter) {
    const selected = filter.value;
    filter.replaceChildren(new Option('Todas as lojas/setores', ''));
    setores.forEach(setor => filter.add(new Option(setor, setor)));
    filter.value = setores.includes(selected) ? selected : '';
  }
  if (datalist) {
    const options = [...new Set([...setores, ...LOJAS, 'TI'])];
    datalist.replaceChildren(...options.map(setor => new Option(setor, setor)));
  }
}

function aquisicaoValorFinal(item) {
  if (item.valor_unitario === null || item.valor_unitario === undefined) return null;
  return Number(item.valor_unitario) * Number(item.quantidade || 0);
}

function formatAquisicaoMoney(value) {
  if (value === null || value === undefined || value === '') return '–';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function filteredAquisicoes() {
  const search = (document.getElementById('aquisicao-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const setor = document.getElementById('aquisicao-setor')?.value || '';
  const status = document.getElementById('aquisicao-status')?.value || '';

  return allAquisicoes.filter(item => {
    if (setor && item.loja_setor !== setor) return false;
    if (status === 'abertos' && !['Pendente', 'Aprovado'].includes(item.status)) return false;
    if (status && status !== 'abertos' && item.status !== status) return false;
    if (!search) return true;
    return [
      item.equipamento, item.loja_setor, item.marca_modelo,
      item.local_compra, item.finalidade, item.status,
    ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(search));
  });
}

function renderAquisicaoResumo() {
  const sum = list => list.reduce((total, item) => total + (aquisicaoValorFinal(item) || 0), 0);
  const pendentes = allAquisicoes.filter(item => item.status === 'Pendente');
  const aprovados = allAquisicoes.filter(item => item.status === 'Aprovado');
  const comprados = allAquisicoes.filter(item => item.status === 'Comprado');

  setText('aq-stat-pendente', pendentes.length);
  setText('aq-stat-pendente-valor', formatAquisicaoMoney(sum(pendentes)));
  setText('aq-stat-aprovado', aprovados.length);
  setText('aq-stat-aprovado-valor', formatAquisicaoMoney(sum(aprovados)));
  setText('aq-stat-comprado', comprados.length);
  setText('aq-stat-comprado-valor', formatAquisicaoMoney(sum(comprados)));
  setText('aq-stat-total', formatAquisicaoMoney(sum([...pendentes, ...aprovados])));
}

function renderAquisicoes() {
  const body = document.getElementById('aquisicao-table-body');
  if (!body) return;

  renderAquisicaoResumo();
  const filtered = filteredAquisicoes();
  const total = filtered.reduce((sum, item) => sum + (aquisicaoValorFinal(item) || 0), 0);

  setText('aquisicao-count', `${filtered.length} de ${allAquisicoes.length} item(ns)`);
  setText('aquisicao-total', formatAquisicaoMoney(total));

  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum item encontrado.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${esc(item.equipamento)}</strong></td>
      <td style="text-align:center">${esc(item.quantidade)}</td>
      <td>${esc(item.loja_setor || '–')}</td>
      <td class="wrap">${esc(item.marca_modelo || '–')}</td>
      <td>${esc(item.local_compra || '–')}</td>
      <td style="white-space:nowrap">${formatAquisicaoMoney(item.valor_unitario)}</td>
      <td style="white-space:nowrap"><strong>${formatAquisicaoMoney(aquisicaoValorFinal(item))}</strong></td>
      <td class="wrap" style="min-width:240px">${esc(item.finalidade || '–')}</td>
      <td><span class="badge ${AQUISICAO_BADGE[item.status] || ''}">${esc(item.status)}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editAquisicao('${item.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteAquisicao('${item.id}')">Excluir</button>
      </td>
    </tr>`).join('');
}

function filterAquisicaoStatus(status) {
  document.getElementById('aquisicao-status').value = status;
  renderAquisicoes();
}

function updateAquisicaoFormTotal() {
  const qty = Number(document.getElementById('aquisicao-form-quantidade').value || 0);
  const value = document.getElementById('aquisicao-form-valor').value;
  setText('aquisicao-form-total', value === '' ? '–' : formatAquisicaoMoney(qty * Number(value)));
}

function openNovaAquisicao() {
  document.getElementById('form-aquisicao').reset();
  document.getElementById('aquisicao-id').value = '';
  document.getElementById('aquisicao-form-status').value = 'Pendente';
  document.getElementById('aquisicao-modal-title').textContent = 'Novo equipamento para aquisição';
  updateAquisicaoFormTotal();
  openModal('modal-aquisicao');
}

function editAquisicao(id) {
  const item = allAquisicoes.find(record => record.id === id);
  if (!item) {
    toast('Item não encontrado.', 'err');
    return;
  }

  document.getElementById('aquisicao-modal-title').textContent = 'Editar item de aquisição';
  document.getElementById('aquisicao-id').value = item.id;
  document.getElementById('aquisicao-form-equipamento').value = item.equipamento || '';
  document.getElementById('aquisicao-form-quantidade').value = item.quantidade ?? 1;
  document.getElementById('aquisicao-form-setor').value = item.loja_setor || '';
  document.getElementById('aquisicao-form-marca').value = item.marca_modelo || '';
  document.getElementById('aquisicao-form-local').value = item.local_compra || '';
  document.getElementById('aquisicao-form-valor').value = item.valor_unitario ?? '';
  document.getElementById('aquisicao-form-finalidade').value = item.finalidade || '';
  document.getElementById('aquisicao-form-status').value = item.status || 'Pendente';
  updateAquisicaoFormTotal();
  openModal('modal-aquisicao');
}

async function submitAquisicao(event) {
  event.preventDefault();
  const button = document.getElementById('btn-save-aquisicao');
  const id = document.getElementById('aquisicao-id').value;
  const amountValue = document.getElementById('aquisicao-form-valor').value;
  const payload = {
    equipamento: document.getElementById('aquisicao-form-equipamento').value.trim(),
    quantidade: Number(document.getElementById('aquisicao-form-quantidade').value) || 1,
    loja_setor: document.getElementById('aquisicao-form-setor').value.trim() || null,
    marca_modelo: document.getElementById('aquisicao-form-marca').value.trim() || null,
    local_compra: document.getElementById('aquisicao-form-local').value.trim() || null,
    valor_unitario: amountValue === '' ? null : Number(amountValue),
    finalidade: document.getElementById('aquisicao-form-finalidade').value.trim() || null,
    status: document.getElementById('aquisicao-form-status').value,
    atualizado_em: new Date().toISOString(),
  };

  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const query = id
      ? supa.from('aquisicoes').update(payload).eq('id', id)
      : supa.from('aquisicoes').insert({
        ...payload,
        criado_por: currentUser?.id || null,
      });
    const { error } = await query;
    if (error) throw error;

    toast(id ? 'Item atualizado!' : 'Item adicionado!', 'ok');
    closeModal('modal-aquisicao');
    await loadAquisicoes();
  } catch (error) {
    console.error('submitAquisicao:', error);
    toast('Erro ao salvar item: ' + error.message, 'err');
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar item';
  }
}

async function deleteAquisicao(id) {
  const item = allAquisicoes.find(record => record.id === id);
  if (!item || !confirm(`Excluir "${item.equipamento}" da lista de aquisição?`)) return;

  try {
    const { error } = await supa.from('aquisicoes').delete().eq('id', id);
    if (error) throw error;
    toast('Item excluído.', 'ok');
    await loadAquisicoes();
  } catch (error) {
    console.error('deleteAquisicao:', error);
    toast('Erro ao excluir item: ' + error.message, 'err');
  }
}

// ── Exportar para Excel (.xlsx) ──
function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_SRC;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('não foi possível carregar a biblioteca do Excel'));
    document.head.appendChild(script);
  });
}

async function exportAquisicoesExcel() {
  const items = filteredAquisicoes();
  if (!items.length) {
    toast('Não há itens para exportar.', 'err');
    return;
  }

  try {
    const XLSX = await loadXlsxLib();
    const header = [
      'EQUIPAMENTOS', 'QUANTIDADE', 'LOJA/SETOR', 'MARCA/MODELO/OBSERVAÇÃO',
      'LOCAL DE COMPRA', 'VALORES', 'Finalidade da compra e uso', 'VALOR FINAL', 'STATUS',
    ];
    const rows = items.map(item => [
      item.equipamento,
      Number(item.quantidade),
      item.loja_setor || '',
      item.marca_modelo || '',
      item.local_compra || '',
      item.valor_unitario === null ? '' : Number(item.valor_unitario),
      item.finalidade || '',
      aquisicaoValorFinal(item) ?? '',
      item.status,
    ]);
    const lastRow = rows.length + 1;
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows, ['', '', '', '', '', '', 'TOTAL']]);
    sheet[`H${lastRow + 1}`] = {
      t: 'n',
      f: `SUM(H2:H${lastRow})`,
      v: rows.reduce((sum, row) => sum + (Number(row[7]) || 0), 0),
    };
    sheet['!ref'] = `A1:I${lastRow + 1}`;
    sheet['!cols'] = [32, 12, 22, 35, 22, 12, 80, 14, 12].map(wch => ({ wch }));

    // Formato de moeda nas colunas de valor
    for (let r = 2; r <= lastRow + 1; r++) {
      ['F', 'H'].forEach(col => {
        const cell = sheet[`${col}${r}`];
        if (cell && cell.t === 'n') cell.z = '"R$" #,##0.00';
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Aquisições');
    const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '.');
    XLSX.writeFile(workbook, `solicitação de equipamentos TI ${today}.xlsx`);
    toast('Planilha exportada!', 'ok');
  } catch (error) {
    console.error('exportAquisicoesExcel:', error);
    toast('Erro ao exportar: ' + error.message, 'err');
  }
}
