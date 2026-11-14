-- =============================================================================
-- GB Eggs ERP — 0005 Feed & medicine inventory
-- Feed uses a weighted-average unit cost. Medicines are stocked per batch
-- (batch number + expiry) and issued first-expiry-first-out when no batch is
-- chosen. Stock columns are maintained only by triggers.
-- =============================================================================

-- Blocks direct edits to trigger-maintained columns.
create or replace function public._guard_internal_columns()
returns trigger
language plpgsql
as $$
declare
  v_cols text[] := tg_argv;
  c text;
begin
  if current_setting('gb.internal', true) = 'on' then
    return new;
  end if;
  foreach c in array v_cols loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'Column % is maintained automatically and cannot be edited', c using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public._internal(p_on boolean)
returns void
language sql
as $$
  select set_config('gb.internal', case when p_on then 'on' else 'off' end, true);
$$;

-- -----------------------------------------------------------------------------
-- Feed
-- -----------------------------------------------------------------------------
create table public.feed_inventory (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  category_id    uuid references public.feed_categories(id) on delete restrict,
  unit           text not null default 'kg' check (unit in ('kg','bag','ton')),
  opening_stock  numeric(14,3) not null default 0 check (opening_stock >= 0),
  opening_cost   numeric(12,4) not null default 0 check (opening_cost >= 0),
  current_stock  numeric(14,3) not null default 0,
  avg_unit_cost  numeric(12,4) not null default 0,
  reorder_level  numeric(14,3) not null default 0 check (reorder_level >= 0),
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger feed_inventory_updated_at before update on public.feed_inventory for each row execute function public.set_updated_at();
create trigger feed_inventory_guard before update on public.feed_inventory
  for each row execute function public._guard_internal_columns('current_stock', 'avg_unit_cost', 'opening_stock', 'opening_cost');

create or replace function public._feed_inventory_init()
returns trigger
language plpgsql
as $$
begin
  new.current_stock := new.opening_stock;
  new.avg_unit_cost := new.opening_cost;
  return new;
end;
$$;
create trigger feed_inventory_init before insert on public.feed_inventory for each row execute function public._feed_inventory_init();

create table public.feed_purchases (
  id               uuid primary key default gen_random_uuid(),
  purchase_date    date not null,
  supplier_id      uuid not null references public.suppliers(id) on delete restrict,
  feed_id          uuid not null references public.feed_inventory(id) on delete restrict,
  invoice_no       text,
  quantity         numeric(14,3) not null check (quantity > 0),
  unit_cost        numeric(12,2) not null check (unit_cost >= 0),
  total_amount     numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  paid_amount      numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_method   text,
  cash_account_id  uuid references public.cash_accounts(id),
  status           text not null default 'posted' check (status in ('posted','void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  notes            text,
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index feed_purchases_date_idx on public.feed_purchases(purchase_date);
create index feed_purchases_supplier_idx on public.feed_purchases(supplier_id);

create or replace function public._feed_purchase_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feed public.feed_inventory%rowtype;
  v_total numeric(14,2) := round(new.quantity * new.unit_cost, 2);
begin
  if new.purchase_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  if new.paid_amount > v_total then raise exception 'Paid amount cannot exceed the total'; end if;
  select * into v_feed from public.feed_inventory where id = new.feed_id for update;
  perform public._internal(true);
  update public.feed_inventory
     set avg_unit_cost = case
           when v_feed.current_stock <= 0 then new.unit_cost
           else round((v_feed.current_stock * v_feed.avg_unit_cost + new.quantity * new.unit_cost)
                      / (v_feed.current_stock + new.quantity), 4)
         end,
         current_stock = current_stock + new.quantity
   where id = new.feed_id;
  perform public._internal(false);
  if new.paid_amount > 0 then
    perform public._post_document_payment('feed_purchase', new.id, 'supplier', null, new.supplier_id, 'out',
      new.paid_amount, new.payment_method, new.cash_account_id, new.purchase_date, 'Initial payment');
  end if;
  return new;
end;
$$;
create trigger feed_purchases_after after insert on public.feed_purchases for each row execute function public._feed_purchase_after();

create table public.feed_consumption (
  id                uuid primary key default gen_random_uuid(),
  consumption_date  date not null,
  farm_id           uuid not null references public.farms(id) on delete restrict,
  shed_id           uuid not null references public.sheds(id) on delete restrict,
  batch_id          uuid references public.chicken_batches(id) on delete restrict,
  feed_id           uuid not null references public.feed_inventory(id) on delete restrict,
  quantity          numeric(14,3) not null check (quantity > 0),
  unit_cost         numeric(12,4) not null default 0,
  total_cost        numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  notes             text,
  status            text not null default 'posted' check (status in ('posted','void')),
  void_reason       text,
  voided_at         timestamptz,
  voided_by         uuid references public.profiles(id),
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index feed_consumption_date_idx on public.feed_consumption(consumption_date);
create index feed_consumption_shed_idx on public.feed_consumption(shed_id, consumption_date);

create or replace function public._feed_consumption_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feed public.feed_inventory%rowtype;
begin
  if new.consumption_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  if not exists (select 1 from public.sheds where id = new.shed_id and farm_id = new.farm_id) then
    raise exception 'Shed does not belong to the selected farm';
  end if;
  select * into v_feed from public.feed_inventory where id = new.feed_id for update;
  if v_feed.current_stock < new.quantity then
    raise exception 'Insufficient feed stock for %: % % available, % required', v_feed.name, v_feed.current_stock, v_feed.unit, new.quantity
      using errcode = 'P0001';
  end if;
  new.unit_cost := v_feed.avg_unit_cost;
  perform public._internal(true);
  update public.feed_inventory set current_stock = current_stock - new.quantity where id = new.feed_id;
  perform public._internal(false);
  return new;
end;
$$;
create trigger feed_consumption_before before insert on public.feed_consumption for each row execute function public._feed_consumption_before();

-- -----------------------------------------------------------------------------
-- Medicines
-- -----------------------------------------------------------------------------
create table public.medicines (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  category       text not null default 'other' check (category in ('vaccine','antibiotic','vitamin','dewormer','disinfectant','supplement','other')),
  unit           text not null default 'ml' check (unit in ('ml','l','g','kg','dose','vial','bottle','sachet','tablet','pcs')),
  manufacturer   text,
  current_stock  numeric(14,3) not null default 0,
  reorder_level  numeric(14,3) not null default 0 check (reorder_level >= 0),
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger medicines_updated_at before update on public.medicines for each row execute function public.set_updated_at();
create trigger medicines_guard before update on public.medicines
  for each row execute function public._guard_internal_columns('current_stock');

create table public.medicine_batches (
  id                uuid primary key default gen_random_uuid(),
  medicine_id       uuid not null references public.medicines(id) on delete restrict,
  batch_no          text not null,
  expiry_date       date,
  quantity_on_hand  numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  unit_cost         numeric(12,2) not null default 0,
  supplier_id       uuid references public.suppliers(id),
  created_at        timestamptz not null default now(),
  unique (medicine_id, batch_no)
);
create index medicine_batches_expiry_idx on public.medicine_batches(expiry_date) where quantity_on_hand > 0;

create table public.medicine_movements (
  id                 uuid primary key default gen_random_uuid(),
  movement_date      date not null,
  medicine_id        uuid not null references public.medicines(id) on delete restrict,
  medicine_batch_id  uuid references public.medicine_batches(id) on delete restrict,
  batch_no           text,
  expiry_date        date,
  movement_type      text not null check (movement_type in ('opening','purchase','usage','adjustment_in','adjustment_out','expired')),
  quantity           numeric(14,3) not null check (quantity > 0),
  unit_cost          numeric(12,2) not null default 0 check (unit_cost >= 0),
  total_amount       numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  supplier_id        uuid references public.suppliers(id),
  chicken_batch_id   uuid references public.chicken_batches(id),
  shed_id            uuid references public.sheds(id),
  invoice_no         text,
  paid_amount        numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_method     text,
  cash_account_id    uuid references public.cash_accounts(id),
  administered_by    text,
  notes              text,
  status             text not null default 'posted' check (status in ('posted','void')),
  void_reason        text,
  voided_at          timestamptz,
  voided_by          uuid references public.profiles(id),
  created_by         uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (movement_type <> 'purchase' or supplier_id is not null)
);
create index medicine_movements_med_idx on public.medicine_movements(medicine_id, movement_date);
create index medicine_movements_batch_idx on public.medicine_movements(chicken_batch_id) where chicken_batch_id is not null;

create or replace function public._medicine_movement_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.medicine_batches%rowtype;
  v_in    boolean := new.movement_type in ('opening','purchase','adjustment_in');
begin
  if new.movement_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;

  if v_in then
    if new.medicine_batch_id is null then
      if coalesce(trim(new.batch_no), '') = '' then
        raise exception 'Batch number is required when receiving medicine';
      end if;
      select * into v_batch from public.medicine_batches
       where medicine_id = new.medicine_id and batch_no = trim(new.batch_no) for update;
      if found then
        if new.expiry_date is not null and v_batch.expiry_date is distinct from new.expiry_date then
          raise exception 'Batch % already exists with expiry %', v_batch.batch_no, v_batch.expiry_date;
        end if;
      else
        insert into public.medicine_batches (medicine_id, batch_no, expiry_date, unit_cost, supplier_id)
        values (new.medicine_id, trim(new.batch_no), new.expiry_date, new.unit_cost, new.supplier_id)
        returning * into v_batch;
      end if;
    else
      select * into v_batch from public.medicine_batches where id = new.medicine_batch_id and medicine_id = new.medicine_id for update;
      if not found then raise exception 'Invalid medicine batch'; end if;
    end if;
    if new.expiry_date is not null and new.expiry_date < new.movement_date and new.movement_type = 'purchase' then
      raise exception 'Cannot purchase medicine that has already expired';
    end if;
    update public.medicine_batches
       set quantity_on_hand = quantity_on_hand + new.quantity,
           unit_cost = case when new.unit_cost > 0 then new.unit_cost else unit_cost end
     where id = v_batch.id;
  else
    if new.medicine_batch_id is null then
      -- First-expiry-first-out
      select * into v_batch from public.medicine_batches
       where medicine_id = new.medicine_id and quantity_on_hand >= new.quantity
         and (new.movement_type = 'expired' or expiry_date is null or expiry_date >= new.movement_date)
       order by expiry_date nulls last, created_at
       limit 1
       for update;
      if not found then
        raise exception 'No single unexpired batch holds % of this medicine; choose a batch or record smaller quantities', new.quantity
          using errcode = 'P0001';
      end if;
    else
      select * into v_batch from public.medicine_batches where id = new.medicine_batch_id and medicine_id = new.medicine_id for update;
      if not found then raise exception 'Invalid medicine batch'; end if;
      if v_batch.quantity_on_hand < new.quantity then
        raise exception 'Batch % has only % in stock', v_batch.batch_no, v_batch.quantity_on_hand using errcode = 'P0001';
      end if;
      if new.movement_type = 'usage' and v_batch.expiry_date is not null and v_batch.expiry_date < new.movement_date then
        raise exception 'Batch % expired on %; it cannot be used', v_batch.batch_no, v_batch.expiry_date;
      end if;
    end if;
    if new.movement_type = 'usage' and new.chicken_batch_id is null and new.shed_id is null then
      raise exception 'Select the chicken batch or shed the medicine was given to';
    end if;
    new.unit_cost := v_batch.unit_cost;
    update public.medicine_batches set quantity_on_hand = quantity_on_hand - new.quantity where id = v_batch.id;
  end if;

  new.medicine_batch_id := v_batch.id;
  new.batch_no := v_batch.batch_no;
  new.expiry_date := v_batch.expiry_date;

  perform public._internal(true);
  update public.medicines
     set current_stock = current_stock + case when v_in then new.quantity else -new.quantity end
   where id = new.medicine_id;
  perform public._internal(false);
  return new;
end;
$$;
create trigger medicine_movements_before before insert on public.medicine_movements
  for each row execute function public._medicine_movement_before();

create or replace function public._medicine_movement_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movement_type = 'purchase' and new.paid_amount > 0 then
    if new.paid_amount > round(new.quantity * new.unit_cost, 2) then raise exception 'Paid amount cannot exceed the total'; end if;
    perform public._post_document_payment('medicine_purchase', new.id, 'supplier', null, new.supplier_id, 'out',
      new.paid_amount, new.payment_method, new.cash_account_id, new.movement_date, 'Initial payment');
  end if;
  return new;
end;
$$;
create trigger medicine_movements_after after insert on public.medicine_movements
  for each row execute function public._medicine_movement_after();

-- -----------------------------------------------------------------------------
-- Voiding stock records
-- -----------------------------------------------------------------------------
create or replace function public.void_stock_record(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fp public.feed_purchases%rowtype;
  v_fc public.feed_consumption%rowtype;
  v_mm public.medicine_movements%rowtype;
  v_stock numeric;
  v_qty numeric;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  if p_kind = 'egg_damage' then
    perform public.require_perm('inventory', 'delete');
    update public.egg_damages set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id and status = 'posted' and source <> 'return';
    if not found then raise exception 'Record not found, already void, or part of a sales return'; end if;

  elsif p_kind = 'feed_purchase' then
    perform public.require_perm('feed', 'delete');
    select * into v_fp from public.feed_purchases where id = p_id and status = 'posted' for update;
    if not found then raise exception 'Record not found or already void'; end if;
    select current_stock into v_stock from public.feed_inventory where id = v_fp.feed_id for update;
    if v_stock < v_fp.quantity then raise exception 'This feed has already been consumed; stock would become negative'; end if;
    perform public._void_document_payments('feed_purchase', p_id, 'Feed purchase voided: ' || p_reason);
    perform public._internal(true);
    update public.feed_inventory set current_stock = current_stock - v_fp.quantity where id = v_fp.feed_id;
    perform public._internal(false);
    update public.feed_purchases set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid() where id = p_id;

  elsif p_kind = 'feed_consumption' then
    perform public.require_perm('feed', 'delete');
    select * into v_fc from public.feed_consumption where id = p_id and status = 'posted' for update;
    if not found then raise exception 'Record not found or already void'; end if;
    perform 1 from public.feed_inventory where id = v_fc.feed_id for update;
    perform public._internal(true);
    update public.feed_inventory set current_stock = current_stock + v_fc.quantity where id = v_fc.feed_id;
    perform public._internal(false);
    update public.feed_consumption set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid() where id = p_id;

  elsif p_kind = 'medicine_movement' then
    perform public.require_perm('medicine', 'delete');
    select * into v_mm from public.medicine_movements where id = p_id and status = 'posted' for update;
    if not found then raise exception 'Record not found or already void'; end if;
    v_qty := case when v_mm.movement_type in ('opening','purchase','adjustment_in') then -v_mm.quantity else v_mm.quantity end;
    select quantity_on_hand into v_stock from public.medicine_batches where id = v_mm.medicine_batch_id for update;
    if v_stock + v_qty < 0 then raise exception 'This batch has already been used; stock would become negative'; end if;
    if v_mm.movement_type = 'purchase' then
      perform public._void_document_payments('medicine_purchase', p_id, 'Medicine purchase voided: ' || p_reason);
    end if;
    update public.medicine_batches set quantity_on_hand = quantity_on_hand + v_qty where id = v_mm.medicine_batch_id;
    perform public._internal(true);
    update public.medicines set current_stock = current_stock + v_qty where id = v_mm.medicine_id;
    perform public._internal(false);
    update public.medicine_movements set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid() where id = p_id;
  else
    raise exception 'Unknown record type %', p_kind;
  end if;
end;
$$;

select public._enable_audit('public.feed_inventory');
select public._enable_audit('public.feed_purchases');
select public._enable_audit('public.feed_consumption');
select public._enable_audit('public.medicines');
select public._enable_audit('public.medicine_batches');
select public._enable_audit('public.medicine_movements');
