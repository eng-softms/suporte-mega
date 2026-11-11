/* ═══════════════════════════════════════════
   SUPORTE MEGA – Aquisição de equipamentos (itens a comprar)

   Para que serve:
   - Esta é a tela "Aquisições" do menu lateral, exclusiva do super
     administrador (ver SUPERADMIN_PAGES em ui.js).
   - É uma lista de compras de TI: cada item diz o equipamento, a
     quantidade, para qual loja/setor, onde comprar, o valor e a finalidade.
   - Cada item passa pelas etapas: Pendente → Aprovado → Comprado
     (ou Cancelado).

   O que contém:
   - Carregamento dos itens do Supabase (tabela "aquisicoes").
   - Cartões de resumo (quantidade e valor por status), filtros e tabela.
   - Janela (modal) para criar, editar e excluir itens, com cálculo
     automático do valor total (quantidade × valor unitário).
   - Exportação para Excel no modelo de planilha usado pela empresa.

   Com quem conversa:
   - ui.js: navigate('aquisicoes') chama loadAquisicoes() ao abrir a tela;
     também fornece esc, setText, toast, openModal, closeModal e loadXlsxLib.
   - config.js: lista LOJAS (sugestões de loja/setor no formulário).
   - app.js: cria "supa", a conexão com o Supabase (banco de dados na nuvem).
   - auth.js: fornece "currentUser" (usuário logado).
   - index.html: cartões, botões, filtros e o formulário "form-aquisicao".
   ═══════════════════════════════════════════ */

// Status possíveis de um item de compra, na ordem do processo.
// (Lista de referência; as opções do seletor estão escritas no index.html.)
const STATUS_AQUISICAO = ['Pendente', 'Aprovado', 'Comprado', 'Cancelado'];
// Classe CSS da etiqueta colorida ("badge") de cada status na tabela.
// Reaproveita as cores dos status de chamados (andamento, aberto, fechado...).
const AQUISICAO_BADGE = {
  'Pendente': 'badge-andamento',
  'Aprovado': 'badge-aberto',
  'Comprado': 'badge-fechado',
  'Cancelado': 'badge-cancelado',
};

// Cópia na memória de todos os itens de aquisição vindos do banco.
// Resumo, filtros e exportação trabalham sobre esta lista.
let allAquisicoes = [];

// ─────────────────────────────────────────
// loadAquisicoes(): busca os itens no Supabase e redesenha a tela.
// Chamada por: navigate('aquisicoes') em ui.js (ao abrir a tela) e, aqui
// mesmo, após salvar (submitAquisicao) ou excluir (deleteAquisicao).
// Recebe: nada. Devolve: nada (atualiza allAquisicoes e a tela).
// "async/await": a função espera a resposta do servidor antes de continuar.
// ─────────────────────────────────────────
async function loadAquisicoes() {
  const body = document.getElementById('aquisicao-table-body');
  // Enquanto busca, mostra um ícone girando ("spinner") no lugar da tabela.
  if (body) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  }

  // Busca todas as colunas (*) da tabela "aquisicoes",
  // na ordem em que foram cadastrados (mais antigos primeiro).
  const { data, error } = await supa
    .from('aquisicoes')
    .select('*')
    .order('criado_em', { ascending: true });

  // Erro na busca: avisa na tabela e num toast; limpa o contador.
  // Causa comum: o script SQL que cria a tabela não foi executado no Supabase.
  if (error) {
    console.error('loadAquisicoes:', error);
    if (body) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar as aquisições. Verifique se o script SQL de aquisições foi executado no Supabase.</td></tr>';
    }
    setText('aquisicao-count', '');
    toast('Erro ao carregar aquisições: ' + error.message, 'err');
    return;
  }

  // Deu certo: guarda a lista, atualiza as opções de loja/setor e desenha a tela.
  allAquisicoes = data || [];
  populateAquisicaoFilters();
  renderAquisicoes();
}

