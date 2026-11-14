-- =============================================================================
-- GB Eggs ERP — 0004 Egg production, inventory, purchases, sales and returns
--
-- Stock is tracked in individual eggs per (location, grade). Every change goes
-- through _egg_stock_move(), which locks the inventory row (SELECT ... FOR
-- UPDATE), refuses to go negative unless an administrator enabled it, and
-- writes an immutable ledger row. Concurrent sales of the same grade therefore
-- serialise on that row and can never double-sell stock.
--
-- Closing stock = Opening + Production + Purchases + Sale returns + Adj. in
--                 + Transfers in - Sales - Damages - Returns out - Adj. out
--                 - Transfers out
-- =============================================================================

create table public.egg_inventory (
  farm_id    uuid not null references public.farms(id) on delete restrict,
  grade_id   uuid not null references public.egg_grades(id) on delete restrict,
  quantity   int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (farm_id, grade_id)
);

create table public.egg_stock_movements (
  id             bigint generated always as identity primary key,
  movement_date  date not null,
  farm_id        uuid not null references public.farms(id) on delete restrict,
  grade_id       uuid not null references public.egg_grades(id) on delete restrict,
  movement_type  text not null check (movement_type in (
                   'opening','production','purchase','sale','sale_return','purchase_return',
                   'damage','adjustment_in','adjustment_out','transfer_in','transfer_out',
                   'sale_cancel','purchase_cancel','production_void','damage_void')),
  quantity       int  not null check (quantity <> 0),
  balance_after  int  not null,
  reference_type text,
  reference_id   uuid,
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index egg_moves_farm_grade_idx on public.egg_stock_movements(farm_id, grade_id, movement_date);
create index egg_moves_date_idx on public.egg_stock_movements(movement_date);
create index egg_moves_ref_idx on public.egg_stock_movements(reference_type, reference_id);
create trigger egg_moves_immutable before update or delete on public.egg_stock_movements
  for each row execute function public.forbid_mutation();

create or replace function public._egg_stock_move(
  p_farm uuid, p_grade uuid, p_qty int, p_type text, p_date date,
  p_ref_type text, p_ref_id uuid, p_notes text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current int;
  v_new     int;
  v_allow   boolean;
  v_grade   text;
  v_farm    text;
begin
  if p_qty is null or p_qty = 0 then
    return null;
  end if;

  insert into public.egg_inventory (farm_id, grade_id, quantity)
  values (p_farm, p_grade, 0)
  on conflict (farm_id, grade_id) do nothing;

  select quantity into v_current
    from public.egg_inventory
   where farm_id = p_farm and grade_id = p_grade
   for update;

  v_new := v_current + p_qty;

  if v_new < 0 then
    select allow_negative_stock into v_allow from public.app_settings where id = 1;
    if not coalesce(v_allow, false) then
      select name into v_grade from public.egg_grades where id = p_grade;
      select name into v_farm from public.farms where id = p_farm;
      raise exception 'Insufficient stock: % at % has % eggs, % required', v_grade, v_farm, v_current, abs(p_qty)
        using errcode = 'P0001', hint = 'insufficient_stock';
    end if;
  end if;

  update public.egg_inventory
     set quantity = v_new, updated_at = now()
   where farm_id = p_farm and grade_id = p_grade;

  insert into public.egg_stock_movements
    (movement_date, farm_id, grade_id, movement_type, quantity, balance_after, reference_type, reference_id, notes)
  values
    (p_date, p_farm, p_grade, p_type, p_qty, v_new, p_ref_type, p_ref_id, p_notes);

  return v_new;
end;
$$;

-- Convert a packaging unit quantity into whole eggs.
create or replace function public._eggs_for_unit(p_unit text, p_unit_qty numeric)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_per int;
  v_eggs numeric;
begin
  select eggs_per_unit into v_per from public.packaging_types where code = p_unit and is_active;
  if v_per is null then
    raise exception 'Unknown or inactive packaging unit %', p_unit;
  end if;
  if p_unit_qty is null or p_unit_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  v_eggs := p_unit_qty * v_per;
  if v_eggs <> trunc(v_eggs) then
    raise exception '% % is not a whole number of eggs', p_unit_qty, p_unit;
  end if;
  return v_eggs::int;
end;
$$;

-- -----------------------------------------------------------------------------
-- Daily egg collection
-- -----------------------------------------------------------------------------
create table public.egg_collections (
  id              uuid primary key default gen_random_uuid(),
  collection_date date not null,
  farm_id         uuid not null references public.farms(id) on delete restrict,
  shed_id         uuid not null references public.sheds(id) on delete restrict,
  batch_id        uuid references public.chicken_batches(id) on delete restrict,
  morning_eggs    int not null default 0 check (morning_eggs >= 0),
  evening_eggs    int not null default 0 check (evening_eggs >= 0),
  total_eggs      int generated always as (morning_eggs + evening_eggs) stored,
  small_eggs      int not null default 0 check (small_eggs >= 0),
  medium_eggs     int not null default 0 check (medium_eggs >= 0),
  large_eggs      int not null default 0 check (large_eggs >= 0),
  xl_eggs         int not null default 0 check (xl_eggs >= 0),
  dirty_eggs      int not null default 0 check (dirty_eggs >= 0),
  broken_eggs     int not null default 0 check (broken_eggs >= 0),
  rejected_eggs   int not null default 0 check (rejected_eggs >= 0),
  saleable_eggs   int generated always as (small_eggs + medium_eggs + large_eggs + xl_eggs + dirty_eggs) stored,
  live_hens       int not null default 0 check (live_hens >= 0),
  status          text not null default 'posted' check (status in ('posted','void')),
  void_reason     text,
  voided_at       timestamptz,
  voided_by       uuid references public.profiles(id),
  notes           text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint egg_collections_total_positive check (morning_eggs + evening_eggs > 0),
  constraint egg_collections_breakdown_matches check (
    small_eggs + medium_eggs + large_eggs + xl_eggs + dirty_eggs + broken_eggs + rejected_eggs
      = morning_eggs + evening_eggs)
);
-- One posted record per shed per day prevents duplicates.
create unique index egg_collections_unique_shed_day
  on public.egg_collections(shed_id, collection_date) where status = 'posted';
create index egg_collections_date_idx on public.egg_collections(collection_date);
create index egg_collections_farm_idx on public.egg_collections(farm_id, collection_date);

create or replace function public._egg_collection_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hens int;
begin
  if new.collection_date > public.app_today() then
    raise exception 'Collection date cannot be in the future' using errcode = '23514';
  end if;
  if not exists (select 1 from public.sheds where id = new.shed_id and farm_id = new.farm_id) then
    raise exception 'Shed does not belong to the selected farm' using errcode = '23514';
  end if;

  if new.batch_id is not null then
    if not exists (select 1 from public.chicken_batches where id = new.batch_id and shed_id = new.shed_id) then
      raise exception 'Batch is not housed in the selected shed' using errcode = '23514';
    end if;
    v_hens := public.batch_live_birds(new.batch_id, new.collection_date);
  else
    select coalesce(sum(public.batch_live_birds(b.id, new.collection_date)), 0)
      into v_hens
      from public.chicken_batches b
     where b.shed_id = new.shed_id
       and b.bird_type in ('layer','breeder')
       and b.placement_date <= new.collection_date
       and (b.status = 'active' or b.closed_date >= new.collection_date);
  end if;

  if v_hens <= 0 then
    raise exception 'No live laying hens are recorded in this shed on %', new.collection_date
      using errcode = '23514', hint = 'Create a chicken batch for the shed first';
  end if;
  -- A hen lays at most one egg a day; allow 5% for carry-over between days.
  if (new.morning_eggs + new.evening_eggs) > ceil(v_hens * 1.05) then
    raise exception 'Collected eggs (%) exceed the number of live hens (%) in the shed',
      new.morning_eggs + new.evening_eggs, v_hens using errcode = '23514';
  end if;

  new.live_hens := v_hens;
  return new;
end;
$$;
create trigger egg_collections_before before insert on public.egg_collections
  for each row execute function public._egg_collection_before();

create or replace function public._egg_collection_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sign int := case when tg_op = 'INSERT' then 1 else -1 end;
  v_type text := case when tg_op = 'INSERT' then 'production' else 'production_void' end;
begin
  if tg_op = 'UPDATE' and not (old.status = 'posted' and new.status = 'void') then
    return new;
  end if;
  for r in
    select g.id as grade_id, x.qty
      from (values ('SMALL', new.small_eggs), ('MEDIUM', new.medium_eggs), ('LARGE', new.large_eggs),
                   ('XL', new.xl_eggs), ('DIRTY', new.dirty_eggs)) as x(code, qty)
      join public.egg_grades g on g.system_code = x.code
     where x.qty > 0
     order by g.id
  loop
    perform public._egg_stock_move(new.farm_id, r.grade_id, v_sign * r.qty, v_type,
      new.collection_date, 'egg_collection', new.id, null);
  end loop;
  return new;
end;
$$;
create trigger egg_collections_after after insert or update of status on public.egg_collections
  for each row execute function public._egg_collection_after();

-- Only status changes are allowed after posting.
create or replace function public._egg_collection_lock()
returns trigger
language plpgsql
as $$
begin
  -- Generated columns are not yet computed in a BEFORE trigger, so skip them.
  if (to_jsonb(new) - array['status','void_reason','voided_at','voided_by','notes','total_eggs','saleable_eggs'])
     is distinct from (to_jsonb(old) - array['status','void_reason','voided_at','voided_by','notes','total_eggs','saleable_eggs']) then
    raise exception 'Posted egg collections cannot be edited; void the record and enter it again'
      using errcode = '42501';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'A void record cannot be re-activated';
  end if;
  return new;
end;
$$;
create trigger egg_collections_lock before update on public.egg_collections
  for each row execute function public._egg_collection_lock();

create or replace function public.void_egg_collection(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_perm('production', 'delete');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  update public.egg_collections
     set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = p_id and status = 'posted';
  if not found then raise exception 'Collection not found or already void'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Damages, adjustments, opening stock and transfers
-- -----------------------------------------------------------------------------
create table public.egg_damages (
  id               uuid primary key default gen_random_uuid(),
  damage_date      date not null,
  farm_id          uuid not null references public.farms(id) on delete restrict,
  grade_id         uuid not null references public.egg_grades(id) on delete restrict,
  quantity         int not null check (quantity > 0),
  source           text not null default 'handling' check (source in ('handling','transport','storage','return','other')),
  affects_stock    boolean not null default true,
  sales_return_id  uuid,
  reason           text,
  status           text not null default 'posted' check (status in ('posted','void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index egg_damages_date_idx on public.egg_damages(damage_date);

create or replace function public._egg_damage_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.damage_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
    if new.affects_stock then
      perform public._egg_stock_move(new.farm_id, new.grade_id, -new.quantity, 'damage', new.damage_date,
        'egg_damage', new.id, new.reason);
    end if;
  elsif old.status = 'posted' and new.status = 'void' and new.affects_stock then
    perform public._egg_stock_move(new.farm_id, new.grade_id, new.quantity, 'damage_void', public.app_today(),
      'egg_damage', new.id, new.void_reason);
  end if;
  return new;
end;
$$;
create trigger egg_damages_after after insert or update of status on public.egg_damages
  for each row execute function public._egg_damage_after();

create table public.egg_stock_adjustments (
  id               uuid primary key default gen_random_uuid(),
  adjustment_date  date not null,
  farm_id          uuid not null references public.farms(id) on delete restrict,
  grade_id         uuid not null references public.egg_grades(id) on delete restrict,
  adjustment_type  text not null check (adjustment_type in ('opening','increase','decrease')),
  quantity         int not null check (quantity > 0),
  reason           text not null check (length(trim(reason)) > 0),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index egg_adjustments_date_idx on public.egg_stock_adjustments(adjustment_date);

create or replace function public._egg_adjustment_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.adjustment_type = 'opening' then
    if exists (select 1 from public.egg_stock_movements
                where farm_id = new.farm_id and grade_id = new.grade_id) then
      raise exception 'Opening stock can only be entered before any other movement for this grade and location'
        using errcode = '23514';
    end if;
    perform public._egg_stock_move(new.farm_id, new.grade_id, new.quantity, 'opening', new.adjustment_date,
      'egg_adjustment', new.id, new.reason);
  elsif new.adjustment_type = 'increase' then
    perform public._egg_stock_move(new.farm_id, new.grade_id, new.quantity, 'adjustment_in', new.adjustment_date,
      'egg_adjustment', new.id, new.reason);
  else
    perform public._egg_stock_move(new.farm_id, new.grade_id, -new.quantity, 'adjustment_out', new.adjustment_date,
      'egg_adjustment', new.id, new.reason);
  end if;
  return new;
end;
$$;
create trigger egg_adjustments_after after insert on public.egg_stock_adjustments
  for each row execute function public._egg_adjustment_after();
create trigger egg_adjustments_immutable before update or delete on public.egg_stock_adjustments
  for each row execute function public.forbid_mutation();

create table public.egg_stock_transfers (
  id             uuid primary key default gen_random_uuid(),
  transfer_date  date not null,
  from_farm_id   uuid not null references public.farms(id) on delete restrict,
  to_farm_id     uuid not null references public.farms(id) on delete restrict,
  grade_id       uuid not null references public.egg_grades(id) on delete restrict,
  quantity       int not null check (quantity > 0),
  notes          text,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (from_farm_id <> to_farm_id)
);

create or replace function public._egg_transfer_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lock in a deterministic order to avoid deadlocks between opposite transfers.
  if new.from_farm_id < new.to_farm_id then
    perform public._egg_stock_move(new.from_farm_id, new.grade_id, -new.quantity, 'transfer_out', new.transfer_date, 'egg_transfer', new.id, new.notes);
    perform public._egg_stock_move(new.to_farm_id, new.grade_id, new.quantity, 'transfer_in', new.transfer_date, 'egg_transfer', new.id, new.notes);
  else
    perform public._egg_stock_move(new.to_farm_id, new.grade_id, new.quantity, 'transfer_in', new.transfer_date, 'egg_transfer', new.id, new.notes);
    perform public._egg_stock_move(new.from_farm_id, new.grade_id, -new.quantity, 'transfer_out', new.transfer_date, 'egg_transfer', new.id, new.notes);
  end if;
  return new;
end;
$$;
create trigger egg_transfers_after after insert on public.egg_stock_transfers
  for each row execute function public._egg_transfer_after();
create trigger egg_transfers_immutable before update or delete on public.egg_stock_transfers
  for each row execute function public.forbid_mutation();

-- -----------------------------------------------------------------------------
-- Packaging material inventory (empty trays, cartons, fillers ...)
-- -----------------------------------------------------------------------------
create table public.packaging_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  packaging_code text references public.packaging_types(code),
  unit          text not null default 'pcs',
  current_stock int not null default 0,
  reorder_level int not null default 0 check (reorder_level >= 0),
  unit_cost     numeric(12,2) not null default 0 check (unit_cost >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger packaging_items_updated_at before update on public.packaging_items for each row execute function public.set_updated_at();

create table public.packaging_movements (
  id               uuid primary key default gen_random_uuid(),
  movement_date    date not null,
  item_id          uuid not null references public.packaging_items(id) on delete restrict,
  movement_type    text not null check (movement_type in ('opening','purchase','usage','damage','adjustment_in','adjustment_out')),
  quantity         int not null check (quantity > 0),
  unit_cost        numeric(12,2) not null default 0 check (unit_cost >= 0),
  total_amount     numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  supplier_id      uuid references public.suppliers(id),
  invoice_no       text,
  paid_amount      numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_method   text,
  cash_account_id  uuid references public.cash_accounts(id),
  notes            text,
  status           text not null default 'posted' check (status in ('posted','void')),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (movement_type <> 'purchase' or supplier_id is not null)
);
create index packaging_movements_item_idx on public.packaging_movements(item_id, movement_date);

create or replace function public._packaging_movement_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
  v_delta int;
begin
  if new.movement_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  v_delta := case when new.movement_type in ('opening','purchase','adjustment_in') then new.quantity else -new.quantity end;
  select current_stock into v_stock from public.packaging_items where id = new.item_id for update;
  if v_stock + v_delta < 0 then
    raise exception 'Insufficient packaging stock: % available, % required', v_stock, new.quantity using errcode = 'P0001';
  end if;
  update public.packaging_items
     set current_stock = current_stock + v_delta,
         unit_cost = case when new.movement_type = 'purchase' and new.unit_cost > 0 then new.unit_cost else unit_cost end
   where id = new.item_id;
  if new.movement_type = 'purchase' and new.paid_amount > 0 then
    if new.paid_amount > round(new.quantity * new.unit_cost, 2) then raise exception 'Paid amount cannot exceed the total'; end if;
    perform public._post_document_payment('packaging_purchase', new.id, 'supplier', null, new.supplier_id, 'out',
      new.paid_amount, new.payment_method, new.cash_account_id, new.movement_date, 'Initial payment');
  end if;
  return new;
end;
$$;
create trigger packaging_movements_after after insert on public.packaging_movements
  for each row execute function public._packaging_movement_after();

-- -----------------------------------------------------------------------------
-- Egg purchases
-- -----------------------------------------------------------------------------
create table public.egg_purchases (
  id                  uuid primary key default gen_random_uuid(),
  purchase_no         text not null unique,
  supplier_invoice_no text,
  supplier_id         uuid not null references public.suppliers(id) on delete restrict,
  farm_id             uuid not null references public.farms(id) on delete restrict,
  purchase_date       date not null,
  status              text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  subtotal            numeric(14,2) not null default 0 check (subtotal >= 0),
  discount            numeric(14,2) not null default 0 check (discount >= 0),
  additional_charges  numeric(14,2) not null default 0 check (additional_charges >= 0),
  total_amount        numeric(14,2) not null default 0 check (total_amount >= 0),
  returned_amount     numeric(14,2) not null default 0 check (returned_amount >= 0),
  paid_amount         numeric(14,2) not null default 0,
  balance_due         numeric(14,2) generated always as (total_amount - returned_amount - paid_amount) stored,
  notes               text,
  confirmed_at        timestamptz,
  confirmed_by        uuid references public.profiles(id),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles(id),
  cancel_reason       text,
  created_by          uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (discount <= subtotal + additional_charges)
);
create index egg_purchases_supplier_idx on public.egg_purchases(supplier_id);
create index egg_purchases_date_idx on public.egg_purchases(purchase_date);
create index egg_purchases_status_idx on public.egg_purchases(status);
create unique index egg_purchases_supplier_invoice_uniq
  on public.egg_purchases(supplier_id, supplier_invoice_no)
  where supplier_invoice_no is not null and status <> 'cancelled';
create trigger egg_purchases_updated_at before update on public.egg_purchases for each row execute function public.set_updated_at();

create table public.egg_purchase_items (
  id              uuid primary key default gen_random_uuid(),
  purchase_id     uuid not null references public.egg_purchases(id) on delete cascade,
  grade_id        uuid not null references public.egg_grades(id) on delete restrict,
  unit_code       text not null references public.packaging_types(code),
  unit_qty        numeric(12,3) not null check (unit_qty > 0),
  eggs_per_unit   int not null check (eggs_per_unit > 0),
  quantity_eggs   int not null check (quantity_eggs > 0),
  rate            numeric(12,2) not null check (rate >= 0),
  line_total      numeric(14,2) not null check (line_total >= 0),
  returned_eggs   int not null default 0 check (returned_eggs >= 0 and returned_eggs <= quantity_eggs)
);
create index egg_purchase_items_purchase_idx on public.egg_purchase_items(purchase_id);

-- -----------------------------------------------------------------------------
-- Egg sales
-- -----------------------------------------------------------------------------
create table public.egg_sales (
  id                  uuid primary key default gen_random_uuid(),
  invoice_no          text not null unique,
  customer_id         uuid references public.customers(id) on delete restrict,
  walk_in_name        text,
  walk_in_phone       text,
  farm_id             uuid not null references public.farms(id) on delete restrict,
  sale_date           date not null,
  status              text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  subtotal            numeric(14,2) not null default 0 check (subtotal >= 0),
  discount            numeric(14,2) not null default 0 check (discount >= 0),
  additional_charges  numeric(14,2) not null default 0 check (additional_charges >= 0),
  tax_rate            numeric(5,2) not null default 0 check (tax_rate >= 0),
  tax_amount          numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount        numeric(14,2) not null default 0 check (total_amount >= 0),
  returned_amount     numeric(14,2) not null default 0 check (returned_amount >= 0),
  paid_amount         numeric(14,2) not null default 0,
  balance_due         numeric(14,2) generated always as (total_amount - returned_amount - paid_amount) stored,
  notes               text,
  confirmed_at        timestamptz,
  confirmed_by        uuid references public.profiles(id),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles(id),
  cancel_reason       text,
  created_by          uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (discount <= subtotal),
  check (customer_id is not null or coalesce(trim(walk_in_name), '') <> '')
);
create index egg_sales_customer_idx on public.egg_sales(customer_id);
create index egg_sales_date_idx on public.egg_sales(sale_date);
create index egg_sales_status_idx on public.egg_sales(status);
create trigger egg_sales_updated_at before update on public.egg_sales for each row execute function public.set_updated_at();

create table public.egg_sale_items (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.egg_sales(id) on delete cascade,
  grade_id        uuid not null references public.egg_grades(id) on delete restrict,
  unit_code       text not null references public.packaging_types(code),
  unit_qty        numeric(12,3) not null check (unit_qty > 0),
  eggs_per_unit   int not null check (eggs_per_unit > 0),
  quantity_eggs   int not null check (quantity_eggs > 0),
  unit_price      numeric(12,2) not null check (unit_price >= 0),
  line_total      numeric(14,2) not null check (line_total >= 0),
  returned_eggs   int not null default 0 check (returned_eggs >= 0 and returned_eggs <= quantity_eggs)
);
create index egg_sale_items_sale_idx on public.egg_sale_items(sale_id);
create index egg_sale_items_grade_idx on public.egg_sale_items(grade_id);

create table public.sales_returns (
  id                uuid primary key default gen_random_uuid(),
  return_no         text not null unique,
  sale_id           uuid not null references public.egg_sales(id) on delete restrict,
  customer_id       uuid references public.customers(id),
  return_date       date not null,
  reason            text,
  subtotal_amount   numeric(14,2) not null default 0,
  tax_amount        numeric(14,2) not null default 0,
  total_amount      numeric(14,2) not null check (total_amount >= 0),
  refund_amount     numeric(14,2) not null default 0 check (refund_amount >= 0),
  status            text not null default 'posted' check (status in ('posted')),
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index sales_returns_sale_idx on public.sales_returns(sale_id);
create index sales_returns_date_idx on public.sales_returns(return_date);

create table public.sales_return_items (
  id             uuid primary key default gen_random_uuid(),
  return_id      uuid not null references public.sales_returns(id) on delete cascade,
  sale_item_id   uuid not null references public.egg_sale_items(id) on delete restrict,
  grade_id       uuid not null references public.egg_grades(id),
  quantity_eggs  int not null check (quantity_eggs > 0),
  condition      text not null default 'good' check (condition in ('good','damaged')),
  amount         numeric(14,2) not null check (amount >= 0)
);

create table public.purchase_returns (
  id              uuid primary key default gen_random_uuid(),
  return_no       text not null unique,
  purchase_id     uuid not null references public.egg_purchases(id) on delete restrict,
  supplier_id     uuid not null references public.suppliers(id),
  return_date     date not null,
  reason          text,
  total_amount    numeric(14,2) not null check (total_amount >= 0),
  refund_amount   numeric(14,2) not null default 0 check (refund_amount >= 0),
  status          text not null default 'posted' check (status in ('posted')),
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index purchase_returns_purchase_idx on public.purchase_returns(purchase_id);

create table public.purchase_return_items (
  id                uuid primary key default gen_random_uuid(),
  return_id         uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_item_id  uuid not null references public.egg_purchase_items(id) on delete restrict,
  grade_id          uuid not null references public.egg_grades(id),
  quantity_eggs     int not null check (quantity_eggs > 0),
  amount            numeric(14,2) not null check (amount >= 0)
);

-- Returns are immutable history. The header totals are written once, by the
-- creating RPC, under a transaction-local internal flag.
create or replace function public.forbid_mutation_unless_internal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_setting('gb.internal', true) = 'on' then
    return new;
  end if;
  raise exception '% rows are immutable', tg_table_name using errcode = '42501';
end;
$$;
create trigger sales_returns_immutable before update or delete on public.sales_returns for each row execute function public.forbid_mutation_unless_internal();
create trigger sales_return_items_immutable before update or delete on public.sales_return_items for each row execute function public.forbid_mutation();
create trigger purchase_returns_immutable before update or delete on public.purchase_returns for each row execute function public.forbid_mutation_unless_internal();
create trigger purchase_return_items_immutable before update or delete on public.purchase_return_items for each row execute function public.forbid_mutation();

-- -----------------------------------------------------------------------------
-- Purchase RPCs
-- -----------------------------------------------------------------------------
create or replace function public._confirm_egg_purchase(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.egg_purchases%rowtype;
  r   record;
begin
  select * into v_p from public.egg_purchases where id = p_id for update;
  if v_p.status <> 'draft' then
    raise exception 'Only draft purchases can be confirmed (current status: %)', v_p.status;
  end if;
  for r in
    select grade_id, sum(quantity_eggs)::int as qty
      from public.egg_purchase_items where purchase_id = p_id
     group by grade_id order by grade_id
  loop
    perform public._egg_stock_move(v_p.farm_id, r.grade_id, r.qty, 'purchase', v_p.purchase_date,
      'egg_purchase', p_id, v_p.purchase_no);
  end loop;
  update public.egg_purchases
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_id;
end;
$$;

-- Create or update (draft only) a purchase invoice. Payload:
-- { id?, supplier_id, farm_id, purchase_date, supplier_invoice_no?, discount?,
--   additional_charges?, notes?, confirm: bool, paid_amount?, payment_method?,
--   cash_account_id?, items: [{ grade_id, unit_code, unit_qty, rate }] }
create or replace function public.save_egg_purchase(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid := nullif(p ->> 'id', '')::uuid;
  v_item      jsonb;
  v_eggs      int;
  v_per       int;
  v_line      numeric(14,2);
  v_subtotal  numeric(14,2) := 0;
  v_discount  numeric(14,2) := coalesce((p ->> 'discount')::numeric, 0);
  v_charges   numeric(14,2) := coalesce((p ->> 'additional_charges')::numeric, 0);
  v_total     numeric(14,2);
  v_paid      numeric(14,2) := coalesce((p ->> 'paid_amount')::numeric, 0);
  v_date      date := (p ->> 'purchase_date')::date;
  v_confirm   boolean := coalesce((p ->> 'confirm')::boolean, false);
  v_status    text;
begin
  perform public.require_perm('purchases', case when v_id is null then 'create' else 'edit' end);

  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'At least one item is required';
  end if;
  if v_date is null or v_date > public.app_today() then
    raise exception 'A valid purchase date (not in the future) is required';
  end if;
  if v_discount < 0 or v_charges < 0 or v_paid < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if v_paid > 0 and not v_confirm then
    raise exception 'Payments can only be recorded against a confirmed purchase';
  end if;

  if v_id is null then
    insert into public.egg_purchases (purchase_no, supplier_id, farm_id, purchase_date, supplier_invoice_no, notes)
    values (public._next_document_number('egg_purchase'), (p ->> 'supplier_id')::uuid, (p ->> 'farm_id')::uuid, v_date,
            nullif(trim(p ->> 'supplier_invoice_no'), ''), nullif(p ->> 'notes', ''))
    returning id into v_id;
  else
    select status into v_status from public.egg_purchases where id = v_id for update;
    if v_status is null then raise exception 'Purchase not found'; end if;
    if v_status <> 'draft' then raise exception 'Only draft purchases can be edited'; end if;
    update public.egg_purchases
       set supplier_id = (p ->> 'supplier_id')::uuid, farm_id = (p ->> 'farm_id')::uuid, purchase_date = v_date,
           supplier_invoice_no = nullif(trim(p ->> 'supplier_invoice_no'), ''), notes = nullif(p ->> 'notes', '')
     where id = v_id;
    delete from public.egg_purchase_items where purchase_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_eggs := public._eggs_for_unit(v_item ->> 'unit_code', (v_item ->> 'unit_qty')::numeric);
    select eggs_per_unit into v_per from public.packaging_types where code = v_item ->> 'unit_code';
    if (v_item ->> 'rate')::numeric < 0 then raise exception 'Rate cannot be negative'; end if;
    v_line := round((v_item ->> 'unit_qty')::numeric * (v_item ->> 'rate')::numeric, 2);
    v_subtotal := v_subtotal + v_line;
    insert into public.egg_purchase_items (purchase_id, grade_id, unit_code, unit_qty, eggs_per_unit, quantity_eggs, rate, line_total)
    values (v_id, (v_item ->> 'grade_id')::uuid, v_item ->> 'unit_code', (v_item ->> 'unit_qty')::numeric, v_per, v_eggs,
            (v_item ->> 'rate')::numeric, v_line);
  end loop;

  v_total := v_subtotal - v_discount + v_charges;
  if v_total < 0 then raise exception 'Discount cannot exceed the invoice amount'; end if;
  if v_paid > v_total then raise exception 'Paid amount cannot exceed the invoice total'; end if;

  update public.egg_purchases
     set subtotal = v_subtotal, discount = v_discount, additional_charges = v_charges, total_amount = v_total
   where id = v_id;

  if v_confirm then
    perform public._confirm_egg_purchase(v_id);
    if v_paid > 0 then
      perform public._post_document_payment('egg_purchase', v_id, 'supplier', null, (p ->> 'supplier_id')::uuid, 'out',
        v_paid, p ->> 'payment_method', nullif(p ->> 'cash_account_id', '')::uuid, v_date, 'Payment with purchase');
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.confirm_egg_purchase(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_perm('purchases', 'edit');
  perform public._confirm_egg_purchase(p_id);
end;
$$;

create or replace function public.cancel_egg_purchase(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.egg_purchases%rowtype;
  r   record;
begin
  perform public.require_perm('purchases', 'delete');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A cancellation reason is required'; end if;
  select * into v_p from public.egg_purchases where id = p_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if v_p.status = 'cancelled' then raise exception 'Purchase is already cancelled'; end if;
  if exists (select 1 from public.purchase_returns where purchase_id = p_id) then
    raise exception 'This purchase has returns recorded against it and cannot be cancelled';
  end if;

  if v_p.status = 'confirmed' then
    for r in
      select grade_id, sum(quantity_eggs)::int as qty from public.egg_purchase_items
       where purchase_id = p_id group by grade_id order by grade_id
    loop
      perform public._egg_stock_move(v_p.farm_id, r.grade_id, -r.qty, 'purchase_cancel', public.app_today(),
        'egg_purchase', p_id, 'Cancelled: ' || p_reason);
    end loop;
    perform public._void_document_payments('egg_purchase', p_id, 'Purchase cancelled: ' || p_reason);
  end if;

  update public.egg_purchases
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
   where id = p_id;
end;
$$;

-- Return eggs to a supplier. Payload:
-- { purchase_id, return_date, reason?, refund_amount?, cash_account_id?, payment_method?,
--   items: [{ purchase_item_id, quantity_eggs }] }
create or replace function public.create_purchase_return(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p       public.egg_purchases%rowtype;
  v_item    jsonb;
  v_pi      public.egg_purchase_items%rowtype;
  v_qty     int;
  v_amount  numeric(14,2);
  v_total   numeric(14,2) := 0;
  v_factor  numeric;
  v_id      uuid;
  v_date    date := (p ->> 'return_date')::date;
  v_refund  numeric(14,2) := coalesce((p ->> 'refund_amount')::numeric, 0);
begin
  perform public.require_perm('purchases', 'edit');
  select * into v_p from public.egg_purchases where id = (p ->> 'purchase_id')::uuid for update;
  if not found or v_p.status <> 'confirmed' then raise exception 'Only confirmed purchases can be returned'; end if;
  if v_date is null or v_date < v_p.purchase_date or v_date > public.app_today() then
    raise exception 'Return date must be between the purchase date and today';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Select at least one item to return';
  end if;

  v_factor := case when v_p.subtotal > 0 then (v_p.subtotal - v_p.discount) / v_p.subtotal else 0 end;

  insert into public.purchase_returns (return_no, purchase_id, supplier_id, return_date, reason, total_amount)
  values (public._next_document_number('purchase_return'), v_p.id, v_p.supplier_id, v_date, nullif(p ->> 'reason', ''), 0)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (v_item ->> 'quantity_eggs')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into v_pi from public.egg_purchase_items
     where id = (v_item ->> 'purchase_item_id')::uuid and purchase_id = v_p.id for update;
    if not found then raise exception 'Invalid purchase item'; end if;
    if v_qty > v_pi.quantity_eggs - v_pi.returned_eggs then
      raise exception 'Cannot return % eggs; only % remain on this line', v_qty, v_pi.quantity_eggs - v_pi.returned_eggs;
    end if;
    v_amount := round(v_pi.line_total / v_pi.quantity_eggs * v_qty * v_factor, 2);
    v_total := v_total + v_amount;
    update public.egg_purchase_items set returned_eggs = returned_eggs + v_qty where id = v_pi.id;
    insert into public.purchase_return_items (return_id, purchase_item_id, grade_id, quantity_eggs, amount)
    values (v_id, v_pi.id, v_pi.grade_id, v_qty, v_amount);
    perform public._egg_stock_move(v_p.farm_id, v_pi.grade_id, -v_qty, 'purchase_return', v_date,
      'purchase_return', v_id, v_p.purchase_no);
  end loop;

  if not exists (select 1 from public.purchase_return_items where return_id = v_id) then
    raise exception 'Nothing to return';
  end if;

  -- purchase_returns is immutable; total is written through a definer-only path.
  perform set_config('gb.internal', 'on', true);
  update public.purchase_returns set total_amount = v_total, refund_amount = v_refund where id = v_id;
  perform set_config('gb.internal', 'off', true);

  update public.egg_purchases set returned_amount = returned_amount + v_total where id = v_p.id;

  if v_refund > 0 then
    -- Refund can only cover money already paid beyond what is now owed.
    if v_refund > greatest(0, -(select balance_due from public.egg_purchases where id = v_p.id)) then
      raise exception 'Refund exceeds the amount overpaid on this purchase';
    end if;
    perform public._post_document_payment('egg_purchase', v_p.id, 'supplier', null, v_p.supplier_id, 'in',
      v_refund, p ->> 'payment_method', nullif(p ->> 'cash_account_id', '')::uuid, v_date, 'Refund for return');
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sale RPCs
-- -----------------------------------------------------------------------------
create or replace function public._confirm_egg_sale(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.egg_sales%rowtype;
  v_limit numeric;
  v_balance numeric;
  r   record;
begin
  select * into v_s from public.egg_sales where id = p_id for update;
  if v_s.status <> 'draft' then
    raise exception 'Only draft invoices can be confirmed (current status: %)', v_s.status;
  end if;
  -- Aggregate per grade and lock rows in a consistent order.
  for r in
    select grade_id, sum(quantity_eggs)::int as qty
      from public.egg_sale_items where sale_id = p_id
     group by grade_id order by grade_id
  loop
    perform public._egg_stock_move(v_s.farm_id, r.grade_id, -r.qty, 'sale', v_s.sale_date,
      'egg_sale', p_id, v_s.invoice_no);
  end loop;

  if v_s.customer_id is not null then
    select credit_limit into v_limit from public.customers where id = v_s.customer_id;
    if v_limit is not null then
      v_balance := public.customer_balance(v_s.customer_id) + v_s.total_amount;
      if v_balance > v_limit and not public.is_admin() then
        raise exception 'Credit limit exceeded: balance would be % (limit %)', v_balance, v_limit;
      end if;
    end if;
  end if;

  update public.egg_sales
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_id;
end;
$$;

-- Create or update (draft only) a sales invoice. Payload:
-- { id?, customer_id?, walk_in_name?, walk_in_phone?, farm_id, sale_date, discount?,
--   additional_charges?, notes?, confirm: bool, paid_amount?, payment_method?,
--   cash_account_id?, items: [{ grade_id, unit_code, unit_qty, unit_price }] }
create or replace function public.save_egg_sale(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid := nullif(p ->> 'id', '')::uuid;
  v_item      jsonb;
  v_eggs      int;
  v_per       int;
  v_line      numeric(14,2);
  v_subtotal  numeric(14,2) := 0;
  v_discount  numeric(14,2) := coalesce((p ->> 'discount')::numeric, 0);
  v_charges   numeric(14,2) := coalesce((p ->> 'additional_charges')::numeric, 0);
  v_tax_rate  numeric(5,2);
  v_tax       numeric(14,2);
  v_total     numeric(14,2);
  v_paid      numeric(14,2) := coalesce((p ->> 'paid_amount')::numeric, 0);
  v_date      date := (p ->> 'sale_date')::date;
  v_confirm   boolean := coalesce((p ->> 'confirm')::boolean, false);
  v_customer  uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_status    text;
begin
  perform public.require_perm('sales', case when v_id is null then 'create' else 'edit' end);

  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'At least one item is required';
  end if;
  if v_date is null or v_date > public.app_today() then
    raise exception 'A valid sale date (not in the future) is required';
  end if;
  if v_discount < 0 or v_charges < 0 or v_paid < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if v_paid > 0 and not v_confirm then
    raise exception 'Payments can only be recorded against a confirmed invoice';
  end if;
  if v_customer is null and coalesce(trim(p ->> 'walk_in_name'), '') = '' then
    raise exception 'Select a customer or enter the walk-in customer name';
  end if;

  select case when tax_enabled then tax_rate else 0 end into v_tax_rate from public.app_settings where id = 1;

  if v_id is null then
    insert into public.egg_sales (invoice_no, customer_id, walk_in_name, walk_in_phone, farm_id, sale_date, tax_rate, notes)
    values (public._next_document_number('egg_sale'), v_customer,
            case when v_customer is null then nullif(trim(p ->> 'walk_in_name'), '') end,
            case when v_customer is null then nullif(trim(p ->> 'walk_in_phone'), '') end,
            (p ->> 'farm_id')::uuid, v_date, v_tax_rate, nullif(p ->> 'notes', ''))
    returning id into v_id;
  else
    select status into v_status from public.egg_sales where id = v_id for update;
    if v_status is null then raise exception 'Invoice not found'; end if;
    if v_status <> 'draft' then raise exception 'Only draft invoices can be edited'; end if;
    update public.egg_sales
       set customer_id = v_customer,
           walk_in_name = case when v_customer is null then nullif(trim(p ->> 'walk_in_name'), '') end,
           walk_in_phone = case when v_customer is null then nullif(trim(p ->> 'walk_in_phone'), '') end,
           farm_id = (p ->> 'farm_id')::uuid, sale_date = v_date, tax_rate = v_tax_rate, notes = nullif(p ->> 'notes', '')
     where id = v_id;
    delete from public.egg_sale_items where sale_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_eggs := public._eggs_for_unit(v_item ->> 'unit_code', (v_item ->> 'unit_qty')::numeric);
    select eggs_per_unit into v_per from public.packaging_types where code = v_item ->> 'unit_code';
    if (v_item ->> 'unit_price')::numeric < 0 then raise exception 'Price cannot be negative'; end if;
    v_line := round((v_item ->> 'unit_qty')::numeric * (v_item ->> 'unit_price')::numeric, 2);
    v_subtotal := v_subtotal + v_line;
    insert into public.egg_sale_items (sale_id, grade_id, unit_code, unit_qty, eggs_per_unit, quantity_eggs, unit_price, line_total)
    values (v_id, (v_item ->> 'grade_id')::uuid, v_item ->> 'unit_code', (v_item ->> 'unit_qty')::numeric, v_per, v_eggs,
            (v_item ->> 'unit_price')::numeric, v_line);
  end loop;

  if v_discount > v_subtotal then raise exception 'Discount cannot exceed the subtotal'; end if;
  v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_total := v_subtotal - v_discount + v_tax + v_charges;
  if v_paid > v_total then raise exception 'Paid amount cannot exceed the invoice total'; end if;
  if v_confirm and v_customer is null and v_paid < v_total then
    raise exception 'Walk-in sales must be paid in full. Select a registered customer for credit sales';
  end if;

  update public.egg_sales
     set subtotal = v_subtotal, discount = v_discount, additional_charges = v_charges, tax_amount = v_tax, total_amount = v_total
   where id = v_id;

  if v_confirm then
    perform public._confirm_egg_sale(v_id);
    if v_paid > 0 then
      perform public._post_document_payment('egg_sale', v_id, 'customer', v_customer, null, 'in',
        v_paid, p ->> 'payment_method', nullif(p ->> 'cash_account_id', '')::uuid, v_date, 'Payment with invoice');
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.confirm_egg_sale(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.egg_sales%rowtype;
begin
  perform public.require_perm('sales', 'edit');
  select * into v_s from public.egg_sales where id = p_id;
  if v_s.customer_id is null then
    raise exception 'Walk-in drafts must be confirmed together with full payment from the invoice form';
  end if;
  perform public._confirm_egg_sale(p_id);
end;
$$;

create or replace function public.delete_draft(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'sale' then
    perform public.require_perm('sales', 'edit');
    delete from public.egg_sales where id = p_id and status = 'draft';
  elsif p_kind = 'purchase' then
    perform public.require_perm('purchases', 'edit');
    delete from public.egg_purchases where id = p_id and status = 'draft';
  else
    raise exception 'Unknown document kind %', p_kind;
  end if;
  if not found then raise exception 'Only draft documents can be deleted'; end if;
end;
$$;

create or replace function public.cancel_egg_sale(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.egg_sales%rowtype;
  r   record;
begin
  perform public.require_perm('sales', 'delete');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A cancellation reason is required'; end if;
  select * into v_s from public.egg_sales where id = p_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_s.status = 'cancelled' then raise exception 'Invoice is already cancelled'; end if;
  if exists (select 1 from public.sales_returns where sale_id = p_id) then
    raise exception 'This invoice has returns recorded against it and cannot be cancelled';
  end if;

  if v_s.status = 'confirmed' then
    for r in
      select grade_id, sum(quantity_eggs)::int as qty from public.egg_sale_items
       where sale_id = p_id group by grade_id order by grade_id
    loop
      perform public._egg_stock_move(v_s.farm_id, r.grade_id, r.qty, 'sale_cancel', public.app_today(),
        'egg_sale', p_id, 'Cancelled: ' || p_reason);
    end loop;
    perform public._void_document_payments('egg_sale', p_id, 'Invoice cancelled: ' || p_reason);
  end if;

  update public.egg_sales
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
   where id = p_id;
end;
$$;

-- Customer return against an invoice. Payload:
-- { sale_id, return_date, reason?, refund_amount?, cash_account_id?, payment_method?,
--   items: [{ sale_item_id, quantity_eggs, condition: 'good'|'damaged' }] }
-- Good eggs go back into stock; damaged eggs are written off as a loss.
create or replace function public.create_sales_return(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s        public.egg_sales%rowtype;
  v_item     jsonb;
  v_si       public.egg_sale_items%rowtype;
  v_qty      int;
  v_cond     text;
  v_net      numeric(14,2);
  v_tax      numeric(14,2);
  v_sub_tot  numeric(14,2) := 0;
  v_tax_tot  numeric(14,2) := 0;
  v_total    numeric(14,2);
  v_factor   numeric;
  v_id       uuid;
  v_date     date := (p ->> 'return_date')::date;
  v_refund   numeric(14,2) := coalesce((p ->> 'refund_amount')::numeric, 0);
  v_overpaid numeric(14,2);
begin
  perform public.require_perm('sales', 'edit');
  select * into v_s from public.egg_sales where id = (p ->> 'sale_id')::uuid for update;
  if not found or v_s.status <> 'confirmed' then raise exception 'Only confirmed invoices can be returned'; end if;
  if v_date is null or v_date < v_s.sale_date or v_date > public.app_today() then
    raise exception 'Return date must be between the invoice date and today';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Select at least one item to return';
  end if;

  -- Each egg is refunded at its share of the invoice after discount (delivery
  -- / additional charges are not refundable), plus its share of tax.
  v_factor := case when v_s.subtotal > 0 then (v_s.subtotal - v_s.discount) / v_s.subtotal else 0 end;

  insert into public.sales_returns (return_no, sale_id, customer_id, return_date, reason, total_amount)
  values (public._next_document_number('sales_return'), v_s.id, v_s.customer_id, v_date, nullif(p ->> 'reason', ''), 0)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (v_item ->> 'quantity_eggs')::int;
    v_cond := coalesce(v_item ->> 'condition', 'good');
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into v_si from public.egg_sale_items
     where id = (v_item ->> 'sale_item_id')::uuid and sale_id = v_s.id for update;
    if not found then raise exception 'Invalid invoice item'; end if;
    if v_qty > v_si.quantity_eggs - v_si.returned_eggs then
      raise exception 'Cannot return % eggs; only % remain on this line', v_qty, v_si.quantity_eggs - v_si.returned_eggs;
    end if;
    v_net := round(v_si.line_total / v_si.quantity_eggs * v_qty * v_factor, 2);
    v_tax := round(v_net * v_s.tax_rate / 100, 2);
    v_sub_tot := v_sub_tot + v_net;
    v_tax_tot := v_tax_tot + v_tax;
    update public.egg_sale_items set returned_eggs = returned_eggs + v_qty where id = v_si.id;
    insert into public.sales_return_items (return_id, sale_item_id, grade_id, quantity_eggs, condition, amount)
    values (v_id, v_si.id, v_si.grade_id, v_qty, v_cond, v_net + v_tax);
    if v_cond = 'good' then
      perform public._egg_stock_move(v_s.farm_id, v_si.grade_id, v_qty, 'sale_return', v_date,
        'sales_return', v_id, v_s.invoice_no);
    else
      insert into public.egg_damages (damage_date, farm_id, grade_id, quantity, source, affects_stock, sales_return_id, reason)
      values (v_date, v_s.farm_id, v_si.grade_id, v_qty, 'return', false, v_id, 'Damaged customer return ' || v_s.invoice_no);
    end if;
  end loop;

  v_total := v_sub_tot + v_tax_tot;
  if not exists (select 1 from public.sales_return_items where return_id = v_id) then
    raise exception 'Nothing to return';
  end if;

  update public.egg_sales set returned_amount = returned_amount + v_total where id = v_s.id;
  v_overpaid := greatest(0, -(select balance_due from public.egg_sales where id = v_s.id));

  -- Walk-in customers have no account to hold a credit, so refund automatically.
  if v_s.customer_id is null then
    v_refund := v_overpaid;
  end if;
  if v_refund > v_overpaid then
    raise exception 'Refund (%) exceeds the amount overpaid on this invoice (%)', v_refund, v_overpaid;
  end if;

  perform set_config('gb.internal', 'on', true);
  update public.sales_returns
     set subtotal_amount = v_sub_tot, tax_amount = v_tax_tot, total_amount = v_total, refund_amount = v_refund
   where id = v_id;
  perform set_config('gb.internal', 'off', true);

  if v_refund > 0 then
    perform public._post_document_payment('egg_sale', v_s.id, 'customer', v_s.customer_id, null, 'out',
      v_refund, p ->> 'payment_method', nullif(p ->> 'cash_account_id', '')::uuid, v_date, 'Refund for return');
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------
create or replace view public.v_egg_stock
with (security_invoker = true)
as
select
  i.farm_id, f.name as farm_name, i.grade_id, g.code as grade_code, g.name as grade_name,
  g.egg_size, g.grade_class, g.is_saleable, g.reorder_level, g.default_price, g.sort_order,
  i.quantity,
  (select eggs_per_unit from public.packaging_types where code = 'tray') as tray_capacity,
  i.quantity / nullif((select eggs_per_unit from public.packaging_types where code = 'tray'), 0) as trays,
  i.quantity % nullif((select eggs_per_unit from public.packaging_types where code = 'tray'), 0) as loose_eggs,
  (i.quantity <= g.reorder_level) as is_low,
  i.updated_at
from public.egg_inventory i
join public.farms f on f.id = i.farm_id
join public.egg_grades g on g.id = i.grade_id;

select public._enable_audit('public.egg_collections');
select public._enable_audit('public.egg_damages');
select public._enable_audit('public.egg_stock_adjustments');
select public._enable_audit('public.egg_stock_transfers');
select public._enable_audit('public.packaging_items');
select public._enable_audit('public.packaging_movements');
select public._enable_audit('public.egg_purchases');
select public._enable_audit('public.egg_purchase_items');
select public._enable_audit('public.egg_sales');
select public._enable_audit('public.egg_sale_items');
select public._enable_audit('public.sales_returns');
select public._enable_audit('public.purchase_returns');
