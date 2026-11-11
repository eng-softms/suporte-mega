-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Protocolo do atendimento e resolução do chamado
--  Pode ser executado mais de uma vez
--
--  • protocolo: número sequencial por ano, gerado pelo banco
--    (ex.: 2026-00001, 2026-00002 … e recomeça em 2027-00001)
--    – ninguém consegue escolher nem alterar o protocolo
--    – os chamados que já existem recebem protocolo pela ordem de abertura
--  • resolucao: texto com a solução do problema, preenchido pelo
--    administrador ao marcar o chamado como "Resolvido"
-- ═══════════════════════════════════════════════════════════════

alter table public.chamados
  add column if not exists protocolo text,
  add column if not exists resolucao text;

alter table public.chamados drop constraint if exists chamados_resolucao_check;
alter table public.chamados
  add constraint chamados_resolucao_check
  check (resolucao is null or char_length(resolucao) <= 4000);

-- ── Contador de protocolos por ano (só o banco mexe nele) ──
create table if not exists public.chamados_protocolo_contador (
  ano    int primary key,
  ultimo int not null default 0
);
alter table public.chamados_protocolo_contador enable row level security;
revoke all on public.chamados_protocolo_contador from anon, authenticated;

-- Próximo número do ano (a linha do ano fica travada até o fim da transação,
-- então dois chamados abertos ao mesmo tempo nunca recebem o mesmo número)
create or replace function public.proximo_protocolo_chamado(p_ano int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num int;
begin
  insert into public.chamados_protocolo_contador as c (ano, ultimo)
  values (p_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
  returning ultimo into v_num;
  return p_ano::text || '-' || lpad(v_num::text, 5, '0');
end;
$$;
revoke all on function public.proximo_protocolo_chamado(int) from public, anon, authenticated;

-- ── Chamados que já existem: numera pela data de abertura ──
with base as (
  select id,
         extract(year from coalesce(criado_em, now()) at time zone 'America/Sao_Paulo')::int as ano,
         coalesce(criado_em, now()) as dt
  from public.chamados
  where protocolo is null
),
numerados as (
  select b.id, b.ano,
         coalesce(c.ultimo, 0) + row_number() over (partition by b.ano order by b.dt, b.id) as n
  from base b
  left join public.chamados_protocolo_contador c on c.ano = b.ano
)
update public.chamados ch
set protocolo = n.ano::text || '-' || lpad(n.n::text, 5, '0')
from numerados n
where ch.id = n.id;

-- Acerta o contador com o maior número já usado em cada ano
insert into public.chamados_protocolo_contador (ano, ultimo)
select split_part(protocolo, '-', 1)::int, max(split_part(protocolo, '-', 2)::int)
from public.chamados
where protocolo ~ '^\d{4}-\d+$'
group by 1
on conflict (ano) do update
  set ultimo = greatest(public.chamados_protocolo_contador.ultimo, excluded.ultimo);

create unique index if not exists chamados_protocolo_key on public.chamados (protocolo);

-- ── Novo chamado: o banco sempre define o protocolo ──
create or replace function public.set_chamado_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.protocolo := public.proximo_protocolo_chamado(
      extract(year from coalesce(new.criado_em, now()) at time zone 'America/Sao_Paulo')::int
    );
  elsif old.protocolo is not null then
    -- Protocolo não muda depois de gerado
    new.protocolo := old.protocolo;
  end if;
  return new;
end;
$$;

drop trigger if exists chamados_set_protocolo on public.chamados;
create trigger chamados_set_protocolo
  before insert or update on public.chamados
  for each row execute function public.set_chamado_protocolo();

-- Conferência
select protocolo, criado_em, status, resolucao
from public.chamados
order by criado_em desc
limit 10;
