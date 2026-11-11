/* ═══════════════════════════════════════════
   SUPORTE MEGA – Chamados (operações de cadastro, consulta, atualização e exclusão + renderização)
   ═══════════════════════════════════════════

   PARA QUE SERVE ESTE ARQUIVO
   É o "coração" do sistema: tudo o que envolve os chamados de TI abertos
   pelas lojas passa por aqui.

   O QUE ELE CONTÉM
   - Carregamento dos chamados do banco de dados (Supabase, tabela "chamados").
   - Atualização em tempo real: quando alguém cria ou altera um chamado,
     a tela de todos os usuários se atualiza sozinha.
   - Painel inicial (cards com números, lista de recentes e gráfico por categoria).
   - Tabela de chamados com filtros, busca e ordenação por coluna.
   - Janela (modal) de detalhes do chamado, onde o administrador muda status,
     prioridade, resolução e observações, ou exclui o chamado.
   - Formulário "Novo Chamado", com anexos de imagens, vídeo e documentos
     (os arquivos vão para o Storage do Supabase, no "bucket" chamados-imagens).
   - Exportação da lista de chamados em CSV e Excel.
   - Desenho de gráficos de barras simples (usado também pelos relatórios).

   COM QUEM ELE CONVERSA
   - config.js: listas fixas (LOJAS, CATEGORIAS, STATUS_CHAMADO, PRIO_ORDER, STATUS_ORDER).
   - ui.js: funções de tela (toast, openModal, closeModal, navigate, esc,
     fmtDate, fmtRelTime, prioBadge, statusBadge, setText, setLoading,
     protocoloChamado, downloadCSV, downloadXLSX, excelDate, fileDateStamp).
   - auth.js: quem está logado (currentUser, currentProfile) e permissões
     (hasAdminAccess, isSuperAdmin).
   - app.js: cria a conexão "supa" com o Supabase e, após o login, chama
     initFormNovo, updateChamadosTableHeader, loadChamados e subscribeChamados.
   - relatorios.js: reaproveita renderBars, chamadosTabela e chamadosSheet.
   - index.html: botões e campos da tela chamam várias funções daqui
     (ex.: exportCSV, sortBy, submitChamado, openChamadosFiltrados).

   OBSERVAÇÃO SOBRE ANEXOS
   Os anexos não ficam em colunas próprias. O sistema escreve "marcadores"
   no fim da descrição, por exemplo:
     [imagem-storage: <id do usuário>/<id aleatório>.jpg]
     [video-storage: <id do usuário>/<id aleatório>.mp4]
     [documento-storage: <id do usuário>/<id aleatório>.pdf | nome original.pdf]
   Na hora de mostrar o chamado, esses marcadores são lidos e trocados
   pelas imagens, pelo vídeo e pelos links de download.
*/

// ─────────────────────────────────────────
// Variáveis globais (valem para o arquivo todo e para os outros scripts)
// ─────────────────────────────────────────

// Lista com todos os chamados carregados do banco (já "normalizados" por normalizeRow).
// É a fonte de dados do painel, da tabela e dos detalhes.
let allChamados = [];
// Coluna usada para ordenar a tabela (começa pela data de abertura)...
let sortField   = 'criado_em';
// ...e a direção: 'asc' (crescente) ou 'desc' (decrescente, mais novos primeiro).
let sortDir     = 'desc';
// Contador de aberturas da janela de detalhes. Serve para descartar uma
// abertura antiga se o usuário clicar em outro chamado antes da primeira terminar.
let detailRequestId = 0;
// Imagens escolhidas no formulário "Novo Chamado" e ainda não enviadas.
let selectedImageFiles = [];
// Vídeo escolhido no formulário "Novo Chamado" (só pode haver um). null = nenhum.
let selectedVideoFile = null;

// Vídeo anexado ao chamado: um por chamado, até 50 MB (limite do Supabase)
// VIDEO_EXTENSIONS liga o tipo do arquivo (informado pelo navegador) à extensão
// usada para salvar no Storage. Tipos fora desta lista são recusados.
const VIDEO_EXTENSIONS = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
// 50 MB escritos em bytes (50 × 1024 × 1024).
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

// Documentos anexados ao chamado: até 5, de até 10 MB cada.
// O tipo é definido pela extensão (o navegador nem sempre informa o tipo de .docx/.csv).
// selectedDocFiles: documentos escolhidos no formulário e ainda não enviados.
let selectedDocFiles = [];
// DOC_TYPES: extensões aceitas e o "tipo MIME" de cada uma.
// Tipo MIME é a etiqueta padrão que diz ao servidor que tipo de arquivo é
// (ex.: application/pdf para PDF).
const DOC_TYPES = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt:  'text/plain',
  csv:  'text/csv',
};
// Quantidade máxima de documentos por chamado.
const MAX_DOCS = 5;
// Tamanho máximo de cada documento: 10 MB em bytes.
const MAX_DOC_SIZE = 10 * 1024 * 1024;
// getDocExt: recebe o nome do arquivo (ex.: "Relatório.PDF") e devolve só a
// extensão em minúsculas (ex.: "pdf"). Se não houver extensão, devolve "".
// Usada para validar documentos e montar o caminho no Storage.
const getDocExt = name => (String(name).split('.').pop() || '').toLowerCase();

// ─────────────────────────────────────────
// Carregamento
// ─────────────────────────────────────────

// loadChamados: busca os chamados no banco e redesenha a tela.
// Chamada por: app.js (logo após o login) e por subscribeChamados
// (toda vez que algo muda na tabela, em tempo real).
// Recebe: nada. Devolve: nada (mas preenche allChamados).
// "async/await": a função espera a resposta do servidor antes de continuar,
// sem travar a página.
async function loadChamados() {
  // Monta a consulta: tabela "chamados", todas as colunas (*),
  // ordenadas da mais nova para a mais antiga.
  let query = supa.from('chamados').select('*').order('criado_em', { ascending: false });

  // Usuário comum: só vê os próprios chamados
  // (filtra pela coluna user_id = id de quem está logado).
  // Administradores não recebem esse filtro e veem os chamados de todas as lojas.
  if (currentProfile && !hasAdminAccess()) {
    query = query.eq('user_id', currentUser.id);
  }

  // Envia a consulta e espera a resposta. Se der erro, registra no console
  // (para quem for investigar) e repassa o erro para quem chamou.
  const { data, error } = await query;
  if (error) {
    console.error('loadChamados:', error.message, error.details, error.hint);
    throw error;
  }
  // Guarda os chamados já convertidos e redesenha painel e tabela.
  allChamados = (data || []).map(normalizeRow);
  renderAll();
}

// ─────────────────────────────────────────
// Converte snake_case para camelCase e datas para milissegundos
// ─────────────────────────────────────────
// normalizeRow: recebe uma linha crua vinda do banco e devolve uma cópia
// com dois campos extras: criadoEm e atualizadoEm, em milissegundos
// (número que facilita comparar e ordenar datas). Se a data não existir, fica null.
// Os campos originais (criado_em, atualizado_em...) continuam na cópia.
// Chamada por: loadChamados.
function normalizeRow(r) {
  return {
    ...r,
    criadoEm:     r.criado_em     ? new Date(r.criado_em).getTime()     : null,
    atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em).getTime() : null,
  };
}

