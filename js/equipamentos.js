/* ═══════════════════════════════════════════
   SUPORTE MEGA – Equipamentos (somente admin)

   Para que serve:
   - Esta é a tela "Equipamentos" do menu lateral: o inventário dos
     equipamentos de TI (computadores, impressoras etc.) de cada loja.
   - É exclusiva do super administrador (ver SUPERADMIN_PAGES em ui.js e
     isSuperAdmin() em auth.js).

   O que contém:
   - Carregamento dos equipamentos do Supabase (tabela "equipamentos") e
     atualização em tempo real (quando outro administrador muda algo,
     a tela se atualiza sozinha).
   - Filtros (busca, loja, tipo, status e responsável) e a tabela.
   - Exportação em CSV ou Excel, respeitando os filtros.
   - Janela (modal) para cadastrar, editar e excluir equipamentos.

   Com quem conversa:
   - app.js: cria "supa" (conexão com o Supabase) e, após o login, chama
     loadEquipamentos() e subscribeEquipamentos() (só para super admin).
   - ui.js: navigate('equipamentos') chama populateLojaFilterEquip() e
     loadEquipamentos(); também fornece esc, setText, toast, openModal,
     closeModal, downloadCSV, downloadXLSX, excelDate, fmtDate,
     fmtDateShort e fileDateStamp.
   - config.js: listas LOJAS e TIPOS_EQUIP (opções dos seletores).
   - index.html: filtros "ef-*", botões e o formulário "form-equip".
   ═══════════════════════════════════════════ */

// Cópia na memória de todos os equipamentos vindos do banco.
// Filtros e exportação trabalham sobre esta lista.
let allEquipamentos = [];

// ─────────────────────────────────────────
// Carregamento
// loadEquipamentos(): busca todos os equipamentos e redesenha a tabela.
// Chamada por: initDb() em app.js (após o login), navigate('equipamentos')
// em ui.js (ao abrir a tela), o tempo real (subscribeEquipamentos) e, aqui
// mesmo, após salvar ou excluir.
// Recebe: nada. Devolve: nada. Em caso de erro, "lança" (throw) o erro
// para quem chamou poder mostrar o aviso.
// "async/await": a função espera a resposta do servidor antes de continuar.
// ─────────────────────────────────────────
async function loadEquipamentos() {
  // Busca todas as colunas (*) da tabela "equipamentos", ordenadas pelo
  // número de série / patrimônio.
  const { data, error } = await supa
    .from('equipamentos')
    .select('*')
    .order('serie', { ascending: true });

  // Erro: mostra a mensagem dentro da tabela e repassa o erro adiante.
  if (error) {
    console.error('loadEquipamentos:', error.message);
    const body = document.getElementById('equip-table-body');
    if (body) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger)">Não foi possível carregar os equipamentos: ${esc(error.message)}</td></tr>`;
    }
    throw error;
  }
  // Guarda a lista. Para cada linha, copia todos os campos (...r) e acrescenta
  // as datas de criação e atualização convertidas em número (milissegundos),
  // que é o formato usado pelas funções de data de ui.js.
  allEquipamentos = (data || []).map(r => ({
    ...r,
    criadoEm:     r.criado_em     ? new Date(r.criado_em).getTime()     : null,
    atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em).getTime() : null,
  }));
  renderEquipamentos();
}

// Canal de "tempo real" do Supabase para a tabela de equipamentos.
// Guardado aqui para poder ser desligado antes de criar outro.
let equipChannel = null;

