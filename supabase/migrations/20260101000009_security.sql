-- =============================================================================
-- GB Eggs ERP — 0009 Row Level Security & privileges
--
-- Principles
--  * RLS is enabled on every table. Nothing is readable by anonymous users.
--  * Reference data is readable by any active signed-in user.
--  * Master data follows the role_permissions matrix (view/create/edit/delete).
--  * Transactional tables are INSERT-only for clients; corrections, voids and
--    cancellations go through SECURITY DEFINER functions that check
--    permissions, keep stock/cash consistent and leave an audit trail.
--  * Ledgers (stock movements, cashbook, audit log) are read-only.
-- =============================================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Helper: full CRUD policies for a master-data table bound to one module.
create or replace function public._crud_policies(p_table text, p_module text, p_select_expr text default null)
returns void
language plpgsql
as $$
begin
  execute format('create policy %I on public.%I for select to authenticated using (%s)',
    p_table || '_select', p_table, coalesce(p_select_expr, format('public.has_perm(%L, ''view'')', p_module)));
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_perm(%L, ''create''))',
    p_table || '_insert', p_table, p_module);
  execute format('create policy %I on public.%I for update to authenticated using (public.has_perm(%L, ''edit'')) with check (public.has_perm(%L, ''edit''))',
    p_table || '_update', p_table, p_module, p_module);
  execute format('create policy %I on public.%I for delete to authenticated using (public.has_perm(%L, ''delete''))',
    p_table || '_delete', p_table, p_module);
end;
$$;

-- Helper: read + insert-only policies for a transactional table.
create or replace function public._insert_only_policies(p_table text, p_module text, p_select_expr text default null,
                                                        p_insert_action text default 'create')
returns void
language plpgsql
as $$
begin
  execute format('create policy %I on public.%I for select to authenticated using (%s)',
    p_table || '_select', p_table, coalesce(p_select_expr, format('public.has_perm(%L, ''view'')', p_module)));
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_perm(%L, %L))',
    p_table || '_insert', p_table, p_module, p_insert_action);
end;
$$;

-- Helper: read-only policy.
create or replace function public._read_policy(p_table text, p_expr text)
returns void
language plpgsql
as $$
begin
  execute format('create policy %I on public.%I for select to authenticated using (%s)', p_table || '_select', p_table, p_expr);
end;
$$;

-- --- Access, settings & reference data --------------------------------------
select public._read_policy('roles', 'public.is_active_user()');
select public._read_policy('app_modules', 'public.is_active_user()');
select public._read_policy('role_permissions', 'public.is_active_user()');
create policy role_permissions_update on public.role_permissions for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and role_code <> 'admin');

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

select public._read_policy('app_settings', 'public.is_active_user()');
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.has_perm('settings', 'edit')) with check (public.has_perm('settings', 'edit'));

select public._read_policy('document_sequences', 'public.is_active_user()');
create policy document_sequences_update on public.document_sequences for update to authenticated
  using (public.has_perm('settings', 'edit')) with check (public.has_perm('settings', 'edit'));

select public._read_policy('audit_logs', 'public.is_admin()');

-- --- Master data ---------------------------------------------------------------
select public._crud_policies('farms', 'poultry', 'public.is_active_user()');
select public._crud_policies('sheds', 'poultry', 'public.is_active_user()');
select public._crud_policies('chicken_breeds', 'poultry', 'public.is_active_user()');
select public._crud_policies('chicken_batches', 'poultry', 'public.is_active_user()');
select public._crud_policies('egg_grades', 'inventory', 'public.is_active_user()');
select public._crud_policies('packaging_types', 'settings', 'public.is_active_user()');
select public._crud_policies('packaging_items', 'inventory', 'public.is_active_user()');
select public._crud_policies('expense_categories', 'expenses', 'public.is_active_user()');
select public._crud_policies('feed_categories', 'feed', 'public.is_active_user()');
select public._crud_policies('feed_inventory', 'feed', 'public.is_active_user()');
select public._crud_policies('medicines', 'medicine', 'public.is_active_user()');
select public._crud_policies('cash_accounts', 'accounting', 'public.is_active_user()');
select public._crud_policies('customers', 'customers',
  'public.has_perm(''customers'',''view'') or public.has_perm(''sales'',''view'') or public.has_perm(''poultry'',''view'') or public.has_perm(''accounting'',''view'')');
select public._crud_policies('suppliers', 'suppliers',
  'public.has_perm(''suppliers'',''view'') or public.has_perm(''purchases'',''view'') or public.has_perm(''feed'',''view'') or public.has_perm(''medicine'',''view'') or public.has_perm(''poultry'',''view'') or public.has_perm(''inventory'',''view'') or public.has_perm(''accounting'',''view'')');
select public._crud_policies('employees', 'employees');
select public._crud_policies('attendance', 'employees');
select public._crud_policies('vaccination_records', 'poultry');

-- --- Transactional (insert-only) -----------------------------------------------
select public._insert_only_policies('chicken_purchases', 'poultry',
  'public.has_perm(''poultry'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'')');
