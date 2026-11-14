-- =============================================================================
-- GB Eggs ERP — 0011 Server-side aggregates
-- Totals are computed in SQL so they stay correct regardless of API row limits.
-- All functions are SECURITY INVOKER: Row Level Security still applies.
-- =============================================================================

-- Cashbook balance before a date (opening balance of a cashbook period).
create or replace function public.cashbook_opening(p_account uuid, p_before date)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
    from public.financial_transactions
   where txn_date < p_before and (p_account is null or cash_account_id = p_account);
$$;

-- Totals for document lists (sales, purchases, expenses) over a filter.
create or replace function public.document_totals(p_kind text, p_from date, p_to date, p_party uuid default null,
                                                  p_status text default null, p_search text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v jsonb;
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if p_kind = 'egg_sale' then
    select jsonb_build_object(
      'confirmed', count(*) filter (where status = 'confirmed'),
      'drafts', count(*) filter (where status = 'draft'),
      'total', coalesce(sum(total_amount) filter (where status = 'confirmed'), 0),
      'returned', coalesce(sum(returned_amount) filter (where status = 'confirmed'), 0),
      'paid', coalesce(sum(paid_amount) filter (where status = 'confirmed'), 0),
      'balance', coalesce(sum(balance_due) filter (where status = 'confirmed'), 0))
      into v
      from egg_sales
     where sale_date between p_from and p_to
       and (p_party is null or customer_id = p_party)
       and (p_status is null or status = p_status)
       and (v_q is null or invoice_no ilike '%' || v_q || '%' or walk_in_name ilike '%' || v_q || '%');
  elsif p_kind = 'egg_purchase' then
    select jsonb_build_object(
      'confirmed', count(*) filter (where status = 'confirmed'),
      'drafts', count(*) filter (where status = 'draft'),
      'total', coalesce(sum(total_amount) filter (where status = 'confirmed'), 0),
      'returned', coalesce(sum(returned_amount) filter (where status = 'confirmed'), 0),
      'paid', coalesce(sum(paid_amount) filter (where status = 'confirmed'), 0),
      'balance', coalesce(sum(balance_due) filter (where status = 'confirmed'), 0))
      into v
      from egg_purchases
     where purchase_date between p_from and p_to
       and (p_party is null or supplier_id = p_party)
       and (p_status is null or status = p_status)
       and (v_q is null or purchase_no ilike '%' || v_q || '%' or supplier_invoice_no ilike '%' || v_q || '%');
  elsif p_kind = 'expense' then
    select jsonb_build_object(
      'count', count(*),
      'total', coalesce(sum(e.amount), 0),
      'by_category', coalesce((
        select jsonb_agg(jsonb_build_object('category', c.name, 'amount', t.amt) order by t.amt desc)
          from (select category_id, sum(amount) amt from expenses
                 where status = 'posted' and expense_date between p_from and p_to
                   and (p_party is null or category_id = p_party)
                 group by category_id) t
          join expense_categories c on c.id = t.category_id), '[]'::jsonb))
      into v
      from expenses e
     where e.status = 'posted' and e.expense_date between p_from and p_to
       and (p_party is null or e.category_id = p_party)
       and (v_q is null or e.expense_no ilike '%' || v_q || '%' or e.description ilike '%' || v_q || '%'
            or e.payee ilike '%' || v_q || '%' or e.reference ilike '%' || v_q || '%');
  else
    raise exception 'Unknown document kind %', p_kind;
  end if;
  return v;
end;
$$;

-- Receivable / payable totals across all parties.
create or replace function public.party_totals(p_type text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case when p_type = 'customer' then
    (select jsonb_build_object('due', coalesce(sum(balance) filter (where balance > 0), 0),
                               'advances', coalesce(-sum(balance) filter (where balance < 0), 0),
                               'active', count(*) filter (where is_active)) from v_customer_balances)
  else
    (select jsonb_build_object('due', coalesce(sum(balance) filter (where balance > 0), 0),
                               'advances', coalesce(-sum(balance) filter (where balance < 0), 0),
                               'active', count(*) filter (where is_active)) from v_supplier_balances)
  end;
$$;

grant execute on function public.cashbook_opening(uuid, date), public.document_totals(text, date, date, uuid, text, text),
  public.party_totals(text) to authenticated;
