/* ═══════════════════════════════════════════
   SUPORTE MEGA – Relatórios (somente admin)

   Para que serve:
   - Esta é a tela "Relatórios" do menu lateral (área de administradores).
   - Mostra indicadores dos chamados: total, tempo médio de resolução,
     taxa de resolução, urgentes resolvidos, gráficos por categoria, loja,
     prioridade, status e mês, e a lista de problemas recorrentes.
   - Tudo pode ser filtrado por período e por loja, e exportado em CSV
     ou em Excel (com várias abas).

   O que contém:
   - getRelData: aplica os filtros de período e loja.
   - Escolha do tipo de gráfico (barras ou pizza), lembrada no navegador.
   - renderPie: desenha o gráfico de pizza (rosca) em SVG.
   - renderRelatorios: preenche a tela.
   - computeRelStats: faz todos os cálculos (usado na tela e na exportação).
   - exportRelCSV / exportRelExcel: exportações.

   Com quem conversa:
   - chamados.js: fornece "allChamados" (a lista de chamados já carregada),
     renderBars (gráfico de barras), chamadosTabela e chamadosSheet
     (tabela de chamados para exportar).
   - config.js: LOJAS e STATUS_CHAMADO.
   - ui.js: navigate('relatorios') chama renderRelatorios(); também
     fornece esc, setText, toast, fmtDate, fileDateStamp, downloadCSV
     e downloadXLSX.
   - index.html: filtros "rel-periodo" e "rel-filtro-loja", botões de
     tipo de gráfico (data-chart-mode) e de exportação.
   - Os relatórios não buscam nada no Supabase: usam os chamados que
     chamados.js já mantém atualizados na memória.
   ═══════════════════════════════════════════ */

// ─────────────────────────────────────────
// getRelData(): devolve os chamados que entram no relatório.
// Chamada por: renderRelatorios(), exportRelCSV() e exportRelExcel().
// Recebe: nada (lê os filtros de período e loja da tela).
// Devolve: lista (array) de chamados.
// ─────────────────────────────────────────
function getRelData() {
  // Período em dias (ex.: 30). "0" significa "todo o período".
  const periodo    = parseInt(document.getElementById('rel-periodo')?.value    || '0');
  const filterLoja = document.getElementById('rel-filtro-loja')?.value || '';
  // Data e hora atuais, em milissegundos.
  const now        = Date.now();

  return allChamados.filter(c => {
    // Loja escolhida: descarta chamados de outras lojas.
    if (filterLoja && c.loja !== filterLoja) return false;
    // Período escolhido: descarta chamados criados há mais de N dias.
    // 86400000 = milissegundos em um dia (24 × 60 × 60 × 1000).
    if (periodo && c.criadoEm && (now - c.criadoEm) > periodo * 86400000) return false;
    return true;
  });
}

// ── Tipo de gráfico: 'barras' ou 'pizza' (lembrado no navegador) ──
// relChartMode guarda o tipo escolhido. Ao carregar a página, lê a última
// escolha salva no navegador (localStorage = pequena memória do navegador
// que continua lá mesmo depois de fechar). Se não houver nada salvo, ou se
// o navegador bloquear o acesso (try/catch), usa 'barras'.
let relChartMode = (() => {
  try { return localStorage.getItem('rel-chart-mode') === 'pizza' ? 'pizza' : 'barras'; }
  catch { return 'barras'; }
})();

// ─────────────────────────────────────────
// setRelChartMode(mode): troca o tipo de gráfico e redesenha a tela.
// Chamada por: botões "Barras" e "Pizza" da tela de relatórios.
// Recebe: 'barras' ou 'pizza'. Devolve: nada.
// Salva a escolha no navegador; se não der para salvar, ignora o erro.
// ─────────────────────────────────────────
function setRelChartMode(mode) {
  relChartMode = mode;
  try { localStorage.setItem('rel-chart-mode', mode); } catch {}
  renderRelatorios();
}

