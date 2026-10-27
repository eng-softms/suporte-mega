/* ═══════════════════════════════════════════
   SUPORTE MEGA – Chamados (operações de cadastro, consulta, atualização e exclusão + renderização)
   ═══════════════════════════════════════════ */

let allChamados = [];
let sortField   = 'criado_em';
let sortDir     = 'desc';
let detailRequestId = 0;

// ─────────────────────────────────────────
// Carregamento
// ─────────────────────────────────────────
async function loadChamados() {
  let query = supa.from('chamados').select('*').order('criado_em', { ascending: false });

  // Usuário comum: só vê os próprios chamados
  if (currentProfile && currentProfile.role !== 'admin') {
    query = query.eq('user_id', currentUser.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('loadChamados:', error.message, error.details, error.hint);
    throw error;
  }
  allChamados = (data || []).map(normalizeRow);
  renderAll();
}

// ─────────────────────────────────────────
// Converte snake_case para camelCase e datas para milissegundos
// ─────────────────────────────────────────
function normalizeRow(r) {
  return {
    ...r,
    criadoEm:     r.criado_em     ? new Date(r.criado_em).getTime()     : null,
    atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em).getTime() : null,
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDescricaoHtml(value = '', imageUrl = '') {
  const raw = String(value || '').trim();
  if (!raw) return 'Sem descrição.';

  const imageMatch = raw.match(/\[imagem-storage:\s*([^\]\r\n]+)\]/);
  const legacyImageMatch = raw.match(/data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+/i);
  const description = raw
    .replace(/\[imagem-storage:\s*[^\]\r\n]+\]/g, '')
    .replace(/data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+/ig, '')
    .trim();
  imageUrl = imageUrl || legacyImageMatch?.[0] || '';
  const text = escapeHtml(description || 'Sem descrição.').replace(/\n/g, '<br>');
  const imageHtml = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="Imagem anexada ao chamado" style="display:block;max-width:100%;margin-top:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);">`
    : '';
  return `${text}${imageMatch || legacyImageMatch ? imageHtml : ''}`;
}

function bindImagePreview() {
  const input = document.getElementById('c-imagem');
  const previewWrap = document.getElementById('c-imagem-preview');
  const thumb = document.getElementById('c-imagem-thumb');
  if (!input || !previewWrap || !thumb) return;

  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) {
      previewWrap.style.display = 'none';
      thumb.src = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast('Selecione apenas imagens.', 'err');
      input.value = '';
      previewWrap.style.display = 'none';
      thumb.src = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      thumb.src = reader.result;
      previewWrap.style.display = 'block';
    };
    reader.onerror = () => {
      toast('Não foi possível carregar a pré-visualização da imagem.', 'err');
      input.value = '';
      previewWrap.style.display = 'none';
      thumb.src = '';
    };
    reader.readAsDataURL(file);
  };

  input.form?.addEventListener('reset', () => {
    setTimeout(() => {
      previewWrap.style.display = 'none';
      thumb.src = '';
    }, 0);
  });
}

function getStorageImagePath(description) {
  const match = String(description || '').match(/\[imagem-storage:\s*([^\]\r\n]+)\]/);
  const path = match?.[1]?.trim() || '';
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(path) ? path : '';
}

// ─────────────────────────────────────────
// Atualizações em tempo real
// ─────────────────────────────────────────
function subscribeChamados() {
  supa.channel('chamados-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, async () => {
      await loadChamados();
    })
    .subscribe();
}

// ─────────────────────────────────────────
// Renderização principal
// ─────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderChamadosTable(getSortedFiltered());
}

function getFilteredChamados() {
  const busca   = (document.getElementById('f-busca')?.value  || '').toLowerCase();
  const status  = document.getElementById('f-status')?.value  || '';
  const prio    = document.getElementById('f-prioridade')?.value || '';
  const cat     = document.getElementById('f-categoria')?.value || '';
  const loja    = document.getElementById('f-loja')?.value    || '';
  const periodo = parseInt(document.getElementById('f-periodo')?.value || '0');
  const now     = Date.now();

  return allChamados.filter(c => {
    if (status  && c.status     !== status)  return false;
    if (prio    && c.prioridade !== prio)     return false;
    if (cat     && c.categoria  !== cat)      return false;
    if (loja    && c.loja       !== loja)      return false;
    if (periodo && c.criadoEm   && (now - c.criadoEm) > periodo * 86400000) return false;
    if (busca) {
      const hay = [c.nome, c.contato, c.assunto, c.descricao, c.loja, c.categoria, c.id]
        .join(' ').toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    return true;
  });
}

function getSortedFiltered() {
  const arr = getFilteredChamados();
  return arr.sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'prioridade') { va = PRIO_ORDER[va] ?? 99; vb = PRIO_ORDER[vb] ?? 99; }
    if (sortField === 'status')     { va = STATUS_ORDER[va] ?? 99; vb = STATUS_ORDER[vb] ?? 99; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

function sortBy(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'asc'; }
  renderChamadosTable(getSortedFiltered());
}

// ─────────────────────────────────────────
// Painel
// ─────────────────────────────────────────
function renderDashboard() {
  const abertos    = allChamados.filter(c => c.status === 'Aberto').length;
  const andamento  = allChamados.filter(c => c.status === 'Em Andamento' || c.status === 'Aguardando usuário').length;
  const urgentes   = allChamados.filter(c => c.prioridade === 'Urgente' && c.status !== 'Fechado' && c.status !== 'Cancelado').length;
  const thirtyDays = Date.now() - 30 * 86400000;
  const fechados   = allChamados.filter(c => (c.status === 'Fechado' || c.status === 'Resolvido') && c.atualizadoEm > thirtyDays).length;

  setText('stat-abertos',   abertos);
  setText('stat-andamento', andamento);
  setText('stat-urgentes',  urgentes);
  setText('stat-fechados',  fechados);

  // Indicador de chamados na navegação
  const badgeEl = document.getElementById('badge-abertos');
  if (badgeEl) {
    badgeEl.textContent = abertos;
    badgeEl.style.display = abertos > 0 ? '' : 'none';
  }

  // Chamados recentes (últimos 10 abertos/em andamento)
  const recentes = allChamados
    .filter(c => c.status !== 'Fechado' && c.status !== 'Cancelado')
    .slice(0, 10);

  const recentesEl = document.getElementById('recentes-list');
  if (recentesEl) {
    if (!recentes.length) {
      recentesEl.innerHTML = '<div class="empty-state" style="padding:16px"><p>Nenhum chamado aberto</p></div>';
    } else {
      recentesEl.innerHTML = recentes.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer"
             onclick="openDetalhe('${c.id}')">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.assunto)}</div>
            <div style="font-size:11px;color:var(--fg3)">${esc(c.loja)} · ${esc(c.nome)} · ${fmtRelTime(c.criadoEm)}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">${prioBadge(c.prioridade)}</div>
        </div>`).join('');
    }
  }

  // Gráfico por categoria
  const catCount = {};
  allChamados.filter(c => c.status !== 'Fechado' && c.status !== 'Cancelado').forEach(c => {
    catCount[c.categoria] = (catCount[c.categoria] || 0) + 1;
  });
  const catEntries = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  renderBars('cat-chart', catEntries, 'var(--accent)');
}

