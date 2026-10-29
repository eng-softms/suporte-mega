/* ═══════════════════════════════════════════
   SUPORTE MEGA – Relatórios (somente admin)
   ═══════════════════════════════════════════ */

function getRelData() {
  const periodo    = parseInt(document.getElementById('rel-periodo')?.value    || '0');
  const filterLoja = document.getElementById('rel-filtro-loja')?.value || '';
  const now        = Date.now();

  return allChamados.filter(c => {
    if (filterLoja && c.loja !== filterLoja) return false;
    if (periodo && c.criadoEm && (now - c.criadoEm) > periodo * 86400000) return false;
    return true;
  });
}

function renderRelatorios() {
  // Popula filtro de loja uma vez
  const relLoja = document.getElementById('rel-filtro-loja');
  if (relLoja && !relLoja.dataset.populated) {
    LOJAS.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l; relLoja.appendChild(o);
    });
    relLoja.dataset.populated = '1';
  }

  const data  = getRelData();
  const total = data.length;
  setText('rel-total', total);

  // ── Métricas de nível de serviço (SLA) ──
  const fechados = data.filter(c => (c.status === 'Fechado' || c.status === 'Resolvido') && c.atualizadoEm && c.criadoEm);
  if (fechados.length) {
    const avg = fechados.reduce((s, c) => s + (c.atualizadoEm - c.criadoEm), 0) / fechados.length;
    setText('rel-tempo', (avg / 86400000).toFixed(1) + 'd');
  } else {
    setText('rel-tempo', '–');
  }

  // Taxa de resolução
  const resolvidos = data.filter(c => c.status === 'Fechado' || c.status === 'Resolvido').length;
  const taxa       = total > 0 ? Math.round(resolvidos / total * 100) : 0;
  setText('rel-taxa', taxa + '%');

  // Urgentes resolvidos
  const urgentesTotal    = data.filter(c => c.prioridade === 'Urgente').length;
  const urgentesResolvidos = data.filter(c => c.prioridade === 'Urgente' && (c.status === 'Fechado' || c.status === 'Resolvido')).length;
  setText('rel-urgentes-resolvidos', `${urgentesResolvidos}/${urgentesTotal}`);

  // ── Dados agrupados ──
  const catC = {}, lojaC = {}, prioC = {}, statusC = {}, mesC = {};

  data.forEach(c => {
    catC[c.categoria]   = (catC[c.categoria]   || 0) + 1;
    lojaC[c.loja]       = (lojaC[c.loja]       || 0) + 1;
    prioC[c.prioridade] = (prioC[c.prioridade] || 0) + 1;
    statusC[c.status]   = (statusC[c.status]   || 0) + 1;
    if (c.criadoEm) {
      // Chave AAAA-MM para ordenar em ordem cronológica
      const d   = new Date(c.criadoEm);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      mesC[mes] = (mesC[mes] || 0) + 1;
    }
  });

  const topCat    = Object.entries(catC).sort((a, b) => b[1] - a[1]);
  const topLoja   = Object.entries(lojaC).sort((a, b) => b[1] - a[1]);
  const topPrio   = ['Urgente','Alta','Média','Baixa'].map(p => [p, prioC[p] || 0]);
  const topStatus = STATUS_CHAMADO.map(s => [s, statusC[s] || 0]).filter(e => e[1] > 0);

  setText('rel-cat',  topCat[0]?.[0]  || '–');
  setText('rel-loja', topLoja[0]?.[0] || '–');

  renderBars('rel-cat-bars',    topCat,             'var(--accent)');
  renderBars('rel-loja-bars',   topLoja.slice(0,12),'var(--warning)');
  renderBars('rel-prio-bars',   topPrio,             'var(--danger)');
  renderBars('rel-status-bars', topStatus,           'var(--success)');

  // ── Tendência mensal ──
  const mesEntries = Object.entries(mesC)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => {
      const [y, m] = k.split('-').map(Number);
      return [new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }), n];
    });
  renderBars('rel-mes-bars', mesEntries, 'var(--info)');

  // ── Recorrências ──
  const grp = {};
  data.forEach(c => {
    const k = `${c.categoria}||${c.loja}`;
    if (!grp[k]) grp[k] = { cat: c.categoria, loja: c.loja, n: 0, urgentes: 0 };
    grp[k].n++;
    if (c.prioridade === 'Urgente') grp[k].urgentes++;
  });

  const recEl  = document.getElementById('rel-recorrentes');
  const sorted = Object.values(grp).filter(g => g.n > 1).sort((a, b) => b.n - a.n).slice(0, 20);

  if (!sorted.length) {
    recEl.innerHTML = '<div class="empty-state"><p>Sem recorrências identificadas no período.</p></div>';
  } else {
    recEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Categoria</th><th>Loja</th><th>Ocorrências</th><th>Urgentes</th><th>Risco</th>
          </tr></thead>
          <tbody>${sorted.map(g => {
            const risco = g.n >= 5 || g.urgentes >= 2
              ? '<span class="badge badge-urgente">Alto</span>'
              : g.n >= 3
              ? '<span class="badge badge-alta">Médio</span>'
              : '<span class="badge badge-baixa">Baixo</span>';
            return `<tr>
              <td>${esc(g.cat)}</td>
              <td>${esc(g.loja)}</td>
              <td><strong style="font-variant-numeric:tabular-nums;color:${g.n >= 5 ? 'var(--danger)' : g.n >= 3 ? 'var(--warning)' : 'var(--fg)'}">${g.n}</strong></td>
              <td>${g.urgentes > 0 ? `<span style="color:var(--danger);font-weight:600">${g.urgentes}</span>` : '–'}</td>
              <td>${risco}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }
}

// ── Exportar relatório CSV ──
function exportRelCSV() {
  const data = getRelData();
  if (!data.length) { toast('Sem dados no período.', 'info'); return; }

  const cols = ['ID','Data','Loja','Solicitante','E-mail','Categoria','Prioridade','Status','Assunto','Equipamento'];
  const rows = data.map(c => [
    c.id, fmtDate(c.criadoEm), c.loja, c.nome, c.email_abertura || '',
    c.categoria, c.prioridade, c.status, c.assunto, c.equipamento || ''
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

  const csv  = '﻿' + [cols.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const name = `relatorio_${new Date().toISOString().slice(0, 10)}.csv`;
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast(`${data.length} registros exportados.`, 'ok');
}
