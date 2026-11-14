-- =============================================================================
-- GB Eggs ERP — 0001 Foundation
-- Roles, permissions, profiles, settings, document numbering, audit logging and
-- shared helper functions used by every other module.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ledgers must never be edited or deleted: corrections are made with new
-- (reversing) rows so the full history stays traceable.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable; post a reversing entry instead', tg_table_name
    using errcode = '42501';
end;
$$;

-- -----------------------------------------------------------------------------
-- Roles & permissions
-- -----------------------------------------------------------------------------
create table public.roles (
  code        text primary key check (code ~ '^[a-z_]+$'),
  name        text not null,
  description text,
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.roles (code, name, description) values
  ('admin',      'Administrator', 'Full system access'),
  ('manager',    'Manager',       'Farm operations, inventory, production and sales'),
  ('accountant', 'Accountant',    'Accounting, invoices, payments and reports'),
  ('staff',      'Staff',         'Assigned operational tasks only');

create table public.app_modules (
  code       text primary key,
  name       text not null,
  sort_order int  not null
);

insert into public.app_modules (code, name, sort_order) values
  ('dashboard',  'Dashboard',            1),
  ('poultry',    'Poultry Management',   2),
  ('production', 'Egg Production',       3),
  ('inventory',  'Egg Inventory',        4),
  ('purchases',  'Egg Purchases',        5),
  ('sales',      'Egg Sales',            6),
  ('customers',  'Customers',            7),
  ('suppliers',  'Suppliers',            8),
  ('feed',       'Feed Management',      9),
  ('medicine',   'Medicine Management', 10),
  ('expenses',   'Expenses',            11),
  ('employees',  'Employees',           12),
  ('accounting', 'Accounting',          13),
  ('reports',    'Reports',             14),
  ('settings',   'Settings',            15);

create table public.role_permissions (
  role_code  text not null references public.roles(code) on delete cascade,
  module     text not null references public.app_modules(code) on delete cascade,
  can_view   boolean not null default false,
  can_create boolean not null default false,
  can_edit   boolean not null default false,
  can_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role_code, module)
);

-- Default permission matrix (admin is always allowed in code; rows kept for UI).
insert into public.role_permissions (role_code, module, can_view, can_create, can_edit, can_delete)
select r.code, m.code,
  case
    when r.code = 'admin' then true
    when r.code = 'manager' then m.code in ('dashboard','poultry','production','inventory','purchases','sales','customers','suppliers','feed','medicine','expenses','employees','reports')
    when r.code = 'accountant' then m.code in ('dashboard','sales','purchases','customers','suppliers','expenses','employees','accounting','reports','inventory')
    when r.code = 'staff' then m.code in ('dashboard','poultry','production','feed','medicine')
  end,
  case
    when r.code = 'admin' then true
    when r.code = 'manager' then m.code in ('poultry','production','inventory','purchases','sales','customers','suppliers','feed','medicine','expenses','employees')
    when r.code = 'accountant' then m.code in ('sales','purchases','customers','suppliers','expenses','employees','accounting')
    when r.code = 'staff' then m.code in ('production','poultry','feed','medicine')
  end,
  case
    when r.code = 'admin' then true
    when r.code = 'manager' then m.code in ('poultry','production','inventory','purchases','sales','customers','suppliers','feed','medicine','employees')
    when r.code = 'accountant' then m.code in ('sales','purchases','customers','suppliers','expenses','employees','accounting')
    else false
  end,
  -- "delete" = reverse / cancel / void a transaction. Restricted on purpose.
  case
    when r.code = 'admin' then true
    when r.code = 'manager' then m.code in ('production','poultry','inventory')
    when r.code = 'accountant' then m.code in ('accounting','expenses')
    else false
  end
from public.roles r cross join public.app_modules m;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  email      text,
  phone      text,
  role_code  text not null default 'staff' references public.roles(code),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role_code);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- The very first account becomes the administrator; everyone after that starts
-- as staff until an administrator assigns a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  perform pg_advisory_xact_lock(hashtext('gb_eggs_first_user'));
  if exists (select 1 from public.profiles) then
    v_role := 'staff';
  else
    v_role := 'admin';
  end if;
  insert into public.profiles (id, full_name, email, role_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    v_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Authorisation helpers (used by RLS policies and RPCs)
-- -----------------------------------------------------------------------------
create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role_code from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code() = 'admin', false);
$$;

