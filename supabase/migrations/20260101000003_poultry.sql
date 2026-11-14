-- =============================================================================
-- GB Eggs ERP — 0003 Poultry management
-- Current live birds = Opening + Purchases + Transfers In
--                      - Mortality - Sales - Transfers Out
-- Every flock event is its own row (posted / void) so the history is complete.
-- =============================================================================

create table public.chicken_batches (
  id                     uuid primary key default gen_random_uuid(),
  batch_code             text not null unique,
  farm_id                uuid not null references public.farms(id) on delete restrict,
  shed_id                uuid not null references public.sheds(id) on delete restrict,
  breed_id               uuid references public.chicken_breeds(id) on delete restrict,
  bird_type              text not null default 'layer' check (bird_type in ('layer','broiler','breeder','grower')),
  placement_date         date not null,
  age_at_placement_days  int not null default 0 check (age_at_placement_days >= 0),
  opening_birds          int not null default 0 check (opening_birds >= 0),
  status                 text not null default 'active' check (status in ('active','closed')),
  closed_date            date,
  notes                  text,
  created_by             uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (closed_date is null or closed_date >= placement_date)
);
create index chicken_batches_shed_idx on public.chicken_batches(shed_id, status);
create index chicken_batches_farm_idx on public.chicken_batches(farm_id);
create trigger chicken_batches_updated_at before update on public.chicken_batches for each row execute function public.set_updated_at();

-- Shed must belong to the farm.
create or replace function public._check_shed_farm()
returns trigger
language plpgsql
as $$
begin
  if new.shed_id is not null and not exists (
    select 1 from public.sheds where id = new.shed_id and farm_id = new.farm_id
  ) then
    raise exception 'Shed does not belong to the selected farm' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger chicken_batches_shed_farm before insert or update on public.chicken_batches
  for each row execute function public._check_shed_farm();

