-- Cadastro de planos de internet das unidades
-- Execute depois de supabase-auth-setup.sql, que cria public.is_admin().

create table if not exists public.internet_planos (
  id            uuid primary key default gen_random_uuid(),
  unidade       text not null,
  fornecedor    text not null,
  plano         text,
  titular       text,
  valor_mensal  numeric(12, 2),
  links         text,
  observacoes   text,
  uso           text,
  ip            text,
  criado_por    uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.internet_planos enable row level security;

grant select, insert, update, delete on table public.internet_planos to authenticated;

drop policy if exists "internet_planos_admin_all" on public.internet_planos;
create policy "internet_planos_admin_all"
  on public.internet_planos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