select public._insert_only_policies('chicken_sales', 'poultry',
  'public.has_perm(''poultry'',''view'') or public.has_perm(''customers'',''view'') or public.has_perm(''accounting'',''view'')');
select public._insert_only_policies('mortality_records', 'poultry');
select public._insert_only_policies('chicken_transfers', 'poultry');
select public._insert_only_policies('egg_collections', 'production',
  'public.has_perm(''production'',''view'') or public.has_perm(''inventory'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('egg_damages', 'inventory',
  'public.has_perm(''inventory'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('egg_stock_adjustments', 'inventory', null, 'edit');
select public._insert_only_policies('egg_stock_transfers', 'inventory');
select public._insert_only_policies('packaging_movements', 'inventory',
  'public.has_perm(''inventory'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'')');
select public._insert_only_policies('feed_purchases', 'feed',
  'public.has_perm(''feed'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('feed_consumption', 'feed',
  'public.has_perm(''feed'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('medicine_movements', 'medicine',
  'public.has_perm(''medicine'',''view'') or public.has_perm(''poultry'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('expenses', 'expenses',
  'public.has_perm(''expenses'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('other_incomes', 'accounting',
  'public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._insert_only_policies('fund_transfers', 'accounting');
select public._insert_only_policies('employee_advances', 'employees');

-- Salary records: pending rows can be corrected by editors (guarded by trigger).
select public._insert_only_policies('salary_records', 'employees',
  'public.has_perm(''employees'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
create policy salary_records_update on public.salary_records for update to authenticated
  using (public.has_perm('employees', 'edit') and status = 'pending')
  with check (public.has_perm('employees', 'edit'));

-- --- Read-only (written only by SECURITY DEFINER functions) ---------------------
select public._read_policy('egg_inventory',
  'public.has_perm(''inventory'',''view'') or public.has_perm(''sales'',''view'') or public.has_perm(''purchases'',''view'') or public.has_perm(''production'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('egg_stock_movements',
  'public.has_perm(''inventory'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('medicine_batches',
  'public.has_perm(''medicine'',''view'') or public.has_perm(''poultry'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('egg_purchases',
  'public.has_perm(''purchases'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('egg_purchase_items',
  'public.has_perm(''purchases'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('purchase_returns',
  'public.has_perm(''purchases'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('purchase_return_items',
  'public.has_perm(''purchases'',''view'') or public.has_perm(''suppliers'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('egg_sales',
  'public.has_perm(''sales'',''view'') or public.has_perm(''customers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('egg_sale_items',
  'public.has_perm(''sales'',''view'') or public.has_perm(''customers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('sales_returns',
  'public.has_perm(''sales'',''view'') or public.has_perm(''customers'',''view'') or public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('sales_return_items',
  'public.has_perm(''sales'',''view'') or public.has_perm(''customers'',''view'') or public.has_perm(''reports'',''view'')');
select public._read_policy('payments',
  'public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'') or (party_type = ''customer'' and (public.has_perm(''sales'',''view'') or public.has_perm(''customers'',''view''))) or (party_type = ''supplier'' and (public.has_perm(''purchases'',''view'') or public.has_perm(''suppliers'',''view'')))');
select public._read_policy('financial_transactions',
  'public.has_perm(''accounting'',''view'') or public.has_perm(''reports'',''view'')');

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Functions: nothing is executable by default; expose the public API only.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;

grant execute on function public.app_has_users() to anon, authenticated;

grant execute on function
  public.current_role_code(), public.is_admin(), public.is_active_user(),
  public.has_perm(text, text), public.app_today(),
  public.batch_live_birds(uuid, date), public.customer_balance(uuid), public.supplier_balance(uuid),
  public.void_flock_event(text, uuid, text),
  public.void_egg_collection(uuid, text),
  public.save_egg_purchase(jsonb), public.confirm_egg_purchase(uuid), public.cancel_egg_purchase(uuid, text),
  public.create_purchase_return(jsonb),
  public.save_egg_sale(jsonb), public.confirm_egg_sale(uuid), public.cancel_egg_sale(uuid, text),
  public.create_sales_return(jsonb), public.delete_draft(text, uuid),
  public.void_stock_record(text, uuid, text),
  public.pay_salary(uuid, uuid, text, date), public.void_salary(uuid, text), public.void_cash_record(text, uuid, text),
  public.record_payment(jsonb), public.void_payment(uuid, text),
  public.party_ledger(text, uuid, date, date),
  public.financial_summary(date, date), public.egg_stock_summary(date, date, uuid),
  public.production_report(date, date, text, uuid, uuid),
  public.dashboard_summary(), public.dashboard_charts(int)
to authenticated;

-- Trigger / internal functions keep the owner's privileges only. Clean up DDL
-- helpers that are not needed at runtime.
drop function public._crud_policies(text, text, text);
drop function public._insert_only_policies(text, text, text, text);
drop function public._read_policy(text, text);
drop function public._enable_audit(regclass);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end;
$$;
