/* ═══════════════════════════════════════════
   SUPORTE MEGA – Mural de avisos (feed estilo rede social)

   Para que serve:
   - Esta é a tela "Avisos" do menu lateral, logo abaixo de "Novo Chamado".
     Todos os usuários entram nela.
   - Administradores publicam avisos com texto, fotos, vídeo e documentos.
   - Qualquer usuário curte, comenta, compartilha e salva os avisos.
   - Quem publicou pode editar ou excluir o próprio aviso; administradores
     também excluem qualquer aviso/comentário e fixam avisos no topo.

   O que contém:
   - Carregamento dos avisos, curtidas, comentários e salvos (Supabase).
   - Desenho do feed (cartões), filtro "Todos / Salvos" e busca.
   - Janela de publicar/editar aviso com anexos.
   - Visualizador de fotos em tela cheia.
   - Tempo real: curtidas, comentários e novos avisos aparecem sozinhos.
   - Contador de avisos novos no menu lateral.

   Com quem conversa:
   - ui.js: navigate('avisos') chama abrirAvisos(); usa esc, toast,
     openModal, closeModal, fmtRelTime e fmtDate.
   - auth.js: currentUser, currentProfile e hasAdminAccess().
   - chamados.js: reaproveita VIDEO_EXTENSIONS, DOC_TYPES, getDocExt e
     safeDocName (regras de anexos iguais às dos chamados).
   - app.js: initDb() chama loadAvisos() e subscribeAvisos().
   - Banco: tabelas avisos, aviso_curtidas, aviso_salvos e
     aviso_comentarios e o bucket avisos-midia (supabase-avisos-setup.sql).
   ═══════════════════════════════════════════ */

// ── Configuração ──
const AVISOS_BUCKET = 'avisos-midia';
// Tipos de imagem aceitos e a extensão usada para salvar no Storage.
const AVISO_IMG_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const AVISO_MAX_IMAGENS = 10;
const AVISO_MAX_IMG_SIZE = 5 * 1024 * 1024;   // 5 MB por foto
// Vídeo e documentos seguem os limites dos chamados (chamados.js):
// 1 vídeo de até 50 MB (MAX_VIDEO_SIZE) e até 5 documentos de 10 MB (MAX_DOCS, MAX_DOC_SIZE).
// Quantos comentários aparecem antes do "Ver todos".
const AVISO_COMENTARIOS_VISIVEIS = 3;

// ── Estado em memória ──
let allAvisos = [];                 // avisos carregados (fixados primeiro, depois mais recentes)
let avisoCurtidas = new Map();      // id do aviso → Set com ids de quem curtiu
let avisoComentarios = new Map();   // id do aviso → lista de comentários (mais antigos primeiro)
let avisosSalvos = new Set();       // ids dos avisos que a pessoa logada salvou
let avisosFiltro = 'todos';         // 'todos' ou 'salvos'
let avisosComentariosAbertos = new Set(); // avisos com "Ver todos os comentários" aberto
let avisosCarregados = false;
let avisosLoadPromise = null;       // evita buscar duas vezes ao mesmo tempo
let avisosChannel = null;
let avisosReloadTimer = null;
// Links temporários (assinados) das fotos e vídeos: caminho → { url, expira }
const avisoUrlCache = new Map();

// ── Permissões (apenas para mostrar ou esconder botões; o banco é quem protege) ──
// Para liberar a publicação a todos os usuários, troque por "return true"
// e ajuste public.pode_publicar_aviso() no supabase-avisos-setup.sql.
function podePublicarAviso() { return hasAdminAccess(); }
function podeEditarAviso(a)  { return !!currentUser && a.autor_id === currentUser.id; }
function podeExcluirAviso(a) { return podeEditarAviso(a) || hasAdminAccess(); }

// ─────────────────────────────────────────
// Carregamento
// ─────────────────────────────────────────

