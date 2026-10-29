-- Aquisição de equipamentos (itens a comprar)
-- Execute depois de supabase-auth-setup.sql, que cria public.is_admin().

create table if not exists public.aquisicoes (
  id             uuid primary key default gen_random_uuid(),
  equipamento    text not null,
  quantidade     integer not null default 1 check (quantidade > 0),
  loja_setor     text,
  marca_modelo   text,
  local_compra   text,
  valor_unitario numeric(12, 2),
  finalidade     text,
  status         text not null default 'Pendente'
                 check (status in ('Pendente', 'Aprovado', 'Comprado', 'Cancelado')),
  criado_por     uuid references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

alter table public.aquisicoes enable row level security;

grant select, insert, update, delete on table public.aquisicoes to authenticated;

drop policy if exists "aquisicoes_admin_all" on public.aquisicoes;
create policy "aquisicoes_admin_all"
  on public.aquisicoes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Itens iniciais da planilha "solicitação de equipamentos TI 03.09.2026"
insert into public.aquisicoes (equipamento, quantidade, loja_setor, marca_modelo, local_compra, valor_unitario, finalidade)
select * from (values
  ('Roteador', 1, 'TI', 'Tp-link ER605', 'Mercado Livre', 390.00,
   'Internet reserva para lojas que tem dois links de internet. Quando uma internet cai o aparelho aciona a outra internet que estava de reserva.'),
  ('Monitor', 3, 'TI', null, 'Shopping China', 220.00,
   'Melhorar e agilizar os processos que necessitam de comparações de planilhas, documentos e acessos remotos.'),
  ('Notebook', 1, 'TI', 'Dell Latitude 5420', 'Shopping China', 2193.00,
   'Colaboradores novos e colaboradores que utilizam apenas o celular necessitam para visualizar documentos e arquivos diversos.'),
  ('Mouse pad', 15, 'Adm e financeiro', 'Não informado', 'Shopping China', 13.00,
   'Agiliza e melhora a movimentação no computador e evita desgaste precoce do mouse.'),
  ('Cabeçote Argox', 1, 'CD', 'Argox', 'Mercado Livre', 372.00,
   'Manutenção corretiva em máquinas que não estão funcionando; será usado para teste ou para substituir máquinas com a peça quebrada.'),
  ('Cabo P2', 1, 'Loja 16', 'Não informado – 8 metros', 'Mercado Livre', 70.00,
   'Melhorar a qualidade do som interno das lojas.'),
  ('Cabo de ethernet Cat5e', 1, 'TI', 'REMX CAT5E – 30 metros', 'Mercado Livre', 48.00,
   'Realizar cabeamento de computadores que necessitam de internet cabeada.'),
  ('Impressora térmica', 2, 'Lojas 6 e 8', 'TOMATE MDK 082 80mm', 'Mercado Livre', 255.00,
   'Lojas com impressoras danificadas por desgaste de uso, com problema físico (hardware).'),
  ('Bateria de notebook', 1, 'TI', 'Dell Inspiron 15 3511 QNG', 'Mercado Livre', 240.00,
   'Notebook com bateria ineficiente, durando em média 20 minutos fora da tomada. Necessita de uma nova.'),
  ('Estação de retrabalho', 1, 'TI', 'JMJN', 'Mercado Livre', 270.00,
   'Remoção de componentes eletrônicos como chips e capacitores. Serve para manutenção de placas eletrônicas.')
) as v(equipamento, quantidade, loja_setor, marca_modelo, local_compra, valor_unitario, finalidade)
where not exists (select 1 from public.aquisicoes);