// escapeHtml: recebe um texto e devolve o mesmo texto "seguro" para ser
// colocado dentro do HTML. Troca os caracteres especiais (& < > " ') por
// códigos equivalentes. Assim, se alguém digitar algo como "<script>" na
// descrição, isso aparece como texto e não é executado pelo navegador.
// Chamada por: formatDescricaoHtml (neste arquivo).
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// formatDescricaoHtml: monta o HTML da descrição do chamado, mostrado na
// janela de detalhes.
// Chamada por: openDetalhe.
// Recebe:
//   value     – texto da descrição, como está no banco (com os marcadores de anexo);
//   imageUrls – endereços temporários das imagens (gerados em openDetalhe);
//   videoUrls – endereços temporários dos vídeos;
//   docLinks  – lista de { url, nome } dos documentos.
// Devolve: um texto HTML com a descrição, as imagens, o vídeo e os links dos documentos.
function formatDescricaoHtml(value = '', imageUrls = [], videoUrls = [], docLinks = []) {
  const raw = String(value || '').trim();
  // Procura os marcadores de imagem salvos no Storage.
  // "Regex" (expressão regular) é um padrão de busca de texto.
  const imageMarkers = [...raw.matchAll(/\[imagem-storage:\s*([^\]\r\n]+)\]/g)];
  // Caso antigo ("legado"): chamados mais velhos guardavam a imagem inteira
  // dentro do texto, no formato "data:image/...;base64,...". Esses também são achados.
  const legacyImages = [...raw.matchAll(/data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+/ig)]
    .map(match => match[0]);
  // Remove do texto todos os marcadores e imagens embutidas,
  // deixando só o que a pessoa realmente escreveu.
  const description = raw
    .replace(/\[imagem-storage:\s*[^\]\r\n]+\]/g, '')
    .replace(/\[video-storage:\s*[^\]\r\n]+\]/g, '')
    .replace(/\[documento-storage:\s*[^\]\r\n]+\]/g, '')
    .replace(/data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+/ig, '')
    .trim();
  // Texto protegido contra HTML malicioso, com as quebras de linha viradas em <br>.
  const text = escapeHtml(description || 'Sem descrição.').replace(/\n/g, '<br>');
  // Usa as imagens do Storage; se não houver, usa as imagens antigas embutidas.
  const availableImageUrls = imageUrls.length ? imageUrls : legacyImages;
  // Monta uma tag <img> para cada imagem, uma tag <video> para cada vídeo
  // e um bloco com links de download para os documentos (se houver).
  const imageHtml = availableImageUrls.map((url, index) =>
    `<img src="${escapeHtml(url)}" alt="Imagem ${index + 1} anexada ao chamado" style="display:block;max-width:100%;max-height:360px;margin-top:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);">`
  ).join('');
  const videoHtml = videoUrls.map((url, index) =>
    `<video src="${escapeHtml(url)}" controls preload="metadata" aria-label="Vídeo ${index + 1} anexado ao chamado" style="display:block;width:100%;max-height:420px;margin-top:10px;border:1px solid var(--border);border-radius:8px;background:#000;"></video>`
  ).join('');
  const docHtml = docLinks.length ? `
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">
      ${docLinks.map(d => `
        <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" download="${escapeHtml(d.nome)}"
           style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--accent);text-decoration:none;font-size:13px;word-break:break-all">
          <span aria-hidden="true">📄</span> ${escapeHtml(d.nome)}
        </a>`).join('')}
    </div>` : '';
  // Junta tudo. As imagens só entram se a descrição tinha marcadores de
  // imagem ou imagens antigas embutidas.
  return `${text}${imageMarkers.length || legacyImages.length ? imageHtml : ''}${videoHtml}${docHtml}`;
}

// bindDocPreview: prepara o campo de documentos do formulário "Novo Chamado".
// Mostra a lista dos documentos escolhidos, com botão "Remover" em cada um,
// e valida cada arquivo (tipo, tamanho e quantidade).
// Chamada por: initFormNovo. Recebe: nada. Devolve: nada.
function bindDocPreview() {
  // Pega os elementos da tela: o campo de arquivo (escondido), a área da
  // lista e o botão "Adicionar documento". Se algum não existir, não faz nada.
  const input = document.getElementById('c-documento');
  const previewWrap = document.getElementById('c-documento-preview');
  const addButton = document.getElementById('btn-add-documento');
  if (!input || !previewWrap || !addButton) return;

  // render: redesenha a lista de documentos escolhidos.
  const render = () => {
    previewWrap.replaceChildren();
    selectedDocFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2)';

      const info = document.createElement('span');
      info.textContent = `📄 ${file.name} – ${(file.size / 1024 / 1024).toFixed(1)} MB`;
      info.style.cssText = 'flex:1;font-size:12px;color:var(--fg2);word-break:break-all';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-ghost btn-sm';
      removeButton.textContent = 'Remover';
      removeButton.setAttribute('aria-label', `Remover documento ${file.name}`);
      // Ao clicar em "Remover", tira o documento da lista e redesenha.
      removeButton.addEventListener('click', () => { selectedDocFiles.splice(index, 1); render(); });

      item.append(info, removeButton);
      previewWrap.appendChild(item);
    });
    // Esconde a área quando não há documentos.
    previewWrap.style.display = selectedDocFiles.length ? 'flex' : 'none';
    // Ao chegar no limite (MAX_DOCS), desativa o botão e troca o texto dele.
    const cheio = selectedDocFiles.length >= MAX_DOCS;
    addButton.disabled = cheio;
    addButton.innerHTML = cheio
      ? '<span aria-hidden="true">+</span> Limite de documentos atingido'
      : '<span aria-hidden="true">+</span> Adicionar documento';
  };

  // Quando o usuário escolhe arquivos: limpa o campo (para permitir escolher
  // o mesmo arquivo de novo) e valida um por um. Os inválidos geram um aviso
  // ("toast") e são ignorados; os válidos entram na lista.
  input.onchange = () => {
    const files = Array.from(input.files || []);
    input.value = '';
    for (const file of files) {
      if (selectedDocFiles.length >= MAX_DOCS) {
        toast(`Você pode anexar no máximo ${MAX_DOCS} documentos.`, 'err'); break;
      }
      if (!DOC_TYPES[getDocExt(file.name)]) {
        toast(`"${file.name}": use PDF, Word, Excel, TXT ou CSV.`, 'err'); continue;
      }
      if (file.size > MAX_DOC_SIZE) {
        toast(`"${file.name}": cada documento deve ter até 10 MB.`, 'err'); continue;
      }
      selectedDocFiles.push(file);
    }
    render();
  };

  // Quando o formulário é limpo (reset, por exemplo após abrir o chamado),
  // esvazia também a lista de documentos. A marca "docResetBound" evita
  // registrar esse aviso duas vezes se a função for chamada de novo.
  if (input.form && !input.form.dataset.docResetBound) {
    input.form.addEventListener('reset', () => { selectedDocFiles = []; render(); });
    input.form.dataset.docResetBound = '1';
  }
}

// bindVideoPreview: prepara o campo de vídeo do formulário "Novo Chamado".
// Mostra uma prévia do vídeo escolhido (dá para assistir antes de enviar),
// com nome, tamanho e botão "Remover vídeo". Só é permitido um vídeo.
// Chamada por: initFormNovo. Recebe: nada. Devolve: nada.
function bindVideoPreview() {
  const input = document.getElementById('c-video');
  const previewWrap = document.getElementById('c-video-preview');
  const addButton = document.getElementById('btn-add-video');
  if (!input || !previewWrap || !addButton) return;

  // Endereço temporário (só existe neste navegador) usado para a prévia.
  let previewUrl = null;

  // render: redesenha a prévia do vídeo.
  const render = () => {
    // Libera o endereço temporário anterior para não gastar memória.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewWrap.replaceChildren();
    // Com vídeo: mostra a prévia e esconde o botão "Adicionar vídeo".
    // Sem vídeo: o contrário.
    previewWrap.style.display = selectedVideoFile ? 'flex' : 'none';
    addButton.style.display = selectedVideoFile ? 'none' : '';
    if (!selectedVideoFile) return;

    // Cria o player de vídeo, o texto com nome/tamanho e o botão de remover.
    previewUrl = URL.createObjectURL(selectedVideoFile);
    const video = document.createElement('video');
    video.src = previewUrl;
    video.controls = true;
    video.preload = 'metadata';
    video.style.cssText = 'display:block;max-width:320px;width:100%;max-height:220px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#000';

    const info = document.createElement('span');
    info.textContent = `${selectedVideoFile.name} – ${(selectedVideoFile.size / 1024 / 1024).toFixed(1)} MB`;
    info.style.cssText = 'color:var(--fg3);font-size:12px;word-break:break-all';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn-ghost btn-sm';
    removeButton.textContent = 'Remover vídeo';
    removeButton.addEventListener('click', () => { selectedVideoFile = null; render(); });

    const side = document.createElement('div');
    side.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:flex-start;justify-content:center';
    side.append(info, removeButton);
    previewWrap.append(video, side);
  };

  // Quando o usuário escolhe um vídeo: pega só o primeiro arquivo,
  // confere o tipo (MP4, WebM ou MOV) e o tamanho (até 50 MB).
  // Se estiver tudo certo, guarda em selectedVideoFile e mostra a prévia.
  input.onchange = () => {
    const file = (input.files || [])[0];
    input.value = '';
    if (!file) return;
    if (!VIDEO_EXTENSIONS[file.type]) {
      toast('Use vídeos MP4, WebM ou MOV.', 'err');
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast('O vídeo deve ter até 50 MB. Grave um trecho mais curto.', 'err');
      return;
    }
    selectedVideoFile = file;
    render();
  };

  // Ao limpar o formulário, remove também o vídeo escolhido
  // (registrado uma única vez, graças à marca "videoResetBound").
  if (input.form && !input.form.dataset.videoResetBound) {
    input.form.addEventListener('reset', () => { selectedVideoFile = null; render(); });
    input.form.dataset.videoResetBound = '1';
  }
}

