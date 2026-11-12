/* ═══════════════════════════════════════════
   SUPORTE MEGA – Configuração global

   Para que serve este arquivo:
   - Guarda as "configurações fixas" do sistema: endereço do banco de dados
     (Supabase), lista de lojas, categorias de chamado, tipos de equipamento,
     situações (status) possíveis e os títulos de cada página.
   - Não tem funções: só constantes. Constante (const) é um valor que não
     muda enquanto o sistema está aberto.

   Com quem conversa:
   - É o PRIMEIRO script carregado no index.html. Por isso, todos os outros
     arquivos (ui.js, auth.js, chamados.js, equipamentos.js, aquisicoes.js,
     relatorios.js, app.js…) podem usar estes valores diretamente, como
     variáveis globais (visíveis em qualquer arquivo da página).
   - Para incluir uma nova loja, categoria ou tipo de equipamento, basta
     acrescentar o texto na lista correspondente abaixo.
   ═══════════════════════════════════════════ */

// ── Supabase ──
// Supabase: serviço na internet que guarda o banco de dados, faz o login
// das pessoas e avisa em tempo real quando algo muda.
// SUPA_URL: endereço do projeto no Supabase. Usado em app.js para criar a conexão.
const SUPA_URL  = 'https://qdqjiikkiatrqgoyhfgv.supabase.co';
// SUPA_ANON: chave pública ("publishable") do projeto. Ela pode ficar no
// navegador sem problema: quem protege os dados são as regras de segurança
// (políticas RLS) configuradas no próprio banco, e não esta chave.
const SUPA_ANON = 'sb_publishable_-Vcn2tD1DvgBNhJdj_OaHg_34VAYct4';

// ── Dados do sistema ──
// LOJAS: lojas e setores que podem abrir chamados. Aparece nas listas de
// seleção do formulário de novo chamado e nos filtros (chamados.js), no
// cadastro de equipamentos (equipamentos.js), nas aquisições (aquisicoes.js)
// e nos relatórios (relatorios.js).
const LOJAS = [
  'Loja 01','Loja 02','Loja 03','Loja 04','Loja 05',
  'Loja 06','Loja 07','Loja 08','Loja 09','Loja 10',
  'Loja 11','Loja 12','Loja 13','Loja 14','Loja 15',
  'Loja 16','Loja 17','Loja 18',
  'Centro de Distribuição','Compras','Financeiro',
  'Recursos Humanos','Diretoria'
];

// CATEGORIAS: tipos de problema que a pessoa escolhe ao abrir um chamado
// (lista de seleção do formulário "Novo Chamado", em chamados.js).
const CATEGORIAS = [
  'Hardware','Software','Rede / Internet','Impressora',
  'PDV / Caixa','Câmera / CFTV','Acesso / Senha',
  'E-mail / Comunicação','Outro'
];

// TIPOS_EQUIP: tipos de equipamento usados no cadastro e no filtro da
// página "Equipamentos" (equipamentos.js).
const TIPOS_EQUIP = [
  'Computador Desktop','Notebook','Impressora','Monitor',
  'PDV / Caixa','Switch / Roteador','Câmera / CFTV',
  'Nobreak / UPS','Smartphone / Tablet','Outro'
];

// STATUS_CHAMADO: situações possíveis de um chamado, na ordem do ciclo de
// vida (do aberto até o encerrado). Usado na lista de status do detalhe do
// chamado (chamados.js) e nos relatórios (relatorios.js).
const STATUS_CHAMADO = ['Aberto','Em Andamento','Aguardando usuário','Resolvido','Fechado','Cancelado'];
// STATUS_EQUIP: situações possíveis de um equipamento (em uso, parado etc.).
const STATUS_EQUIP   = ['Em uso','Disponível','Em manutenção','Descartado'];

// Ordem para ORDENAR as tabelas (chamados.js): o número menor vem primeiro.
// PRIO_ORDER: prioridades, da mais urgente (0) para a menos urgente (3).
// Também serve de lista das prioridades que o super admin pode escolher.
const PRIO_ORDER   = { 'Urgente':0,'Alta':1,'Média':2,'Baixa':3 };
// STATUS_ORDER: status, seguindo a mesma ordem do ciclo de vida acima.
const STATUS_ORDER = { 'Aberto':0,'Em Andamento':1,'Aguardando usuário':2,'Resolvido':3,'Fechado':4,'Cancelado':5 };

// ── Títulos das páginas ──
// PAGE_TITLES: texto exibido na barra do topo para cada página do sistema.
// A chave (à esquerda) é o nome interno da página; o valor (à direita) é o
// título que aparece na tela. Usado pela navegação em ui.js.
const PAGE_TITLES = {
  dashboard:   'Início',
  chamados:    'Chamados',
  novo:        'Novo Chamado',
  avisos:      'Avisos',
  equipamentos:'Equipamentos',
  internet:    'Internet das Lojas',
  aquisicoes:  'Aquisição de Equipamentos',
  tickets:     'Tickets Data System',
  relatorios:  'Relatórios',
  usuarios:    'Gerenciar Usuários',
};