-- Opening birds cannot be lowered below what has already left the flock.
create table public.chicken_purchases (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.chicken_batches(id) on delete restrict,
  supplier_id      uuid not null references public.suppliers(id) on delete restrict,
  purchase_date    date not null,
  invoice_no       text,
  quantity         int not null check (quantity > 0),
  rate             numeric(12,2) not null check (rate >= 0),
  total_amount     numeric(14,2) generated always as (round(quantity * rate, 2)) stored,
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
create index chicken_purchases_batch_idx on public.chicken_purchases(batch_id) where status = 'posted';
create index chicken_purchases_supplier_idx on public.chicken_purchases(supplier_id);
create index chicken_purchases_date_idx on public.chicken_purchases(purchase_date);

create table public.mortality_records (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.chicken_batches(id) on delete restrict,
  record_date  date not null,
  quantity     int not null check (quantity > 0),
  cause        text,
  notes        text,
  status       text not null default 'posted' check (status in ('posted','void')),
  void_reason  text,
  voided_at    timestamptz,
  voided_by    uuid references public.profiles(id),
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index mortality_batch_idx on public.mortality_records(batch_id) where status = 'posted';
create index mortality_date_idx on public.mortality_records(record_date);

create table public.chicken_sales (
  id               uuid primary key default gen_random_uuid(),
  sale_no          text not null unique,
  batch_id         uuid not null references public.chicken_batches(id) on delete restrict,
  customer_id      uuid references public.customers(id) on delete restrict,
  buyer_name       text,
  sale_date        date not null,
  quantity         int not null check (quantity > 0),
  total_weight_kg  numeric(12,3) check (total_weight_kg is null or total_weight_kg >= 0),
  rate             numeric(12,2) not null check (rate >= 0),
  rate_basis       text not null default 'per_bird' check (rate_basis in ('per_bird','per_kg')),
  total_amount     numeric(14,2) not null check (total_amount >= 0),
  paid_amount      numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_method   text,
  cash_account_id  uuid references public.cash_accounts(id),
  status           text not null default 'posted' check (status in ('posted','void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  notes            text,
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (rate_basis = 'per_bird' or total_weight_kg is not null)
);
create index chicken_sales_batch_idx on public.chicken_sales(batch_id) where status = 'posted';
create index chicken_sales_customer_idx on public.chicken_sales(customer_id);
create index chicken_sales_date_idx on public.chicken_sales(sale_date);

create table public.chicken_transfers (
  id             uuid primary key default gen_random_uuid(),
  from_batch_id  uuid not null references public.chicken_batches(id) on delete restrict,
  to_batch_id    uuid not null references public.chicken_batches(id) on delete restrict,
  transfer_date  date not null,
  quantity       int not null check (quantity > 0),
  notes          text,
  status         text not null default 'posted' check (status in ('posted','void')),
  void_reason    text,
  voided_at      timestamptz,
  voided_by      uuid references public.profiles(id),
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (from_batch_id <> to_batch_id)
);
create index chicken_transfers_from_idx on public.chicken_transfers(from_batch_id) where status = 'posted';
create index chicken_transfers_to_idx on public.chicken_transfers(to_batch_id) where status = 'posted';

create table public.vaccination_records (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.chicken_batches(id) on delete restrict,
  vaccination_date  date not null,
  vaccine_name      text not null,
  disease_target    text,
  dose              text,
  method            text check (method is null or method in ('drinking_water','injection','eye_drop','spray','wing_web','other')),
  birds_vaccinated  int check (birds_vaccinated is null or birds_vaccinated >= 0),
  administered_by   text,
  next_due_date     date,
  notes             text,
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  check (next_due_date is null or next_due_date >= vaccination_date)
);
create index vaccination_batch_idx on public.vaccination_records(batch_id, vaccination_date desc);
create index vaccination_due_idx on public.vaccination_records(next_due_date);

-- -----------------------------------------------------------------------------
-- Live bird calculation
-- -----------------------------------------------------------------------------
create or replace function public.batch_live_birds(p_batch uuid, p_as_of date default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
      coalesce((select case when p_as_of is null or b.placement_date <= p_as_of then b.opening_birds else 0 end
                from public.chicken_batches b where b.id = p_batch), 0)
    + coalesce((select sum(quantity) from public.chicken_purchases
                where batch_id = p_batch and status = 'posted' and (p_as_of is null or purchase_date <= p_as_of)), 0)
    + coalesce((select sum(quantity) from public.chicken_transfers
                where to_batch_id = p_batch and status = 'posted' and (p_as_of is null or transfer_date <= p_as_of)), 0)
    - coalesce((select sum(quantity) from public.mortality_records
                where batch_id = p_batch and status = 'posted' and (p_as_of is null or record_date <= p_as_of)), 0)
    - coalesce((select sum(quantity) from public.chicken_sales
                where batch_id = p_batch and status = 'posted' and (p_as_of is null or sale_date <= p_as_of)), 0)
    - coalesce((select sum(quantity) from public.chicken_transfers
                where from_batch_id = p_batch and status = 'posted' and (p_as_of is null or transfer_date <= p_as_of)), 0)
  )::int;
$$;

create or replace view public.v_chicken_batches
with (security_invoker = true)
as
select
  b.*,
  f.name  as farm_name,
  s.name  as shed_name,
  br.name as breed_name,
  coalesce(p.qty, 0)    as purchased_birds,
  coalesce(ti.qty, 0)   as transferred_in,
  coalesce(m.qty, 0)    as mortality,
  coalesce(sl.qty, 0)   as sold_birds,
  coalesce(tout.qty, 0) as transferred_out,
  (b.opening_birds + coalesce(p.qty,0) + coalesce(ti.qty,0)
     - coalesce(m.qty,0) - coalesce(sl.qty,0) - coalesce(tout.qty,0))::int as live_birds,
  (b.age_at_placement_days + (public.app_today() - b.placement_date))::int as age_days
from public.chicken_batches b
join public.farms f on f.id = b.farm_id
join public.sheds s on s.id = b.shed_id
left join public.chicken_breeds br on br.id = b.breed_id
left join lateral (select sum(quantity) qty from public.chicken_purchases where batch_id = b.id and status = 'posted') p on true
left join lateral (select sum(quantity) qty from public.chicken_transfers where to_batch_id = b.id and status = 'posted') ti on true
left join lateral (select sum(quantity) qty from public.mortality_records where batch_id = b.id and status = 'posted') m on true
left join lateral (select sum(quantity) qty from public.chicken_sales where batch_id = b.id and status = 'posted') sl on true
left join lateral (select sum(quantity) qty from public.chicken_transfers where from_batch_id = b.id and status = 'posted') tout on true;

-- Lock the batch and make sure removing p_qty birds keeps the flock >= 0.
create or replace function public._assert_birds_available(p_batch uuid, p_qty int, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.chicken_batches%rowtype;
  v_live  int;
begin
  select * into v_batch from public.chicken_batches where id = p_batch for update;
  if not found then
    raise exception 'Chicken batch not found';
  end if;
  if p_date is not null and p_date < v_batch.placement_date then
    raise exception 'Date % is before the batch placement date %', p_date, v_batch.placement_date using errcode = '23514';
  end if;
  v_live := public.batch_live_birds(p_batch);
  if p_qty > v_live then
    raise exception 'Only % live birds available in batch %, cannot remove %', v_live, v_batch.batch_code, p_qty
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public._flock_event_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_batch public.chicken_batches%rowtype;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if tg_table_name = 'mortality_records' then
    if new.record_date > public.app_today() then raise exception 'Date cannot be in the future' using errcode = '23514'; end if;
    perform public._assert_birds_available(new.batch_id, new.quantity, new.record_date);
  elsif tg_table_name = 'chicken_sales' then
    if new.sale_date > public.app_today() then raise exception 'Date cannot be in the future' using errcode = '23514'; end if;
    if new.paid_amount > new.total_amount then raise exception 'Paid amount cannot exceed the total' using errcode = '23514'; end if;
    if new.customer_id is null and new.paid_amount < new.total_amount then
      raise exception 'Walk-in chicken sales must be paid in full; select a customer for credit sales' using errcode = '23514';
    end if;
    perform public._assert_birds_available(new.batch_id, new.quantity, new.sale_date);
  elsif tg_table_name = 'chicken_transfers' then
    if new.transfer_date > public.app_today() then raise exception 'Date cannot be in the future' using errcode = '23514'; end if;
    perform public._assert_birds_available(new.from_batch_id, new.quantity, new.transfer_date);
    select * into v_batch from public.chicken_batches where id = new.to_batch_id;
    if v_batch.status <> 'active' then raise exception 'Destination batch is closed' using errcode = '23514'; end if;
  elsif tg_table_name = 'chicken_purchases' then
    if new.purchase_date > public.app_today() then raise exception 'Date cannot be in the future' using errcode = '23514'; end if;
    if new.paid_amount > round(new.quantity * new.rate, 2) then raise exception 'Paid amount cannot exceed the total' using errcode = '23514'; end if;
    select * into v_batch from public.chicken_batches where id = new.batch_id;
    if v_batch.status <> 'active' then raise exception 'Batch is closed' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

create trigger mortality_guard before insert on public.mortality_records for each row execute function public._flock_event_guard();
create trigger chicken_sales_guard before insert on public.chicken_sales for each row execute function public._flock_event_guard();
create trigger chicken_transfers_guard before insert on public.chicken_transfers for each row execute function public._flock_event_guard();
create trigger chicken_purchases_guard before insert on public.chicken_purchases for each row execute function public._flock_event_guard();

-- Number chicken sales automatically.
create or replace function public._chicken_sale_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sale_no is null or new.sale_no = '' then
    new.sale_no := public._next_document_number('chicken_sale');
  end if;
  return new;
end;
$$;
create trigger chicken_sales_number before insert on public.chicken_sales for each row execute function public._chicken_sale_number();

-- Opening birds edits must not make the flock negative.
create or replace function public._batch_opening_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.opening_birds <> old.opening_birds
     and public.batch_live_birds(new.id) + (new.opening_birds - old.opening_birds) < 0 then
    raise exception 'Opening birds cannot be lower than the birds already removed from this batch' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger chicken_batches_opening_guard before update of opening_birds on public.chicken_batches
  for each row execute function public._batch_opening_guard();

-- Void a flock event (requires poultry:delete). Reversing an addition is only
-- allowed if the birds are still in the flock.
create or replace function public.void_flock_event(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty   int;
  v_batch uuid;
begin
  perform public.require_perm('poultry', 'delete');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to void a record';
  end if;

  if p_kind = 'mortality' then
    update public.mortality_records set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id and status = 'posted';
  elsif p_kind = 'transfer' then
    select quantity, to_batch_id into v_qty, v_batch from public.chicken_transfers where id = p_id and status = 'posted';
    if not found then raise exception 'Record not found or already void'; end if;
    perform public._assert_birds_available(v_batch, v_qty, null);
    update public.chicken_transfers set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id;
  elsif p_kind = 'purchase' then
    select quantity, batch_id into v_qty, v_batch from public.chicken_purchases where id = p_id and status = 'posted';
    if not found then raise exception 'Record not found or already void'; end if;
    perform public._assert_birds_available(v_batch, v_qty, null);
    perform public._void_document_payments('chicken_purchase', p_id, 'Chicken purchase voided: ' || p_reason);
    update public.chicken_purchases set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id;
  elsif p_kind = 'sale' then
    perform public._void_document_payments('chicken_sale', p_id, 'Chicken sale voided: ' || p_reason);
    update public.chicken_sales set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id and status = 'posted';
  else
    raise exception 'Unknown flock event type %', p_kind;
  end if;

  if not found then
    raise exception 'Record not found or already void';
  end if;
end;
$$;

select public._enable_audit('public.chicken_batches');
select public._enable_audit('public.chicken_purchases');
select public._enable_audit('public.mortality_records');
select public._enable_audit('public.chicken_sales');
select public._enable_audit('public.chicken_transfers');
select public._enable_audit('public.vaccination_records');