// ─────────────────────────────────────────
// syncRelChartModeButtons(): destaca o botão do tipo de gráfico em uso.
// Chamada por: renderRelatorios().
// Recebe: nada. Devolve: nada.
// Para cada botão com "data-chart-mode", liga a classe "active" se ele for o
// tipo atual, e ajusta "aria-pressed" (informa leitores de tela para pessoas
// com deficiência visual se o botão está pressionado).
// ─────────────────────────────────────────
function syncRelChartModeButtons() {
  document.querySelectorAll('[data-chart-mode]').forEach(b => {
    const on = b.dataset.chartMode === relChartMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

// Gráfico de rosca com legenda (quantidade e %). Máximo de 8 cores:
// a partir da 8ª fatia, o restante é somado em "Outros".
// renderPie(elId, entries): desenha o gráfico dentro de um elemento da página.
// Chamada por: renderRelatorios(), quando o modo escolhido é 'pizza'.
// Recebe: elId = id do elemento onde desenhar; entries = lista de pares
//   [rótulo, quantidade], ex.: [['Impressora', 12], ['Rede', 5]].
// Devolve: nada (troca o HTML do elemento).
// SVG: formato de desenho vetorial que o navegador entende, escrito como texto.
function renderPie(elId, entries) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Soma das quantidades = 100% do gráfico. Se for zero, mostra "Sem dados".
  const total = entries.reduce((s, e) => s + e[1], 0);
  if (!total) { el.innerHTML = '<div class="empty-state" style="padding:16px"><p>Sem dados</p></div>'; return; }

  // Fatias: se houver mais de 8, mantém as 7 primeiras (as listas já vêm
  // ordenadas da maior para a menor) e junta o resto numa 8ª fatia "Outros".
  let slices = entries;
  if (entries.length > 8) {
    const resto = entries.slice(7).reduce((s, e) => s + e[1], 0);
    slices = [...entries.slice(0, 7), ['Outros', resto]];
  }

  // ── Geometria do desenho ──
  // O desenho tem 150 × 150 unidades (viewBox). C = 75 é o centro.
  // R = 72 é o raio externo da rosca; r = 46 é o raio do furo do meio.
  // pt(raio, ângulo): calcula o ponto "x,y" na circunferência.
  //   O ângulo é em radianos (volta completa = 2π) e começa no topo (12 h),
  //   girando no sentido horário; por isso x usa seno e y usa -cosseno.
  //   toFixed(2) arredonda para 2 casas, deixando o SVG menor.
  const C = 75, R = 72, r = 46;
  const pt = (rad, a) => `${(C + rad * Math.sin(a)).toFixed(2)},${(C - rad * Math.cos(a)).toFixed(2)}`;
  // arc(início, fim): monta o contorno de uma fatia da rosca, entre dois ângulos.
  // Comandos do caminho SVG:
  //   M = vai até o ponto inicial na borda externa;
  //   A = arco externo até o ângulo final (sentido horário, "1");
  //   L = linha reta até a borda interna;
  //   A = arco interno de volta ao ângulo inicial (sentido anti-horário, "0");
  //   Z = fecha a figura.
  // "large" avisa o SVG quando o arco é maior que meia volta (mais de 180°);
  // sem isso ele escolheria o caminho curto e a fatia sairia errada.
  const arc = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
  };

  // ── Desenho das fatias ──
  // "a" é o ângulo onde a próxima fatia começa (a primeira começa no topo).
  // Para cada fatia:
  //   sweep = tamanho da fatia em ângulo = (quantidade ÷ total) × volta inteira;
  //   pct   = porcentagem arredondada, mostrada na dica ao passar o mouse.
  // Cada fatia recebe uma cor da paleta do CSS (--series-1, --series-2...)
  // e um <title>, que vira a dica "rótulo: quantidade (porcentagem)".
  let a = 0;
  const paths = slices.map(([label, n], i) => {
    const sweep = n / total * Math.PI * 2;
    const pct   = Math.round(n / total * 100);
    // Uma fatia de 100% vira duas metades (um arco SVG não fecha um círculo inteiro)
    // (1e-6 é uma pequena folga para erros de arredondamento.
    // Nesse caso também tira a borda, para não aparecer a emenda.)
    const full = sweep >= Math.PI * 2 - 1e-6;
    const d = full ? arc(0, Math.PI) + arc(Math.PI, Math.PI * 2) : arc(a, a + sweep);
    a += sweep;
    return `<path d="${d}" fill="var(--series-${i + 1})"${full ? ' style="stroke:none"' : ''}><title>${esc(label)}: ${n} (${pct}%)</title></path>`;
  }).join('');

  // Legenda ao lado do gráfico: uma linha por fatia, com a bolinha da mesma
  // cor, o rótulo, a quantidade e a porcentagem.
  const legend = slices.map(([label, n], i) => `
    <div class="pie-legend-row">
      <span class="pie-dot" style="background:var(--series-${i + 1})"></span>
      <span class="pie-legend-lbl" title="${esc(label)}">${esc(label)}</span>
      <span class="pie-legend-val">${n}</span>
      <span class="pie-legend-pct">${Math.round(n / total * 100)}%</span>
    </div>`).join('');

  // Monta o resultado final: o SVG com as fatias e, no furo do meio, o total
  // de chamados; e a legenda ao lado. "aria-label" descreve o gráfico para
  // leitores de tela.
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

// ─────────────────────────────────────────
// renderRelatorios(): preenche toda a tela de relatórios.
// Chamada por: navigate('relatorios') em ui.js (ao abrir a tela), pelos
// filtros de período e loja (index.html) e por setRelChartMode().
// Recebe: nada. Devolve: nada (altera o HTML da página).
// ─────────────────────────────────────────
function renderRelatorios() {
  // Popula filtro de loja uma vez
  // (com a lista LOJAS de config.js; a marca "data-populated" evita repetir)
  const relLoja = document.getElementById('rel-filtro-loja');
  if (relLoja && !relLoja.dataset.populated) {
    LOJAS.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l; relLoja.appendChild(o);
    });
    relLoja.dataset.populated = '1';
  }

  // Filtra os chamados e calcula todos os números de uma vez (computeRelStats).
  // As chaves { ... } "desmontam" o resultado em variáveis separadas.
  const data = getRelData();
  const {
    total, tempoMedioDias, taxa, urgentesTotal, urgentesResolvidos,
    topCat, topLoja, topPrio, topStatus, mesEntries, recorrencias,
  } = computeRelStats(data);

  // ── Cartões de indicadores ──
  // Tempo médio com 1 casa decimal e "d" de dias (ou "–" se não há fechados).
  // Urgentes no formato "resolvidos/total", ex.: 3/4.
  setText('rel-total', total);
  setText('rel-tempo', tempoMedioDias === null ? '–' : tempoMedioDias.toFixed(1) + 'd');
  setText('rel-taxa', taxa + '%');
  setText('rel-urgentes-resolvidos', `${urgentesResolvidos}/${urgentesTotal}`);

  // Categoria e loja com mais chamados: o primeiro item das listas
  // ordenadas. topCat[0]?.[0] = nome do 1º colocado (ou "–" se a lista está vazia).
  setText('rel-cat',  topCat[0]?.[0]  || '–');
  setText('rel-loja', topLoja[0]?.[0] || '–');

  // ── Gráficos ──
  // No modo pizza, as prioridades sem chamados (0) são tiradas, para não
  // aparecerem fatias vazias na legenda.
  // No modo barras, cada gráfico tem sua cor, e o de lojas mostra só as 12
  // lojas com mais chamados, para não ficar comprido demais.
  // renderBars fica em chamados.js.
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
  // Mostra no máximo as 20 combinações "categoria + loja" que mais se
  // repetem (a lista já vem ordenada em computeRelStats).
  const recEl  = document.getElementById('rel-recorrentes');
  const sorted = recorrencias.slice(0, 20);

  // Sem recorrências: mostra um aviso.
  // Com recorrências: monta uma tabela. Regras visuais:
  // - Ocorrências: vermelho a partir de 5, amarelo a partir de 3;
  // - Urgentes: em vermelho quando há algum, senão "–";
  // - Risco: etiqueta colorida (RISCO_BADGE).
  // "data-sort-value" dá o valor usado ao ordenar a tabela clicando no
  // título da coluna (ui.js). No risco, Baixo = 1, Médio = 2 e Alto = 3,
  // para ordenar pela gravidade e não em ordem alfabética.
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
              <td data-sort-value="${g.urgentes}">${g.urgentes > 0 ? `<span style="color:var(--danger);font-weight:600">${g.urgentes}</span>` : '–'}</td>
              <td data-sort-value="${{ 'Baixo': 1, 'Médio': 2, 'Alto': 3 }[g.risco]}">${risco}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }
}