// ─────────────────────────────────────────
// Tabela de chamados
// ─────────────────────────────────────────
function renderChamadosTable(list) {
  const el = document.getElementById('chamados-table-body');
  if (!el) return;

  const isAdmin = currentProfile?.role === 'admin';

  if (!list.length) {
    el.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum chamado encontrado</td></tr>`;
    return;
  }

  el.innerHTML = list.map(c => {
    const colSolicitante = isAdmin
      ? `<td>${esc(c.nome)}<br><small style="color:var(--fg3)">${esc(c.email_abertura || '')}</small></td>`
      : `<td>${esc(c.nome)}</td>`;

    return `<tr onclick="openDetalhe('${c.id}')" style="cursor:pointer">
      <td><span style="font-family:var(--mono);font-size:11px;color:var(--fg3)">#${c.id.substring(0,6)}</span></td>
      <td class="wrap" style="max-width:220px"><strong>${esc(c.assunto)}</strong><br><small style="color:var(--fg3)">${esc(c.categoria)}</small></td>
      ${colSolicitante}
      <td>${esc(c.loja)}</td>
      <td>${prioBadge(c.prioridade)}</td>
      <td>${statusBadge(c.status)}</td>
      <td><span style="font-size:12px;color:var(--fg3)">${fmtDate(c.criadoEm)}</span></td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        ${isAdmin ? `<button class="btn btn-ghost btn-sm" onclick="openDetalhe('${c.id}')">Ver</button>` : `<button class="btn btn-ghost btn-sm" onclick="openDetalhe('${c.id}')">Ver</button>`}
      </td>
    </tr>`;
  }).join('');
}

// Atualiza cabeçalho de "Solicitante" baseado no perfil
function updateChamadosTableHeader() {
  const isAdmin = currentProfile?.role === 'admin';
  const header  = document.getElementById('th-solicitante');
  if (header) header.textContent = isAdmin ? 'Solicitante' : 'Nome';
}

// ─────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────
function populateLojaFilter() {
  const sel = document.getElementById('f-loja');
  if (!sel || sel.dataset.populated) return;
  LOJAS.forEach(l => {
    const o = document.createElement('option');
    o.value = l; o.textContent = l;
    sel.appendChild(o);
  });
  sel.dataset.populated = '1';
}

// ─────────────────────────────────────────
// Janela modal com os detalhes do chamado
// ─────────────────────────────────────────
async function openDetalhe(id) {
  const c = allChamados.find(x => x.id === id);
  if (!c) return;
  const requestId = ++detailRequestId;

  const isAdmin   = currentProfile?.role === 'admin';
  const isMine    = c.user_id === currentUser?.id;
  const canEdit   = isAdmin;
  const canDelete = isAdmin;

  const statusOptions = STATUS_CHAMADO.map(s =>
    `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  let imageUrl = '';
  const imagePath = getStorageImagePath(c.descricao);
  if (imagePath) {
    try {
      const { data, error } = await supa.storage
        .from('chamados-imagens')
        .createSignedUrl(imagePath, 3600);
      if (error) throw error;
      imageUrl = data.signedUrl;
    } catch (e) {
      toast('Não foi possível carregar a imagem: ' + e.message, 'err');
    }
  }
  if (requestId !== detailRequestId) return;

  document.getElementById('md-titulo').textContent = c.assunto;
  document.getElementById('md-body').innerHTML = `
    <div class="detail-header">
      <div style="flex:1">
        <div class="detail-meta">
          ${prioBadge(c.prioridade)} ${statusBadge(c.status)}
          <span style="font-size:11px;color:var(--fg3)">Aberto ${fmtRelTime(c.criadoEm)}</span>
        </div>
      </div>
      ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteChamado('${c.id}')">Excluir</button>` : ''}
    </div>

    <div class="detail-grid">
      <div class="detail-field">
        <div class="detail-field-label">Solicitante</div>
        <div class="detail-field-val">${esc(c.nome)}${c.email_abertura ? `<br><small style="color:var(--fg3)">${esc(c.email_abertura)}</small>` : ''}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Contato</div>
        <div class="detail-field-val">${esc(c.contato || '–')}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Loja / Setor</div>
        <div class="detail-field-val">${esc(c.loja)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Categoria</div>
        <div class="detail-field-val">${esc(c.categoria)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Equipamento</div>
        <div class="detail-field-val">${esc(c.equipamento || '–')}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Última atualização</div>
        <div class="detail-field-val">${fmtDate(c.atualizadoEm)}</div>
      </div>
    </div>

    <div>
      <div class="detail-field-label" style="margin-bottom:6px">Descrição</div>
      <div class="detail-body">${formatDescricaoHtml(c.descricao, imageUrl)}</div>
    </div>

    ${canEdit ? `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--bg3);border-radius:var(--radius-sm);padding:12px 14px">
      <label style="font-size:12px;font-weight:600;color:var(--fg2)">Status:</label>
      <select id="md-status" style="flex:1;min-width:160px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:6px 10px;font-family:var(--font);font-size:13px;outline:none">
        ${statusOptions}
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveStatus('${c.id}')">Salvar</button>
    </div>
    ` : ''}

    <div>
      <div class="detail-field-label" style="margin-bottom:6px">Observações / Histórico</div>
      <div class="detail-body" style="min-height:60px">${esc(c.observacao || 'Nenhuma observação.')}</div>
    </div>

    ${canEdit ? `
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <textarea id="md-obs" class="form-control" rows="3" placeholder="Adicionar observação ou atualize o histórico…" style="flex:1">${esc(c.observacao || '')}</textarea>
      <button class="btn btn-ghost btn-sm" onclick="saveObs('${c.id}')">Salvar obs.</button>
    </div>
    ` : ''}
  `;

  openModal('modal-detalhe');
}

async function saveStatus(id) {
  const status = document.getElementById('md-status')?.value;
  if (!status) return;
  try {
    const { error } = await supa.from('chamados')
      .update({ status, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast('Status atualizado!', 'ok');
    closeModal('modal-detalhe');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

async function saveObs(id) {
  const obs = document.getElementById('md-obs')?.value || '';
  try {
    const { error } = await supa.from('chamados')
      .update({ observacao: obs, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast('Observação salva!', 'ok');
    closeModal('modal-detalhe');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

async function deleteChamado(id) {
  if (!confirm('Excluir este chamado permanentemente?')) return;
  try {
    const { error } = await supa.from('chamados').delete().eq('id', id);
    if (error) throw error;
    toast('Chamado excluído.', 'info');
    closeModal('modal-detalhe');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────
// Formulário: Novo Chamado
// ─────────────────────────────────────────
function initFormNovo() {
  bindImagePreview();

  // Preenche a lista de lojas
  const lojasSel = document.getElementById('c-loja');
  if (lojasSel && !lojasSel.dataset.populated) {
    LOJAS.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l; lojasSel.appendChild(o);
    });
    lojasSel.dataset.populated = '1';
  }

  // Preenche as categorias
  const catSel = document.getElementById('c-categoria');
  if (catSel && !catSel.dataset.populated) {
    CATEGORIAS.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c; catSel.appendChild(o);
    });
    catSel.dataset.populated = '1';
  }

  // Preenche a lista de equipamentos no campo de seleção
  populateEquipSelect();
}

function populateEquipSelect() {
  const sel = document.getElementById('c-equipamento');
  if (!sel) return;
  const val = sel.value;
  // Mantém apenas a opção vazia
  while (sel.options.length > 1) sel.remove(1);
  allEquipamentos.forEach(e => {
    const o = document.createElement('option');
    const nome = e.nome || e.serie || e.tipo;
    o.value = nome; o.textContent = `${nome} (${e.tipo} – ${e.loja})`;
    sel.appendChild(o);
  });
  sel.value = val;
}

async function submitChamado(ev) {
  ev.preventDefault();
  const btn = ev.submitter || document.getElementById('btn-submit-chamado');

  const nome       = document.getElementById('c-nome').value.trim();
  const contato    = document.getElementById('c-contato').value.trim();
  const loja       = document.getElementById('c-loja').value;
  const categoria  = document.getElementById('c-categoria').value;
  const prioridade = document.getElementById('c-prioridade').value;
  const equipamento= document.getElementById('c-equipamento').value;
  const assunto    = document.getElementById('c-assunto').value.trim();
  const descricao  = document.getElementById('c-descricao').value.trim();
  const inputImage = document.getElementById('c-imagem');
  const imageFile = inputImage?.files?.[0] || null;

  if (!nome || !loja || !categoria || !assunto) {
    toast('Preencha os campos obrigatórios (*).', 'err'); return;
  }

  btn.disabled = true; btn.textContent = 'Enviando…';

  let uploadedImagePath = '';
  try {
    if (imageFile) {
      const fileExtensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const extension = fileExtensions[imageFile.type];
      if (!extension) {
        throw new Error('Use uma imagem JPG, PNG, GIF ou WebP.');
      }
      if (imageFile.size > 2 * 1024 * 1024) {
        throw new Error('A imagem deve ter até 2 MB.');
      }
      if (!currentUser?.id) {
        throw new Error('Faça login novamente antes de anexar uma imagem.');
      }

      uploadedImagePath = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supa.storage
        .from('chamados-imagens')
        .upload(uploadedImagePath, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
    }

    const descricaoFinal = uploadedImagePath
      ? `${descricao}${descricao ? '\n\n' : ''}[imagem-storage: ${uploadedImagePath}]`
      : descricao;
    const now = new Date().toISOString();
    const payload = {
      user_id:        currentUser?.id || null,
      email_abertura: currentUser?.email || null,
      nome, contato, loja, categoria, prioridade,
      equipamento: equipamento || null,
      assunto, descricao: descricaoFinal,
      status:       'Aberto',
      criado_em:    now,
      atualizado_em: now,
    };

    const { error } = await supa.from('chamados').insert(payload);
    if (error) throw error;
    uploadedImagePath = '';
    toast('Chamado aberto com sucesso!', 'ok');
    ev.target.reset();
    const previewWrap = document.getElementById('c-imagem-preview');
    const thumb = document.getElementById('c-imagem-thumb');
    if (previewWrap) previewWrap.style.display = 'none';
    if (thumb) thumb.src = '';
    if (currentProfile) document.getElementById('c-nome').value = currentProfile.display_name;
    navigate('chamados');
  } catch (e) {
    if (uploadedImagePath) {
      try {
        const { error: cleanupError } = await supa.storage
          .from('chamados-imagens')
          .remove([uploadedImagePath]);
        if (cleanupError) {
          console.error('Não foi possível remover a imagem após falha ao abrir o chamado:', cleanupError);
        }
      } catch (cleanupError) {
        console.error('Não foi possível remover a imagem após falha ao abrir o chamado:', cleanupError);
      }
    }
    toast('Erro ao enviar: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Abrir Chamado';
  }
}

// ─────────────────────────────────────────
// Exportar arquivo CSV
// ─────────────────────────────────────────
async function exportCSV() {
  const list = getSortedFiltered();
  if (!list.length) { toast('Nenhum dado para exportar.', 'info'); return; }

  const isAdmin = currentProfile?.role === 'admin';
  const cols    = ['ID','Data','Loja','Solicitante','E-mail','Contato','Categoria','Prioridade','Status','Assunto','Equipamento','Descrição'];
  const rows    = list.map(c => [
    c.id, fmtDate(c.criadoEm), c.loja, c.nome,
    isAdmin ? (c.email_abertura || '') : '',
    c.contato || '', c.categoria, c.prioridade, c.status, c.assunto,
    c.equipamento || '', (c.descricao || '').replace(/\n/g, ' ')
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

  const csv  = '﻿' + [cols.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const name = `chamados_${new Date().toISOString().slice(0, 10)}.csv`;

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast(`${list.length} chamados exportados.`, 'ok');
}

// ─────────────────────────────────────────
// Gráfico de barras
// ─────────────────────────────────────────
function renderBars(elId, entries, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!entries.length) { el.innerHTML = '<div class="empty-state" style="padding:16px"><p>Sem dados</p></div>'; return; }
  const max = Math.max(...entries.map(e => e[1]));
  el.innerHTML = entries.map(([label, n]) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="font-size:12px;width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg2);flex-shrink:0">${esc(label)}</div>
      <div style="flex:1;background:var(--bg3);border-radius:3px;height:10px;overflow:hidden">
        <div style="height:100%;width:${Math.round(n / max * 100)}%;background:${color};border-radius:3px;transition:width .3s"></div>
      </div>
      <div style="font-size:12px;font-variant-numeric:tabular-nums;font-weight:600;color:var(--fg);width:24px;text-align:right;flex-shrink:0">${n}</div>
    </div>`).join('');
}
