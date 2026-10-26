-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Setup completo Auth + Perfis + RLS
--  Execute no SQL Editor do Supabase (uma vez)
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────
-- 1. TABELA: profiles
--    Vinculada a auth.users via UUID
-- ──────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text,
  role          text        not null default 'user' check (role in ('admin','user')),
  created_at    timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- 2. TRIGGER: cria profile automaticamente
--    quando um novo usuário se cadastra
-- ──────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────
-- 3. TABELA: chamados
--    Adiciona user_id e email_abertura
-- ──────────────────────────────────────────
alter table public.chamados
  add column if not exists user_id         uuid references auth.users (id) on delete set null,
  add column if not exists email_abertura  text;

-- Índice para filtrar por usuário
create index if not exists idx_chamados_user_id on public.chamados (user_id);

-- ──────────────────────────────────────────
-- 4. TABELA: equipamentos
--    Adiciona dados de responsável e aquisição
-- ──────────────────────────────────────────
alter table public.equipamentos
  add column if not exists responsavel        text,
  add column if not exists responsavel_email  text,
  add column if not exists data_aquisicao     date;

-- ──────────────────────────────────────────
-- 5. RLS — Habilitar nas 3 tabelas
-- ──────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.chamados      enable row level security;
alter table public.equipamentos  enable row level security;

-- ──────────────────────────────────────────
-- 6. Helper: verifica se o usuário é admin
--    (evita recursão em RLS usando security definer)
-- ──────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ──────────────────────────────────────────
-- 7. POLÍTICAS: profiles
-- ──────────────────────────────────────────
drop policy if exists "profiles: leitura própria"   on public.profiles;
drop policy if exists "profiles: leitura admin"     on public.profiles;
drop policy if exists "profiles: atualização própria" on public.profiles;
drop policy if exists "profiles: atualização admin" on public.profiles;
drop policy if exists "profiles: inserção pública"  on public.profiles;

-- Qualquer autenticado pode ler o próprio perfil
create policy "profiles: leitura própria"
  on public.profiles for select
  using (auth.uid() = id);

-- Admin lê todos os perfis
create policy "profiles: leitura admin"
  on public.profiles for select
  using (public.is_admin());

-- Usuário edita o próprio perfil (nome/apelido)
create policy "profiles: atualização própria"
  on public.profiles for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin edita qualquer perfil (para promover/rebaixar)
create policy "profiles: atualização admin"
  on public.profiles for update
  using  (public.is_admin())
  with check (public.is_admin());

-- Inserção: o próprio usuário (trigger já faz isso, mas por segurança)
create policy "profiles: inserção pública"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ──────────────────────────────────────────
-- 8. POLÍTICAS: chamados
-- ──────────────────────────────────────────
drop policy if exists "chamados: select own"   on public.chamados;
drop policy if exists "chamados: select admin" on public.chamados;
drop policy if exists "chamados: insert auth"  on public.chamados;
drop policy if exists "chamados: update own"   on public.chamados;
drop policy if exists "chamados: update admin" on public.chamados;
drop policy if exists "chamados: delete admin" on public.chamados;

-- Usuário vê somente os próprios chamados
create policy "chamados: select own"
  on public.chamados for select
  using (auth.uid() = user_id);

-- Admin vê todos
create policy "chamados: select admin"
  on public.chamados for select
  using (public.is_admin());

-- Qualquer autenticado pode abrir chamado
create policy "chamados: insert auth"
  on public.chamados for insert
  with check (auth.role() = 'authenticated');

-- Usuário pode editar o próprio chamado (enquanto Aberto)
create policy "chamados: update own"
  on public.chamados for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin pode editar qualquer chamado
create policy "chamados: update admin"
  on public.chamados for update
  using  (public.is_admin())
  with check (public.is_admin());

-- Somente admin pode excluir
create policy "chamados: delete admin"
  on public.chamados for delete
  using (public.is_admin());

-- ──────────────────────────────────────────
-- 9. POLÍTICAS: equipamentos (somente admin)
-- ──────────────────────────────────────────
drop policy if exists "equip: select admin" on public.equipamentos;
drop policy if exists "equip: insert admin" on public.equipamentos;
drop policy if exists "equip: update admin" on public.equipamentos;
drop policy if exists "equip: delete admin" on public.equipamentos;

create policy "equip: select admin"
  on public.equipamentos for select
  using (public.is_admin());

create policy "equip: insert admin"
  on public.equipamentos for insert
  with check (public.is_admin());

create policy "equip: update admin"
  on public.equipamentos for update
  using  (public.is_admin())
  with check (public.is_admin());

create policy "equip: delete admin"
  on public.equipamentos for delete
  using (public.is_admin());

-- ──────────────────────────────────────────
-- 10. Torna você (David) o primeiro admin
--     Execute APÓS fazer seu cadastro no site.
--     Substitua o e-mail se necessário.
-- ──────────────────────────────────────────
-- update public.profiles
-- set role = 'admin'
-- where email = 'borgesroberto41@gmail.com';

-- ═══════════════════════════════════════════════════════════════
--  FIM DO SCRIPT
--  Depois de rodar, descomente e execute o UPDATE acima
--  para se tornar admin na primeira vez.
-- ═══════════════════════════════════════════════════════════════