// bindImagePreview: prepara o campo de imagens do formulário "Novo Chamado".
// Mostra miniaturas das imagens escolhidas, cada uma com botão "Remover",
// e um contador ("2 de 5 imagens selecionadas").
// Chamada por: initFormNovo. Recebe: nada. Devolve: nada.
function bindImagePreview() {
  const input = document.getElementById('c-imagem');
  const previewWrap = document.getElementById('c-imagem-preview');
  const addButton = document.getElementById('btn-add-imagem');
  if (!input || !previewWrap || !addButton) return;

  // Regras das imagens: no máximo 5, até 2 MB cada, só JPG, PNG, GIF ou WebP.
  // (As mesmas regras são conferidas de novo em submitChamado.)
  const maxImages = 5;
  const maxImageSize = 2 * 1024 * 1024;
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
  // Endereços temporários das miniaturas, guardados para serem liberados depois.
  let previewUrls = [];

  // clearPreviews: apaga as miniaturas da tela e libera a memória usada.
  const clearPreviews = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];
    previewWrap.replaceChildren();
    previewWrap.style.display = 'none';
  };

  // renderPreviews: redesenha todas as miniaturas a partir de selectedImageFiles.
  const renderPreviews = () => {
    clearPreviews();
    selectedImageFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);

      const item = document.createElement('div');
      item.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:4px;max-width:180px';

      const img = document.createElement('img');
      img.src = url;
      img.alt = `Pré-visualização da imagem ${index + 1}`;
      img.style.cssText = 'display:block;max-width:180px;max-height:180px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2)';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-ghost btn-sm';
      removeButton.textContent = 'Remover';
      removeButton.setAttribute('aria-label', `Remover imagem ${index + 1}`);
      removeButton.addEventListener('click', () => {
        selectedImageFiles.splice(index, 1);
        renderPreviews();
      });

      item.append(img, removeButton);
      previewWrap.appendChild(item);
    });

    // Contador de imagens ao lado das miniaturas.
    if (selectedImageFiles.length) {
      const count = document.createElement('span');
      count.textContent = `${selectedImageFiles.length} de ${maxImages} imagens selecionadas`;
      count.style.cssText = 'align-self:center;color:var(--fg3);font-size:12px';
      previewWrap.appendChild(count);
    }

    // Mostra/esconde a área e desativa o botão quando o limite é atingido.
    previewWrap.style.display = selectedImageFiles.length ? 'flex' : 'none';
    addButton.disabled = selectedImageFiles.length >= maxImages;
    addButton.innerHTML = selectedImageFiles.length >= maxImages
      ? '<span aria-hidden="true">+</span> Limite de imagens atingido'
      : '<span aria-hidden="true">+</span> Adicionar imagem';
  };

  // Quando o usuário escolhe uma imagem: pega o primeiro arquivo,
  // confere limite de quantidade, tipo e tamanho. Se passar em tudo,
  // adiciona à lista e redesenha as miniaturas.
  input.onchange = () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;

    const file = files[0];
    if (selectedImageFiles.length >= maxImages) {
      toast(`Você pode anexar no máximo ${maxImages} imagens.`, 'err');
      return;
    }

    if (!allowedTypes.has(file.type)) {
      toast('Use imagens JPG, PNG, GIF ou WebP.', 'err');
      return;
    }
    if (file.size > maxImageSize) {
      toast('Cada imagem deve ter até 2 MB.', 'err');
      return;
    }

    selectedImageFiles.push(file);
    renderPreviews();
  };

  // Ao limpar o formulário: esvazia a lista de imagens, apaga as miniaturas
  // e volta o botão ao normal. Registrado uma vez só ("imageResetBound").
  if (input.form && !input.form.dataset.imageResetBound) {
    input.form.addEventListener('reset', () => {
      selectedImageFiles = [];
      clearPreviews();
      addButton.disabled = false;
      addButton.innerHTML = '<span aria-hidden="true">+</span> Adicionar imagem';
    });
    input.form.dataset.imageResetBound = '1';
  }
}

// getStorageImagePaths: lê a descrição do chamado e devolve a lista de
// caminhos das imagens no Storage (tirados dos marcadores [imagem-storage: ...]).
// Por segurança, só aceita caminhos no formato esperado:
// "<id de 36 caracteres>/<id de 36 caracteres>.jpg|png|gif|webp".
// Qualquer coisa diferente é descartada.
// Chamada por: openDetalhe.
function getStorageImagePaths(description) {
  const matches = String(description || '').matchAll(/\[imagem-storage:\s*([^\]\r\n]+)\]/g);
  const validPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i;
  return [...matches]
    .map(match => match[1].trim())
    .filter(path => validPath.test(path));
}

// getStorageVideoPaths: igual à função acima, mas para vídeos
// (marcadores [video-storage: ...], extensões mp4, webm ou mov).
// Devolve a lista de caminhos válidos. Chamada por: openDetalhe.
function getStorageVideoPaths(description) {
  const matches = String(description || '').matchAll(/\[video-storage:\s*([^\]\r\n]+)\]/g);
  const validPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov)$/i;
  return [...matches]
    .map(match => match[1].trim())
    .filter(path => validPath.test(path));
}

// Documentos: [documento-storage: <caminho> | <nome original>]
// getStorageDocs: lê os marcadores de documento da descrição e devolve uma
// lista de objetos { path, nome }, onde "path" é o caminho no Storage e
// "nome" é o nome original do arquivo (para baixar com o nome certo).
// Se o nome não estiver no marcador, usa o final do caminho.
// Só aceita caminhos no formato esperado (pdf, doc, docx, xls, xlsx, txt, csv).
// Chamada por: openDetalhe.
function getStorageDocs(description) {
  const matches = String(description || '').matchAll(/\[documento-storage:\s*([^\]\r\n]+)\]/g);
  const validPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx?|xlsx?|txt|csv)$/i;
  return [...matches]
    .map(match => {
      const [path, ...resto] = match[1].split('|');
      const p = path.trim();
      return { path: p, nome: resto.join('|').trim() || p.split('/').pop() };
    })
    .filter(d => validPath.test(d.path));
}

// Nome do arquivo seguro para guardar no marcador (sem colchetes, barras verticais ou quebras de linha)
// Esses caracteres quebrariam a leitura do marcador, por isso viram espaço.
// Também corta o nome em 120 caracteres. Se sobrar vazio, usa "documento".
// Chamada por: submitChamado.
function safeDocName(name) {
  return String(name).replace(/[\[\]|\r\n]/g, ' ').trim().slice(0, 120) || 'documento';
}

// ─────────────────────────────────────────
// Atualizações em tempo real
// ─────────────────────────────────────────
// Canal de tempo real aberto com o Supabase. null = nenhum canal aberto ainda.
let chamadosChannel = null;

// subscribeChamados: "assina" a tabela chamados no Supabase. A partir daí,
// qualquer inclusão, alteração ou exclusão feita por qualquer pessoa
// (event: '*') dispara loadChamados, que recarrega a lista e redesenha a tela.
// Chamada por: app.js, logo depois do primeiro loadChamados.
// Recebe: nada. Devolve: nada.
function subscribeChamados() {
  // Evita assinaturas duplicadas quando o usuário sai e entra de novo
  if (chamadosChannel) supa.removeChannel(chamadosChannel);
  chamadosChannel = supa.channel('chamados-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, async () => {
      await loadChamados();
    })
    .subscribe();
}

// ─────────────────────────────────────────
// Renderização principal
// ─────────────────────────────────────────
// renderAll: redesenha o painel e a tabela de chamados de uma vez.
// Chamada por: loadChamados (sempre que os dados chegam do banco).
function renderAll() {
  renderDashboard();
  renderChamadosTable(getSortedFiltered());
}

