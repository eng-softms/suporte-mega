-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Exclusão de usuários (somente super administrador)
--  Execute depois de supabase-acesso-setup.sql, que cria public.is_superadmin()
-- ═══════════════════════════════════════════════════════════════

-- Apaga a conta em auth.users; o perfil some junto (on delete cascade)
-- e os chamados da pessoa ficam sem o vínculo (on delete set null).
create or replace function public.delete_user(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Somente o super administrador pode excluir usuários.';
  end if;
  if target = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta.';
  end if;

  delete from auth.users where id = target;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$$;

revoke execute on function public.delete_user(uuid) from public, anon;
grant  execute on function public.delete_user(uuid) to authenticated;