// loadAvisos: busca avisos, curtidas, comentários e salvos e redesenha o feed.
// - Chamada por: initDb (app.js) em segundo plano, abrirAvisos e o tempo real.
// - silencioso: true = não mostra toast de erro (carga em segundo plano no login).
function loadAvisos({ silencioso = false } = {}) {
  if (avisosLoadPromise) return avisosLoadPromise;
  avisosLoadPromise = (async () => {
    try {
      const { data: avisos, error } = await supa
        .from('avisos')
        .select('*')
        .order('fixado', { ascending: false })
        .order('criado_em', { ascending: false })
        .limit(200);
      if (error) throw error;

      const ids = (avisos || []).map(a => a.id);
      // As três buscas abaixo não dependem uma da outra: rodam juntas.
      const [curt, coms, salv] = ids.length
        ? await Promise.all([
            supa.from('aviso_curtidas').select('aviso_id,user_id').in('aviso_id', ids),
            supa.from('aviso_comentarios').select('*').in('aviso_id', ids).order('criado_em', { ascending: true }),
            supa.from('aviso_salvos').select('aviso_id').eq('user_id', currentUser?.id || ''),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];
      const errSec = curt.error || coms.error || salv.error;
      if (errSec) throw errSec;

      allAvisos = avisos || [];
      avisoCurtidas = new Map();
      (curt.data || []).forEach(c => {
        if (!avisoCurtidas.has(c.aviso_id)) avisoCurtidas.set(c.aviso_id, new Set());
        avisoCurtidas.get(c.aviso_id).add(c.user_id);
      });
      avisoComentarios = new Map();
      (coms.data || []).forEach(c => {
        if (!avisoComentarios.has(c.aviso_id)) avisoComentarios.set(c.aviso_id, []);
        avisoComentarios.get(c.aviso_id).push(c);
      });
      avisosSalvos = new Set((salv.data || []).map(s => s.aviso_id));

      // Links das fotos e vídeos antes de desenhar, para o feed já abrir com eles
      await prepararUrlsAvisos(allAvisos);
      avisosCarregados = true;
      renderAvisos();
      atualizarBadgeAvisos();
    } catch (e) {
      console.error('loadAvisos:', e);
      const feed = document.getElementById('avisos-feed');
      if (feed && !avisosCarregados) {
        feed.innerHTML = `<div class="card empty-state"><p>Não foi possível carregar os avisos.</p>
          <p style="font-size:12px">Verifique se o script <strong>supabase-avisos-setup.sql</strong> foi executado no Supabase.</p></div>`;
      }
      if (!silencioso) toast('Erro ao carregar avisos: ' + (e.message || e), 'err');
    } finally {
      avisosLoadPromise = null;
    }
  })();
  return avisosLoadPromise;
}

// prepararUrlsAvisos: gera (em uma única chamada) os links temporários das
// fotos e vídeos que ainda não estão no cache ou que vão expirar logo.
async function prepararUrlsAvisos(avisos) {
  const agora = Date.now();
  const paths = [];
  avisos.forEach(a => (a.midia || []).forEach(m => {
    if (m.tipo === 'documento') return; // documentos geram link só ao baixar
    const c = avisoUrlCache.get(m.path);
    if (!c || c.expira - agora < 10 * 60 * 1000) paths.push(m.path);
  }));
  if (!paths.length) return;
  const { data, error } = await supa.storage.from(AVISOS_BUCKET).createSignedUrls(paths, 3600);
  if (error) { console.error('prepararUrlsAvisos:', error); return; }
  (data || []).forEach(d => {
    if (d.signedUrl) avisoUrlCache.set(d.path, { url: d.signedUrl, expira: agora + 3600 * 1000 });
  });
}
const avisoUrl = path => avisoUrlCache.get(path)?.url || '';

// abrirAvisos: chamada por navigate('avisos') (ui.js) ao abrir a tela.
function abrirAvisos() {
  atualizarComposerAvisos();
  if (avisosCarregados) {
    renderAvisos();
    // Links de mídia vencem em 1 hora: renova em segundo plano se for preciso
    prepararUrlsAvisos(allAvisos);
  } else {
    const feed = document.getElementById('avisos-feed');
    if (feed && !avisosLoadPromise) feed.innerHTML = '<div style="padding:40px"><div class="spinner" style="margin:0 auto"></div></div>';
    loadAvisos();
  }
  marcarAvisosVistos();
}

// ─────────────────────────────────────────
// Contador de avisos novos (bolinha no menu)
// ─────────────────────────────────────────
const avisosVistoKey = () => 'avisos-visto:' + (currentUser?.id || '');
function lerAvisosVisto() {
  try { return localStorage.getItem(avisosVistoKey()); } catch (e) { return null; }
}
const avisosNaTela = () => !!document.getElementById('page-avisos')?.classList.contains('active');
function marcarAvisosVistos() {
  try { localStorage.setItem(avisosVistoKey(), new Date().toISOString()); } catch (e) {}
  atualizarBadgeAvisos();
}
function atualizarBadgeAvisos() {
  const badge = document.getElementById('badge-avisos');
  if (!badge) return;
  // Na primeira visita, conta os avisos dos últimos 7 dias
  // Com a tela de avisos aberta, tudo o que aparece já conta como visto
  if (avisosNaTela()) {
    try { localStorage.setItem(avisosVistoKey(), new Date().toISOString()); } catch (e) {}
    badge.style.display = 'none';
    return;
  }
  const visto = lerAvisosVisto() || new Date(Date.now() - 7 * 864e5).toISOString();
  const novos = allAvisos.filter(a => a.criado_em > visto && a.autor_id !== currentUser?.id).length;
  badge.textContent = novos > 99 ? '99+' : novos;
  badge.style.display = novos ? '' : 'none';
}

// ─────────────────────────────────────────
// Desenho do feed
// ─────────────────────────────────────────

// Mostra a caixa "Escreva um aviso…" só para quem pode publicar.
function atualizarComposerAvisos() {
  const comp = document.getElementById('avisos-composer');
  if (comp) comp.style.display = podePublicarAviso() ? '' : 'none';
  const av = document.getElementById('avisos-composer-avatar');
  if (av) avisoAvatarEl(av, currentProfile?.display_name);
}

// Troca o filtro "Todos" / "Salvos" (botões no topo da tela).
function setAvisosFiltro(filtro) {
  avisosFiltro = filtro;
  document.querySelectorAll('[data-avisos-filtro]').forEach(b =>
    b.classList.toggle('active', b.dataset.avisosFiltro === filtro));
  renderAvisos();
}

function avisosFiltrados() {
  const busca = (document.getElementById('avisos-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  return allAvisos.filter(a => {
    if (avisosFiltro === 'salvos' && !avisosSalvos.has(a.id)) return false;
    if (!busca) return true;
    return [a.titulo, a.texto, a.autor_nome].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(busca));
  });
}

