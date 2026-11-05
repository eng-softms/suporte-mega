-- Tickets abertos no suporte da Data System (somente administradores)
-- Execute depois de supabase-acesso-setup.sql, que define public.is_admin().

create table if not exists public.tickets (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null,          -- o mesmo número pode aparecer em mais de um registro
  descricao         text,
  data_atendimento  date,
  situacao          text not null default 'Não informado'
                    check (situacao in ('Resolvido', 'Não resolvido', 'Em andamento', 'Não informado')),
  criado_por        uuid references auth.users (id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

alter table public.tickets enable row level security;

revoke all on table public.tickets from anon;
grant select, insert, update, delete on table public.tickets to authenticated;

drop policy if exists "tickets_admin_all" on public.tickets;
create policy "tickets_admin_all"
  on public.tickets
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