// getFilteredChamados: aplica os filtros da página "Chamados" sobre allChamados.
// Lê o que está escolhido nos campos de busca, status, prioridade, categoria,
// loja e período, e devolve só os chamados que passam em todos eles.
// Chamada por: getSortedFiltered. Não altera allChamados.
function getFilteredChamados() {
  // Valores atuais dos filtros. O "?." evita erro se o campo não existir na
  // tela; nesse caso, o filtro fica vazio (= não filtra).
  // "periodo" é a quantidade de dias (0 = qualquer data).
  const busca   = (document.getElementById('f-busca')?.value  || '').toLowerCase();
  const status  = document.getElementById('f-status')?.value  || '';
  const prio    = document.getElementById('f-prioridade')?.value || '';
  const cat     = document.getElementById('f-categoria')?.value || '';
  const loja    = document.getElementById('f-loja')?.value    || '';
  const periodo = parseInt(document.getElementById('f-periodo')?.value || '0');
  const now     = Date.now();

  // Cada "return false" tira o chamado da lista. Filtro vazio é ignorado.
  return allChamados.filter(c => {
    if (status  && !matchStatus(c.status, status)) return false;
    if (prio    && c.prioridade !== prio)     return false;
    if (cat     && c.categoria  !== cat)      return false;
    if (loja    && c.loja       !== loja)      return false;
    // Período: 86400000 é a quantidade de milissegundos em um dia.
    // Sai da lista o chamado aberto há mais dias do que o período escolhido.
    if (periodo && c.criadoEm   && (now - c.criadoEm) > periodo * 86400000) return false;
    // Busca livre: junta protocolo, nome, contato, assunto, descrição, loja,
    // categoria, resolução e id num só texto e procura o termo digitado
    // (sem diferenciar maiúsculas de minúsculas).
    if (busca) {
      const hay = [protocoloChamado(c), c.nome, c.contato, c.assunto, c.descricao, c.loja, c.categoria, c.resolucao, c.id]
        .join(' ').toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    return true;
  });
}

// Grupos de status usados pelos cards do painel e pelo filtro
// Cada grupo é uma pequena função que recebe um status e responde
// verdadeiro/falso:
//   ativos     – tudo que não foi Fechado nem Cancelado;
//   andamento  – "Em Andamento" ou "Aguardando usuário";
//   concluidos – "Fechado" ou "Resolvido".
const STATUS_GRUPOS = {
  ativos:     s => s !== 'Fechado' && s !== 'Cancelado',
  andamento:  s => s === 'Em Andamento' || s === 'Aguardando usuário',
  concluidos: s => s === 'Fechado' || s === 'Resolvido',
};

// matchStatus: diz se o status de um chamado combina com o filtro escolhido.
// Se o filtro for o nome de um grupo (ativos, andamento, concluidos), usa a
// regra do grupo; senão, compara o status exatamente (ex.: "Aberto").
// Recebe: status do chamado e valor do filtro. Devolve: true ou false.
// Chamada por: getFilteredChamados.
function matchStatus(status, filtro) {
  return STATUS_GRUPOS[filtro] ? STATUS_GRUPOS[filtro](status) : status === filtro;
}

// Abre a lista de chamados já filtrada (usado pelos cards do painel)
// Chamada por: os cards "Abertos", "Em andamento", "Urgentes" e "Concluídos"
// do painel (onclick no index.html).
// Recebe um objeto com status, prioridade e período (todos opcionais).
// Vai para a página "Chamados", limpa os demais filtros, preenche os
// filtros pedidos e redesenha a tabela. Devolve: nada.
function openChamadosFiltrados({ status = '', prioridade = '', periodo = '0' } = {}) {
  navigate('chamados');
  // "set": atalho para colocar um valor num campo pelo id, se ele existir.
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('f-busca', '');
  set('f-categoria', '');
  set('f-loja', '');
  set('f-status', status);
  set('f-prioridade', prioridade);
  set('f-periodo', periodo);
  renderChamadosTable(getSortedFiltered());
}

// getSortedFiltered: devolve a lista de chamados já filtrada e ordenada
// pela coluna escolhida (sortField) e na direção escolhida (sortDir).
// Chamada por: renderAll, openChamadosFiltrados, sortBy, exportações e
// pelos campos de filtro do index.html (a cada alteração).
function getSortedFiltered() {
  const arr = getFilteredChamados();
  // "sort" compara dois chamados (a e b) de cada vez para decidir quem vem antes.
  return arr.sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    // Prioridade e status não são ordenados por ordem alfabética, e sim pela
    // ordem definida em config.js (PRIO_ORDER e STATUS_ORDER).
    // Valores desconhecidos recebem 99 e vão para o fim.
    if (sortField === 'prioridade') { va = PRIO_ORDER[va] ?? 99; vb = PRIO_ORDER[vb] ?? 99; }
    if (sortField === 'status')     { va = STATUS_ORDER[va] ?? 99; vb = STATUS_ORDER[vb] ?? 99; }
    // O protocolo é sequencial pela data de abertura
    if (sortField === 'protocolo')  { va = a.criadoEm || 0; vb = b.criadoEm || 0; }
    // Compara os valores e inverte o resultado quando a direção é decrescente.
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

// sortBy: chamada ao clicar no título de uma coluna da tabela (index.html).
// Recebe o nome do campo (ex.: 'loja'). Se for a mesma coluna já ordenada,
// inverte a direção; se for outra, passa a ordenar por ela em ordem crescente.
// Depois redesenha a tabela.
function sortBy(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'asc'; }
  renderChamadosTable(getSortedFiltered());
}

// ─────────────────────────────────────────
// Painel
// ─────────────────────────────────────────
// renderDashboard: desenha a página "Painel".
// Calcula os números dos cards, atualiza o contador no menu, a lista de
// chamados recentes e o gráfico por categoria.
// Chamada por: renderAll. Usa sempre allChamados (sem os filtros da tabela).
function renderDashboard() {
  // Números dos cards:
  //   abertos   – status "Aberto";
  //   andamento – "Em Andamento" ou "Aguardando usuário";
  //   urgentes  – prioridade "Urgente" que ainda não foi fechado nem cancelado;
  //   fechados  – "Fechado" ou "Resolvido" atualizados nos últimos 30 dias.
  const abertos    = allChamados.filter(c => c.status === 'Aberto').length;
  const andamento  = allChamados.filter(c => c.status === 'Em Andamento' || c.status === 'Aguardando usuário').length;
  const urgentes   = allChamados.filter(c => c.prioridade === 'Urgente' && c.status !== 'Fechado' && c.status !== 'Cancelado').length;
  const thirtyDays = Date.now() - 30 * 86400000;
  const fechados   = allChamados.filter(c => (c.status === 'Fechado' || c.status === 'Resolvido') && c.atualizadoEm > thirtyDays).length;

  setStat('stat-abertos',   abertos);
  setStat('stat-andamento', andamento);
  setStat('stat-urgentes',  urgentes);
  setStat('stat-fechados',  fechados);

  // Indicador de chamados na navegação
  // (bolinha com o número de abertos no menu; some quando é zero)
  const badgeEl = document.getElementById('badge-abertos');
  if (badgeEl) {
    badgeEl.textContent = abertos;
    badgeEl.style.display = abertos > 0 ? '' : 'none';
  }

  // Chamados recentes (últimos 10 abertos/em andamento)
  // A lista já vem do banco ordenada do mais novo para o mais antigo,
  // então basta pegar os 10 primeiros que não estão fechados nem cancelados.
  // Cada item, ao ser clicado, abre a janela de detalhes (openDetalhe).
  const recentes = allChamados
    .filter(c => c.status !== 'Fechado' && c.status !== 'Cancelado')
    .slice(0, 10);

  const recentesEl = document.getElementById('recentes-list');
  if (recentesEl) {
    if (!recentes.length) {
      recentesEl.innerHTML = '<div class="empty-state" style="padding:16px"><p>Nenhum chamado aberto</p></div>';
    } else {
      recentesEl.innerHTML = recentes.map(c => `
        <div class="recent-item" role="button" tabindex="0" data-open-id="${c.id}"
             onclick="openDetalhe('${c.id}')">
          <div style="flex:1;min-width:0">
            <div class="recent-title">${esc(c.assunto)}</div>
            <div class="recent-meta">${esc(c.loja)} · ${esc(c.nome)} · ${fmtRelTime(c.criadoEm)}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">${prioBadge(c.prioridade)}</div>
        </div>`).join('');
    }
  }

  // Gráfico por categoria
  // Conta quantos chamados ativos existem em cada categoria, ordena do maior
  // para o menor e desenha as barras na área "cat-chart".
  const catCount = {};
  allChamados.filter(c => c.status !== 'Fechado' && c.status !== 'Cancelado').forEach(c => {
    catCount[c.categoria] = (catCount[c.categoria] || 0) + 1;
  });
  const catEntries = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  renderBars('cat-chart', catEntries, 'var(--accent)');
}

// Atualiza um indicador e dá um "pulo" quando o número muda
// Recebe: id do elemento na tela e o novo valor. Devolve: nada.
// A animação vem da classe CSS "bump". Para ela tocar de novo, a classe é
// removida, o navegador é forçado a recalcular a tela e a classe volta.
// Chamada por: renderDashboard.
function setStat(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const changed = el.textContent !== String(val);
  el.textContent = val;
  if (changed && el.textContent !== '–') {
    el.classList.remove('bump');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('bump');
  }
}

// ─────────────────────────────────────────
// Tabela de chamados
// ─────────────────────────────────────────
// renderChamadosTable: desenha as linhas da tabela da página "Chamados".
// Recebe: a lista de chamados a mostrar (normalmente getSortedFiltered()).
// Devolve: nada.
// Chamada por: renderAll, sortBy, openChamadosFiltrados e pelos campos de
// filtro/busca do index.html.
function renderChamadosTable(list) {
  const el = document.getElementById('chamados-table-body');
  if (!el) return;

  // Administradores veem também o e-mail de quem abriu o chamado.
  const isAdmin = hasAdminAccess();

  // Seta indicando a coluna e a direção da ordenação
  document.querySelectorAll('#page-chamados th[data-sort]').forEach(th => {
    th.classList.toggle('sorted-asc',  th.dataset.sort === sortField && sortDir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.sort === sortField && sortDir === 'desc');
  });

  // Nenhum chamado depois dos filtros: mostra uma linha com o aviso.
  if (!list.length) {
    el.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--fg3)">Nenhum chamado encontrado</td></tr>`;
    return;
  }

  // Uma linha por chamado: protocolo, assunto/categoria, solicitante, loja,
  // prioridade, status, data e o botão "Ver". Clicar na linha ou no botão
  // abre os detalhes (openDetalhe). Os textos passam por esc() para
  // evitar que HTML digitado pelo usuário seja executado.
  el.innerHTML = list.map(c => {
    // Coluna do solicitante: com e-mail para administradores, só o nome para os demais.
    const colSolicitante = isAdmin
      ? `<td>${esc(c.nome)}<br><small style="color:var(--fg3)">${esc(c.email_abertura || '')}</small></td>`
      : `<td>${esc(c.nome)}</td>`;

    return `<tr class="row-click" tabindex="0" data-open-id="${c.id}" onclick="openDetalhe('${c.id}')">
      <td style="white-space:nowrap"><span style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--fg2)">#${esc(protocoloChamado(c))}</span></td>
      <td class="wrap" style="max-width:220px"><strong>${esc(c.assunto)}</strong><br><small style="color:var(--fg3)">${esc(c.categoria)}</small></td>
      ${colSolicitante}
      <td>${esc(c.loja)}</td>
      <td>${prioBadge(c.prioridade)}</td>
      <td>${statusBadge(c.status)}</td>
      <td><span style="font-size:12px;color:var(--fg3)">${fmtDate(c.criadoEm)}</span></td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openDetalhe('${c.id}')">Ver</button>
      </td>
    </tr>`;
  }).join('');
}

