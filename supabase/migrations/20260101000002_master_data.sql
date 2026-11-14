-- =============================================================================
-- GB Eggs ERP — 0002 Master data
-- =============================================================================

create table public.farms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  farm_type   text not null default 'farm' check (farm_type in ('farm','store')),
  location    text,
  manager_name text,
  phone       text,
  capacity    int check (capacity is null or capacity >= 0),
  is_active   boolean not null default true,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger farms_updated_at before update on public.farms for each row execute function public.set_updated_at();

create table public.sheds (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms(id) on delete restrict,
  code        text not null,
  name        text not null,
  shed_type   text not null default 'layer' check (shed_type in ('layer','broiler','breeder','grower','brooder')),
  capacity    int check (capacity is null or capacity >= 0),
  is_active   boolean not null default true,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (farm_id, code)
);
create index sheds_farm_idx on public.sheds(farm_id);
create trigger sheds_updated_at before update on public.sheds for each row execute function public.set_updated_at();

create table public.chicken_breeds (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  bird_type   text not null default 'layer' check (bird_type in ('layer','broiler','breeder','dual')),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger chicken_breeds_updated_at before update on public.chicken_breeds for each row execute function public.set_updated_at();

create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  name            text not null,
  business_name   text,
  phone           text,
  email           text,
  address         text,
  city            text,
  opening_balance numeric(14,2) not null default 0,
  credit_limit    numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  is_active       boolean not null default true,
  notes           text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index customers_name_idx on public.customers using btree (lower(name));
create index customers_phone_idx on public.customers(phone);
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();

create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  name            text not null,
  business_name   text,
  supplier_type   text not null default 'egg' check (supplier_type in ('egg','chicken','feed','medicine','packaging','general')),
  phone           text,
  email           text,
  address         text,
  city            text,
  opening_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  notes           text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index suppliers_name_idx on public.suppliers using btree (lower(name));
create index suppliers_type_idx on public.suppliers(supplier_type);
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();

create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  account_type    text not null default 'cash' check (account_type in ('cash','bank','mobile_wallet')),
  bank_name       text,
  account_number  text,
  opening_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger cash_accounts_updated_at before update on public.cash_accounts for each row execute function public.set_updated_at();
insert into public.cash_accounts (name, account_type) values ('Cash in Hand', 'cash');

-- Egg grades = the inventory categories eggs are stocked and sold in.
-- system_code links the grade to the size columns of the daily collection form.
create table public.egg_grades (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  egg_size      text not null check (egg_size in ('small','medium','large','xl','jumbo','mixed')),
  grade_class   text not null default 'A' check (grade_class in ('A','B','C','dirty')),
  system_code   text unique check (system_code in ('SMALL','MEDIUM','LARGE','XL','DIRTY')),
  is_saleable   boolean not null default true,
  default_price numeric(12,2) not null default 0 check (default_price >= 0),
  reorder_level int not null default 0 check (reorder_level >= 0),
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger egg_grades_updated_at before update on public.egg_grades for each row execute function public.set_updated_at();

insert into public.egg_grades (code, name, egg_size, grade_class, system_code, sort_order) values
  ('S-A',   'Small (Grade A)',        'small',  'A',     'SMALL',  1),
  ('M-A',   'Medium (Grade A)',       'medium', 'A',     'MEDIUM', 2),
  ('L-A',   'Large (Grade A)',        'large',  'A',     'LARGE',  3),
  ('XL-A',  'Extra Large (Grade A)',  'xl',     'A',     'XL',     4),
  ('DIRTY', 'Dirty / Grade B',        'mixed',  'dirty', 'DIRTY',  5);

-- Packaging conversions: how many eggs one selling/buying unit holds.
create table public.packaging_types (
  code          text primary key check (code ~ '^[a-z_]+$'),
  name          text not null,
  eggs_per_unit int not null check (eggs_per_unit > 0),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now()
);
insert into public.packaging_types (code, name, eggs_per_unit, sort_order) values
  ('egg',    'Egg',         1,   1),
  ('dozen',  'Dozen',       12,  2),
  ('tray',   'Tray',        30,  3),
  ('carton', 'Carton (12 trays)', 360, 4);

-- "egg" must always exist and always equal 1.
create or replace function public._protect_egg_unit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.code = 'egg' then
    raise exception 'The base unit "egg" cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and new.code = 'egg' and new.eggs_per_unit <> 1 then
    raise exception 'The base unit "egg" must hold exactly 1 egg';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger packaging_types_protect before update or delete on public.packaging_types
  for each row execute function public._protect_egg_unit();

create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into public.expense_categories (name) values
  ('Chicken purchases'), ('Feed'), ('Medicine'), ('Electricity'), ('Transportation'),
  ('Labour'), ('Salaries'), ('Packaging'), ('Maintenance'), ('Miscellaneous');

create table public.feed_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

select public._enable_audit('public.farms');
select public._enable_audit('public.sheds');
select public._enable_audit('public.chicken_breeds');
select public._enable_audit('public.customers');
select public._enable_audit('public.suppliers');
select public._enable_audit('public.cash_accounts');
select public._enable_audit('public.egg_grades');
select public._enable_audit('public.packaging_types');
select public._enable_audit('public.expense_categories');
select public._enable_audit('public.feed_categories');
