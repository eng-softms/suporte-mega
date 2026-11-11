/* ═══════════════════════════════════════════
   SUPORTE MEGA – Equipamentos (somente admin)
   ═══════════════════════════════════════════ */

let allEquipamentos = [];

// ─────────────────────────────────────────
// Carregamento
// ─────────────────────────────────────────
async function loadEquipamentos() {
  const { data, error } = await supa
    .from('equipamentos')
    .select('*')
    .order('serie', { ascending: true });

  if (error) {
    console.error('loadEquipamentos:', error.message);
    const body = document.getElementById('equip-table-body');
    if (body) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar os equipamentos: ${esc(error.message)}</td></tr>`;
    }
    throw error;
  }
  allEquipamentos = (data || []).map(r => ({
    ...r,
    criadoEm:     r.criado_em     ? new Date(r.criado_em).getTime()     : null,
    atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em).getTime() : null,
  }));
  renderEquipamentos();
}

let equipChannel = null;

function subscribeEquipamentos() {
  // Evita assinaturas duplicadas quando o usuário sai e entra de novo
  if (equipChannel) supa.removeChannel(equipChannel);
  equipChannel = supa.channel('equip-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos' }, async () => {
      await loadEquipamentos();
    })
    .subscribe();
}

// ─────────────────────────────────────────
// Renderização da tabela
// ─────────────────────────────────────────
// Equipamentos de acordo com os filtros da tela (também usado na exportação)
function getFilteredEquipamentos(resp = document.getElementById('ef-responsavel')?.value || '') {
  const busca = (document.getElementById('ef-busca')?.value  || '').toLowerCase();
  const loja  = document.getElementById('ef-loja')?.value    || '';
  const tipo  = document.getElementById('ef-tipo')?.value    || '';
  const stat  = document.getElementById('ef-status')?.value  || '';

  return allEquipamentos.filter(e => {
    if (loja && e.loja   !== loja)   return false;
    if (tipo && e.tipo   !== tipo)   return false;
    if (stat && e.status !== stat)   return false;
    if (resp === SEM_RESPONSAVEL ? respKey(e.responsavel) : resp && respKey(e.responsavel) !== resp) return false;
    if (busca) {
      const hay = [e.serie, e.marca, e.modelo, e.loja, e.obs, e.responsavel].join(' ').toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    return true;
  });
}

function renderEquipamentos() {
  const el = document.getElementById('equip-table-body');
  if (!el) return;

  // Atualiza a lista de responsáveis antes de filtrar
  const list = getFilteredEquipamentos(populateResponsavelFilter());

  setText('equip-count', `${list.length} de ${allEquipamentos.length} equipamento(s)`);

  if (!list.length) {
    el.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum equipamento encontrado</td></tr>`;
    return;
  }

  const statusColor = { 'Em uso':'var(--accent)', 'Disponível':'var(--success)', 'Em manutenção':'var(--warning)', 'Descartado':'var(--fg3)' };

  el.innerHTML = list.map(e => `
    <tr>
      <td><span style="font-family:var(--mono);font-size:11px;color:var(--fg3)">${esc(e.serie || '–')}</span></td>
      <td>
        <div style="font-weight:500">${esc(e.marca || '–')} ${esc(e.modelo || '')}</div>
        <div style="font-size:11px;color:var(--fg3)">${esc(e.tipo || '')}</div>
      </td>
      <td>${e.data_aquisicao ? new Date(`${e.data_aquisicao}T00:00:00`).toLocaleDateString('pt-BR') : '–'}</td>
      <td>${esc(e.loja)}</td>
      <td>
        ${e.responsavel
          ? `<div style="font-size:12px;font-weight:500">${esc(e.responsavel)}</div>
             ${e.responsavel_email ? `<div style="font-size:11px;color:var(--fg3)">${esc(e.responsavel_email)}</div>` : ''}`
          : '<span style="color:var(--fg3)">–</span>'}
      </td>
      <td>
        <span style="font-size:12px;font-weight:600;color:${statusColor[e.status] || 'var(--fg)'}">${esc(e.status)}</span>
      </td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editEquip('${e.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteEquip('${e.id}')">Excluir</button>
      </td>
    </tr>`).join('');
}