// Atualiza cabeçalho de "Solicitante" baseado no perfil
// Administrador vê "Solicitante"; usuário comum vê "Nome".
// Chamada por: app.js, depois do login. Recebe: nada. Devolve: nada.
function updateChamadosTableHeader() {
  const isAdmin = hasAdminAccess();
  const header  = document.getElementById('th-solicitante');
  if (header) header.textContent = isAdmin ? 'Solicitante' : 'Nome';
}

// ─────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────
// populateLojaFilter: preenche o filtro "Loja" da página Chamados com a lista
// LOJAS (config.js). A marca "populated" garante que isso aconteça só uma vez,
// mesmo que a página seja aberta várias vezes.
// Chamada por: navigate (ui.js), ao entrar na página "chamados".
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
// openDetalhe: abre a janela (modal) com todos os detalhes de um chamado.
// Chamada por: clique numa linha da tabela, no botão "Ver" ou num item da
// lista de recentes do painel.
// Recebe: o id do chamado. Devolve: nada.
// Também gera links temporários para ver/baixar os anexos guardados no Storage.
async function openDetalhe(id) {
  // Procura o chamado na lista já carregada. Se não achar, não faz nada.
  const c = allChamados.find(x => x.id === id);
  if (!c) return;
  // Número desta abertura. Se outra abertura começar enquanto esta espera
  // os anexos, esta será descartada mais abaixo.
  const requestId = ++detailRequestId;

  // Permissões: só administradores editam status/observações e excluem.
  const isAdmin   = hasAdminAccess();
  const canEdit   = isAdmin;
  const canDelete = isAdmin;
  // Depois de aberto, só o super administrador altera a prioridade
  const canEditPrio = isSuperAdmin();

  // Opções das listas de prioridade e de status, já com a opção atual marcada.
  const prioOptions = Object.keys(PRIO_ORDER).map(p =>
    `<option value="${p}" ${c.prioridade === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  const statusOptions = STATUS_CHAMADO.map(s =>
    `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  // Anexos: lê os caminhos das imagens e do vídeo a partir da descrição.
  const imagePaths = getStorageImagePaths(c.descricao);
  const videoPaths = getStorageVideoPaths(c.descricao);
  const imageUrls = [];
  const videoUrls = [];
  // signAll: para cada caminho, pede ao Supabase Storage (bucket
  // "chamados-imagens") um "link assinado": um endereço temporário, válido
  // por 3600 segundos (1 hora), que permite ver o arquivo privado.
  // Se um arquivo falhar, avisa o usuário e segue com os outros.
  const signAll = async (paths, urls, tipo) => {
    for (const path of paths) {
      try {
        const { data, error } = await supa.storage
          .from('chamados-imagens')
          .createSignedUrl(path, 3600);
        if (error) throw error;
        urls.push(data.signedUrl);
      } catch (e) {
        toast(`Não foi possível carregar ${tipo}: ` + e.message, 'err');
      }
    }
  };
  // Documentos anexados e se há algum anexo. Havendo, mostra o indicador
  // de "carregando" enquanto os links são gerados.
  const docs = getStorageDocs(c.descricao);
  const docLinks = [];
  const hasMedia = imagePaths.length || videoPaths.length || docs.length;
  if (hasMedia) setLoading(true);
  await signAll(imagePaths, imageUrls, 'uma imagem');
  await signAll(videoPaths, videoUrls, 'o vídeo');
  for (const d of docs) {
    try {
      // "download" faz o arquivo baixar com o nome original
      const { data, error } = await supa.storage
        .from('chamados-imagens')
        .createSignedUrl(d.path, 3600, { download: d.nome });
      if (error) throw error;
      docLinks.push({ url: data.signedUrl, nome: d.nome });
    } catch (e) {
      toast('Não foi possível carregar um documento: ' + e.message, 'err');
    }
  }
  if (hasMedia) setLoading(false);
  // Se o usuário já clicou em outro chamado enquanto esperávamos,
  // esta abertura ficou velha: para aqui para não mostrar o chamado errado.
  if (requestId !== detailRequestId) return;

  // Preenche o título e o corpo da janela. O corpo tem:
  // - cabeçalho com protocolo, prioridade, status, tempo desde a abertura
  //   e botão "Excluir" (só administradores);
  // - grade com solicitante, contato, loja, categoria, equipamento,
  //   acesso remoto (com botão "Copiar") e última atualização;
  // - descrição com os anexos (formatDescricaoHtml);
  // - resolução do problema (só se já houver uma);
  // - troca de prioridade (só super administrador);
  // - troca de status e caixa de resolução (só administradores);
  // - observações/histórico, editáveis só por administradores.
  // Todo texto vindo do banco passa por esc() por segurança.
  document.getElementById('md-titulo').textContent = c.assunto;
  document.getElementById('md-body').innerHTML = `
    <div class="detail-header">
      <div style="flex:1">
        <div class="detail-meta">
          <span class="protocolo-tag" title="Protocolo do atendimento">#${esc(protocoloChamado(c))}</span>
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
        <div class="detail-field-label">Acesso remoto</div>
        <div class="detail-field-val">${c.acesso_remoto_codigo ? `
          ${esc(c.acesso_remoto_tipo || 'Código')}: <strong style="font-family:monospace;letter-spacing:.04em">${esc(c.acesso_remoto_codigo)}</strong>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-left:6px;padding:2px 8px"
                  data-codigo="${esc(c.acesso_remoto_codigo)}" onclick="copiarAcessoRemoto(this)">Copiar</button>
        ` : '–'}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Última atualização</div>
        <div class="detail-field-val">${fmtDate(c.atualizadoEm)}</div>
      </div>
    </div>

    <div>
      <div class="detail-field-label" style="margin-bottom:6px">Descrição</div>
      <div class="detail-body">${formatDescricaoHtml(c.descricao, imageUrls, videoUrls, docLinks)}</div>
    </div>

    ${c.resolucao ? `
    <div>
      <div class="detail-field-label" style="margin-bottom:6px">Resolução do problema</div>
      <div class="detail-body resolucao-body">${esc(c.resolucao)}</div>
    </div>
    ` : ''}

    ${canEditPrio ? `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--bg3);border-radius:var(--radius-sm);padding:12px 14px">
      <label style="font-size:12px;font-weight:600;color:var(--fg2)">Prioridade:</label>
      <select id="md-prioridade" style="flex:1;min-width:160px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:6px 10px;font-family:var(--font);font-size:13px;outline:none">
        ${prioOptions}
      </select>
      <button class="btn btn-primary btn-sm" onclick="savePrioridade('${c.id}')">Salvar</button>
    </div>
    ` : ''}

    ${canEdit ? `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--bg3);border-radius:var(--radius-sm);padding:12px 14px">
      <label style="font-size:12px;font-weight:600;color:var(--fg2)">Status:</label>
      <select id="md-status" onchange="toggleResolucaoBox()" style="flex:1;min-width:160px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:6px 10px;font-family:var(--font);font-size:13px;outline:none">
        ${statusOptions}
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveStatus('${c.id}')">Salvar</button>
      <div id="md-resolucao-wrap" style="flex-basis:100%;display:none;flex-direction:column;gap:6px">
        <label for="md-resolucao" style="font-size:12px;font-weight:600;color:var(--fg2)">Resolução do problema <span id="md-resolucao-obrig" style="color:var(--danger)">*</span></label>
        <textarea id="md-resolucao" class="form-control" rows="4" maxlength="4000"
                  placeholder="Descreva o que foi feito para resolver (ex.: troca do cabo de rede, reinstalação do driver…)">${esc(c.resolucao || '')}</textarea>
      </div>
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

  // Ajusta a caixa de resolução conforme o status atual (sem pôr o cursor
  // nela) e, por fim, abre a janela.
  toggleResolucaoBox(false);
  openModal('modal-detalhe');
}