// ─────────────────────────────────────────
// subscribeEquipamentos(): liga o "tempo real" dos equipamentos.
// Tempo real: o Supabase avisa o navegador sempre que alguém cria, altera
// ou exclui um equipamento; então a lista é recarregada sozinha.
// Chamada por: initDb() em app.js, só para o super administrador.
// Recebe: nada. Devolve: nada.
// ─────────────────────────────────────────
function subscribeEquipamentos() {
  // Evita assinaturas duplicadas quando o usuário sai e entra de novo
  if (equipChannel) supa.removeChannel(equipChannel);
  // Escuta qualquer evento (*: inserir, atualizar, excluir) na tabela
  // "equipamentos" e, a cada aviso, busca a lista de novo.
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
// getFilteredEquipamentos(resp): devolve só os equipamentos que passam nos filtros.
// Chamada por: renderEquipamentos() e exportEquipamentos().
// Recebe: "resp", o responsável escolhido. Se não for informado, lê o valor
//   do seletor "ef-responsavel" (valor padrão do parâmetro).
//   renderEquipamentos() passa o valor já atualizado da lista de responsáveis.
// Devolve: lista (array) de equipamentos.
function getFilteredEquipamentos(resp = document.getElementById('ef-responsavel')?.value || '') {
  // Lê os outros filtros da tela. O "?." evita erro se o campo não existir.
  const busca = (document.getElementById('ef-busca')?.value  || '').toLowerCase();
  const loja  = document.getElementById('ef-loja')?.value    || '';
  const tipo  = document.getElementById('ef-tipo')?.value    || '';
  const stat  = document.getElementById('ef-status')?.value  || '';

  return allEquipamentos.filter(e => {
    // Loja, tipo e status: se escolhidos, precisam ser iguais.
    if (loja && e.loja   !== loja)   return false;
    if (tipo && e.tipo   !== tipo)   return false;
    if (stat && e.status !== stat)   return false;
    // Responsável (regra em uma linha só):
    // - opção "Sem responsável": descarta quem TEM responsável;
    // - um nome escolhido: descarta quem tem outro responsável
    //   (comparando pelo nome normalizado, ver respKey);
    // - "Todos": não filtra.
    if (resp === SEM_RESPONSAVEL ? respKey(e.responsavel) : resp && respKey(e.responsavel) !== resp) return false;
    // Busca por texto: junta série, marca, modelo, loja, observações e
    // responsável num só texto ("palheiro") e procura o termo nele.
    if (busca) {
      const hay = [e.serie, e.marca, e.modelo, e.loja, e.obs, e.responsavel].join(' ').toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────
// renderEquipamentos(): desenha a tabela de equipamentos.
// Chamada por: loadEquipamentos() e pelos filtros da tela (busca, loja,
// tipo, status e responsável no index.html).
// Recebe: nada. Devolve: nada (altera o HTML da página).
// ─────────────────────────────────────────
function renderEquipamentos() {
  const el = document.getElementById('equip-table-body');
  if (!el) return;

  // Atualiza a lista de responsáveis antes de filtrar
  const list = getFilteredEquipamentos(populateResponsavelFilter());

  // Resumo "X de Y equipamento(s)" acima da tabela.
  setText('equip-count', `${list.length} de ${allEquipamentos.length} equipamento(s)`);

  // Nada passou nos filtros: mostra uma linha de aviso.
  if (!list.length) {
    el.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum equipamento encontrado</td></tr>`;
    return;
  }

  // Cor do texto de cada status (variáveis de cor definidas no CSS).
  const statusColor = { 'Em uso':'var(--accent)', 'Disponível':'var(--success)', 'Em manutenção':'var(--warning)', 'Descartado':'var(--fg3)' };

  // Uma linha <tr> por equipamento: série, marca/modelo/tipo, data de
  // aquisição (em formato brasileiro), loja, responsável (com e-mail, se
  // houver), status colorido e botões Editar/Excluir.
  // esc() (de ui.js) protege o texto digitado para não virar HTML.
  // A data recebe "T00:00:00" para ser lida no horário local; sem isso
  // poderia aparecer um dia antes.
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
// exportEquipamentos(formato): gera e baixa o arquivo.
// Chamada por: botões "CSV" e "Excel" da tela de equipamentos.
// Recebe: 'csv' ou 'xlsx'. Devolve: nada (o navegador baixa o arquivo).
async function exportEquipamentos(formato) {
  // Usa os mesmos filtros da tela. Sem nada para exportar, só avisa.
  const list = getFilteredEquipamentos();
  if (!list.length) { toast('Nenhum equipamento para exportar.', 'info'); return; }

  const excel  = formato === 'xlsx';
  // Títulos das colunas (A até K).
  const header = [
    'Série / Patrimônio', 'Tipo', 'Marca', 'Modelo', 'Data de aquisição', 'Loja',
    'Responsável', 'E-mail do responsável', 'Status', 'Observações', 'Atualizado em',
  ];
  // Uma linha por equipamento. As datas mudam conforme o formato:
  // - Excel: número de data do Excel (excelDate), para poder ordenar/filtrar;
  // - CSV: texto já formatado (fmtDateShort / fmtDate).
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
  // Nome do arquivo com a data de hoje, ex.: equipamentos_2026-11-11.
  const name = `equipamentos_${fileDateStamp()}`;

  try {
    // Excel: uma aba "Equipamentos". "dates" diz o formato de exibição das
    // colunas de data (E = aquisição, K = atualizado em) e "widths" a
    // largura de cada coluna. downloadXLSX fica em ui.js.
    // CSV: arquivo de texto simples (downloadCSV, também em ui.js).
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
// Valor especial da opção "Sem responsável" no filtro de responsáveis.
// Usa um texto que nunca seria um nome real, para não confundir.
const SEM_RESPONSAVEL = '__sem__';

// Nome do responsável normalizado ("joão " e "João" contam como a mesma pessoa)
// respKey(nome): tira espaços das pontas e passa para minúsculas.
// Chamada por: getFilteredEquipamentos() e populateResponsavelFilter().
// Recebe: o nome (pode ser vazio). Devolve: o nome normalizado ('' se vazio).
function respKey(nome) {
  return (nome || '').trim().toLocaleLowerCase('pt-BR');
}

// Monta a lista de responsáveis a partir dos equipamentos cadastrados,
// mantendo a seleção atual. Devolve o valor selecionado.
// Chamada por: renderEquipamentos(), a cada redesenho, para a lista
// acompanhar os responsáveis cadastrados.
function populateResponsavelFilter() {
  const sel = document.getElementById('ef-responsavel');
  if (!sel) return '';
  // Guarda a opção escolhida antes de recriar a lista.
  const atual = sel.value;

  // Junta os nomes sem repetição. Se o mesmo nome foi digitado de jeitos
  // diferentes, vale a primeira grafia encontrada. Depois ordena de A a Z.
  const nomes = new Map(); // chave normalizada → nome como foi digitado
  allEquipamentos.forEach(e => {
    const k = respKey(e.responsavel);
    if (k && !nomes.has(k)) nomes.set(k, e.responsavel.trim());
  });
  const ordenados = [...nomes.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

  // Recria as opções: "Todos", um item por responsável (o valor é o nome
  // normalizado) e, no fim, "Sem responsável".
  sel.innerHTML = '<option value="">Todos os responsáveis</option>' +
    ordenados.map(([k, nome]) => `<option value="${esc(k)}">${esc(nome)}</option>`).join('') +
    `<option value="${SEM_RESPONSAVEL}">Sem responsável</option>`;

  // Volta a escolha anterior, se ela ainda existir; senão, "Todos".
  sel.value = [...sel.options].some(o => o.value === atual) ? atual : '';
  return sel.value;
}
// ─────────────────────────────────────────
// populateLojaFilterEquip(): preenche os seletores de filtro "Loja"
// (com LOJAS) e "Tipo" (com TIPOS_EQUIP), ambos de config.js.
// Chamada por: navigate('equipamentos') em ui.js, ao abrir a tela.
// Recebe: nada. Devolve: nada.
// A marca "data-populated" evita repetir as opções a cada abertura da tela.
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
// Janela modal: novo / editar equipamento
// ─────────────────────────────────────────
// openNovoEquip(): abre a janela vazia para cadastrar um equipamento.
// Chamada por: botão "+ Novo" da tela de equipamentos.
// Recebe: nada. Devolve: nada.
function openNovoEquip() {
  // Limpa o formulário. O campo escondido "e-id" vazio indica "novo".
  document.getElementById('me-titulo').textContent = 'Novo Equipamento';
  document.getElementById('form-equip').reset();
  document.getElementById('e-id').value = '';

  // Popula lojas no modal
  // (só na primeira vez; a marca "data-populated" evita opções repetidas)
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

// editEquip(id): abre a janela preenchida com os dados de um equipamento.
// Chamada por: botão "Editar" de cada linha (montado em renderEquipamentos).
// Recebe: o id do equipamento. Devolve: nada.
function editEquip(id) {
  // Procura o equipamento na memória; se não achar, não faz nada.
  const e = allEquipamentos.find(x => x.id === id);
  if (!e) return;

  // Copia os dados para os campos do formulário. O id vai para o campo
  // escondido "e-id", para que o salvamento atualize este equipamento.
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
  // (cria as opções se a janela ainda não tinha sido aberta antes)
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

// submitEquip(ev): grava o equipamento (novo ou editado) no Supabase.
// Chamada por: envio do formulário "form-equip" (botão "Salvar").
// Recebe: o evento de envio do formulário. Devolve: nada.
async function submitEquip(ev) {
  // Impede o navegador de recarregar a página ao enviar o formulário.
  ev.preventDefault();
  // existId preenchido = edição; vazio = equipamento novo.
  // "existing" é o registro atual (usado para manter o campo "nome").
  const btn    = document.getElementById('btn-submit-equip');
  const existId = document.getElementById('e-id').value;
  const existing = allEquipamentos.find(e => e.id === existId);
  const serie = document.getElementById('e-serie').value.trim();
  const tipo = document.getElementById('e-tipo').value;
  const marca = document.getElementById('e-marca').value.trim();
  const modelo = document.getElementById('e-modelo').value.trim();

  // "payload": os dados que serão gravados na tabela "equipamentos".
  // Campos opcionais vazios viram null.
  // "nome" é obrigatório no banco, mas não aparece no formulário. Regra:
  // mantém o nome que já existia; senão usa a série; senão junta
  // tipo + marca + modelo (ex.: "Notebook Dell Latitude").
  // atualizado_em guarda a data/hora desta alteração.
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

  // Validação: tipo, nome, data de aquisição e loja são obrigatórios.
  if (!payload.tipo || !payload.nome || !payload.data_aquisicao || !payload.loja) {
    toast('Preencha os campos obrigatórios (*).', 'err'); return;
  }

  // Desativa o botão durante o salvamento, para evitar gravar duas vezes.
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    // Edição: update na linha com este id.
    // Novo: registra também a data de criação e faz insert.
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
    // Falha (rede, permissão, etc.): mostra a mensagem ao usuário.
    toast('Erro: ' + e.message, 'err');
  } finally {
    // Roda sempre (com sucesso ou erro): reativa o botão.
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

// deleteEquip(id): remove um equipamento do inventário, após confirmação.
// Chamada por: botão "Excluir" de cada linha da tabela.
// Recebe: o id do equipamento. Devolve: nada.
async function deleteEquip(id) {
  // Pergunta antes, mostrando a série (ou o nome, ou o id) do equipamento.
  const e = allEquipamentos.find(x => x.id === id);
  if (!confirm(`Remover "${e?.serie || e?.nome || id}" do inventário?`)) return;
  // Apaga a linha da tabela "equipamentos" e recarrega a lista.
  try {
    const { error } = await supa.from('equipamentos').delete().eq('id', id);
    if (error) throw error;
    toast('Equipamento removido.', 'info');
    await loadEquipamentos();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
