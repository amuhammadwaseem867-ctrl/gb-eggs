-- Security & performance hardening found during the app audit.

-- 1. Self sign-ups must not get access. Only the very first account (the
--    administrator) is active automatically; every later account starts
--    inactive until an administrator activates it (Settings -> Users), or is
--    created already active by an administrator through the server action.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('gb_eggs_first_user'));
  v_first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, full_name, email, role_code, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    case when v_first then 'admin' else 'staff' end,
    v_first
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Internal helpers that read balances / flock sizes without their own
--    permission checks. They are only called from SECURITY DEFINER functions
--    and triggers, so nobody needs to call them directly over the API.
revoke execute on function public.customer_balance(uuid) from public, anon, authenticated;
revoke execute on function public.supplier_balance(uuid) from public, anon, authenticated;
revoke execute on function public.batch_live_birds(uuid, date) from public, anon, authenticated;

-- 3. Evaluate auth.uid() once per query instead of once per row.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_user()));

-- 4. Index foreign keys used for joins and filters (audit "who" columns excluded).
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and a.attname not in ('created_by', 'voided_by', 'cancelled_by', 'confirmed_by', 'updated_by')
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    execute format('create index if not exists %I on %s (%I)', left(r.conname, 55) || '_idx', r.tbl, r.attname);
  end loop;
end $$;