// ─────────────────────────────────────────
// Cálculo das métricas (usado pela tela e pela exportação)
// ─────────────────────────────────────────
// Classe CSS da etiqueta colorida de cada nível de risco das recorrências.
const RISCO_BADGE = { 'Alto': 'badge-urgente', 'Médio': 'badge-alta', 'Baixo': 'badge-baixa' };
// isConcluido(chamado): diz se o chamado foi encerrado.
// Regra de negócio: "Fechado" e "Resolvido" contam como concluídos.
// Devolve true (sim) ou false (não).
const isConcluido = c => c.status === 'Fechado' || c.status === 'Resolvido';

// ─────────────────────────────────────────
// computeRelStats(data): calcula todos os números do relatório.
// Chamada por: renderRelatorios() (tela) e exportRelExcel() (planilha),
// garantindo que os dois mostrem exatamente os mesmos valores.
// Recebe: a lista de chamados já filtrada (getRelData).
// Devolve: um objeto com todos os indicadores, listas para os gráficos e
// as recorrências (veja o "return" no fim).
// ─────────────────────────────────────────
function computeRelStats(data) {
  const total = data.length;

  // ── Nível de serviço (SLA) ──
  // SLA: acordo de nível de serviço, ou seja, o quanto e quão rápido a TI resolve.
  // Tempo médio de resolução, em dias: para os chamados concluídos que têm
  // as duas datas, soma (última atualização − criação), divide pela
  // quantidade e converte milissegundos em dias (÷ 86400000).
  // A última atualização é usada como data aproximada de encerramento.
  // Sem nenhum concluído, o resultado é null (a tela mostra "–").
  const fechados = data.filter(c => isConcluido(c) && c.atualizadoEm && c.criadoEm);
  const tempoMedioDias = fechados.length
    ? fechados.reduce((s, c) => s + (c.atualizadoEm - c.criadoEm), 0) / fechados.length / 86400000
    : null;
  // Taxa de resolução = concluídos ÷ total × 100, arredondada (0 se não há chamados).
  // Urgentes: quantos têm prioridade "Urgente" e quantos desses foram concluídos.
  const resolvidos = data.filter(isConcluido).length;
  const taxa = total > 0 ? Math.round(resolvidos / total * 100) : 0;
  const urgentesTotal      = data.filter(c => c.prioridade === 'Urgente').length;
  const urgentesResolvidos = data.filter(c => c.prioridade === 'Urgente' && isConcluido(c)).length;

  // ── Dados agrupados ──
  // Contadores: para cada categoria, loja, prioridade, status e mês, conta
  // quantos chamados existem. Ex.: catC = { 'Impressora': 12, 'Rede': 5 }.
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

  // Transforma os contadores em listas de pares [nome, quantidade]:
  // - categoria e loja: da maior quantidade para a menor;
  // - prioridade: sempre na ordem fixa Urgente → Baixa, mesmo com 0;
  // - status: na ordem de STATUS_CHAMADO (config.js), sem os que têm 0;
  // - mês: em ordem cronológica, com o nome curto do mês (ex.: "nov. de 26").
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
  // Agrupa os chamados pela combinação "categoria||loja" e conta quantos
  // existem e quantos são urgentes em cada grupo.
  const grp = {};
  data.forEach(c => {
    const k = `${c.categoria}||${c.loja}`;
    if (!grp[k]) grp[k] = { cat: c.categoria, loja: c.loja, n: 0, urgentes: 0 };
    grp[k].n++;
    if (c.prioridade === 'Urgente') grp[k].urgentes++;
  });
  // Só conta como recorrência o grupo com mais de 1 chamado.
  // Ordena do que mais se repete para o que menos se repete.
  // Regra do risco:
  // - Alto: 5 ou mais ocorrências, OU 2 ou mais urgentes;
  // - Médio: 3 ou 4 ocorrências;
  // - Baixo: 2 ocorrências.
  const recorrencias = Object.values(grp)
    .filter(g => g.n > 1)
    .sort((a, b) => b.n - a.n)
    .map(g => ({ ...g, risco: g.n >= 5 || g.urgentes >= 2 ? 'Alto' : g.n >= 3 ? 'Médio' : 'Baixo' }));

  // Devolve tudo num só objeto. mesKeys e mesC (chaves AAAA-MM e contagem
  // por mês) são usados na aba "Por mês" da exportação para Excel.
  return {
    total, tempoMedioDias, resolvidos, taxa, urgentesTotal, urgentesResolvidos,
    topCat, topLoja, topPrio, topStatus, mesKeys, mesC, mesEntries, recorrencias,
  };
}

