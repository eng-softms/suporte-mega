-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Código de acesso remoto (AnyDesk / RustDesk) no chamado
--  Pode ser executado mais de uma vez
--
--  • Campos opcionais, preenchidos por quem abre o chamado
--  • As permissões da tabela chamados continuam as mesmas
-- ═══════════════════════════════════════════════════════════════

alter table public.chamados
  add column if not exists acesso_remoto_tipo   text,
  add column if not exists acesso_remoto_codigo text;

alter table public.chamados drop constraint if exists chamados_acesso_remoto_tipo_check;
alter table public.chamados
  add constraint chamados_acesso_remoto_tipo_check
  check (acesso_remoto_tipo is null or acesso_remoto_tipo in ('AnyDesk', 'RustDesk'));

alter table public.chamados drop constraint if exists chamados_acesso_remoto_codigo_check;
alter table public.chamados
  add constraint chamados_acesso_remoto_codigo_check
  check (acesso_remoto_codigo is null or char_length(acesso_remoto_codigo) <= 40);

-- Conferência
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'chamados'
  and column_name like 'acesso_remoto%';
