/* ═══════════════════════════════════════════
   SUPORTE MEGA – Cadastro de planos de internet das unidades

   Para que serve:
   - Esta é a tela "Internet das lojas" do menu lateral (administradores).
   - Guarda, para cada unidade (loja), os contratos de internet: fornecedor,
     plano, titular, valor mensal, links, uso, IP e observações.
   - Administradores podem consultar e exportar; só o super administrador
     vê os botões de criar, editar e excluir (classe "superadmin-only").

   O que contém:
   - Carregamento dos cadastros do Supabase (tabela "internet_planos").
   - Filtros (busca por texto e por unidade), tabela e exportação CSV/Excel.
   - Janela (modal) para criar, editar e excluir um cadastro.

   Com quem conversa:
   - ui.js: navigate('internet') chama loadPlanosInternet() ao abrir a tela;
     também fornece esc, setText, toast, openModal, closeModal,
     downloadCSV, downloadXLSX e fileDateStamp.
   - app.js: cria "supa", a conexão com o Supabase (banco de dados na nuvem).
   - auth.js: fornece "currentUser" (usuário logado) e controla quem vê
     os itens "superadmin-only".
   - index.html: botões, filtros e o formulário "form-internet".
   ═══════════════════════════════════════════ */

// Cópia na memória de todos os cadastros de internet vindos do banco.
// Filtros e exportação trabalham sobre esta lista.
let allPlanosInternet = [];

// ─────────────────────────────────────────
// loadPlanosInternet(): busca os cadastros no Supabase e redesenha a tela.
// Chamada por: navigate('internet') em ui.js (ao abrir a tela) e, aqui
// mesmo, após salvar (submitPlanoInternet) ou excluir (deletePlanoInternet).
// Recebe: nada. Devolve: nada (atualiza allPlanosInternet e a tabela).
// "async/await": a função espera a resposta do servidor antes de continuar.
// ─────────────────────────────────────────
async function loadPlanosInternet() {
  const body = document.getElementById('internet-table-body');
  // Enquanto busca, mostra um ícone girando ("spinner") no lugar da tabela.
  if (body) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  }

  // Busca todas as colunas (*) da tabela "internet_planos",
  // ordenadas por unidade e, dentro da mesma unidade, por fornecedor.
  const { data, error } = await supa
    .from('internet_planos')
    .select('*')
    .order('unidade', { ascending: true })
    .order('fornecedor', { ascending: true });

  // Erro na busca: mostra o aviso na tabela, limpa o contador e exibe um toast.
  // Causa comum: o script SQL que cria a tabela não foi executado no Supabase.
  if (error) {
    console.error('loadPlanosInternet:', error);
    if (body) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar os cadastros. Verifique se o script SQL de internet foi executado no Supabase.</td></tr>';
    }
    setText('internet-count', '');
    toast('Erro ao carregar internet das lojas: ' + error.message, 'err');
    return;
  }

  // Deu certo: guarda a lista, atualiza as opções de unidade e desenha a tabela.
  allPlanosInternet = data || [];
  populateInternetUnitFilters();
  renderPlanosInternet();
}