// ─────────────────────────────────────────
// Exportação do relatório
// ─────────────────────────────────────────
// relFiltroDescricao(): descreve em texto os filtros em uso,
// ex.: "Últimos 30 dias · Todas as lojas".
// Chamada por: exportRelExcel(), na aba "Resumo".
// Recebe: nada. Devolve: o texto. Usa o texto visível da opção de período.
function relFiltroDescricao() {
  const periodo = document.getElementById('rel-periodo');
  const loja    = document.getElementById('rel-filtro-loja')?.value || '';
  const txtPer  = periodo?.selectedOptions?.[0]?.textContent || 'Todo período';
  return `${txtPer} · ${loja || 'Todas as lojas'}`;
}

// exportRelCSV(): baixa os chamados do relatório (com os filtros) em CSV.
// Chamada por: botão "CSV" da tela de relatórios.
// Recebe: nada. Devolve: nada.
// chamadosTabela (chamados.js) monta os títulos e as linhas; o "false"
// indica que não é Excel (datas saem como texto).
function exportRelCSV() {
  const data = getRelData();
  if (!data.length) { toast('Sem dados no período.', 'info'); return; }
  const { header, rows } = chamadosTabela(data, false);
  downloadCSV(`relatorio_${fileDateStamp()}.csv`, header, rows);
  toast(`${data.length} registros exportados.`, 'ok');
}

