/* ═══════════════════════════════════════════
   SUPORTE MEGA – Configuração global
   ═══════════════════════════════════════════ */

// ── Supabase ──
const SUPA_URL  = 'https://qdqjiikkiatrqgoyhfgv.supabase.co';
const SUPA_ANON = 'sb_publishable_-Vcn2tD1DvgBNhJdj_OaHg_34VAYct4';

// ── Dados do sistema ──
const LOJAS = [
  'Loja 01','Loja 02','Loja 03','Loja 04','Loja 05',
  'Loja 06','Loja 07','Loja 08','Loja 09','Loja 10',
  'Loja 11','Loja 12','Loja 13','Loja 14','Loja 15',
  'Loja 16','Loja 17','Loja 18',
  'Centro de Distribuição','Compras','Financeiro',
  'Recursos Humanos','Diretoria'
];

const CATEGORIAS = [
  'Hardware','Software','Rede / Internet','Impressora',
  'PDV / Caixa','Câmera / CFTV','Acesso / Senha',
  'E-mail / Comunicação','Outro'
];

const TIPOS_EQUIP = [
  'Computador Desktop','Notebook','Impressora','Monitor',
  'PDV / Caixa','Switch / Roteador','Câmera / CFTV',
  'Nobreak / UPS','Smartphone / Tablet','Outro'
];

const STATUS_CHAMADO = ['Aberto','Em Andamento','Aguardando usuário','Resolvido','Fechado','Cancelado'];
const STATUS_EQUIP   = ['Em uso','Disponível','Em manutenção','Descartado'];

const PRIO_ORDER   = { 'Urgente':0,'Alta':1,'Média':2,'Baixa':3 };
const STATUS_ORDER = { 'Aberto':0,'Em Andamento':1,'Aguardando usuário':2,'Resolvido':3,'Fechado':4,'Cancelado':5 };

// ── Títulos das páginas ──
const PAGE_TITLES = {
  dashboard:   'Dashboard',
  chamados:    'Chamados',
  novo:        'Novo Chamado',
  equipamentos:'Equipamentos',
  internet:    'Internet das Lojas',
  relatorios:  'Relatórios',
  usuarios:    'Gerenciar Usuários',
};