// Status que pedem a resolução do problema (obrigatória em "Resolvido")
const STATUS_COM_RESOLUCAO = ['Resolvido', 'Fechado'];

// Mostra a caixa de resolução quando o status escolhido é Resolvido/Fechado
// Chamada por: openDetalhe (ao abrir, com focus = false) e pela lista de
// status da janela de detalhes, toda vez que ela muda (com focus = true).
// Recebe: focus – se true, coloca o cursor na caixa quando ela estiver vazia.
// O asterisco de "obrigatório" só aparece para "Resolvido".
function toggleResolucaoBox(focus = true) {
  const status = document.getElementById('md-status')?.value;
  const wrap   = document.getElementById('md-resolucao-wrap');
  if (!wrap) return;
  const show = STATUS_COM_RESOLUCAO.includes(status);
  wrap.style.display = show ? 'flex' : 'none';
  const obrig = document.getElementById('md-resolucao-obrig');
  if (obrig) obrig.style.display = status === 'Resolvido' ? '' : 'none';
  const txt = document.getElementById('md-resolucao');
  if (show && focus && txt && !txt.value.trim()) txt.focus();
}

// saveStatus: grava o novo status do chamado (e a resolução, se for o caso).
// Chamada por: botão "Salvar" ao lado do status, na janela de detalhes
// (só aparece para administradores).
// Recebe: o id do chamado. Devolve: nada.
async function saveStatus(id) {
  const status = document.getElementById('md-status')?.value;
  if (!status) return;
  // "payload" é o conjunto de dados que será enviado ao banco.
  // A data de atualização é sempre renovada.
  const payload = { status, atualizado_em: new Date().toISOString() };

  // Regra de negócio: para "Resolvido" a resolução é obrigatória;
  // para "Fechado" é opcional. Nos dois casos ela é gravada (ou apagada, se vazia).
  if (STATUS_COM_RESOLUCAO.includes(status)) {
    const txt = document.getElementById('md-resolucao');
    const resolucao = (txt?.value || '').trim();
    if (status === 'Resolvido' && !resolucao) {
      toast('Descreva a resolução do problema antes de marcar como resolvido.', 'err');
      txt?.focus();
      return;
    }
    payload.resolucao = resolucao || null;
  }

  // Atualiza a linha da tabela "chamados" com esse id. A tela se atualiza
  // sozinha depois, pelo tempo real (subscribeChamados).
  try {
    const { error } = await supa.from('chamados').update(payload).eq('id', id);
    if (error) throw error;
    toast('Status atualizado!', 'ok');
    closeModal('modal-detalhe');
  } catch (e) {
    // Caso especial: se o erro fala da coluna "resolucao", é porque o banco
    // ainda não tem essa coluna. A mensagem orienta a rodar o script SQL.
    const semColuna = /resolucao/i.test(e?.message || '');
    toast(semColuna
      ? 'Erro: execute o script supabase-protocolo-resolucao.sql no Supabase para salvar a resolução.'
      : 'Erro: ' + e.message, 'err');
  }
}

// Copia o código do AnyDesk/RustDesk para colar direto no programa
// Chamada por: botão "Copiar" no campo "Acesso remoto" da janela de detalhes.
// Recebe: o próprio botão, que guarda o código em data-codigo.
// Os espaços são retirados antes de copiar (ex.: "123 456 789" vira "123456789").
// Se o navegador não deixar copiar, mostra o código num aviso.
async function copiarAcessoRemoto(btn) {
  const codigo = btn?.dataset.codigo || '';
  try {
    await navigator.clipboard.writeText(codigo.replace(/\s+/g, ''));
    toast('Código de acesso remoto copiado!', 'ok');
  } catch {
    toast('Não foi possível copiar. Código: ' + codigo, 'info');
  }
}

