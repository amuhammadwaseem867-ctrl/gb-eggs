-- =============================================================================
-- GB Eggs ERP — 0007 Finance core
--
-- * financial_transactions is the immutable cashbook. Nothing is ever edited;
--   a void posts an equal and opposite reversing row.
-- * payments are receipts/payments with customers and suppliers, optionally
--   allocated to one document. Paying an old invoice is a *collection*, never
--   new revenue: revenue is recognised only by the invoice itself.
-- =============================================================================

create table public.financial_transactions (
  id              uuid primary key default gen_random_uuid(),
  txn_date        date not null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  direction       text not null check (direction in ('in','out')),
  amount          numeric(14,2) not null check (amount > 0),
  category        text not null check (category in (
                    'customer_receipt','customer_refund','supplier_payment','supplier_refund',
                    'expense','salary','employee_advance','other_income','owner_capital','loan_received',
                    'owner_drawing','transfer_in','transfer_out','opening_balance','adjustment')),
  reference_type  text,
  reference_id    uuid,
  description     text,
  reversal_of     uuid references public.financial_transactions(id),
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index fin_txn_account_date_idx on public.financial_transactions(cash_account_id, txn_date);
create index fin_txn_date_idx on public.financial_transactions(txn_date);
create index fin_txn_ref_idx on public.financial_transactions(reference_type, reference_id);
create unique index fin_txn_single_reversal on public.financial_transactions(reversal_of) where reversal_of is not null;
create trigger fin_txn_immutable before update or delete on public.financial_transactions
  for each row execute function public.forbid_mutation();

create or replace function public._post_transaction(
  p_date date, p_account uuid, p_direction text, p_amount numeric, p_category text,
  p_ref_type text, p_ref_id uuid, p_description text, p_reversal_of uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_account is null then
    raise exception 'A cash or bank account is required';
  end if;
  if not exists (select 1 from public.cash_accounts where id = p_account and is_active) then
    raise exception 'The selected cash/bank account is inactive or does not exist';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  insert into public.financial_transactions
    (txn_date, cash_account_id, direction, amount, category, reference_type, reference_id, description, reversal_of)
  values
    (p_date, p_account, p_direction, round(p_amount, 2), p_category, p_ref_type, p_ref_id, p_description, p_reversal_of)
  returning id into v_id;
  return v_id;
end;
$$;

-- Reverse every not-yet-reversed transaction of a source record.
create or replace function public._reverse_transactions(p_ref_type text, p_ref_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.financial_transactions%rowtype;
begin
  for r in
    select t.* from public.financial_transactions t
     where t.reference_type = p_ref_type and t.reference_id = p_ref_id and t.reversal_of is null
       and not exists (select 1 from public.financial_transactions x where x.reversal_of = t.id)
     order by t.created_at
     for update
  loop
    perform public._post_transaction(public.app_today(), r.cash_account_id,
      case when r.direction = 'in' then 'out' else 'in' end, r.amount, r.category,
      r.reference_type, r.reference_id, 'Reversal: ' || coalesce(p_reason, '') , r.id);
  end loop;
end;
$$;

create table public.fund_transfers (
  id               uuid primary key default gen_random_uuid(),
  transfer_date    date not null,
  from_account_id  uuid not null references public.cash_accounts(id),
  to_account_id    uuid not null references public.cash_accounts(id),
  amount           numeric(14,2) not null check (amount > 0),
  notes            text,
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create trigger fund_transfers_immutable before update or delete on public.fund_transfers
  for each row execute function public.forbid_mutation();

create or replace function public._fund_transfer_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transfer_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  perform public._post_transaction(new.transfer_date, new.from_account_id, 'out', new.amount, 'transfer_out', 'fund_transfer', new.id, coalesce(new.notes, 'Fund transfer'), null);
  perform public._post_transaction(new.transfer_date, new.to_account_id, 'in', new.amount, 'transfer_in', 'fund_transfer', new.id, coalesce(new.notes, 'Fund transfer'), null);
  return new;
end;
$$;
create trigger fund_transfers_after after insert on public.fund_transfers for each row execute function public._fund_transfer_after();

-- Opening balance of cash accounts is posted to the cashbook so balances are a
-- simple sum of transactions.
create or replace function public._cash_account_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.opening_balance <> 0 then
    perform public._post_transaction(public.app_today(), new.id, case when new.opening_balance > 0 then 'in' else 'out' end,
      abs(new.opening_balance), 'opening_balance', 'cash_account', new.id, 'Opening balance', null);
  elsif tg_op = 'UPDATE' and new.opening_balance <> old.opening_balance then
    perform public._post_transaction(public.app_today(), new.id,
      case when new.opening_balance > old.opening_balance then 'in' else 'out' end,
      abs(new.opening_balance - old.opening_balance), 'opening_balance', 'cash_account', new.id,
      'Opening balance correction', null);
  end if;
  return new;
end;
$$;
create trigger cash_accounts_opening after insert or update of opening_balance on public.cash_accounts
  for each row execute function public._cash_account_opening();

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  payment_no       text not null unique,
  payment_date     date not null,
  party_type       text not null check (party_type in ('customer','supplier')),
  customer_id      uuid references public.customers(id) on delete restrict,
  supplier_id      uuid references public.suppliers(id) on delete restrict,
  direction        text not null check (direction in ('in','out')),
  amount           numeric(14,2) not null check (amount > 0),
  method           text not null default 'cash' check (method in ('cash','bank_transfer','cheque','mobile_wallet','card','other')),
  cash_account_id  uuid not null references public.cash_accounts(id) on delete restrict,
  doc_type         text check (doc_type in ('egg_sale','chicken_sale','egg_purchase','chicken_purchase','feed_purchase','medicine_purchase','packaging_purchase')),
  doc_id           uuid,
  reference_no     text,
  notes            text,
  status           text not null default 'posted' check (status in ('posted','void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check ((doc_type is null) = (doc_id is null)),
  -- Walk-in sales have no customer record; their payments carry only the document.
  check (party_type <> 'customer' or customer_id is not null or doc_type = 'egg_sale' or doc_type = 'chicken_sale'),
  check (party_type <> 'supplier' or supplier_id is not null),
  check (party_type <> 'customer' or supplier_id is null),
  check (party_type <> 'supplier' or customer_id is null)
);
create index payments_customer_idx on public.payments(customer_id, payment_date);
create index payments_supplier_idx on public.payments(supplier_id, payment_date);
create index payments_doc_idx on public.payments(doc_type, doc_id);
create index payments_date_idx on public.payments(payment_date);

create or replace function public._payments_lock()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments cannot be deleted; void them instead' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status','void_reason','voided_at','voided_by'])
     is distinct from (to_jsonb(old) - array['status','void_reason','voided_at','voided_by']) then
    raise exception 'Posted payments cannot be edited; void and re-enter instead' using errcode = '42501';
  end if;
  if old.status = 'void' then raise exception 'Payment is already void'; end if;
  return new;
end;
$$;
create trigger payments_lock before update or delete on public.payments
  for each row execute function public._payments_lock();

-- Gross amount of a document and its party, read from the source table.
create or replace function public._document_info(p_doc_type text, p_doc_id uuid,
  out party_type text, out customer_id uuid, out supplier_id uuid, out gross numeric,
  out doc_date date, out is_open boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  case p_doc_type
    when 'egg_sale' then
      select 'customer', s.customer_id, null::uuid, s.total_amount - s.returned_amount, s.sale_date, s.status = 'confirmed'
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.egg_sales s where s.id = p_doc_id;
    when 'chicken_sale' then
      select 'customer', s.customer_id, null::uuid, s.total_amount, s.sale_date, s.status = 'posted'
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.chicken_sales s where s.id = p_doc_id;
    when 'egg_purchase' then
      select 'supplier', null::uuid, p.supplier_id, p.total_amount - p.returned_amount, p.purchase_date, p.status = 'confirmed'
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.egg_purchases p where p.id = p_doc_id;
    when 'chicken_purchase' then
      select 'supplier', null::uuid, p.supplier_id, p.total_amount, p.purchase_date, p.status = 'posted'
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.chicken_purchases p where p.id = p_doc_id;
    when 'feed_purchase' then
      select 'supplier', null::uuid, p.supplier_id, p.total_amount, p.purchase_date, p.status = 'posted'
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.feed_purchases p where p.id = p_doc_id;
    when 'medicine_purchase' then
      select 'supplier', null::uuid, m.supplier_id, m.total_amount, m.movement_date, (m.status = 'posted' and m.movement_type = 'purchase')
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.medicine_movements m where m.id = p_doc_id;
    when 'packaging_purchase' then
      select 'supplier', null::uuid, m.supplier_id, m.total_amount, m.movement_date, (m.status = 'posted' and m.movement_type = 'purchase')
        into party_type, customer_id, supplier_id, gross, doc_date, is_open from public.packaging_movements m where m.id = p_doc_id;
    else
      raise exception 'Unknown document type %', p_doc_type;
  end case;
  if party_type is null then
    raise exception 'Document not found';
  end if;
end;
$$;

-- Net settled on a document: receipts minus refunds (customers) or payments
-- minus refunds (suppliers), from posted payments only.
create or replace function public._document_settled(p_doc_type text, p_doc_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case
      when party_type = 'customer' and direction = 'in'  then amount
      when party_type = 'customer' and direction = 'out' then -amount
      when party_type = 'supplier' and direction = 'out' then amount
      else -amount end), 0)
  from public.payments
  where doc_type = p_doc_type and doc_id = p_doc_id and status = 'posted';
$$;

create or replace function public._refresh_document_paid(p_doc_type text, p_doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric := public._document_settled(p_doc_type, p_doc_id);
begin
  case p_doc_type
    when 'egg_sale'           then update public.egg_sales set paid_amount = v_paid where id = p_doc_id;
    when 'chicken_sale'       then update public.chicken_sales set paid_amount = v_paid where id = p_doc_id;
    when 'egg_purchase'       then update public.egg_purchases set paid_amount = v_paid where id = p_doc_id;
    when 'chicken_purchase'   then update public.chicken_purchases set paid_amount = v_paid where id = p_doc_id;
    when 'feed_purchase'      then update public.feed_purchases set paid_amount = v_paid where id = p_doc_id;
    when 'medicine_purchase'  then update public.medicine_movements set paid_amount = v_paid where id = p_doc_id;
    when 'packaging_purchase' then update public.packaging_movements set paid_amount = v_paid where id = p_doc_id;
  end case;
end;
$$;

create or replace function public._payment_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc     record;
  v_balance numeric;
begin
  if new.payment_date > public.app_today() then
    raise exception 'Payment date cannot be in the future';
  end if;
  if not exists (select 1 from public.cash_accounts where id = new.cash_account_id and is_active) then
    raise exception 'Select an active cash or bank account';
  end if;

  if new.doc_type is not null then
    select * into v_doc from public._document_info(new.doc_type, new.doc_id);
    if v_doc.party_type <> new.party_type then
      raise exception 'Document does not belong to a % account', new.party_type;
    end if;
    if not v_doc.is_open then
      raise exception 'Payments can only be recorded against confirmed/posted documents';
    end if;
    if new.party_type = 'customer' then
      if new.customer_id is distinct from v_doc.customer_id then
        raise exception 'Payment customer does not match the invoice customer';
      end if;
    elsif new.supplier_id is distinct from v_doc.supplier_id then
      raise exception 'Payment supplier does not match the document supplier';
    end if;
    if new.payment_date < v_doc.doc_date then
      raise exception 'Payment date cannot be before the document date';
    end if;
    -- Outstanding on the document (positive = still owed, negative = overpaid)
    v_balance := v_doc.gross - public._document_settled(new.doc_type, new.doc_id);
    if (new.party_type = 'customer' and new.direction = 'in') or (new.party_type = 'supplier' and new.direction = 'out') then
      if new.amount > v_balance + 0.004 then
        raise exception 'Payment (%) exceeds the outstanding balance (%)', new.amount, greatest(v_balance, 0)
          using errcode = '23514';
      end if;
    elsif new.amount > -v_balance + 0.004 then
      raise exception 'Refund (%) exceeds the amount overpaid (%)', new.amount, greatest(-v_balance, 0)
        using errcode = '23514';
    end if;
  elsif new.party_type = 'customer' and new.customer_id is null then
    raise exception 'Select a customer';
  end if;

  if new.payment_no is null or new.payment_no = '' then
    new.payment_no := public._next_document_number(case when new.direction = 'in' then 'payment_in' else 'payment_out' end);
  end if;
  return new;
end;
$$;
create trigger payments_before before insert on public.payments for each row execute function public._payment_before();

create or replace function public._payment_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_party    text;
begin
  if tg_op = 'INSERT' then
    v_category := case
      when new.party_type = 'customer' and new.direction = 'in'  then 'customer_receipt'
      when new.party_type = 'customer' and new.direction = 'out' then 'customer_refund'
      when new.party_type = 'supplier' and new.direction = 'out' then 'supplier_payment'
      else 'supplier_refund' end;
    if new.party_type = 'customer' then
      select name into v_party from public.customers where id = new.customer_id;
      if v_party is null then
        select coalesce(walk_in_name, 'Walk-in customer') into v_party from public.egg_sales where id = new.doc_id;
        v_party := coalesce(v_party, 'Walk-in customer');
      end if;
    else
      select name into v_party from public.suppliers where id = new.supplier_id;
    end if;
    perform public._post_transaction(new.payment_date, new.cash_account_id, new.direction, new.amount, v_category,
      'payment', new.id, new.payment_no || ' — ' || coalesce(v_party, ''), null);
  elsif old.status = 'posted' and new.status = 'void' then
    perform public._reverse_transactions('payment', new.id, new.void_reason);
  end if;

  if new.doc_type is not null then
    perform public._refresh_document_paid(new.doc_type, new.doc_id);
  end if;
  return new;
end;
$$;
create trigger payments_after after insert or update of status on public.payments
  for each row execute function public._payment_after();

-- Internal: payment created together with a document.
create or replace function public._post_document_payment(
  p_doc_type text, p_doc_id uuid, p_party text, p_customer uuid, p_supplier uuid, p_direction text,
  p_amount numeric, p_method text, p_account uuid, p_date date, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_account is null then
    raise exception 'Select the cash/bank account for the payment';
  end if;
  insert into public.payments (payment_no, payment_date, party_type, customer_id, supplier_id, direction, amount, method,
                               cash_account_id, doc_type, doc_id, notes)
  values (null, p_date, p_party, p_customer, p_supplier, p_direction, round(p_amount, 2), coalesce(nullif(p_method, ''), 'cash'),
          p_account, p_doc_type, p_doc_id, p_notes)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public._void_document_payments(p_doc_type text, p_doc_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
     set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where doc_type = p_doc_type and doc_id = p_doc_id and status = 'posted';
end;
$$;

-- Public RPC: receive from a customer or pay a supplier (or refund either way).
-- Payload: { party_type, customer_id?, supplier_id?, direction, amount, method,
--            cash_account_id, payment_date, doc_type?, doc_id?, reference_no?, notes? }
create or replace function public.record_payment(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party text := p ->> 'party_type';
  v_id    uuid;
begin
  if not (public.has_perm('accounting', 'create')
          or (v_party = 'customer' and public.has_perm('sales', 'create'))
          or (v_party = 'supplier' and public.has_perm('purchases', 'create'))) then
    raise exception 'Permission denied: cannot record payments' using errcode = '42501';
  end if;
  insert into public.payments (payment_no, payment_date, party_type, customer_id, supplier_id, direction, amount, method,
                               cash_account_id, doc_type, doc_id, reference_no, notes)
  values (null, (p ->> 'payment_date')::date, v_party,
          case when v_party = 'customer' then nullif(p ->> 'customer_id', '')::uuid end,
          case when v_party = 'supplier' then nullif(p ->> 'supplier_id', '')::uuid end,
          p ->> 'direction', (p ->> 'amount')::numeric, coalesce(nullif(p ->> 'method', ''), 'cash'),
          (p ->> 'cash_account_id')::uuid, nullif(p ->> 'doc_type', ''), nullif(p ->> 'doc_id', '')::uuid,
          nullif(p ->> 'reference_no', ''), nullif(p ->> 'notes', ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.void_payment(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_perm('accounting', 'delete');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  update public.payments set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = p_id and status = 'posted';
  if not found then raise exception 'Payment not found or already void'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Receivables & payables
-- -----------------------------------------------------------------------------
create or replace view public.v_party_documents
with (security_invoker = true)
as
select 'egg_sale'::text as doc_type, s.id as doc_id, s.invoice_no as doc_no, s.sale_date as doc_date,
       'customer'::text as party_type, s.customer_id, null::uuid as supplier_id,
       coalesce(c.name, s.walk_in_name, 'Walk-in') as party_name,
       s.total_amount as amount, s.returned_amount, s.paid_amount, s.balance_due, s.status
  from public.egg_sales s left join public.customers c on c.id = s.customer_id
 where s.status = 'confirmed'
union all
select 'chicken_sale', s.id, s.sale_no, s.sale_date, 'customer', s.customer_id, null,
       coalesce(c.name, s.buyer_name, 'Walk-in'), s.total_amount, 0, s.paid_amount, s.total_amount - s.paid_amount, s.status
  from public.chicken_sales s left join public.customers c on c.id = s.customer_id
 where s.status = 'posted'
union all
select 'egg_purchase', p.id, p.purchase_no, p.purchase_date, 'supplier', null, p.supplier_id, sp.name,
       p.total_amount, p.returned_amount, p.paid_amount, p.balance_due, p.status
  from public.egg_purchases p join public.suppliers sp on sp.id = p.supplier_id
 where p.status = 'confirmed'
union all
select 'chicken_purchase', p.id, coalesce(p.invoice_no, 'CHK-' || left(p.id::text, 8)), p.purchase_date, 'supplier', null, p.supplier_id, sp.name,
       p.total_amount, 0, p.paid_amount, p.total_amount - p.paid_amount, p.status
  from public.chicken_purchases p join public.suppliers sp on sp.id = p.supplier_id
 where p.status = 'posted'
union all
select 'feed_purchase', p.id, coalesce(p.invoice_no, 'FEED-' || left(p.id::text, 8)), p.purchase_date, 'supplier', null, p.supplier_id, sp.name,
       p.total_amount, 0, p.paid_amount, p.total_amount - p.paid_amount, p.status
  from public.feed_purchases p join public.suppliers sp on sp.id = p.supplier_id
 where p.status = 'posted'
union all
select 'medicine_purchase', m.id, coalesce(m.invoice_no, 'MED-' || left(m.id::text, 8)), m.movement_date, 'supplier', null, m.supplier_id, sp.name,
       m.total_amount, 0, m.paid_amount, m.total_amount - m.paid_amount, m.status
  from public.medicine_movements m join public.suppliers sp on sp.id = m.supplier_id
 where m.status = 'posted' and m.movement_type = 'purchase'
union all
select 'packaging_purchase', m.id, coalesce(m.invoice_no, 'PKG-' || left(m.id::text, 8)), m.movement_date, 'supplier', null, m.supplier_id, sp.name,
       m.total_amount, 0, m.paid_amount, m.total_amount - m.paid_amount, m.status
  from public.packaging_movements m join public.suppliers sp on sp.id = m.supplier_id
 where m.status = 'posted' and m.movement_type = 'purchase';

create or replace function public.customer_balance(p_customer uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select opening_balance from public.customers where id = p_customer), 0)
       + coalesce((select sum(total_amount - returned_amount) from public.egg_sales where customer_id = p_customer and status = 'confirmed'), 0)
       + coalesce((select sum(total_amount) from public.chicken_sales where customer_id = p_customer and status = 'posted'), 0)
       - coalesce((select sum(case when direction = 'in' then amount else -amount end)
                     from public.payments where customer_id = p_customer and status = 'posted'), 0);
$$;

create or replace function public.supplier_balance(p_supplier uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select opening_balance from public.suppliers where id = p_supplier), 0)
       + coalesce((select sum(amount - returned_amount) from public.v_party_documents where supplier_id = p_supplier), 0)
       - coalesce((select sum(case when direction = 'out' then amount else -amount end)
                     from public.payments where supplier_id = p_supplier and status = 'posted'), 0);
$$;

create or replace view public.v_customer_balances
with (security_invoker = true)
as
select c.*,
  coalesce(d.sales, 0)   as total_sales,
  coalesce(d.returns, 0) as total_returns,
  coalesce(pm.net, 0)    as total_paid,
  c.opening_balance + coalesce(d.sales, 0) - coalesce(d.returns, 0) - coalesce(pm.net, 0) as balance,
  d.last_sale_date
from public.customers c
left join lateral (
  select sum(amount) sales, sum(returned_amount) returns, max(doc_date) last_sale_date
    from public.v_party_documents where customer_id = c.id
) d on true
left join lateral (
  select sum(case when direction = 'in' then amount else -amount end) net
    from public.payments where customer_id = c.id and status = 'posted'
) pm on true;

create or replace view public.v_supplier_balances
with (security_invoker = true)
as
select s.*,
  coalesce(d.purchases, 0) as total_purchases,
  coalesce(d.returns, 0)   as total_returns,
  coalesce(pm.net, 0)      as total_paid,
  s.opening_balance + coalesce(d.purchases, 0) - coalesce(d.returns, 0) - coalesce(pm.net, 0) as balance,
  d.last_purchase_date
from public.suppliers s
left join lateral (
  select sum(amount) purchases, sum(returned_amount) returns, max(doc_date) last_purchase_date
    from public.v_party_documents where supplier_id = s.id
) d on true
left join lateral (
  select sum(case when direction = 'out' then amount else -amount end) net
    from public.payments where supplier_id = s.id and status = 'posted'
) pm on true;

create or replace view public.v_cash_account_balances
with (security_invoker = true)
as
select a.*,
  coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)  as total_in,
  coalesce(sum(t.amount) filter (where t.direction = 'out'), 0) as total_out,
  coalesce(sum(case when t.direction = 'in' then t.amount else -t.amount end), 0) as balance
from public.cash_accounts a
left join public.financial_transactions t on t.cash_account_id = a.id
group by a.id;

-- Party ledger with running balance (debit increases what the party owes us /
-- what we owe the supplier).
create or replace function public.party_ledger(p_party_type text, p_party_id uuid, p_from date, p_to date)
returns table (entry_date date, entry_type text, reference text, description text,
               debit numeric, credit numeric, balance numeric, sort_key timestamptz)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_opening numeric;
begin
  if p_party_type = 'customer' then
    if not public.has_perm('customers', 'view') then raise exception 'Permission denied' using errcode = '42501'; end if;
    select opening_balance into v_opening from public.customers where id = p_party_id;
  else
    if not public.has_perm('suppliers', 'view') then raise exception 'Permission denied' using errcode = '42501'; end if;
    select opening_balance into v_opening from public.suppliers where id = p_party_id;
  end if;

  return query
  with entries as (
    -- Documents (gross, at document date)
    select d.doc_date as e_date, d.doc_type as e_type, d.doc_no as e_ref,
           initcap(replace(d.doc_type, '_', ' ')) as e_desc,
           d.amount as e_debit, 0::numeric as e_credit, d.doc_date::timestamptz as e_sort
      from public.v_party_documents d
     where (p_party_type = 'customer' and d.customer_id = p_party_id)
        or (p_party_type = 'supplier' and d.supplier_id = p_party_id)
    union all
    -- Returns
    select r.return_date, 'sales_return', r.return_no, 'Sales return', 0, r.total_amount, r.created_at
      from public.sales_returns r where p_party_type = 'customer' and r.customer_id = p_party_id
    union all
    select r.return_date, 'purchase_return', r.return_no, 'Purchase return', 0, r.total_amount, r.created_at
      from public.purchase_returns r where p_party_type = 'supplier' and r.supplier_id = p_party_id
    union all
    -- Payments
    select pm.payment_date,
           case when (pm.party_type = 'customer' and pm.direction = 'in') or (pm.party_type = 'supplier' and pm.direction = 'out')
                then 'payment' else 'refund' end,
           pm.payment_no, coalesce(pm.notes, initcap(replace(pm.method, '_', ' '))),
           case when (pm.party_type = 'customer' and pm.direction = 'out') or (pm.party_type = 'supplier' and pm.direction = 'in') then pm.amount else 0 end,
           case when (pm.party_type = 'customer' and pm.direction = 'in') or (pm.party_type = 'supplier' and pm.direction = 'out') then pm.amount else 0 end,
           pm.created_at
      from public.payments pm
     where pm.status = 'posted'
       and ((p_party_type = 'customer' and pm.customer_id = p_party_id)
         or (p_party_type = 'supplier' and pm.supplier_id = p_party_id))
  ),
  opening as (
    select coalesce(v_opening, 0) + coalesce(sum(e_debit - e_credit), 0) as amt
      from entries where p_from is not null and e_date < p_from
  )
  select p_from, 'opening'::text, null::text, 'Opening balance'::text, null::numeric, null::numeric,
         (select amt from opening), '-infinity'::timestamptz
   where p_from is not null
  union all
  select e.e_date, e.e_type, e.e_ref, e.e_desc, e.e_debit, e.e_credit,
         (case when p_from is null then coalesce(v_opening, 0) else (select amt from opening) end)
           + sum(e.e_debit - e.e_credit) over (order by e.e_date, e.e_sort rows unbounded preceding),
         e.e_sort
    from entries e
   where (p_from is null or e.e_date >= p_from) and (p_to is null or e.e_date <= p_to)
   order by 1, 8;
end;
$$;

select public._enable_audit('public.payments');
select public._enable_audit('public.fund_transfers');

-- Initial payment entered together with a chicken purchase / sale.
create or replace function public._flock_document_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paid_amount > 0 then
    if tg_table_name = 'chicken_purchases' then
      perform public._post_document_payment('chicken_purchase', new.id, 'supplier', null, new.supplier_id, 'out',
        new.paid_amount, new.payment_method, new.cash_account_id, new.purchase_date, 'Initial payment');
    else
      perform public._post_document_payment('chicken_sale', new.id, 'customer', new.customer_id, null, 'in',
        new.paid_amount, new.payment_method, new.cash_account_id, new.sale_date, 'Initial payment');
    end if;
  end if;
  return new;
end;
$$;
create trigger chicken_purchases_payment after insert on public.chicken_purchases
  for each row execute function public._flock_document_payment();
create trigger chicken_sales_payment after insert on public.chicken_sales
  for each row execute function public._flock_document_payment();
