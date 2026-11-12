-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Mural de avisos (feed com fotos, vídeos e documentos)
--  Execute depois de supabase-acesso-setup.sql, que cria public.is_admin(),
--  public.is_superadmin() e public.is_authorized().
--  Pode ser executado mais de uma vez.
--
--  • avisos             publicações do mural (texto + anexos)
--  • aviso_curtidas     quem curtiu cada aviso
--  • aviso_salvos       avisos que cada pessoa salvou (só ela vê)
--  • aviso_comentarios  comentários de qualquer usuário
--  • bucket avisos-midia: fotos, vídeos e documentos dos avisos
--
--  Quem pode publicar: administradores e super administrador (função
--  public.pode_publicar_aviso). Para liberar a publicação a TODOS os
--  usuários, troque o corpo dessa função por:
--      select public.is_authorized() or public.is_admin();
--  e, no site, a função podePublicarAviso() em js/avisos.js.
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────
-- 1. Funções auxiliares
-- ──────────────────────────────────────────
-- Quem pode ver e interagir com o mural: qualquer pessoa autorizada.
create or replace function public.pode_ver_avisos()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.is_authorized() or public.is_admin();
$$;

-- Quem pode criar avisos.
create or replace function public.pode_publicar_aviso()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.is_admin();
$$;

-- ──────────────────────────────────────────
-- 2. Tabelas
-- ──────────────────────────────────────────
create table if not exists public.avisos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text check (char_length(titulo) <= 160),
  texto       text not null default '' check (char_length(texto) <= 5000),
  -- Anexos: lista de { "tipo": "imagem" | "video" | "documento", "path": "...", "nome": "..." }
  midia       jsonb not null default '[]'::jsonb,
  fixado      boolean not null default false,
  autor_id    uuid references auth.users (id) on delete set null default auth.uid(),
  autor_nome  text,
  criado_em   timestamptz not null default now(),
  editado_em  timestamptz
);
create index if not exists idx_avisos_criado_em on public.avisos (criado_em desc);

