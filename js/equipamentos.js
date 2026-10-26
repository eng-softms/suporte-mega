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
    throw error;
  }
  allEquipamentos = (data || []).map(r => ({
    ...r,
    criadoEm:     r.criado_em     ? new Date(r.criado_em).getTime()     : null,
    atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em).getTime() : null,
  }));
  renderEquipamentos();
  populateEquipSelect?.(); // atualiza select no form de chamado se existir
}

function subscribeEquipamentos() {
  supa.channel('equip-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos' }, async () => {
      await loadEquipamentos();
    })
    .subscribe();
}

// ─────────────────────────────────────────
// Render tabela
// ─────────────────────────────────────────
function renderEquipamentos() {
  const el = document.getElementById('equip-table-body');
  if (!el) return;

  // Filtros
  const busca = (document.getElementById('ef-busca')?.value  || '').toLowerCase();
  const loja  = document.getElementById('ef-loja')?.value    || '';
  const tipo  = document.getElementById('ef-tipo')?.value    || '';
  const stat  = document.getElementById('ef-status')?.value  || '';

  const list = allEquipamentos.filter(e => {
    if (loja && e.loja   !== loja)   return false;
    if (tipo && e.tipo   !== tipo)   return false;
    if (stat && e.status !== stat)   return false;
    if (busca) {
      const hay = [e.serie, e.marca, e.modelo, e.loja, e.obs, e.responsavel].join(' ').toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    return true;
  });

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

  // Contador
  setText('equip-count', `${list.length} de ${allEquipamentos.length} equipamento(s)`);
}

// ─────────────────────────────────────────
// Filtros de equipamentos
// ─────────────────────────────────────────
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
// Modal: Novo / Editar Equipamento
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

  // Popula e seta loja
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
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
