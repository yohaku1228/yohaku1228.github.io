create table public.household_ledger (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  ledger jsonb not null check (jsonb_typeof(ledger) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.household_ledger enable row level security;
revoke all on public.household_ledger from anon, authenticated;
grant select on public.household_ledger to authenticated;
create policy household_read_own on public.household_ledger
  for select to authenticated using ((select auth.uid()) = owner_id);

create function public.save_household_ledger(expected_revision integer, new_ledger jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  saved_revision integer;
begin
  if caller is null then raise exception 'login required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or new_ledger is null
     or jsonb_typeof(new_ledger) <> 'object' or octet_length(new_ledger::text) > 2000000 then
    raise exception 'invalid ledger' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.household_ledger(owner_id, revision, ledger)
    values (caller, 1, new_ledger) on conflict (owner_id) do nothing
    returning revision into saved_revision;
  else
    update public.household_ledger set ledger = new_ledger, revision = revision + 1, updated_at = now()
    where owner_id = caller and revision = expected_revision returning revision into saved_revision;
  end if;
  return saved_revision;
end;
$$;
revoke all on function public.save_household_ledger(integer, jsonb) from public, anon;
grant execute on function public.save_household_ledger(integer, jsonb) to authenticated;