// renderAvisos: redesenha todos os cartões do feed.
// O que a pessoa estava digitando nos comentários é preservado.
function renderAvisos() {
  const feed = document.getElementById('avisos-feed');
  if (!feed || !avisosCarregados) return;
  atualizarComposerAvisos();

  const rascunhos = {};
  feed.querySelectorAll('input[data-comentario]').forEach(i => { if (i.value) rascunhos[i.dataset.comentario] = i.value; });

  const lista = avisosFiltrados();
  if (!lista.length) {
    const msg = avisosFiltro === 'salvos'
      ? 'Você ainda não salvou nenhum aviso. Use o botão <strong>Salvar</strong> para guardar os avisos importantes aqui.'
      : allAvisos.length ? 'Nenhum aviso encontrado para esta busca.' : 'Nenhum aviso publicado ainda.';
    feed.innerHTML = `<div class="card empty-state">
      <svg viewBox="0 0 16 16" width="40" height="40" fill="currentColor"><path d="M12 2v1.2L4 5H2v5h2l.6.13L5.5 14h2l-.8-3.4L12 11.8V13h1V2h-1zm0 2.22v6.56L5 9.2V5.8l7-1.58z"/></svg>
      <p>${msg}</p></div>`;
  } else {
    feed.innerHTML = lista.map(avisoCardHtml).join('');
  }

  Object.entries(rascunhos).forEach(([id, v]) => {
    const i = feed.querySelector(`input[data-comentario="${id}"]`);
    if (i) i.value = v;
  });
  irParaAvisoDoLink();
}

