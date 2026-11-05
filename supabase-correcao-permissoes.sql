-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Correção de permissões: chamados e equipamentos
--  Execute depois de supabase-acesso-setup.sql (pode ser executado mais de uma vez)
--
--  1. Chamados estavam legíveis por qualquer pessoa, sem login, pela chave
--     pública do site: havia política antiga liberando acesso a todos
--     (as políticas do Supabase somam permissões, e uma aberta anula as outras).
--  2. Equipamentos sem as permissões (GRANT) e sem atualização em tempo real.
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────
-- 1. Apaga TODAS as políticas atuais das duas tabelas
--    (inclusive as antigas e desconhecidas) e recria só as do sistema
-- ──────────────────────────────────────────
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('chamados', 'equipamentos')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

alter table public.chamados     enable row level security;
alter table public.equipamentos enable row level security;

-- Sem login, nada; logado, as políticas abaixo decidem o que cada um vê
revoke all on table public.chamados, public.equipamentos from anon;
grant select, insert, update, delete on table public.chamados, public.equipamentos to authenticated;

-- ──────────────────────────────────────────
-- 2. POLÍTICAS: chamados
-- ──────────────────────────────────────────
create policy "chamados: select own"
  on public.chamados for select to authenticated
  using (auth.uid() = user_id and public.is_authorized());

create policy "chamados: select admin"
  on public.chamados for select to authenticated
  using (public.is_admin());

-- O chamado sempre fica no nome de quem abriu
create policy "chamados: insert auth"
  on public.chamados for insert to authenticated
  with check (user_id = auth.uid() and (public.is_authorized() or public.is_admin()));

create policy "chamados: update own"
  on public.chamados for update to authenticated
  using  (auth.uid() = user_id and public.is_authorized())
  with check (auth.uid() = user_id and public.is_authorized());

create policy "chamados: update admin"
  on public.chamados for update to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

create policy "chamados: delete admin"
  on public.chamados for delete to authenticated
  using (public.is_admin());

-- ──────────────────────────────────────────
-- 3. POLÍTICAS: equipamentos (somente administradores)
-- ──────────────────────────────────────────
create policy "equip: admin all"
  on public.equipamentos for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ──────────────────────────────────────────
-- 4. Atualização em tempo real da lista de equipamentos
-- ──────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.equipamentos;
exception when duplicate_object then null;
end;
$$;

-- ──────────────────────────────────────────
-- 5. Conferência: políticas que ficaram em cada tabela
-- ──────────────────────────────────────────
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('chamados', 'equipamentos')
order by tablename, policyname;