// ─────────────────────────────────────────
// Exportar equipamentos (CSV ou Excel), respeitando os filtros
// ─────────────────────────────────────────
async function exportEquipamentos(formato) {
  const list = getFilteredEquipamentos();
  if (!list.length) { toast('Nenhum equipamento para exportar.', 'info'); return; }

  const excel  = formato === 'xlsx';
  const header = [
    'Série / Patrimônio', 'Tipo', 'Marca', 'Modelo', 'Data de aquisição', 'Loja',
    'Responsável', 'E-mail do responsável', 'Status', 'Observações', 'Atualizado em',
  ];
  const rows = list.map(e => {
    const aquisicao = e.data_aquisicao ? new Date(`${e.data_aquisicao}T00:00:00`).getTime() : null;
    return [
      e.serie || '', e.tipo || '', e.marca || '', e.modelo || '',
      excel ? excelDate(aquisicao) : fmtDateShort(aquisicao),
      e.loja || '', e.responsavel || '', e.responsavel_email || '',
      e.status || '', e.obs || '',
      excel ? excelDate(e.atualizadoEm) : fmtDate(e.atualizadoEm),
    ];
  });
  const name = `equipamentos_${fileDateStamp()}`;

  try {
    if (excel) {
      await downloadXLSX(`${name}.xlsx`, [
        { name: 'Equipamentos', header, rows,
          dates: { E: 'dd/mm/yyyy', K: 'dd/mm/yyyy hh:mm' },
          widths: [20, 20, 16, 22, 14, 20, 24, 28, 14, 40, 17] },
      ]);
    } else {
      downloadCSV(`${name}.csv`, header, rows);
    }
    toast(`${list.length} equipamento(s) exportado(s).`, 'ok');
  } catch (err) {
    console.error('exportEquipamentos:', err);
    toast('Erro ao exportar: ' + err.message, 'err');
  }
}

// ─────────────────────────────────────────
// Filtros de equipamentos
// ─────────────────────────────────────────
const SEM_RESPONSAVEL = '__sem__';

// Nome do responsável normalizado ("joão " e "João" contam como a mesma pessoa)
function respKey(nome) {
  return (nome || '').trim().toLocaleLowerCase('pt-BR');
}

// Monta a lista de responsáveis a partir dos equipamentos cadastrados,
// mantendo a seleção atual. Devolve o valor selecionado.
function populateResponsavelFilter() {
  const sel = document.getElementById('ef-responsavel');
  if (!sel) return '';
  const atual = sel.value;

  const nomes = new Map(); // chave normalizada → nome como foi digitado
  allEquipamentos.forEach(e => {
    const k = respKey(e.responsavel);
    if (k && !nomes.has(k)) nomes.set(k, e.responsavel.trim());
  });
  const ordenados = [...nomes.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

  sel.innerHTML = '<option value="">Todos os responsáveis</option>' +
    ordenados.map(([k, nome]) => `<option value="${esc(k)}">${esc(nome)}</option>`).join('') +
    `<option value="${SEM_RESPONSAVEL}">Sem responsável</option>`;

  sel.value = [...sel.options].some(o => o.value === atual) ? atual : '';
  return sel.value;
}
function populateLojaFilterEquip() {
  const sel = document.getElementById('ef-loja');
  if (!sel || sel.dataset.populated) return;
  LOJAS.forEach(l => {
    const o = document.createElement('option');
    o.value = l; o.textContent = l; sel.appendChild(o);
  });
  sel.dataset.populated = '1';

  // Popula tipos também
  const tipoSel = document.getElementById('ef-tipo');
  if (tipoSel && !tipoSel.dataset.populated) {
    TIPOS_EQUIP.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t; tipoSel.appendChild(o);
    });
    tipoSel.dataset.populated = '1';
  }
}

