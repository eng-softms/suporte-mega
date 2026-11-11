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

// ── Tipo de gráfico: 'barras' ou 'pizza' (lembrado no navegador) ──
let relChartMode = (() => {
  try { return localStorage.getItem('rel-chart-mode') === 'pizza' ? 'pizza' : 'barras'; }
  catch { return 'barras'; }
})();

function setRelChartMode(mode) {
  relChartMode = mode;
  try { localStorage.setItem('rel-chart-mode', mode); } catch {}
  renderRelatorios();
}

function syncRelChartModeButtons() {
  document.querySelectorAll('[data-chart-mode]').forEach(b => {
    const on = b.dataset.chartMode === relChartMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

// Gráfico de rosca com legenda (quantidade e %). Máximo de 8 cores:
// a partir da 8ª fatia, o restante é somado em "Outros".
function renderPie(elId, entries) {
  const el = document.getElementById(elId);
  if (!el) return;
  const total = entries.reduce((s, e) => s + e[1], 0);
  if (!total) { el.innerHTML = '<div class="empty-state" style="padding:16px"><p>Sem dados</p></div>'; return; }

  let slices = entries;
  if (entries.length > 8) {
    const resto = entries.slice(7).reduce((s, e) => s + e[1], 0);
    slices = [...entries.slice(0, 7), ['Outros', resto]];
  }

  const C = 75, R = 72, r = 46;
  const pt = (rad, a) => `${(C + rad * Math.sin(a)).toFixed(2)},${(C - rad * Math.cos(a)).toFixed(2)}`;
  const arc = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
  };

  let a = 0;
  const paths = slices.map(([label, n], i) => {
    const sweep = n / total * Math.PI * 2;
    const pct   = Math.round(n / total * 100);
    // Uma fatia de 100% vira duas metades (um arco SVG não fecha um círculo inteiro)
    const full = sweep >= Math.PI * 2 - 1e-6;
    const d = full ? arc(0, Math.PI) + arc(Math.PI, Math.PI * 2) : arc(a, a + sweep);
    a += sweep;
    return `<path d="${d}" fill="var(--series-${i + 1})"${full ? ' style="stroke:none"' : ''}><title>${esc(label)}: ${n} (${pct}%)</title></path>`;
  }).join('');

  const legend = slices.map(([label, n], i) => `
    <div class="pie-legend-row">
      <span class="pie-dot" style="background:var(--series-${i + 1})"></span>
      <span class="pie-legend-lbl" title="${esc(label)}">${esc(label)}</span>
      <span class="pie-legend-val">${n}</span>
      <span class="pie-legend-pct">${Math.round(n / total * 100)}%</span>
    </div>`).join('');

  el.innerHTML = `
    <div class="pie-wrap">
      <svg class="pie-svg" viewBox="0 0 150 150" role="img" aria-label="Gráfico de pizza, total ${total}">
        ${paths}
        <text class="pie-total" x="75" y="80">${total}</text>
        <text class="pie-total-lbl" x="75" y="96">chamados</text>
      </svg>
      <div class="pie-legend">${legend}</div>
    </div>`;
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

  const data = getRelData();
  const {
    total, tempoMedioDias, taxa, urgentesTotal, urgentesResolvidos,
    topCat, topLoja, topPrio, topStatus, mesEntries, recorrencias,
  } = computeRelStats(data);

  setText('rel-total', total);
  setText('rel-tempo', tempoMedioDias === null ? '–' : tempoMedioDias.toFixed(1) + 'd');
  setText('rel-taxa', taxa + '%');
  setText('rel-urgentes-resolvidos', `${urgentesResolvidos}/${urgentesTotal}`);

  setText('rel-cat',  topCat[0]?.[0]  || '–');
  setText('rel-loja', topLoja[0]?.[0] || '–');

  syncRelChartModeButtons();
  if (relChartMode === 'pizza') {
    renderPie('rel-cat-bars',    topCat);
    renderPie('rel-loja-bars',   topLoja);
    renderPie('rel-prio-bars',   topPrio.filter(e => e[1] > 0));
    renderPie('rel-status-bars', topStatus);
  } else {
    renderBars('rel-cat-bars',    topCat,             'var(--accent)');
    renderBars('rel-loja-bars',   topLoja.slice(0,12),'var(--warning)');
    renderBars('rel-prio-bars',   topPrio,             'var(--danger)');
    renderBars('rel-status-bars', topStatus,           'var(--success)');
  }

  // ── Tendência mensal (sempre em barras: pizza não mostra evolução no tempo) ──
  renderBars('rel-mes-bars', mesEntries, 'var(--info)');

  // ── Recorrências ──
  const recEl  = document.getElementById('rel-recorrentes');
  const sorted = recorrencias.slice(0, 20);

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
            const risco = `<span class="badge ${RISCO_BADGE[g.risco]}">${g.risco}</span>`;
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

// ─────────────────────────────────────────
// Cálculo das métricas (usado pela tela e pela exportação)
// ─────────────────────────────────────────
const RISCO_BADGE = { 'Alto': 'badge-urgente', 'Médio': 'badge-alta', 'Baixo': 'badge-baixa' };
const isConcluido = c => c.status === 'Fechado' || c.status === 'Resolvido';

function computeRelStats(data) {
  const total = data.length;

  // ── Nível de serviço (SLA) ──
  const fechados = data.filter(c => isConcluido(c) && c.atualizadoEm && c.criadoEm);
  const tempoMedioDias = fechados.length
    ? fechados.reduce((s, c) => s + (c.atualizadoEm - c.criadoEm), 0) / fechados.length / 86400000
    : null;
  const resolvidos = data.filter(isConcluido).length;
  const taxa = total > 0 ? Math.round(resolvidos / total * 100) : 0;
  const urgentesTotal      = data.filter(c => c.prioridade === 'Urgente').length;
  const urgentesResolvidos = data.filter(c => c.prioridade === 'Urgente' && isConcluido(c)).length;

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
  const mesKeys   = Object.keys(mesC).sort();
  const mesEntries = mesKeys.map(k => {
    const [y, m] = k.split('-').map(Number);
    return [new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }), mesC[k]];
  });

  // ── Recorrências (mesma categoria na mesma loja) ──
  const grp = {};
  data.forEach(c => {
    const k = `${c.categoria}||${c.loja}`;
    if (!grp[k]) grp[k] = { cat: c.categoria, loja: c.loja, n: 0, urgentes: 0 };
    grp[k].n++;
    if (c.prioridade === 'Urgente') grp[k].urgentes++;
  });
  const recorrencias = Object.values(grp)
    .filter(g => g.n > 1)
    .sort((a, b) => b.n - a.n)
    .map(g => ({ ...g, risco: g.n >= 5 || g.urgentes >= 2 ? 'Alto' : g.n >= 3 ? 'Médio' : 'Baixo' }));

  return {
    total, tempoMedioDias, resolvidos, taxa, urgentesTotal, urgentesResolvidos,
    topCat, topLoja, topPrio, topStatus, mesKeys, mesC, mesEntries, recorrencias,
  };
}

// ─────────────────────────────────────────
// Exportação do relatório
// ─────────────────────────────────────────
function relFiltroDescricao() {
  const periodo = document.getElementById('rel-periodo');
  const loja    = document.getElementById('rel-filtro-loja')?.value || '';
  const txtPer  = periodo?.selectedOptions?.[0]?.textContent || 'Todo período';
  return `${txtPer} · ${loja || 'Todas as lojas'}`;
}

function exportRelCSV() {
  const data = getRelData();
  if (!data.length) { toast('Sem dados no período.', 'info'); return; }
  const { header, rows } = chamadosTabela(data, false);
  downloadCSV(`relatorio_${fileDateStamp()}.csv`, header, rows);
  toast(`${data.length} registros exportados.`, 'ok');
}

// Excel com várias abas: resumo, agrupamentos, recorrências e a lista de chamados
async function exportRelExcel() {
  const data = getRelData();
  if (!data.length) { toast('Sem dados no período.', 'info'); return; }

  const s   = computeRelStats(data);
  const pct = n => s.total ? Math.round(n / s.total * 1000) / 10 : 0;
  const grupo = (name, titulo, entries) => ({
    name,
    header: [titulo, 'Chamados', '% do total'],
    rows: entries.map(([k, n]) => [k || '(sem informação)', n, pct(n)]),
    widths: [30, 12, 12],
  });

  const resumo = {
    name: 'Resumo',
    header: ['Indicador', 'Valor'],
    rows: [
      ['Filtro aplicado', relFiltroDescricao()],
      ['Gerado em', fmtDate(Date.now())],
      ['Total de chamados', s.total],
      ['Resolvidos / fechados', s.resolvidos],
      ['Taxa de resolução (%)', s.taxa],
      ['Tempo médio de resolução (dias)', s.tempoMedioDias === null ? '–' : Math.round(s.tempoMedioDias * 10) / 10],
      ['Urgentes resolvidos', `${s.urgentesResolvidos}/${s.urgentesTotal}`],
      ['Categoria mais frequente', s.topCat[0]?.[0] || '–'],
      ['Loja com mais chamados', s.topLoja[0]?.[0] || '–'],
    ],
    widths: [34, 34],
  };

  const porMes = {
    name: 'Por mês',
    header: ['Mês', 'Chamados'],
    rows: s.mesKeys.map(k => { const [y, m] = k.split('-'); return [`${m}/${y}`, s.mesC[k]]; }),
    widths: [12, 12],
  };

  const recorr = {
    name: 'Recorrências',
    header: ['Categoria', 'Loja', 'Ocorrências', 'Urgentes', 'Risco'],
    rows: s.recorrencias.map(g => [g.cat, g.loja, g.n, g.urgentes, g.risco]),
    widths: [24, 24, 12, 10, 10],
  };

  try {
    await downloadXLSX(`relatorio_${fileDateStamp()}.xlsx`, [
      resumo,
      grupo('Por categoria', 'Categoria', s.topCat),
      grupo('Por loja', 'Loja / Setor', s.topLoja),
      grupo('Por status', 'Status', s.topStatus),
      grupo('Por prioridade', 'Prioridade', s.topPrio),
      porMes,
      recorr,
      chamadosSheet(data),
    ]);
    toast(`Relatório exportado (${data.length} chamados).`, 'ok');
  } catch (e) {
    console.error('exportRelExcel:', e);
    toast('Erro ao exportar: ' + e.message, 'err');
  }
}
