-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Permissões por função e anexos (fotos e vídeos)
--  Execute depois de supabase-correcao-permissoes.sql (pode ser executado mais de uma vez)
--
--  • Equipamentos e aquisições: somente super administrador
--  • Internet das lojas e tickets Data System: admin só visualiza; super administrador altera
--  • Chamados: usuário comum não altera chamado depois de aberto
--  • Anexos dos chamados: pasta de cada usuário, privada, aceita vídeo
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────
-- 1. Equipamentos (somente super administrador)
-- ──────────────────────────────────────────
drop policy if exists "equip: admin all"      on public.equipamentos;
drop policy if exists "equip: superadmin all" on public.equipamentos;
create policy "equip: superadmin all"
  on public.equipamentos for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ──────────────────────────────────────────
-- 2. Aquisições (somente super administrador)
-- ──────────────────────────────────────────
revoke all on table public.aquisicoes from anon;
drop policy if exists "aquisicoes_admin_all"      on public.aquisicoes;
drop policy if exists "aquisicoes_superadmin_all" on public.aquisicoes;
create policy "aquisicoes_superadmin_all"
  on public.aquisicoes for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ──────────────────────────────────────────
-- 3. Internet das lojas (admin lê; super administrador altera)
-- ──────────────────────────────────────────
revoke all on table public.internet_planos from anon;
drop policy if exists "internet_planos_admin_all"        on public.internet_planos;
drop policy if exists "internet_planos_admin_select"     on public.internet_planos;
drop policy if exists "internet_planos_superadmin_write" on public.internet_planos;

create policy "internet_planos_admin_select"
  on public.internet_planos for select to authenticated
  using (public.is_admin());

create policy "internet_planos_superadmin_write"
  on public.internet_planos for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ──────────────────────────────────────────
-- 3b. Tickets Data System (admin lê; super administrador altera)
-- ──────────────────────────────────────────
drop policy if exists "tickets_admin_all"        on public.tickets;
drop policy if exists "tickets_admin_select"     on public.tickets;
drop policy if exists "tickets_superadmin_write" on public.tickets;

create policy "tickets_admin_select"
  on public.tickets for select to authenticated
  using (public.is_admin());

create policy "tickets_superadmin_write"
  on public.tickets for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ──────────────────────────────────────────
-- 4. Chamados: só administradores alteram status e observações
-- ──────────────────────────────────────────
drop policy if exists "chamados: update own" on public.chamados;

-- ──────────────────────────────────────────
-- 5. Anexos dos chamados (bucket privado chamados-imagens)
--    Fotos até 2 MB e vídeos até 50 MB são conferidos no site;
--    o limite do bucket é o maior deles.
-- ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chamados-imagens', 'chamados-imagens', false, 52428800,
  array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove as políticas antigas deste bucket e recria as do sistema
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%chamados-imagens%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$$;

-- Cada usuário envia somente para a própria pasta (<id do usuário>/arquivo)
create policy "chamados-anexos: envio na própria pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chamados-imagens'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_authorized() or public.is_admin())
  );

-- O dono vê os próprios anexos; administradores veem todos
create policy "chamados-anexos: leitura"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chamados-imagens'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- O dono remove os próprios (limpeza quando o envio falha); administradores removem qualquer um
create policy "chamados-anexos: exclusão"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chamados-imagens'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ──────────────────────────────────────────
-- 6. Conferência
-- ──────────────────────────────────────────
select schemaname, tablename, policyname, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('chamados','equipamentos','aquisicoes','internet_planos','tickets'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