// Abre o aviso indicado no endereço (#aviso-<id>), vindo de um link compartilhado.
function irParaAvisoDoLink() {
  const m = location.hash.match(/^#aviso-([0-9a-f-]{36})$/i);
  if (!m || !avisosNaTela()) return;
  const el = document.getElementById('aviso-' + m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (!el) { toast('Este aviso não existe mais.', 'info'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('aviso-destaque');
  setTimeout(() => el.classList.remove('aviso-destaque'), 2500);
}

// Cor do avatar a partir do nome (sempre a mesma cor para a mesma pessoa).
function avisoCorNome(nome = '') {
  let h = 0;
  for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}
function avisoAvatarHtml(nome, cls = '') {
  const ini = esc((String(nome || '?').trim().charAt(0) || '?').toUpperCase());
  return `<span class="aviso-avatar ${cls}" style="background:${avisoCorNome(nome)}" aria-hidden="true">${ini}</span>`;
}
function avisoAvatarEl(el, nome) {
  el.textContent = (String(nome || '?').trim().charAt(0) || '?').toUpperCase();
  el.style.background = avisoCorNome(nome);
}

// Texto do aviso/comentário: protegido (esc) e com links clicáveis.
// As quebras de linha são mantidas pelo CSS (white-space: pre-wrap).
function avisoTextoHtml(t) {
  return esc(t).replace(/https?:\/\/[^\s<]+/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

const avisoTs = iso => (iso ? new Date(iso).getTime() : null);

function avisoCardHtml(a) {
  const midia = a.midia || [];
  const imagens = midia.filter(m => m.tipo === 'imagem');
  const video = midia.find(m => m.tipo === 'video');
  const docs = midia.filter(m => m.tipo === 'documento');

  // Menu "⋯" com as ações de quem tem permissão
  const acoes = [];
  if (podeEditarAviso(a)) acoes.push(`<button type="button" onclick="editarAviso('${a.id}')">✏️ Editar</button>`);
  if (hasAdminAccess()) acoes.push(`<button type="button" onclick="fixarAviso('${a.id}')">📌 ${a.fixado ? 'Desafixar' : 'Fixar no topo'}</button>`);
  if (podeExcluirAviso(a)) acoes.push(`<button type="button" class="danger" onclick="excluirAviso('${a.id}')">🗑️ Excluir</button>`);
  const menu = acoes.length ? `
    <details class="aviso-menu">
      <summary aria-label="Opções do aviso" title="Opções">⋯</summary>
      <div class="aviso-menu-list">${acoes.join('')}</div>
    </details>` : '';

  // Fotos: até 4 na grade; a quarta mostra "+N" se houver mais
  let fotosHtml = '';
  if (imagens.length) {
    const vis = imagens.slice(0, 4);
    fotosHtml = `<div class="aviso-fotos n${vis.length}">` + vis.map((m, i) => {
      const extra = i === 3 && imagens.length > 4 ? `<span class="aviso-fotos-mais">+${imagens.length - 4}</span>` : '';
      return `<button type="button" class="aviso-foto" onclick="abrirFotoAviso('${a.id}',${i})" aria-label="Ampliar foto ${i + 1}">
        <img src="${esc(avisoUrl(m.path))}" alt="" loading="lazy">${extra}</button>`;
    }).join('') + '</div>';
  }
  const videoHtml = video
    ? `<video class="aviso-video" src="${esc(avisoUrl(video.path))}" controls preload="metadata" playsinline></video>` : '';
  const docsHtml = docs.length ? `<div class="aviso-docs">` + docs.map((d, i) => `
      <button type="button" class="aviso-doc" onclick="baixarDocAviso('${a.id}',${i})">
        <span class="aviso-doc-ext">${esc(getDocExt(d.nome).toUpperCase() || 'DOC')}</span>
        <span class="aviso-doc-nome">${esc(d.nome)}</span>
        <span class="aviso-doc-baixar" aria-hidden="true">⬇</span>
      </button>`).join('') + '</div>' : '';

  return `
  <article class="card aviso-card${a.fixado ? ' fixado' : ''}" id="aviso-${a.id}">
    <header class="aviso-head">
      ${avisoAvatarHtml(a.autor_nome)}
      <div class="aviso-autor">
        <strong>${esc(a.autor_nome || 'Usuário')}</strong>
        <span title="${esc(fmtDate(avisoTs(a.criado_em)))}">${fmtRelTime(avisoTs(a.criado_em))}${a.editado_em ? ' · editado' : ''}</span>
      </div>
      ${a.fixado ? '<span class="badge badge-andamento aviso-fixado">📌 Fixado</span>' : ''}
      ${menu}
    </header>
    ${a.titulo ? `<h3 class="aviso-titulo">${esc(a.titulo)}</h3>` : ''}
    ${a.texto ? `<div class="aviso-texto">${avisoTextoHtml(a.texto)}</div>` : ''}
    ${fotosHtml}${videoHtml}${docsHtml}
    <div class="aviso-social" data-social="${a.id}">${avisoSocialHtml(a)}</div>
    <form class="aviso-comentar" onsubmit="comentarAviso(event,'${a.id}')">
      ${avisoAvatarHtml(currentProfile?.display_name, 'sm')}
      <input type="text" data-comentario="${a.id}" maxlength="1000" placeholder="Escreva um comentário…" aria-label="Escreva um comentário" autocomplete="off">
      <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
    </form>
  </article>`;
}

// Parte "social" do cartão: contadores, botões e comentários.
// É redesenhada sozinha quando alguém curte ou comenta (updateAvisoSocial).
function avisoSocialHtml(a) {
  const curtidas = avisoCurtidas.get(a.id) || new Set();
  const comentarios = avisoComentarios.get(a.id) || [];
  const curti = curtidas.has(currentUser?.id);
  const salvo = avisosSalvos.has(a.id);

  let textoCurtidas = '';
  if (curtidas.size) {
    textoCurtidas = curti
      ? (curtidas.size === 1 ? 'Você curtiu' : `Você e mais ${curtidas.size - 1} ${curtidas.size === 2 ? 'pessoa' : 'pessoas'}`)
      : `${curtidas.size} ${curtidas.size === 1 ? 'curtida' : 'curtidas'}`;
  }
  const contadores = (curtidas.size || comentarios.length) ? `
    <div class="aviso-contadores">
      <span>${curtidas.size ? `<span class="aviso-coracao">❤</span> ${textoCurtidas}` : ''}</span>
      <span>${comentarios.length ? `${comentarios.length} ${comentarios.length === 1 ? 'comentário' : 'comentários'}` : ''}</span>
    </div>` : '';

  const abertos = avisosComentariosAbertos.has(a.id);
  const visiveis = abertos ? comentarios : comentarios.slice(-AVISO_COMENTARIOS_VISIVEIS);
  const verTodos = comentarios.length > AVISO_COMENTARIOS_VISIVEIS
    ? `<button type="button" class="aviso-ver-todos" onclick="toggleTodosComentarios('${a.id}')">${abertos ? 'Mostrar menos' : `Ver todos os ${comentarios.length} comentários`}</button>` : '';
  const comentariosHtml = visiveis.map(c => `
    <div class="aviso-comentario">
      ${avisoAvatarHtml(c.autor_nome, 'sm')}
      <div class="aviso-comentario-corpo">
        <div class="aviso-comentario-bolha">
          <strong>${esc(c.autor_nome || 'Usuário')}</strong>
          <span>${avisoTextoHtml(c.texto)}</span>
        </div>
        <div class="aviso-comentario-meta">
          <span title="${esc(fmtDate(avisoTs(c.criado_em)))}">${fmtRelTime(avisoTs(c.criado_em))}</span>
          ${(c.user_id === currentUser?.id || hasAdminAccess()) ? `<button type="button" onclick="excluirComentarioAviso('${c.id}','${a.id}')">Excluir</button>` : ''}
        </div>
      </div>
    </div>`).join('');

  return `${contadores}
    <div class="aviso-acoes">
      <button type="button" class="aviso-acao${curti ? ' ativo curtir' : ''}" onclick="toggleCurtidaAviso('${a.id}')" aria-pressed="${curti}">
        <span aria-hidden="true">${curti ? '❤' : '♡'}</span> Curtir
      </button>
      <button type="button" class="aviso-acao" onclick="focarComentarioAviso('${a.id}')">
        <span aria-hidden="true">💬</span> Comentar
      </button>
      <button type="button" class="aviso-acao" onclick="compartilharAviso('${a.id}')">
        <span aria-hidden="true">↗</span> Compartilhar
      </button>
      <button type="button" class="aviso-acao${salvo ? ' ativo salvar' : ''}" onclick="toggleSalvarAviso('${a.id}')" aria-pressed="${salvo}">
        <span aria-hidden="true">${salvo ? '★' : '☆'}</span> ${salvo ? 'Salvo' : 'Salvar'}
      </button>
    </div>
    ${(verTodos || comentariosHtml) ? `<div class="aviso-comentarios">${verTodos}${comentariosHtml}</div>` : ''}`;
}

function updateAvisoSocial(id) {
  const a = allAvisos.find(x => x.id === id);
  const el = document.querySelector(`[data-social="${id}"]`);
  if (a && el) el.innerHTML = avisoSocialHtml(a);
}

// ─────────────────────────────────────────
// Interações: curtir, comentar, compartilhar, salvar
// ─────────────────────────────────────────

// Curtir/descurtir. A tela muda na hora e volta atrás se o banco recusar.
async function toggleCurtidaAviso(id) {
  if (!currentUser) return;
  if (!avisoCurtidas.has(id)) avisoCurtidas.set(id, new Set());
  const set = avisoCurtidas.get(id);
  const curtir = !set.has(currentUser.id);
  curtir ? set.add(currentUser.id) : set.delete(currentUser.id);
  updateAvisoSocial(id);

  const { error } = curtir
    ? await supa.from('aviso_curtidas').insert({ aviso_id: id, user_id: currentUser.id })
    : await supa.from('aviso_curtidas').delete().eq('aviso_id', id).eq('user_id', currentUser.id);
  // 23505 = já estava curtido (ex.: clique em outra aba): não é erro
  if (error && error.code !== '23505') {
    curtir ? set.delete(currentUser.id) : set.add(currentUser.id);
    updateAvisoSocial(id);
    toast('Não foi possível registrar a curtida: ' + error.message, 'err');
  }
}

// Salvar/remover dos salvos (lista particular de cada pessoa).
async function toggleSalvarAviso(id) {
  if (!currentUser) return;
  const salvar = !avisosSalvos.has(id);
  salvar ? avisosSalvos.add(id) : avisosSalvos.delete(id);
  updateAvisoSocial(id);

  const { error } = salvar
    ? await supa.from('aviso_salvos').insert({ aviso_id: id, user_id: currentUser.id })
    : await supa.from('aviso_salvos').delete().eq('aviso_id', id).eq('user_id', currentUser.id);
  if (error && error.code !== '23505') {
    salvar ? avisosSalvos.delete(id) : avisosSalvos.add(id);
    updateAvisoSocial(id);
    toast('Não foi possível salvar: ' + error.message, 'err');
    return;
  }
  toast(salvar ? 'Aviso salvo! Veja em "Salvos".' : 'Removido dos salvos.', 'info');
  if (avisosFiltro === 'salvos' && !salvar) renderAvisos();
}

function focarComentarioAviso(id) {
  document.querySelector(`input[data-comentario="${id}"]`)?.focus();
}

function toggleTodosComentarios(id) {
  avisosComentariosAbertos.has(id) ? avisosComentariosAbertos.delete(id) : avisosComentariosAbertos.add(id);
  updateAvisoSocial(id);
}

// Envia um comentário. O nome do autor é preenchido pelo banco.
async function comentarAviso(ev, id) {
  ev.preventDefault();
  const input = ev.target.querySelector('input');
  const btn = ev.target.querySelector('button');
  const texto = input.value.trim();
  if (!texto) return;
  btn.disabled = true;
  try {
    const { data, error } = await supa
      .from('aviso_comentarios')
      .insert({ aviso_id: id, texto })
      .select()
      .single();
    if (error) throw error;
    adicionarComentarioLocal(data);
    input.value = '';
  } catch (e) {
    console.error('comentarAviso:', e);
    toast('Erro ao comentar: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

// Coloca o comentário na memória (sem repetir, pois o tempo real também o entrega).
function adicionarComentarioLocal(c) {
  if (!c?.aviso_id) return;
  if (!avisoComentarios.has(c.aviso_id)) avisoComentarios.set(c.aviso_id, []);
  const lista = avisoComentarios.get(c.aviso_id);
  if (lista.some(x => x.id === c.id)) return;
  lista.push(c);
  updateAvisoSocial(c.aviso_id);
}

function removerComentarioLocal(comentarioId) {
  for (const [avisoId, lista] of avisoComentarios) {
    const i = lista.findIndex(c => c.id === comentarioId);
    if (i >= 0) { lista.splice(i, 1); updateAvisoSocial(avisoId); return; }
  }
}

async function excluirComentarioAviso(comentarioId, avisoId) {
  if (!confirm('Excluir este comentário?')) return;
  const { error } = await supa.from('aviso_comentarios').delete().eq('id', comentarioId);
  if (error) { toast('Erro ao excluir comentário: ' + error.message, 'err'); return; }
  removerComentarioLocal(comentarioId);
}

// Compartilhar: no celular abre o menu de compartilhamento do aparelho
// (WhatsApp, e-mail…); no computador copia o link do aviso.
async function compartilharAviso(id) {
  const a = allAvisos.find(x => x.id === id);
  if (!a) return;
  const url = `${location.origin}${location.pathname}#aviso-${id}`;
  const resumo = a.titulo || String(a.texto || '').slice(0, 120) || 'Aviso';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Aviso – Suporte Mega', text: resumo, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // a pessoa fechou o menu
    }
  }
  try {
    await navigator.clipboard.writeText(`${resumo}\n${url}`);
    toast('Link do aviso copiado! Cole onde quiser compartilhar.', 'ok');
  } catch (e) {
    prompt('Copie o link do aviso:', url);
  }
}

// Documentos: o link de download é gerado na hora do clique.
async function baixarDocAviso(avisoId, idx) {
  const a = allAvisos.find(x => x.id === avisoId);
  const d = (a?.midia || []).filter(m => m.tipo === 'documento')[idx];
  if (!d) return;
  const { data, error } = await supa.storage.from(AVISOS_BUCKET).createSignedUrl(d.path, 600, { download: d.nome });
  if (error) { toast('Erro ao baixar documento: ' + error.message, 'err'); return; }
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// ─────────────────────────────────────────
// Visualizador de fotos (tela cheia)
// ─────────────────────────────────────────
let avisoFotoLista = [];
let avisoFotoIdx = 0;

function abrirFotoAviso(avisoId, idx) {
  const a = allAvisos.find(x => x.id === avisoId);
  avisoFotoLista = (a?.midia || []).filter(m => m.tipo === 'imagem').map(m => avisoUrl(m.path));
  if (!avisoFotoLista.length) return;
  avisoFotoIdx = idx;
  mostrarFotoAviso();
  openModal('modal-aviso-foto');
}
function mostrarFotoAviso() {
  const total = avisoFotoLista.length;
  avisoFotoIdx = (avisoFotoIdx + total) % total;
  document.getElementById('aviso-foto-img').src = avisoFotoLista[avisoFotoIdx];
  setText('aviso-foto-contador', total > 1 ? `${avisoFotoIdx + 1} / ${total}` : '');
  document.querySelectorAll('.aviso-foto-nav').forEach(b => { b.style.display = total > 1 ? '' : 'none'; });
}
function passarFotoAviso(delta) { avisoFotoIdx += delta; mostrarFotoAviso(); }

document.addEventListener('keydown', ev => {
  if (!document.getElementById('modal-aviso-foto')?.classList.contains('open')) return;
  if (ev.key === 'ArrowLeft')  passarFotoAviso(-1);
  if (ev.key === 'ArrowRight') passarFotoAviso(1);
});

// Link de aviso aberto com o sistema já aberto (o endereço muda só depois do "#").
window.addEventListener('hashchange', () => {
  if (!/^#aviso-/.test(location.hash) || !currentUser) return;
  if (avisosNaTela()) irParaAvisoDoLink();
  else navigate('avisos');
});

// Fecha o menu "⋯" ao clicar fora dele.
document.addEventListener('click', ev => {
  document.querySelectorAll('.aviso-menu[open]').forEach(d => { if (!d.contains(ev.target)) d.open = false; });
});

// ─────────────────────────────────────────
// Publicar / editar aviso
// ─────────────────────────────────────────
let avisoEditId = null;
let avisoMidiaExistente = [];   // anexos já salvos que continuam no aviso
let avisoMidiaRemovida = [];    // anexos já salvos que a pessoa removeu (apagados ao salvar)
let avisoNovasImagens = [];     // File[]
let avisoNovoVideo = null;      // File | null
let avisoNovosDocs = [];        // File[]
let avisoPreviewUrls = [];      // prévias locais (liberadas ao fechar)

function limparFormAviso() {
  document.getElementById('form-aviso').reset();
  avisoPreviewUrls.forEach(u => URL.revokeObjectURL(u));
  avisoPreviewUrls = [];
  avisoMidiaExistente = [];
  avisoMidiaRemovida = [];
  avisoNovasImagens = [];
  avisoNovoVideo = null;
  avisoNovosDocs = [];
}

// openNovoAviso: abre a janela vazia (caixa "Escreva um aviso…" ou atalhos Foto/Vídeo/Documento).
// tipo opcional: 'imagem' | 'video' | 'documento' abre logo a escolha de arquivo.
function openNovoAviso(tipo) {
  if (!podePublicarAviso()) { toast('Somente administradores publicam avisos.', 'err'); return; }
  limparFormAviso();
  avisoEditId = null;
  document.getElementById('aviso-modal-title').textContent = 'Publicar aviso';
  document.getElementById('btn-save-aviso').textContent = 'Publicar';
  document.getElementById('aviso-fixar-field').style.display = hasAdminAccess() ? '' : 'none';
  renderAvisoFormMidia();
  openModal('modal-aviso');
  if (tipo) escolherArquivoAviso(tipo);
  else setTimeout(() => document.getElementById('aviso-form-texto').focus(), 50);
}

function editarAviso(id) {
  const a = allAvisos.find(x => x.id === id);
  if (!a || !podeEditarAviso(a)) return;
  limparFormAviso();
  avisoEditId = id;
  avisoMidiaExistente = [...(a.midia || [])];
  document.getElementById('aviso-modal-title').textContent = 'Editar aviso';
  document.getElementById('btn-save-aviso').textContent = 'Salvar alterações';
  document.getElementById('aviso-form-titulo').value = a.titulo || '';
  document.getElementById('aviso-form-texto').value = a.texto || '';
  document.getElementById('aviso-form-fixado').checked = !!a.fixado;
  document.getElementById('aviso-fixar-field').style.display = hasAdminAccess() ? '' : 'none';
  renderAvisoFormMidia();
  openModal('modal-aviso');
}

function escolherArquivoAviso(tipo) {
  document.getElementById({ imagem: 'aviso-input-imagem', video: 'aviso-input-video', documento: 'aviso-input-documento' }[tipo]).click();
}

// Recebe os arquivos escolhidos, confere tipo/tamanho/quantidade e mostra a prévia.
function addArquivosAviso(input, tipo) {
  const files = [...input.files];
  input.value = ''; // permite escolher o mesmo arquivo de novo
  const qtdExist = t => avisoMidiaExistente.filter(m => m.tipo === t).length;

  for (const f of files) {
    if (tipo === 'imagem') {
      if (!AVISO_IMG_EXT[f.type]) { toast(`"${f.name}": use foto JPG, PNG, GIF ou WebP.`, 'err'); continue; }
      if (f.size > AVISO_MAX_IMG_SIZE) { toast(`"${f.name}" passa de 5 MB.`, 'err'); continue; }
      if (qtdExist('imagem') + avisoNovasImagens.length >= AVISO_MAX_IMAGENS) { toast(`No máximo ${AVISO_MAX_IMAGENS} fotos por aviso.`, 'err'); break; }
      avisoNovasImagens.push(f);
    } else if (tipo === 'video') {
      if (!VIDEO_EXTENSIONS[f.type]) { toast('Use vídeo MP4, WebM ou MOV.', 'err'); continue; }
      if (f.size > MAX_VIDEO_SIZE) { toast('O vídeo passa de 50 MB.', 'err'); continue; }
      // Um vídeo por aviso: o novo substitui o anterior
      avisoMidiaExistente.filter(m => m.tipo === 'video').forEach(m => avisoMidiaRemovida.push(m));
      avisoMidiaExistente = avisoMidiaExistente.filter(m => m.tipo !== 'video');
      avisoNovoVideo = f;
    } else {
      if (!DOC_TYPES[getDocExt(f.name)]) { toast(`"${f.name}": use PDF, Word, Excel, TXT ou CSV.`, 'err'); continue; }
      if (f.size > MAX_DOC_SIZE) { toast(`"${f.name}" passa de 10 MB.`, 'err'); continue; }
      if (qtdExist('documento') + avisoNovosDocs.length >= MAX_DOCS) { toast(`No máximo ${MAX_DOCS} documentos por aviso.`, 'err'); break; }
      avisoNovosDocs.push(f);
    }
  }
  renderAvisoFormMidia();
}

// Remove um anexo da prévia. origem: 'exist' (já salvo) ou 'img'/'video'/'doc' (novo).
function removerArquivoAviso(origem, idx) {
  if (origem === 'exist') avisoMidiaRemovida.push(...avisoMidiaExistente.splice(idx, 1));
  if (origem === 'img') avisoNovasImagens.splice(idx, 1);
  if (origem === 'video') avisoNovoVideo = null;
  if (origem === 'doc') avisoNovosDocs.splice(idx, 1);
  renderAvisoFormMidia();
}

// Prévia dos anexos dentro da janela de publicar.
function renderAvisoFormMidia() {
  avisoPreviewUrls.forEach(u => URL.revokeObjectURL(u));
  avisoPreviewUrls = [];
  const local = f => { const u = URL.createObjectURL(f); avisoPreviewUrls.push(u); return u; };
  const chip = (thumb, nome, origem, idx) => `
    <div class="aviso-anexo">
      ${thumb}
      <span class="aviso-anexo-nome" title="${esc(nome)}">${esc(nome)}</span>
      <button type="button" onclick="removerArquivoAviso('${origem}',${idx})" aria-label="Remover ${esc(nome)}">✕</button>
    </div>`;
  const icone = txt => `<span class="aviso-anexo-icone">${esc(txt)}</span>`;

  const html = [
    ...avisoMidiaExistente.map((m, i) => chip(
      m.tipo === 'imagem' ? `<img src="${esc(avisoUrl(m.path))}" alt="">` : icone(m.tipo === 'video' ? '▶' : getDocExt(m.nome).toUpperCase()),
      m.nome || (m.tipo === 'imagem' ? 'Foto' : 'Vídeo'), 'exist', i)),
    ...avisoNovasImagens.map((f, i) => chip(`<img src="${local(f)}" alt="">`, f.name, 'img', i)),
    ...(avisoNovoVideo ? [chip(icone('▶'), avisoNovoVideo.name, 'video', 0)] : []),
    ...avisoNovosDocs.map((f, i) => chip(icone(getDocExt(f.name).toUpperCase()), f.name, 'doc', i)),
  ].join('');

  const box = document.getElementById('aviso-form-midia');
  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}

// Envia um arquivo para a pasta da pessoa no bucket e devolve o caminho.
async function enviarArquivoAviso(file, ext, contentType) {
  const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supa.storage.from(AVISOS_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

// submitAviso: envia os arquivos novos, grava o aviso e apaga os anexos removidos.
async function submitAviso(ev) {
  ev.preventDefault();
  const btn = document.getElementById('btn-save-aviso');
  const titulo = document.getElementById('aviso-form-titulo').value.trim();
  const texto = document.getElementById('aviso-form-texto').value.trim();
  const fixado = document.getElementById('aviso-form-fixado').checked;
  const temMidia = avisoMidiaExistente.length || avisoNovasImagens.length || avisoNovoVideo || avisoNovosDocs.length;
  if (!titulo && !texto && !temMidia) { toast('Escreva algo ou anexe um arquivo.', 'err'); return; }
  if (!currentUser?.id) { toast('Faça login novamente.', 'err'); return; }

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  const enviados = []; // caminhos enviados agora (apagados se algo falhar)
  try {
    const novaMidia = [];
    for (const [i, f] of avisoNovasImagens.entries()) {
      btn.textContent = `Enviando foto ${i + 1} de ${avisoNovasImagens.length}…`;
      const path = await enviarArquivoAviso(f, AVISO_IMG_EXT[f.type], f.type);
      enviados.push(path);
      novaMidia.push({ tipo: 'imagem', path, nome: safeDocName(f.name) });
    }
    if (avisoNovoVideo) {
      btn.textContent = 'Enviando vídeo… (pode levar alguns instantes)';
      const f = avisoNovoVideo;
      const path = await enviarArquivoAviso(f, VIDEO_EXTENSIONS[f.type], f.type);
      enviados.push(path);
      novaMidia.push({ tipo: 'video', path, nome: safeDocName(f.name) });
    }
    for (const [i, f] of avisoNovosDocs.entries()) {
      btn.textContent = `Enviando documento ${i + 1} de ${avisoNovosDocs.length}…`;
      const ext = getDocExt(f.name);
      const path = await enviarArquivoAviso(f, ext, DOC_TYPES[ext]);
      enviados.push(path);
      novaMidia.push({ tipo: 'documento', path, nome: safeDocName(f.name) });
    }

    btn.textContent = 'Salvando…';
    // Ordem dos anexos: fotos, vídeo e documentos
    const ordem = { imagem: 0, video: 1, documento: 2 };
    const midia = [...avisoMidiaExistente, ...novaMidia].sort((x, y) => ordem[x.tipo] - ordem[y.tipo]);
    const payload = { titulo: titulo || null, texto, midia };
    if (hasAdminAccess()) payload.fixado = fixado;

    const { error } = avisoEditId
      ? await supa.from('avisos').update({ ...payload, editado_em: new Date().toISOString() }).eq('id', avisoEditId)
      : await supa.from('avisos').insert(payload);
    if (error) throw error;

    // Só depois de gravar apaga do Storage os anexos que foram removidos
    const removidos = avisoMidiaRemovida.map(m => m.path);
    if (removidos.length) {
      const { error: rmErr } = await supa.storage.from(AVISOS_BUCKET).remove(removidos);
      if (rmErr) console.warn('Anexos antigos não removidos:', rmErr);
    }

    toast(avisoEditId ? 'Aviso atualizado!' : 'Aviso publicado!', 'ok');
    closeModal('modal-aviso');
    limparFormAviso();
    await loadAvisos();
    marcarAvisosVistos();
  } catch (e) {
    console.error('submitAviso:', e);
    if (enviados.length) await supa.storage.from(AVISOS_BUCKET).remove(enviados);
    toast('Erro ao salvar aviso: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function fixarAviso(id) {
  const a = allAvisos.find(x => x.id === id);
  if (!a) return;
  const { error } = await supa.from('avisos').update({ fixado: !a.fixado }).eq('id', id);
  if (error) { toast('Erro ao fixar aviso: ' + error.message, 'err'); return; }
  toast(a.fixado ? 'Aviso desafixado.' : 'Aviso fixado no topo!', 'ok');
  await loadAvisos();
}

async function excluirAviso(id) {
  const a = allAvisos.find(x => x.id === id);
  if (!a || !confirm('Excluir este aviso? Curtidas, comentários e anexos também serão apagados.')) return;
  const { error } = await supa.from('avisos').delete().eq('id', id);
  if (error) { toast('Erro ao excluir aviso: ' + error.message, 'err'); return; }
  const paths = (a.midia || []).map(m => m.path);
  if (paths.length) {
    const { error: rmErr } = await supa.storage.from(AVISOS_BUCKET).remove(paths);
    if (rmErr) console.warn('Anexos não removidos:', rmErr);
  }
  toast('Aviso excluído.', 'ok');
  await loadAvisos();
}

// ─────────────────────────────────────────
// Tempo real
// ─────────────────────────────────────────
// Novos avisos e edições recarregam o feed (com uma pequena espera para
// juntar várias mudanças seguidas). Curtidas e comentários atualizam só
// o cartão afetado, sem atrapalhar quem está lendo ou assistindo um vídeo.
function subscribeAvisos() {
  if (avisosChannel) supa.removeChannel(avisosChannel);
  const recarregar = () => {
    clearTimeout(avisosReloadTimer);
    avisosReloadTimer = setTimeout(() => loadAvisos({ silencioso: true }), 400);
  };
  avisosChannel = supa.channel('avisos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' }, recarregar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aviso_curtidas' }, ({ eventType, new: n, old: o }) => {
      const row = eventType === 'DELETE' ? o : n;
      if (!row?.aviso_id || !row.user_id) return;
      if (!avisoCurtidas.has(row.aviso_id)) avisoCurtidas.set(row.aviso_id, new Set());
      const set = avisoCurtidas.get(row.aviso_id);
      eventType === 'DELETE' ? set.delete(row.user_id) : set.add(row.user_id);
      updateAvisoSocial(row.aviso_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aviso_comentarios' }, ({ eventType, new: n, old: o }) => {
      if (eventType === 'INSERT') adicionarComentarioLocal(n);
      if (eventType === 'DELETE' && o?.id) removerComentarioLocal(o.id);
    })
    .subscribe();
}