// ─────────────────────────────────────────
// populateAquisicaoFilters(): monta as listas de loja/setor usadas em:
//   1) o seletor de filtro "Todas as lojas/setores" da tela;
//   2) as sugestões (datalist) do campo "Loja/Setor" no formulário.
// Chamada por: loadAquisicoes(), sempre que os dados chegam.
// Recebe: nada. Devolve: nada.
// ─────────────────────────────────────────
function populateAquisicaoFilters() {
  // Lojas/setores já usados nos itens, sem repetição (Set) e sem vazios,
  // em ordem alfabética. "numeric: true" faz "Loja 2" vir antes de "Loja 10".
  const setores = [...new Set(allAquisicoes.map(item => item.loja_setor).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const filter = document.getElementById('aquisicao-setor');
  const datalist = document.getElementById('aquisicao-setores');

  // O filtro só mostra os setores que têm itens. Recria as opções e
  // mantém a escolha atual, se ela ainda existir.
  if (filter) {
    const selected = filter.value;
    filter.replaceChildren(new Option('Todas as lojas/setores', ''));
    setores.forEach(setor => filter.add(new Option(setor, setor)));
    filter.value = setores.includes(selected) ? selected : '';
  }
  // As sugestões do formulário juntam: setores já usados + todas as lojas
  // de config.js + "TI". O Set remove nomes repetidos.
  if (datalist) {
    const options = [...new Set([...setores, ...LOJAS, 'TI'])];
    datalist.replaceChildren(...options.map(setor => new Option(setor, setor)));
  }
}

// ─────────────────────────────────────────
// aquisicaoValorFinal(item): calcula o valor total de um item.
// Regra: valor final = valor unitário × quantidade.
// Chamada por: resumo, tabela, total filtrado e exportação para Excel.
// Recebe: um item. Devolve: o número, ou null se o valor unitário não foi
// informado (para mostrar "–" em vez de "R$ 0,00").
// ─────────────────────────────────────────
function aquisicaoValorFinal(item) {
  if (item.valor_unitario === null || item.valor_unitario === undefined) return null;
  return Number(item.valor_unitario) * Number(item.quantidade || 0);
}

// ─────────────────────────────────────────
// formatAquisicaoMoney(value): formata um número como dinheiro ("R$ 1.234,50").
// Chamada por: resumo, tabela e total do formulário.
// Recebe: um número (ou vazio). Devolve: o texto formatado, ou "–" se vazio.
// ─────────────────────────────────────────
function formatAquisicaoMoney(value) {
  if (value === null || value === undefined || value === '') return '–';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─────────────────────────────────────────
// filteredAquisicoes(): devolve só os itens que passam nos filtros da tela.
// Chamada por: renderAquisicoes() e exportAquisicoesExcel() (a planilha
// exportada traz exatamente o que está na tela).
// Recebe: nada (lê busca, loja/setor e status). Devolve: lista (array).
// ─────────────────────────────────────────
function filteredAquisicoes() {
  // Texto da busca sem espaços nas pontas e em minúsculas.
  // O "?." evita erro se o campo não existir na página.
  const search = (document.getElementById('aquisicao-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const setor = document.getElementById('aquisicao-setor')?.value || '';
  const status = document.getElementById('aquisicao-status')?.value || '';

  return allAquisicoes.filter(item => {
    // Loja/setor escolhido: descarta itens de outros setores.
    if (setor && item.loja_setor !== setor) return false;
    // Opção especial "abertos": itens ainda não comprados nem cancelados,
    // ou seja, Pendente ou Aprovado.
    if (status === 'abertos' && !['Pendente', 'Aprovado'].includes(item.status)) return false;
    // Qualquer outro status: precisa ser exatamente igual.
    if (status && status !== 'abertos' && item.status !== status) return false;
    if (!search) return true;
    // Com busca: mantém o item se algum destes campos contiver o texto.
    return [
      item.equipamento, item.loja_setor, item.marca_modelo,
      item.local_compra, item.finalidade, item.status,
    ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(search));
  });
}

// ─────────────────────────────────────────
// renderAquisicaoResumo(): preenche os cartões do topo da tela.
// Chamada por: renderAquisicoes().
// Recebe: nada. Devolve: nada.
// Usa TODOS os itens (ignora filtros), para mostrar a visão geral.
// ─────────────────────────────────────────
function renderAquisicaoResumo() {
  // sum(): soma o valor final de uma lista de itens (sem valor conta como 0).
  const sum = list => list.reduce((total, item) => total + (aquisicaoValorFinal(item) || 0), 0);
  // Separa os itens por status (cancelados não entram em nenhum cartão).
  const pendentes = allAquisicoes.filter(item => item.status === 'Pendente');
  const aprovados = allAquisicoes.filter(item => item.status === 'Aprovado');
  const comprados = allAquisicoes.filter(item => item.status === 'Comprado');

  // Cada cartão mostra a quantidade de itens e a soma dos valores.
  setText('aq-stat-pendente', pendentes.length);
  setText('aq-stat-pendente-valor', formatAquisicaoMoney(sum(pendentes)));
  setText('aq-stat-aprovado', aprovados.length);
  setText('aq-stat-aprovado-valor', formatAquisicaoMoney(sum(aprovados)));
  setText('aq-stat-comprado', comprados.length);
  setText('aq-stat-comprado-valor', formatAquisicaoMoney(sum(comprados)));
  // Cartão "em aberto": quanto ainda falta gastar (pendentes + aprovados).
  setText('aq-stat-total', formatAquisicaoMoney(sum([...pendentes, ...aprovados])));
}

// ─────────────────────────────────────────
// renderAquisicoes(): desenha os cartões de resumo e a tabela de itens.
// Chamada por: loadAquisicoes(), filterAquisicaoStatus() e pelos filtros
// da tela (busca, loja/setor e status no index.html).
// Recebe: nada. Devolve: nada (altera o HTML da página).
// ─────────────────────────────────────────
function renderAquisicoes() {
  const body = document.getElementById('aquisicao-table-body');
  if (!body) return;

  renderAquisicaoResumo();
  // Aplica os filtros e soma o valor final só dos itens que estão na tela.
  const filtered = filteredAquisicoes();
  const total = filtered.reduce((sum, item) => sum + (aquisicaoValorFinal(item) || 0), 0);

  // Resumo "X de Y item(ns)" e o total em dinheiro da lista filtrada.
  setText('aquisicao-count', `${filtered.length} de ${allAquisicoes.length} item(ns)`);
  setText('aquisicao-total', formatAquisicaoMoney(total));

  // Nada passou nos filtros: mostra uma linha de aviso.
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum item encontrado.</td></tr>';
    return;
  }

  // Uma linha <tr> por item: equipamento, quantidade, loja/setor, marca,
  // local de compra, valor unitário, valor final, finalidade, status
  // (etiqueta colorida) e botões Editar/Excluir.
  // esc() (de ui.js) protege o texto digitado para não virar HTML.
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

// ─────────────────────────────────────────
// filterAquisicaoStatus(status): filtra a tabela por status.
// Chamada por: clique nos cartões de resumo do topo da tela.
// Recebe: o status ('Pendente', 'Aprovado', 'Comprado' ou 'abertos').
// Devolve: nada. Coloca o valor no seletor de status e redesenha a tabela.
// ─────────────────────────────────────────
function filterAquisicaoStatus(status) {
  document.getElementById('aquisicao-status').value = status;
  renderAquisicoes();
}

// ─────────────────────────────────────────
// updateAquisicaoFormTotal(): mostra no formulário o valor total do item
// (quantidade × valor unitário), enquanto o usuário digita.
// Chamada por: campos de quantidade e de valor do formulário (index.html),
// e por openNovaAquisicao() / editAquisicao() ao abrir a janela.
// Recebe: nada. Devolve: nada. Sem valor unitário, mostra "–".
// ─────────────────────────────────────────
function updateAquisicaoFormTotal() {
  const qty = Number(document.getElementById('aquisicao-form-quantidade').value || 0);
  const value = document.getElementById('aquisicao-form-valor').value;
  setText('aquisicao-form-total', value === '' ? '–' : formatAquisicaoMoney(qty * Number(value)));
}

// ─────────────────────────────────────────
// openNovaAquisicao(): abre a janela (modal) vazia para um item novo.
// Chamada por: botão "+ Adicionar equipamento" da tela de aquisições.
// Recebe: nada. Devolve: nada.
// ─────────────────────────────────────────
function openNovaAquisicao() {
  // Limpa o formulário. O campo escondido "aquisicao-id" vazio indica
  // "item novo". Todo item novo começa como "Pendente".
  document.getElementById('form-aquisicao').reset();
  document.getElementById('aquisicao-id').value = '';
  document.getElementById('aquisicao-form-status').value = 'Pendente';
  document.getElementById('aquisicao-modal-title').textContent = 'Novo equipamento para aquisição';
  updateAquisicaoFormTotal();
  openModal('modal-aquisicao');
}

// ─────────────────────────────────────────
// editAquisicao(id): abre a janela preenchida com um item existente.
// Chamada por: botão "Editar" de cada linha (montado em renderAquisicoes).
// Recebe: o id do item. Devolve: nada.
// ─────────────────────────────────────────
function editAquisicao(id) {
  // Procura o item na lista da memória; se não achar, avisa e para.
  const item = allAquisicoes.find(record => record.id === id);
  if (!item) {
    toast('Item não encontrado.', 'err');
    return;
  }

  // Copia os dados para o formulário. O id vai para o campo escondido,
  // para que o salvamento atualize este item. "??" só troca valores nulos
  // (assim um valor 0 continua aparecendo). No fim, recalcula o total.
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

// ─────────────────────────────────────────
// submitAquisicao(event): grava o item (novo ou editado) no Supabase.
// Chamada por: envio do formulário "form-aquisicao" (botão "Salvar item").
// Recebe: o evento de envio do formulário. Devolve: nada.
// ─────────────────────────────────────────
async function submitAquisicao(event) {
  // Impede o navegador de recarregar a página ao enviar o formulário.
  event.preventDefault();
  const button = document.getElementById('btn-save-aquisicao');
  // id preenchido = edição; vazio = item novo.
  const id = document.getElementById('aquisicao-id').value;
  const amountValue = document.getElementById('aquisicao-form-valor').value;
  // "payload": os dados que serão gravados na tabela "aquisicoes".
  // Quantidade inválida ou vazia vira 1. Campos opcionais vazios viram null.
  // O valor unitário vira número (ou null, se não informado).
  // Obs.: o valor final NÃO é gravado; ele é sempre calculado na hora
  // (aquisicaoValorFinal).
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

  // Desativa o botão durante o salvamento, para evitar gravar duas vezes.
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    // Edição: update na linha com este id.
    // Novo: insert, registrando também quem criou (criado_por).
    const query = id
      ? supa.from('aquisicoes').update(payload).eq('id', id)
      : supa.from('aquisicoes').insert({
        ...payload,
        criado_por: currentUser?.id || null,
      });
    const { error } = await query;
    if (error) throw error;

    // Sucesso: avisa, fecha a janela e recarrega a lista do banco.
    toast(id ? 'Item atualizado!' : 'Item adicionado!', 'ok');
    closeModal('modal-aquisicao');
    await loadAquisicoes();
  } catch (error) {
    // Falha (rede, permissão, etc.): mostra a mensagem ao usuário.
    console.error('submitAquisicao:', error);
    toast('Erro ao salvar item: ' + error.message, 'err');
  } finally {
    // Roda sempre (com sucesso ou erro): reativa o botão.
    button.disabled = false;
    button.textContent = 'Salvar item';
  }
}

// ─────────────────────────────────────────
// deleteAquisicao(id): exclui um item do banco, após confirmação.
// Chamada por: botão "Excluir" de cada linha da tabela.
// Recebe: o id do item. Devolve: nada.
// ─────────────────────────────────────────
async function deleteAquisicao(id) {
  // Pede confirmação. Se o item não existir ou o usuário cancelar, para.
  const item = allAquisicoes.find(record => record.id === id);
  if (!item || !confirm(`Excluir "${item.equipamento}" da lista de aquisição?`)) return;

  // Apaga a linha da tabela "aquisicoes" e recarrega a lista.
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

// ── Exportar para Excel (.xlsx) – loadXlsxLib() fica em ui.js ──

// ─────────────────────────────────────────
// exportAquisicoesExcel(): gera a planilha "solicitação de equipamentos TI".
// Chamada por: botão "Exportar Excel" da tela de aquisições.
// Recebe: nada. Devolve: nada (o navegador baixa o arquivo .xlsx).
// Diferente das outras telas, aqui a planilha é montada "à mão" (sem
// downloadXLSX), para seguir o modelo da empresa: títulos próprios e uma
// linha TOTAL com fórmula de soma do Excel.
// ─────────────────────────────────────────
async function exportAquisicoesExcel() {
  // Exporta só os itens filtrados na tela. Sem itens, avisa e para.
  const items = filteredAquisicoes();
  if (!items.length) {
    toast('Não há itens para exportar.', 'err');
    return;
  }

  try {
    // Carrega a biblioteca de planilhas (SheetJS / XLSX) só quando precisa.
    const XLSX = await loadXlsxLib();
    // Títulos das colunas (A até I), iguais aos da planilha usada pela empresa.
    const header = [
      'EQUIPAMENTOS', 'QUANTIDADE', 'LOJA/SETOR', 'MARCA/MODELO/OBSERVAÇÃO',
      'LOCAL DE COMPRA', 'VALORES', 'Finalidade da compra e uso', 'VALOR FINAL', 'STATUS',
    ];
    // Uma linha por item. Valores e quantidade vão como números, para o
    // Excel conseguir somar. Valor ausente vira célula vazia.
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
    // lastRow = número da última linha de dados no Excel
    // (linha 1 é o título, então os dados vão da linha 2 até rows.length + 1).
    const lastRow = rows.length + 1;
    // Cria a aba a partir de uma lista de linhas: título, dados e uma linha
    // final com a palavra "TOTAL" na coluna G.
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows, ['', '', '', '', '', '', 'TOTAL']]);
    // Na coluna H da linha de total, coloca uma fórmula de soma do Excel
    // (f: SUM(H2:H<última>)). O "v" é o resultado já calculado, para a
    // célula mostrar o valor mesmo antes de o Excel recalcular.
    // t: 'n' indica que a célula é numérica.
    sheet[`H${lastRow + 1}`] = {
      t: 'n',
      f: `SUM(H2:H${lastRow})`,
      v: rows.reduce((sum, row) => sum + (Number(row[7]) || 0), 0),
    };
    // "!ref" informa a área usada da planilha (de A1 até a linha de total),
    // necessário porque a célula de total foi incluída à mão.
    sheet['!ref'] = `A1:I${lastRow + 1}`;
    // Largura de cada coluna, em número aproximado de caracteres (wch).
    sheet['!cols'] = [32, 12, 22, 35, 22, 12, 80, 14, 12].map(wch => ({ wch }));

    // Formato de moeda nas colunas de valor
    // (F = valor unitário, H = valor final), da linha 2 até a de total.
    // Só aplica em células numéricas; "z" é o formato de exibição.
    for (let r = 2; r <= lastRow + 1; r++) {
      ['F', 'H'].forEach(col => {
        const cell = sheet[`${col}${r}`];
        if (cell && cell.t === 'n') cell.z = '"R$" #,##0.00';
      });
    }

    // Cria o arquivo (workbook), adiciona a aba "Aquisições" e baixa.
    // O nome usa a data de hoje com pontos (ex.: 11.11.2026), pois "/" não
    // é permitido em nomes de arquivo.
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Aquisições');
    const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '.');
    XLSX.writeFile(workbook, `solicitação de equipamentos TI ${today}.xlsx`);
    toast('Planilha exportada!', 'ok');
  } catch (error) {
    // Falha ao carregar a biblioteca ou gerar o arquivo: avisa o usuário.
    console.error('exportAquisicoesExcel:', error);
    toast('Erro ao exportar: ' + error.message, 'err');
  }
}
