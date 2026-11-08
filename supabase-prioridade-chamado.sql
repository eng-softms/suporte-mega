-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Prioridade do chamado: só o super administrador altera
--  Execute depois de supabase-permissoes-admin-midia.sql (pode ser executado mais de uma vez)
--
--  • O usuário escolhe a prioridade ao abrir o chamado
--  • Depois de aberto, somente o super administrador muda a prioridade
--    (admins continuam alterando status e observações normalmente)
-- ═══════════════════════════════════════════════════════════════

create or replace function public.protect_chamado_prioridade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prioridade is distinct from old.prioridade
     and not public.is_superadmin() then
    raise exception 'Somente o super administrador pode alterar a prioridade do chamado.';
  end if;
  return new;
end;
$$;

drop trigger if exists chamados_protect_prioridade on public.chamados;
create trigger chamados_protect_prioridade
  before update on public.chamados
  for each row execute function public.protect_chamado_prioridade();