// Excel com várias abas: resumo, agrupamentos, recorrências e a lista de chamados
// exportRelExcel(): gera e baixa o relatório completo em .xlsx.
// Chamada por: botão "Excel" da tela de relatórios.
// Recebe: nada. Devolve: nada (o navegador baixa o arquivo).
async function exportRelExcel() {
  // Mesmos filtros da tela. Sem chamados, só avisa.
  const data = getRelData();
  if (!data.length) { toast('Sem dados no período.', 'info'); return; }

  // Mesmos cálculos da tela.
  // pct(n): porcentagem do total com 1 casa decimal (ex.: 12,5).
  //   Multiplica por 1000, arredonda e divide por 10 para manter 1 casa.
  // grupo(...): monta uma aba de agrupamento com 3 colunas:
  //   nome, quantidade de chamados e % do total.
  //   Nome vazio aparece como "(sem informação)".
  const s   = computeRelStats(data);
  const pct = n => s.total ? Math.round(n / s.total * 1000) / 10 : 0;
  const grupo = (name, titulo, entries) => ({
    name,
    header: [titulo, 'Chamados', '% do total'],
    rows: entries.map(([k, n]) => [k || '(sem informação)', n, pct(n)]),
    widths: [30, 12, 12],
  });

  // Aba "Resumo": os mesmos indicadores dos cartões da tela, mais o filtro
  // aplicado e a data/hora em que o arquivo foi gerado.
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

  // Aba "Por mês": converte a chave AAAA-MM em MM/AAAA (ex.: 11/2026).
  const porMes = {
    name: 'Por mês',
    header: ['Mês', 'Chamados'],
    rows: s.mesKeys.map(k => { const [y, m] = k.split('-'); return [`${m}/${y}`, s.mesC[k]]; }),
    widths: [12, 12],
  };

  // Aba "Recorrências": TODAS as recorrências (a tela mostra só as 20 primeiras).
  const recorr = {
    name: 'Recorrências',
    header: ['Categoria', 'Loja', 'Ocorrências', 'Urgentes', 'Risco'],
    rows: s.recorrencias.map(g => [g.cat, g.loja, g.n, g.urgentes, g.risco]),
    widths: [24, 24, 12, 10, 10],
  };

  // Gera o arquivo com as abas nesta ordem. A última aba (chamadosSheet,
  // de chamados.js) traz a lista completa dos chamados filtrados.
  // downloadXLSX fica em ui.js.
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