create table if not exists public.aviso_curtidas (
  aviso_id  uuid not null references public.avisos (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  criado_em timestamptz not null default now(),
  primary key (aviso_id, user_id)
);

create table if not exists public.aviso_salvos (
  aviso_id  uuid not null references public.avisos (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  criado_em timestamptz not null default now(),
  primary key (aviso_id, user_id)
);

create table if not exists public.aviso_comentarios (
  id          uuid primary key default gen_random_uuid(),
  aviso_id    uuid not null references public.avisos (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null default auth.uid(),
  autor_nome  text,
  texto       text not null check (char_length(texto) between 1 and 1000),
  criado_em   timestamptz not null default now()
);
create index if not exists idx_aviso_comentarios_aviso on public.aviso_comentarios (aviso_id, criado_em);

-- ──────────────────────────────────────────
-- 3. Gatilhos: autor sempre é quem está logado
--    (o nome vem do perfil, não do navegador, para ninguém se passar por outro)
-- ──────────────────────────────────────────
create or replace function public.avisos_definir_autor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id   := auth.uid();
    new.autor_nome := (select coalesce(display_name, split_part(email, '@', 1))
                       from public.profiles where id = auth.uid());
    new.criado_em  := now();
    new.editado_em := null;
    -- Só administradores fixam avisos no topo
    if not public.is_admin() then new.fixado := false; end if;
  else
    -- Autor e data de criação nunca mudam
    new.autor_id   := old.autor_id;
    new.autor_nome := old.autor_nome;
    new.criado_em  := old.criado_em;
    if not public.is_admin() then new.fixado := old.fixado; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_avisos_autor on public.avisos;
create trigger trg_avisos_autor
  before insert or update on public.avisos
  for each row execute function public.avisos_definir_autor();

create or replace function public.aviso_comentarios_definir_autor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.user_id    := auth.uid();
  new.autor_nome := (select coalesce(display_name, split_part(email, '@', 1))
                     from public.profiles where id = auth.uid());
  new.criado_em  := now();
  return new;
end;
$$;

drop trigger if exists trg_aviso_comentarios_autor on public.aviso_comentarios;
create trigger trg_aviso_comentarios_autor
  before insert on public.aviso_comentarios
  for each row execute function public.aviso_comentarios_definir_autor();

-- ──────────────────────────────────────────
-- 4. Permissões (RLS)
-- ──────────────────────────────────────────
alter table public.avisos            enable row level security;
alter table public.aviso_curtidas    enable row level security;
alter table public.aviso_salvos      enable row level security;
alter table public.aviso_comentarios enable row level security;

revoke all on table public.avisos, public.aviso_curtidas, public.aviso_salvos, public.aviso_comentarios from anon;
grant select, insert, update, delete on table public.avisos, public.aviso_curtidas, public.aviso_salvos, public.aviso_comentarios to authenticated;

-- Remove as políticas antigas destas tabelas e recria as do sistema
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('avisos', 'aviso_curtidas', 'aviso_salvos', 'aviso_comentarios')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- Avisos: todos leem; quem pode publicar cria; o autor edita; autor ou admin exclui.
-- Administradores também alteram (para fixar/desafixar).
create policy "avisos: leitura"
  on public.avisos for select to authenticated
  using (public.pode_ver_avisos());

create policy "avisos: publicar"
  on public.avisos for insert to authenticated
  with check (public.pode_publicar_aviso());

create policy "avisos: editar"
  on public.avisos for update to authenticated
  using  (autor_id = auth.uid() or public.is_admin())
  with check (autor_id = auth.uid() or public.is_admin());

create policy "avisos: excluir"
  on public.avisos for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());

-- Curtidas: todos veem a contagem; cada um curte/descurte só em seu nome
create policy "aviso_curtidas: leitura"
  on public.aviso_curtidas for select to authenticated
  using (public.pode_ver_avisos());

create policy "aviso_curtidas: curtir"
  on public.aviso_curtidas for insert to authenticated
  with check (user_id = auth.uid() and public.pode_ver_avisos());

create policy "aviso_curtidas: descurtir"
  on public.aviso_curtidas for delete to authenticated
  using (user_id = auth.uid());

-- Salvos: cada pessoa só vê e mexe nos próprios
create policy "aviso_salvos: próprios"
  on public.aviso_salvos for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.pode_ver_avisos());

-- Comentários: todos leem e comentam; o autor ou um admin exclui
create policy "aviso_comentarios: leitura"
  on public.aviso_comentarios for select to authenticated
  using (public.pode_ver_avisos());

create policy "aviso_comentarios: comentar"
  on public.aviso_comentarios for insert to authenticated
  with check (public.pode_ver_avisos());

create policy "aviso_comentarios: excluir"
  on public.aviso_comentarios for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ──────────────────────────────────────────
-- 5. Tempo real (o mural atualiza sozinho)
-- ──────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.avisos;            exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.aviso_curtidas;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.aviso_comentarios; exception when duplicate_object then null; end;
end;
$$;

-- ──────────────────────────────────────────
-- 6. Arquivos dos avisos (bucket privado avisos-midia)
--    Fotos até 5 MB, vídeos até 50 MB e documentos até 10 MB são
--    conferidos no site; o limite do bucket é o maior deles.
-- ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avisos-midia', 'avisos-midia', false, 52428800,
  array[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%avisos-midia%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$$;

-- Quem publica envia arquivos só para a própria pasta (<id do usuário>/arquivo)
create policy "avisos-midia: envio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avisos-midia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.pode_publicar_aviso()
  );

-- Todos os usuários autorizados veem as mídias do mural
create policy "avisos-midia: leitura"
  on storage.objects for select to authenticated
  using (bucket_id = 'avisos-midia' and public.pode_ver_avisos());

-- O dono remove os próprios arquivos; administradores removem qualquer um
create policy "avisos-midia: exclusão"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avisos-midia'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ──────────────────────────────────────────
-- 7. Conferência
-- ──────────────────────────────────────────
select schemaname, tablename, policyname, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('avisos','aviso_curtidas','aviso_salvos','aviso_comentarios'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'avisos-midia%')
order by schemaname, tablename, policyname;