// savePrioridade: grava a nova prioridade do chamado na tabela "chamados".
// Chamada por: botão "Salvar" ao lado da prioridade, na janela de detalhes.
// Recebe: o id do chamado. Devolve: nada.
// Regra: só o super administrador pode mudar a prioridade. A checagem é
// repetida aqui, mesmo com o campo escondido para os demais, por segurança.
async function savePrioridade(id) {
  if (!isSuperAdmin()) { toast('Somente o super administrador pode alterar a prioridade.', 'err'); return; }
  const prioridade = document.getElementById('md-prioridade')?.value;
  if (!prioridade) return;
  try {
    const { error } = await supa.from('chamados')
      .update({ prioridade, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast('Prioridade atualizada!', 'ok');
    closeModal('modal-detalhe');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

// saveObs: grava o texto de observações/histórico do chamado (coluna
// "observacao") e renova a data de atualização.
// Chamada por: botão "Salvar obs." na janela de detalhes (só administradores).
// Recebe: o id do chamado. Devolve: nada.
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

// deleteChamado: apaga o chamado de vez da tabela "chamados", depois de
// pedir confirmação ao usuário.
// Chamada por: botão "Excluir" na janela de detalhes (só administradores).
// Recebe: o id do chamado. Devolve: nada.
// Observação: os arquivos anexados no Storage não são apagados aqui.
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
// initFormNovo: prepara o formulário "Novo Chamado".
// Liga os campos de anexo (imagens, vídeo, documentos) e preenche as
// listas de lojas e categorias (vindas de config.js). A marca "populated"
// impede que as opções sejam repetidas se a função rodar de novo.
// Chamada por: app.js, depois do login. Recebe: nada. Devolve: nada.
function initFormNovo() {
  bindImagePreview();
  bindVideoPreview();
  bindDocPreview();

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

}

// submitChamado: abre um novo chamado.
// Chamada por: envio do formulário "Novo Chamado" (onsubmit no index.html).
// Recebe: o evento de envio do formulário. Devolve: nada.
// Passo a passo:
//   1. Lê e valida os campos e os anexos.
//   2. Envia os anexos para o Storage do Supabase (bucket "chamados-imagens").
//   3. Acrescenta os marcadores dos anexos ao fim da descrição.
//   4. Grava o chamado na tabela "chamados" com status "Aberto".
//   5. Limpa o formulário, vai para a lista e mostra o aviso com o protocolo.
// Se algo falhar, apaga os anexos já enviados para não deixar arquivos soltos.
async function submitChamado(ev) {
  // Impede o navegador de recarregar a página (comportamento padrão do formulário).
  ev.preventDefault();
  // Botão que enviou o formulário. Ele mostra o progresso do envio.
  const btn = ev.submitter || document.getElementById('btn-submit-chamado');

  // Lê os valores digitados/escolhidos no formulário (sem espaços nas pontas)
  // e copia as listas de anexos escolhidos.
  const nome       = document.getElementById('c-nome').value.trim();
  const contato    = document.getElementById('c-contato').value.trim();
  const loja       = document.getElementById('c-loja').value;
  const categoria  = document.getElementById('c-categoria').value;
  const prioridade = document.getElementById('c-prioridade').value;
  const equipamento= document.getElementById('c-equipamento').value;
  const remotoTipo = document.getElementById('c-remoto-tipo')?.value || '';
  const remotoCod  = (document.getElementById('c-remoto-codigo')?.value || '').trim();
  const assunto    = document.getElementById('c-assunto').value.trim();
  const descricao  = document.getElementById('c-descricao').value.trim();
  const imageFiles = [...selectedImageFiles];
  const videoFile = selectedVideoFile;
  const docFiles = [...selectedDocFiles];
  // Regras das imagens (iguais às de bindImagePreview) e a extensão usada
  // para salvar cada tipo de imagem no Storage.
  const maxImages = 5;
  const maxImageSize = 2 * 1024 * 1024;
  const fileExtensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };

  // Validação: nome, loja, categoria e assunto são obrigatórios.
  if (!nome || !loja || !categoria || !assunto) {
    toast('Preencha os campos obrigatórios (*).', 'err'); return;
  }
  // Código do AnyDesk/RustDesk: números, letras e os símbolos @ . - _ (ex.: 123 456 789 ou nome@ad)
  if (remotoCod && !/^[\w@.\- ]{3,40}$/.test(remotoCod)) {
    toast('Código de acesso remoto inválido. Use apenas números e letras (ex.: 123 456 789).', 'err'); return;
  }

  // Confere de novo os anexos (quantidade, tipo e tamanho) antes de enviar.
  // É uma segunda proteção, além da feita no momento da escolha.
  if (imageFiles.length > maxImages) {
    toast(`Anexe no máximo ${maxImages} imagens.`, 'err'); return;
  }
  const invalidFile = imageFiles.find(file => !fileExtensions[file.type] || file.size > maxImageSize);
  if (invalidFile) {
    toast(!fileExtensions[invalidFile.type]
      ? 'Use imagens JPG, PNG, GIF ou WebP.'
      : 'Cada imagem deve ter até 2 MB.', 'err');
    return;
  }
  if (videoFile && (!VIDEO_EXTENSIONS[videoFile.type] || videoFile.size > MAX_VIDEO_SIZE)) {
    toast('Use um vídeo MP4, WebM ou MOV de até 50 MB.', 'err');
    return;
  }
  if (docFiles.length > MAX_DOCS
      || docFiles.some(f => !DOC_TYPES[getDocExt(f.name)] || f.size > MAX_DOC_SIZE)) {
    toast(`Anexe até ${MAX_DOCS} documentos PDF, Word, Excel, TXT ou CSV de até 10 MB cada.`, 'err');
    return;
  }

  // Guarda o texto original do botão e o desativa, para evitar clique duplo
  // (o que abriria o chamado duas vezes).
  const btnHtml = btn.innerHTML;
  btn.disabled = true;

  // Listas do que já foi enviado ao Storage. Servem para apagar tudo se o
  // processo falhar no meio do caminho.
  const uploadedImagePaths = [];
  let uploadedVideoPath = null;
  const uploadedDocs = [];
  // try/catch/finally: "try" tenta executar; se der erro em qualquer ponto,
  // pula para o "catch"; o "finally" roda sempre no fim, com ou sem erro.
  try {
    // Os arquivos são guardados numa pasta com o id do usuário, então é
    // preciso estar logado para anexar.
    if ((imageFiles.length || videoFile || docFiles.length) && !currentUser?.id) {
      throw new Error('Faça login novamente antes de anexar arquivos.');
    }
    // Envia as imagens, uma por vez, mostrando o progresso no botão.
    // Cada arquivo recebe um nome aleatório (crypto.randomUUID) dentro da
    // pasta do usuário. "upsert: false" impede sobrescrever um arquivo existente.
    if (imageFiles.length) {

      for (const [index, imageFile] of imageFiles.entries()) {
        btn.textContent = `Enviando imagem ${index + 1} de ${imageFiles.length}…`;
        const path = `${currentUser.id}/${crypto.randomUUID()}.${fileExtensions[imageFile.type]}`;
        const { error: uploadError } = await supa.storage
          .from('chamados-imagens')
          .upload(path, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedImagePaths.push(path);
      }
    }

    // Envia o vídeo (se houver), do mesmo jeito.
    if (videoFile) {
      btn.textContent = 'Enviando vídeo… (pode levar alguns instantes)';
      const path = `${currentUser.id}/${crypto.randomUUID()}.${VIDEO_EXTENSIONS[videoFile.type]}`;
      const { error: uploadError } = await supa.storage
        .from('chamados-imagens')
        .upload(path, videoFile, { contentType: videoFile.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedVideoPath = path;
    }

    // Envia os documentos. O tipo do arquivo vem da extensão (DOC_TYPES),
    // e o nome original é guardado (já limpo por safeDocName) para o download.
    for (const [index, docFile] of docFiles.entries()) {
      btn.textContent = `Enviando documento ${index + 1} de ${docFiles.length}…`;
      const ext = getDocExt(docFile.name);
      const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supa.storage
        .from('chamados-imagens')
        .upload(path, docFile, { contentType: DOC_TYPES[ext], upsert: false });
      if (uploadError) throw uploadError;
      uploadedDocs.push({ path, nome: safeDocName(docFile.name) });
    }

    // Monta os marcadores dos anexos e os coloca no fim da descrição,
    // separados do texto por uma linha em branco.
    const marcadores = [
      ...uploadedImagePaths.map(path => `[imagem-storage: ${path}]`),
      ...(uploadedVideoPath ? [`[video-storage: ${uploadedVideoPath}]`] : []),
      ...uploadedDocs.map(d => `[documento-storage: ${d.path} | ${d.nome}]`),
    ];
    const descricaoFinal = marcadores.length
      ? `${descricao}${descricao ? '\n\n' : ''}${marcadores.join('\n')}`
      : descricao;
    // Dados da nova linha da tabela "chamados".
    // - user_id/email_abertura: quem abriu (usados nas permissões e na tabela do admin);
    // - acesso remoto só é gravado se houver código;
    // - todo chamado nasce com status "Aberto";
    // - criado_em e atualizado_em recebem a data/hora atual.
    const now = new Date().toISOString();
    const payload = {
      user_id:        currentUser?.id || null,
      email_abertura: currentUser?.email || null,
      nome, contato, loja, categoria, prioridade,
      equipamento: equipamento || null,
      acesso_remoto_tipo:   remotoCod ? (remotoTipo || null) : null,
      acesso_remoto_codigo: remotoCod || null,
      assunto, descricao: descricaoFinal,
      status:       'Aberto',
      criado_em:    now,
      atualizado_em: now,
    };

    btn.textContent = 'Registrando chamado…';
    // Pede a linha de volta para mostrar o protocolo gerado pelo banco
    const { data: novo, error } = await supa.from('chamados').insert(payload).select().single();
    if (error) throw error;
    // Deu certo: esvazia as listas de enviados, para que nada seja apagado
    // por engano caso ocorra algum erro depois deste ponto.
    uploadedImagePaths.length = 0;
    uploadedVideoPath = null;
    uploadedDocs.length = 0;
    toast('Chamado aberto com sucesso!', 'ok');
    // Limpa o formulário (isso também limpa os anexos, pelos avisos de
    // "reset" registrados em bindImagePreview/bindVideoPreview/bindDocPreview),
    // volta o nome do usuário logado e vai para a lista de chamados.
    ev.target.reset();
    const previewWrap = document.getElementById('c-imagem-preview');
    if (previewWrap) previewWrap.style.display = 'none';
    if (currentProfile) document.getElementById('c-nome').value = currentProfile.display_name;
    navigate('chamados');
    // Aviso sobre o prazo de atendimento (com o protocolo, se o banco já gera)
    const protoBox = document.getElementById('chamado-aberto-protocolo');
    if (protoBox) {
      protoBox.style.display = novo?.protocolo ? '' : 'none';
      setText('chamado-aberto-protocolo-num', novo?.protocolo ? `#${novo.protocolo}` : '');
    }
    openModal('modal-chamado-aberto');
  } catch (e) {
    console.error('submitChamado:', e);
    // Apaga os arquivos já enviados para não deixar anexos sem chamado
    const enviados = [
      ...uploadedImagePaths,
      ...(uploadedVideoPath ? [uploadedVideoPath] : []),
      ...uploadedDocs.map(d => d.path),
    ];
    if (enviados.length) {
      try {
        const { error: cleanupError } = await supa.storage
          .from('chamados-imagens')
          .remove(enviados);
        if (cleanupError) {
          console.error('Não foi possível remover a imagem após falha ao abrir o chamado:', cleanupError);
        }
      } catch (cleanupError) {
        console.error('Não foi possível remover a imagem após falha ao abrir o chamado:', cleanupError);
      }
    }
    // Mostra ao usuário a melhor mensagem de erro disponível.
    const errorMessage = e?.message || e?.details || 'Erro desconhecido.';
    toast('Erro ao enviar: ' + errorMessage, 'err');
  } finally {
    // Com sucesso ou erro, reativa o botão e devolve o texto original.
    btn.disabled = false; btn.innerHTML = btnHtml;
  }
}

// ─────────────────────────────────────────
// Exportar chamados (CSV e Excel)
// ─────────────────────────────────────────

// Descrição sem os marcadores internos de anexos
// Recebe um chamado e devolve só o texto da descrição: tira os marcadores,
// troca imagens antigas embutidas por "[imagem]" e junta tudo numa linha só
// (quebras de linha e espaços repetidos viram um espaço).
// Chamada por: chamadosTabela (exportação).
function descricaoTexto(c) {
  return String(c.descricao || '')
    .replace(/\[(?:imagem|video|documento)-storage:\s*[^\]\r\n]+\]/g, '')
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/ig, '[imagem]')
    .replace(/\s+/g, ' ')
    .trim();
}

// Monta cabeçalho e linhas da planilha de chamados.
// excel = true: datas como data do Excel e prazo como número; false: tudo como texto.
// Recebe: a lista de chamados e o modo (excel true/false).
// Devolve: { header, rows, widths } – títulos das colunas, linhas e larguras.
// Chamada por: exportCSV, chamadosSheet e relatorios.js.
function chamadosTabela(list, excel) {
  // Colunas "E-mail" e "Observações" só entram para administradores.
  const isAdmin = hasAdminAccess();
  const header = [
    'Protocolo', 'Aberto em', 'Última atualização', 'Loja', 'Solicitante',
    ...(isAdmin ? ['E-mail'] : []),
    'Contato', 'Categoria', 'Prioridade', 'Status', 'Assunto', 'Equipamento',
    'Acesso remoto', 'Descrição', 'Resolução', 'Dias até resolver',
    ...(isAdmin ? ['Observações'] : []),
  ];
  // Uma linha por chamado, na mesma ordem do cabeçalho.
  // "Dias até resolver": só para chamados Resolvidos/Fechados; é a diferença
  // entre a abertura e a última atualização, em dias, com uma casa decimal
  // (864e5 = 86.400.000 milissegundos = 1 dia). No CSV, o ponto vira vírgula.
  const rows = list.map(c => {
    const concluido = (c.status === 'Resolvido' || c.status === 'Fechado') && c.criadoEm && c.atualizadoEm;
    const dias = concluido ? Math.round((c.atualizadoEm - c.criadoEm) / 864e5 * 10) / 10 : '';
    return [
      protocoloChamado(c),
      excel ? excelDate(c.criadoEm)     : fmtDate(c.criadoEm),
      excel ? excelDate(c.atualizadoEm) : fmtDate(c.atualizadoEm),
      c.loja || '', c.nome || '',
      ...(isAdmin ? [c.email_abertura || ''] : []),
      c.contato || '', c.categoria || '', c.prioridade || '', c.status || '',
      c.assunto || '', c.equipamento || '',
      c.acesso_remoto_codigo ? `${c.acesso_remoto_tipo ? c.acesso_remoto_tipo + ' ' : ''}${c.acesso_remoto_codigo}` : '',
      descricaoTexto(c),
      c.resolucao || '',
      excel ? dias : String(dias).replace('.', ','),
      ...(isAdmin ? [c.observacao || ''] : []),
    ];
  });
  // Larguras das colunas no Excel, na mesma ordem do cabeçalho
  const widths = [
    13, 17, 17, 18, 24, ...(isAdmin ? [28] : []),
    16, 18, 11, 18, 36, 20, 20, 60, 60, 10, ...(isAdmin ? [40] : []),
  ];
  return { header, rows, widths };
}

// Planilha de chamados pronta para downloadXLSX
// Recebe: a lista de chamados e o nome da aba (padrão "Chamados").
// Devolve: um objeto com nome, cabeçalho, linhas, larguras e as colunas
// que são datas (B = "Aberto em", C = "Última atualização").
// Chamada por: exportChamadosExcel e relatorios.js.
function chamadosSheet(list, name = 'Chamados') {
  const { header, rows, widths } = chamadosTabela(list, true);
  return { name, header, rows, widths, dates: ['B', 'C'] };
}

// exportCSV: baixa um arquivo CSV com os chamados que estão na tela
// (respeitando filtros e ordenação). O nome leva a data de hoje.
// Chamada por: botão "CSV" da página Chamados (index.html).
async function exportCSV() {
  const list = getSortedFiltered();
  if (!list.length) { toast('Nenhum dado para exportar.', 'info'); return; }
  const { header, rows } = chamadosTabela(list, false);
  downloadCSV(`chamados_${fileDateStamp()}.csv`, header, rows);
  toast(`${list.length} chamados exportados.`, 'ok');
}

// exportChamadosExcel: igual ao CSV, mas gera uma planilha Excel (.xlsx)
// usando downloadXLSX (ui.js). Avisa o usuário se der erro.
// Chamada por: botão "Excel" da página Chamados (index.html).
async function exportChamadosExcel() {
  const list = getSortedFiltered();
  if (!list.length) { toast('Nenhum dado para exportar.', 'info'); return; }
  try {
    await downloadXLSX(`chamados_${fileDateStamp()}.xlsx`, [chamadosSheet(list)]);
    toast(`${list.length} chamados exportados.`, 'ok');
  } catch (e) {
    console.error('exportChamadosExcel:', e);
    toast('Erro ao exportar: ' + e.message, 'err');
  }
}

// ─────────────────────────────────────────
// Gráfico de barras
// ─────────────────────────────────────────
// renderBars: desenha um gráfico de barras horizontais simples.
// Recebe:
//   elId    – id do elemento onde o gráfico será desenhado;
//   entries – lista de pares [rótulo, quantidade], ex.: [['Impressora', 5], ...];
//   color   – cor das barras (ex.: 'var(--accent)').
// Devolve: nada.
// Chamada por: renderDashboard (gráfico por categoria) e relatorios.js.
function renderBars(elId, entries, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Sem dados: mostra o aviso "Sem dados".
  if (!entries.length) { el.innerHTML = '<div class="empty-state" style="padding:16px"><p>Sem dados</p></div>'; return; }
  // A maior quantidade vira 100% da largura; as outras barras são
  // proporcionais a ela. Cada linha tem rótulo, barra e número.
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