create or replace function public.has_perm(p_module text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_role_code() is null then false
    when public.current_role_code() = 'admin' then true
    else coalesce((
      select case p_action
               when 'view'   then rp.can_view
               when 'create' then rp.can_create
               when 'edit'   then rp.can_edit
               when 'delete' then rp.can_delete
               else false
             end
      from public.role_permissions rp
      where rp.role_code = public.current_role_code() and rp.module = p_module
    ), false)
  end;
$$;

create or replace function public.require_perm(p_module text, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_perm(p_module, p_action) then
    raise exception 'Permission denied: % on %', p_action, p_module using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Application settings (single row)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                    int primary key default 1 check (id = 1),
  company_name          text not null default 'GB Eggs',
  logo_url              text,
  address               text,
  phone                 text,
  email                 text,
  ntn_number            text,
  currency              text not null default 'PKR',
  timezone              text not null default 'Asia/Karachi',
  language              text not null default 'en' check (language in ('en','ur')),
  tax_enabled           boolean not null default false,
  tax_label             text not null default 'GST',
  tax_rate              numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  allow_negative_stock  boolean not null default false,
  mortality_alert_pct   numeric(5,2) not null default 0.5 check (mortality_alert_pct >= 0),
  medicine_expiry_days  int not null default 30 check (medicine_expiry_days >= 0),
  invoice_footer        text default 'Thank you for your business!',
  updated_at            timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Business "today" in the configured timezone.
create or replace function public.app_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce((select timezone from public.app_settings where id = 1), 'Asia/Karachi'))::date;
$$;

-- -----------------------------------------------------------------------------
-- Document numbering (gap-free per type, row-locked)
-- -----------------------------------------------------------------------------
create table public.document_sequences (
  doc_type    text primary key,
  label       text not null,
  prefix      text not null,
  next_number bigint not null default 1 check (next_number > 0),
  padding     int not null default 6 check (padding between 1 and 12),
  updated_at  timestamptz not null default now()
);

insert into public.document_sequences (doc_type, label, prefix) values
  ('egg_sale',        'Sales invoice',       'GB-INV-'),
  ('egg_purchase',    'Purchase invoice',    'GB-PUR-'),
  ('sales_return',    'Sales return',        'GB-SR-'),
  ('purchase_return', 'Purchase return',     'GB-PR-'),
  ('payment_in',      'Receipt voucher',     'GB-RCV-'),
  ('payment_out',     'Payment voucher',     'GB-PAY-'),
  ('expense',         'Expense voucher',     'GB-EXP-'),
  ('chicken_sale',    'Chicken sale',        'GB-CS-'),
  ('income',          'Income voucher',      'GB-INC-');

create or replace function public._next_document_number(p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq public.document_sequences%rowtype;
begin
  update public.document_sequences
     set next_number = next_number + 1, updated_at = now()
   where doc_type = p_doc_type
  returning * into v_seq;
  if not found then
    raise exception 'Unknown document type %', p_doc_type;
  end if;
  return v_seq.prefix || lpad((v_seq.next_number - 1)::text, v_seq.padding, '0');
end;
$$;

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index audit_logs_table_record_idx on public.audit_logs(table_name, record_id);
create index audit_logs_changed_at_idx on public.audit_logs(changed_at desc);
create index audit_logs_changed_by_idx on public.audit_logs(changed_by);

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.forbid_mutation();

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  text;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid());
  return null;
end;
$$;

-- Helper to attach the audit trigger to a table.
create or replace function public._enable_audit(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function public.audit_trigger()',
    'audit_' || replace(p_table::text, 'public.', ''), p_table
  );
end;
$$;

select public._enable_audit('public.profiles');
select public._enable_audit('public.role_permissions');
select public._enable_audit('public.app_settings');
select public._enable_audit('public.document_sequences');

-- Public, unauthenticated check used by the login page to decide whether the
-- one-time "create administrator" sign-up form should be shown.
create or replace function public.app_has_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles);
$$;