// ─────────────────────────────────────────
// populateInternetUnitFilters(): monta a lista de unidades usada em dois lugares:
//   1) o seletor de filtro "Todas as unidades" da tela;
//   2) as sugestões (datalist) do campo "Unidade" no formulário.
// Chamada por: loadPlanosInternet(), sempre que os dados chegam.
// Recebe: nada. Devolve: nada.
// ─────────────────────────────────────────
function populateInternetUnitFilters() {
  // Pega as unidades cadastradas, sem repetição (Set) e sem vazios,
  // em ordem alfabética. "numeric: true" faz "Loja 2" vir antes de "Loja 10".
  const units = [...new Set(allPlanosInternet.map(item => item.unidade).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const filter = document.getElementById('internet-unidade');
  const datalist = document.getElementById('internet-unidades');

  // Recria as opções do filtro, mas mantém a unidade que estava escolhida
  // (se ela ainda existir; senão volta para "Todas as unidades").
  if (filter) {
    const selected = filter.value;
    filter.replaceChildren(new Option('Todas as unidades', ''));
    units.forEach(unit => filter.add(new Option(unit, unit)));
    filter.value = units.includes(selected) ? selected : '';
  }
  // O datalist dá sugestões ao digitar a unidade no formulário,
  // ajudando a escrever o nome sempre do mesmo jeito.
  if (datalist) {
    datalist.replaceChildren(...units.map(unit => new Option(unit, unit)));
  }
}

// ─────────────────────────────────────────
// formatInternetMoney(value): formata um número como dinheiro ("R$ 99,90").
// Chamada por: renderPlanosInternet() e exportPlanosInternet() (no CSV).
// Recebe: um número (ou vazio). Devolve: o texto formatado, ou "–" se vazio.
// ─────────────────────────────────────────
function formatInternetMoney(value) {
  if (value === null || value === undefined || value === '') return '–';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─────────────────────────────────────────
// Cadastros de acordo com os filtros da tela (também usado na exportação)
// getFilteredPlanosInternet(): devolve só os cadastros que passam nos filtros.
// Chamada por: renderPlanosInternet() e exportPlanosInternet(), assim a
// planilha exportada traz exatamente o que está na tela.
// Recebe: nada (lê a busca e o seletor de unidade). Devolve: lista (array).
// ─────────────────────────────────────────
function getFilteredPlanosInternet() {
  // Texto da busca sem espaços nas pontas e em minúsculas (busca sem
  // diferenciar maiúsculas). O "?." evita erro se o campo não existir.
  const search = (document.getElementById('internet-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const unit = document.getElementById('internet-unidade')?.value || '';
  return allPlanosInternet.filter(item => {
    // Unidade escolhida: descarta cadastros de outras unidades.
    if (unit && item.unidade !== unit) return false;
    if (!search) return true;
    // Com busca: mantém o cadastro se QUALQUER um destes campos
    // contiver o texto digitado (some = "pelo menos um").
    return [
      item.unidade, item.fornecedor, item.plano, item.titular,
      item.links, item.observacoes, item.uso, item.ip,
    ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(search));
  });
}

// ─────────────────────────────────────────
// Exporta os cadastros filtrados em CSV ou Excel
// exportPlanosInternet(formato): gera e baixa o arquivo.
// Chamada por: botões "CSV" e "Excel" da tela de internet.
// Recebe: 'csv' ou 'xlsx'. Devolve: nada (o navegador baixa o arquivo).
// CSV: texto simples separado por vírgulas, abre em qualquer planilha.
// ─────────────────────────────────────────
async function exportPlanosInternet(formato) {
  // Usa os mesmos filtros da tela. Sem nada para exportar, só avisa.
  const list = getFilteredPlanosInternet();
  if (!list.length) { toast('Nenhum cadastro para exportar.', 'info'); return; }

  const excel  = formato === 'xlsx';
  // Títulos das colunas da planilha.
  const header = ['Unidade', 'Fornecedor', 'Plano', 'Titular', 'Mensalidade', 'Links', 'Observações', 'Uso', 'IP'];
  // Converte o valor mensal em número (ou vazio, se não informado).
  const valor  = v => (v === null || v === undefined || v === '') ? '' : Number(v);
  // Uma linha por cadastro. A mensalidade vai como NÚMERO no Excel (para
  // permitir somas) e como texto já formatado ("R$ 99,90") no CSV.
  const rows = list.map(item => [
    item.unidade || '', item.fornecedor || '', item.plano || '', item.titular || '',
    excel ? valor(item.valor_mensal) : (valor(item.valor_mensal) === '' ? '' : formatInternetMoney(item.valor_mensal)),
    item.links || '', item.observacoes || '', item.uso || '', item.ip || '',
  ]);
  // Nome do arquivo com a data de hoje, ex.: internet_lojas_2026-11-11.
  const name = `internet_lojas_${fileDateStamp()}`;

  try {
    if (excel) {
      // Soma de todas as mensalidades exportadas (vazias contam como 0).
      // Vai numa linha "TOTAL MENSAL" no fim da planilha (footer), com a
      // coluna E formatada como moeda (money) e larguras de coluna (widths).
      const total = list.reduce((s, item) => s + (Number(item.valor_mensal) || 0), 0);
      await downloadXLSX(`${name}.xlsx`, [{
        name: 'Internet das lojas',
        header,
        rows,
        footer: [['', '', '', 'TOTAL MENSAL', total, '', '', '', '']],
        money: ['E'],
        widths: [16, 20, 20, 24, 14, 18, 40, 16, 18],
      }]);
    } else {
      // CSV: arquivo de texto simples (downloadCSV fica em ui.js).
      downloadCSV(`${name}.csv`, header, rows);
    }
    toast(`${list.length} cadastro(s) exportado(s).`, 'ok');
  } catch (err) {
    console.error('exportPlanosInternet:', err);
    toast('Erro ao exportar: ' + err.message, 'err');
  }
}

// ─────────────────────────────────────────
// renderPlanosInternet(): desenha a tabela de cadastros de internet.
// Chamada por: loadPlanosInternet() e pelos filtros da tela (caixa de busca
// "internet-busca" e seletor "internet-unidade" no index.html).
// Recebe: nada. Devolve: nada (altera o HTML da página).
// ─────────────────────────────────────────
function renderPlanosInternet() {
  const body = document.getElementById('internet-table-body');
  if (!body) return;

  const filtered = getFilteredPlanosInternet();

  // Resumo "X de Y cadastro(s)" acima da tabela.
  setText('internet-count', `${filtered.length} de ${allPlanosInternet.length} cadastro(s)`);
  // Nada passou nos filtros: mostra uma linha de aviso.
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum cadastro encontrado.</td></tr>';
    return;
  }

  // Uma linha <tr> por cadastro. esc() (de ui.js) protege o texto para não
  // virar HTML. Campos vazios aparecem como "–". A última coluna (Editar /
  // Excluir) tem a classe "superadmin-only": só o super administrador vê.
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
      <td class="superadmin-only" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editPlanoInternet('${item.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deletePlanoInternet('${item.id}')">Excluir</button>
      </td>
    </tr>`).join('');
}

// ─────────────────────────────────────────
// clearPlanoInternetForm(): limpa todos os campos do formulário.
// Chamada por: openNovoPlanoInternet().
// O campo escondido "internet-id" vazio indica "cadastro novo".
// ─────────────────────────────────────────
function clearPlanoInternetForm() {
  document.getElementById('form-internet').reset();
  document.getElementById('internet-id').value = '';
}

// ─────────────────────────────────────────
// openNovoPlanoInternet(): abre a janela (modal) vazia para um cadastro novo.
// Chamada por: botão "Novo cadastro" (só para o super administrador).
// Recebe: nada. Devolve: nada.
// ─────────────────────────────────────────
function openNovoPlanoInternet() {
  clearPlanoInternetForm();
  document.getElementById('internet-modal-title').textContent = 'Novo cadastro de internet';
  openModal('modal-internet');
}

// ─────────────────────────────────────────
// editPlanoInternet(id): abre a janela preenchida com um cadastro existente.
// Chamada por: botão "Editar" de cada linha (montado em renderPlanosInternet).
// Recebe: o id do cadastro. Devolve: nada.
// ─────────────────────────────────────────
function editPlanoInternet(id) {
  // Procura o cadastro na lista da memória; se não achar, avisa e para.
  const item = allPlanosInternet.find(record => record.id === id);
  if (!item) {
    toast('Cadastro de internet não encontrado.', 'err');
    return;
  }

  // Copia cada dado para o campo do formulário. O id vai para o campo
  // escondido, para que o salvamento atualize este cadastro.
  // "??" usa '' só quando o valor é nulo; assim um valor 0 continua aparecendo.
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

// ─────────────────────────────────────────
// submitPlanoInternet(event): grava o cadastro (novo ou editado) no Supabase.
// Chamada por: envio do formulário "form-internet" (botão "Salvar cadastro").
// Recebe: o evento de envio do formulário. Devolve: nada.
// ─────────────────────────────────────────
async function submitPlanoInternet(event) {
  // Impede o navegador de recarregar a página ao enviar o formulário.
  event.preventDefault();
  const button = document.getElementById('btn-save-internet');
  // id preenchido = edição; vazio = cadastro novo.
  const id = document.getElementById('internet-id').value;
  const amountValue = document.getElementById('internet-form-valor').value;
  // "payload": os dados que serão gravados na tabela "internet_planos".
  // Unidade e fornecedor são obrigatórios (o próprio formulário exige).
  // Campos opcionais vazios viram null; o valor vira número.
  // atualizado_em guarda a data/hora desta alteração.
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

  // Desativa o botão durante o salvamento, para evitar gravar duas vezes.
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    // Edição: update na linha com este id.
    // Novo: insert, registrando também quem criou (criado_por).
    const query = id
      ? supa.from('internet_planos').update(payload).eq('id', id)
      : supa.from('internet_planos').insert({
        ...payload,
        criado_por: currentUser?.id || null,
      });
    const { error } = await query;
    if (error) throw error;

    // Sucesso: avisa, fecha a janela e recarrega a lista do banco.
    toast(id ? 'Cadastro atualizado!' : 'Cadastro adicionado!', 'ok');
    closeModal('modal-internet');
    await loadPlanosInternet();
  } catch (error) {
    // Falha (rede, permissão, etc.): mostra a mensagem ao usuário.
    console.error('submitPlanoInternet:', error);
    toast('Erro ao salvar cadastro: ' + error.message, 'err');
  } finally {
    // Roda sempre (com sucesso ou erro): reativa o botão.
    button.disabled = false;
    button.textContent = 'Salvar cadastro';
  }
}

// ─────────────────────────────────────────
// deletePlanoInternet(id): exclui um cadastro do banco, após confirmação.
// Chamada por: botão "Excluir" de cada linha da tabela.
// Recebe: o id do cadastro. Devolve: nada.
// ─────────────────────────────────────────
async function deletePlanoInternet(id) {
  // Pede confirmação. Se o cadastro não existir ou o usuário cancelar, para.
  const item = allPlanosInternet.find(record => record.id === id);
  if (!item || !confirm(`Excluir o plano de internet de ${item.unidade} (${item.fornecedor})?`)) return;

  // Apaga a linha da tabela "internet_planos" e recarrega a lista.
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