// ─────────────────────────────────────────
// Janela modal: novo / editar equipamento
// ─────────────────────────────────────────
function openNovoEquip() {
  document.getElementById('me-titulo').textContent = 'Novo Equipamento';
  document.getElementById('form-equip').reset();
  document.getElementById('e-id').value = '';

  // Popula lojas no modal
  const sel = document.getElementById('e-loja');
  if (sel && !sel.dataset.populated) {
    LOJAS.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l; sel.appendChild(o);
    });
    sel.dataset.populated = '1';
  }

  openModal('modal-equip');
}

function editEquip(id) {
  const e = allEquipamentos.find(x => x.id === id);
  if (!e) return;

  document.getElementById('me-titulo').textContent = 'Editar Equipamento';
  document.getElementById('e-id').value      = e.id;
  document.getElementById('e-serie').value   = e.serie  || '';
  document.getElementById('e-tipo').value    = e.tipo   || '';
  document.getElementById('e-marca').value   = e.marca  || '';
  document.getElementById('e-modelo').value  = e.modelo || '';
  document.getElementById('e-data-aquisicao').value = e.data_aquisicao || '';
  document.getElementById('e-status').value  = e.status || 'Em uso';
  document.getElementById('e-obs').value     = e.obs    || '';

  // Preenche e seleciona a loja
  const lojaEl = document.getElementById('e-loja');
  if (lojaEl && !lojaEl.dataset.populated) {
    LOJAS.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l; lojaEl.appendChild(o);
    });
    lojaEl.dataset.populated = '1';
  }
  if (lojaEl) lojaEl.value = e.loja || '';

  // Responsável
  document.getElementById('e-responsavel').value       = e.responsavel       || '';
  document.getElementById('e-responsavel-email').value = e.responsavel_email || '';

  openModal('modal-equip');
}

async function submitEquip(ev) {
  ev.preventDefault();
  const btn    = document.getElementById('btn-submit-equip');
  const existId = document.getElementById('e-id').value;
  const existing = allEquipamentos.find(e => e.id === existId);
  const serie = document.getElementById('e-serie').value.trim();
  const tipo = document.getElementById('e-tipo').value;
  const marca = document.getElementById('e-marca').value.trim();
  const modelo = document.getElementById('e-modelo').value.trim();

  const payload = {
    serie:              serie || null,
    tipo,
    nome:               existing?.nome || serie || [tipo, marca, modelo].filter(Boolean).join(' '),
    marca:              marca || null,
    modelo:             modelo || null,
    data_aquisicao:     document.getElementById('e-data-aquisicao').value,
    loja:               document.getElementById('e-loja').value,
    status:             document.getElementById('e-status').value,
    obs:                document.getElementById('e-obs').value.trim()    || null,
    responsavel:        document.getElementById('e-responsavel').value.trim()       || null,
    responsavel_email:  document.getElementById('e-responsavel-email').value.trim() || null,
    atualizado_em:      new Date().toISOString(),
  };

  if (!payload.tipo || !payload.nome || !payload.data_aquisicao || !payload.loja) {
    toast('Preencha os campos obrigatórios (*).', 'err'); return;
  }

  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    if (existId) {
      const { error } = await supa.from('equipamentos').update(payload).eq('id', existId);
      if (error) throw error;
      toast('Equipamento atualizado!', 'ok');
    } else {
      payload.criado_em = new Date().toISOString();
      const { error } = await supa.from('equipamentos').insert(payload);
      if (error) throw error;
      toast('Equipamento cadastrado!', 'ok');
    }
    closeModal('modal-equip');
    // Recarrega na hora; o tempo real atualiza os outros administradores
    await loadEquipamentos();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

async function deleteEquip(id) {
  const e = allEquipamentos.find(x => x.id === id);
  if (!confirm(`Remover "${e?.serie || e?.nome || id}" do inventário?`)) return;
  try {
    const { error } = await supa.from('equipamentos').delete().eq('id', id);
    if (error) throw error;
    toast('Equipamento removido.', 'info');
    await loadEquipamentos();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
