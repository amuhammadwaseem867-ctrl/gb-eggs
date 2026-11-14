-- =============================================================================
-- GB Eggs ERP — 0008 Reporting, dashboard & analytics functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profit & loss + cash analysis (accrual basis)
--  Revenue is recognised on the invoice date. Receipts against invoices dated
--  before the period (or on account) are reported as collections of previous
--  receivables, never as revenue.
-- -----------------------------------------------------------------------------
create or replace function public.financial_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_egg_sales numeric; v_tax numeric; v_returns numeric; v_chicken_sales numeric; v_other_income numeric;
  v_egg_purch numeric; v_purch_returns numeric; v_chicken_purch numeric; v_feed numeric; v_medicine numeric;
  v_packaging numeric; v_expenses numeric; v_salaries numeric;
  v_rcpt_total numeric; v_rcpt_current numeric; v_rcpt_previous numeric; v_rcpt_on_account numeric; v_refunds numeric;
  v_paid_suppliers numeric; v_cash_in numeric; v_cash_out numeric;
  v_revenue numeric; v_cost numeric;
  v_by_cat jsonb;
begin
  if not (public.has_perm('reports', 'view') or public.has_perm('accounting', 'view') or public.has_perm('dashboard', 'view')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  select coalesce(sum(subtotal - discount + additional_charges), 0), coalesce(sum(tax_amount), 0)
    into v_egg_sales, v_tax
    from egg_sales where status = 'confirmed' and sale_date between p_from and p_to;
  select coalesce(sum(subtotal_amount), 0) into v_returns from sales_returns where return_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into v_chicken_sales from chicken_sales where status = 'posted' and sale_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_other_income from other_incomes
   where status = 'posted' and category not in ('owner_capital','loan_received') and income_date between p_from and p_to;

  select coalesce(sum(total_amount), 0) into v_egg_purch from egg_purchases where status = 'confirmed' and purchase_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into v_purch_returns from purchase_returns where return_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into v_chicken_purch from chicken_purchases where status = 'posted' and purchase_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into v_feed from feed_purchases where status = 'posted' and purchase_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into v_medicine from medicine_movements where status = 'posted' and movement_type = 'purchase' and movement_date between p_from and p_to;
  select coalesce(sum(total_amount), 0) into v_packaging from packaging_movements where status = 'posted' and movement_type = 'purchase' and movement_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_expenses from expenses where status = 'posted' and expense_date between p_from and p_to;
  select coalesce(sum(gross_salary), 0) into v_salaries from salary_records
   where status <> 'void' and salary_month between date_trunc('month', p_from)::date and p_to;

  select coalesce(jsonb_agg(jsonb_build_object('category', c.name, 'amount', t.amt) order by t.amt desc), '[]'::jsonb)
    into v_by_cat
    from (select category_id, sum(amount) amt from expenses where status = 'posted' and expense_date between p_from and p_to group by category_id) t
    join expense_categories c on c.id = t.category_id;

  -- Customer receipts split by what they settle.
  select
    coalesce(sum(p.amount) filter (where p.direction = 'in'), 0),
    coalesce(sum(p.amount) filter (where p.direction = 'in' and d.doc_date between p_from and p_to), 0),
    coalesce(sum(p.amount) filter (where p.direction = 'in' and d.doc_date < p_from), 0),
    coalesce(sum(p.amount) filter (where p.direction = 'in' and p.doc_id is null), 0),
    coalesce(sum(p.amount) filter (where p.direction = 'out'), 0)
    into v_rcpt_total, v_rcpt_current, v_rcpt_previous, v_rcpt_on_account, v_refunds
    from payments p
    left join lateral (
      select coalesce(
        (select sale_date from egg_sales where id = p.doc_id and p.doc_type = 'egg_sale'),
        (select sale_date from chicken_sales where id = p.doc_id and p.doc_type = 'chicken_sale')) as doc_date
    ) d on true
   where p.party_type = 'customer' and p.status = 'posted' and p.payment_date between p_from and p_to;

  select coalesce(sum(case when direction = 'out' then amount else -amount end), 0) into v_paid_suppliers
    from payments where party_type = 'supplier' and status = 'posted' and payment_date between p_from and p_to;

  select coalesce(sum(amount) filter (where direction = 'in' and category not in ('transfer_in','opening_balance')), 0),
         coalesce(sum(amount) filter (where direction = 'out' and category not in ('transfer_out','opening_balance')), 0)
    into v_cash_in, v_cash_out
    from financial_transactions where txn_date between p_from and p_to;

  v_revenue := v_egg_sales - v_returns + v_chicken_sales + v_other_income;
  v_cost := (v_egg_purch - v_purch_returns) + v_chicken_purch + v_feed + v_medicine + v_packaging + v_expenses + v_salaries;

  v := jsonb_build_object(
    'from', p_from, 'to', p_to,
    'revenue', jsonb_build_object(
      'egg_sales', v_egg_sales, 'sales_returns', v_returns, 'net_egg_sales', v_egg_sales - v_returns,
      'chicken_sales', v_chicken_sales, 'other_income', v_other_income, 'total', v_revenue,
      'tax_collected', v_tax),
    'costs', jsonb_build_object(
      'egg_purchases', v_egg_purch, 'purchase_returns', v_purch_returns, 'net_egg_purchases', v_egg_purch - v_purch_returns,
      'chicken_purchases', v_chicken_purch, 'feed_purchases', v_feed, 'medicine_purchases', v_medicine,
      'packaging_purchases', v_packaging, 'operating_expenses', v_expenses, 'salaries', v_salaries,
      'expenses_by_category', v_by_cat, 'total', v_cost),
    'net_profit', v_revenue - v_cost,
    'cash', jsonb_build_object(
      'customer_receipts', v_rcpt_total,
      'receipts_current_sales', v_rcpt_current,
      'receipts_previous_receivables', v_rcpt_previous,
      'receipts_on_account', v_rcpt_on_account,
      'customer_refunds', v_refunds,
      'supplier_payments', v_paid_suppliers,
      'cash_in', v_cash_in, 'cash_out', v_cash_out, 'net_cash_flow', v_cash_in - v_cash_out)
  );
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Egg stock movement summary per grade
-- -----------------------------------------------------------------------------
create or replace function public.egg_stock_summary(p_from date, p_to date, p_farm uuid default null)
returns table (grade_id uuid, grade_code text, grade_name text, sort_order int,
               opening bigint, production bigint, purchases bigint, sale_returns bigint, adjustments_in bigint,
               transfers_in bigint, sales bigint, damages bigint, returns_out bigint, adjustments_out bigint,
               transfers_out bigint, closing bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.code, g.name, g.sort_order,
    coalesce(sum(m.quantity) filter (where m.movement_date < p_from), 0),
    coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type in ('production','production_void')), 0),
    coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type in ('purchase','purchase_cancel')), 0),
    coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'sale_return'), 0),
    coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type in ('adjustment_in','opening')), 0),
    coalesce(sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'transfer_in'), 0),
    coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type in ('sale','sale_cancel')), 0),
    coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type in ('damage','damage_void')), 0),
    coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'purchase_return'), 0),
    coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'adjustment_out'), 0),
    coalesce(-sum(m.quantity) filter (where m.movement_date between p_from and p_to and m.movement_type = 'transfer_out'), 0),
    coalesce(sum(m.quantity) filter (where m.movement_date <= p_to), 0)
  from public.egg_grades g
  left join public.egg_stock_movements m on m.grade_id = g.id and (p_farm is null or m.farm_id = p_farm)
  group by g.id
  order by g.sort_order;
$$;

-- -----------------------------------------------------------------------------
-- Production report (day / week / month), optionally per shed
-- Production rate = saleable eggs / hen-days x 100 (= average daily rate)
-- -----------------------------------------------------------------------------
create or replace function public.production_report(p_from date, p_to date, p_period text default 'day',
                                                    p_farm uuid default null, p_shed uuid default null)
returns table (period_start date, records bigint, morning bigint, evening bigint, total bigint,
               small bigint, medium bigint, large bigint, xl bigint, dirty bigint, broken bigint, rejected bigint,
               saleable bigint, hen_days bigint, avg_hens numeric, production_rate numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with daily as (
    select collection_date,
           sum(morning_eggs) morning, sum(evening_eggs) evening, sum(total_eggs) total,
           sum(small_eggs) small, sum(medium_eggs) medium, sum(large_eggs) large, sum(xl_eggs) xl,
           sum(dirty_eggs) dirty, sum(broken_eggs) broken, sum(rejected_eggs) rejected,
           sum(saleable_eggs) saleable, sum(live_hens) hens, count(*) recs
      from public.egg_collections
     where status = 'posted' and collection_date between p_from and p_to
       and (p_farm is null or farm_id = p_farm) and (p_shed is null or shed_id = p_shed)
     group by collection_date
  )
  select date_trunc(case when p_period in ('week','month') then p_period else 'day' end, collection_date)::date,
         sum(recs)::bigint, sum(morning)::bigint, sum(evening)::bigint, sum(total)::bigint,
         sum(small)::bigint, sum(medium)::bigint, sum(large)::bigint, sum(xl)::bigint, sum(dirty)::bigint,
         sum(broken)::bigint, sum(rejected)::bigint, sum(saleable)::bigint, sum(hens)::bigint,
         round(avg(hens), 0),
         round(sum(saleable)::numeric / nullif(sum(hens), 0) * 100, 2)
    from daily
   group by 1
   order by 1;
$$;

-- -----------------------------------------------------------------------------
-- Dashboard
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.app_today();
  v_fin   jsonb;
  v_show_fin boolean := public.has_perm('accounting', 'view') or public.has_perm('reports', 'view');
  v_mort_pct numeric;
  v_exp_days int;
begin
  perform public.require_perm('dashboard', 'view');
  select mortality_alert_pct, medicine_expiry_days into v_mort_pct, v_exp_days from app_settings where id = 1;
  if v_show_fin then
    v_fin := public.financial_summary(v_today, v_today);
  end if;

  return jsonb_build_object(
    'today', v_today,
    'live_birds', (select coalesce(sum(public.batch_live_birds(id)), 0) from chicken_batches where status = 'active'),
    'active_batches', (select count(*) from chicken_batches where status = 'active'),
    'eggs_collected_today', (select coalesce(sum(total_eggs), 0) from egg_collections where status = 'posted' and collection_date = v_today),
    'saleable_today', (select coalesce(sum(saleable_eggs), 0) from egg_collections where status = 'posted' and collection_date = v_today),
    'production_rate_today', (select round(sum(saleable_eggs)::numeric / nullif(sum(live_hens), 0) * 100, 2)
                                from egg_collections where status = 'posted' and collection_date = v_today),
    'eggs_purchased_today', (select coalesce(sum(i.quantity_eggs), 0) from egg_purchase_items i join egg_purchases p on p.id = i.purchase_id
                              where p.status = 'confirmed' and p.purchase_date = v_today),
    'eggs_sold_today', (select coalesce(sum(i.quantity_eggs), 0) from egg_sale_items i join egg_sales s on s.id = i.sale_id
                         where s.status = 'confirmed' and s.sale_date = v_today),
    'available_stock', (select coalesce(sum(i.quantity), 0) from egg_inventory i join egg_grades g on g.id = i.grade_id where g.is_saleable),
    'tray_capacity', (select eggs_per_unit from packaging_types where code = 'tray'),
    'broken_today', (select coalesce(sum(broken_eggs + rejected_eggs), 0) from egg_collections where status = 'posted' and collection_date = v_today)
                    + (select coalesce(sum(quantity), 0) from egg_damages where status = 'posted' and damage_date = v_today),
    'total_customers', (select count(*) from customers where is_active),
    'outstanding_receivables', case when v_show_fin or public.has_perm('customers', 'view')
                                 then (select coalesce(sum(greatest(public.customer_balance(id), 0)), 0) from customers) end,
    'outstanding_payables', case when v_show_fin or public.has_perm('suppliers', 'view')
                              then (select coalesce(sum(greatest(public.supplier_balance(id), 0)), 0) from suppliers) end,
    'revenue_today', v_fin #> '{revenue,total}',
    'expenses_today', v_fin #> '{costs,total}',
    'net_profit_today', v_fin -> 'net_profit',
    'collections_today', v_fin #> '{cash,customer_receipts}',
    'cash_balance', case when v_show_fin then (select coalesce(sum(balance), 0) from v_cash_account_balances where is_active) end,
    'alerts', jsonb_build_object(
      'low_egg_stock', (
        select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'quantity', coalesce(s.qty, 0), 'reorder_level', g.reorder_level)), '[]'::jsonb)
          from egg_grades g
          left join (select grade_id, sum(quantity) qty from egg_inventory group by grade_id) s on s.grade_id = g.id
         where g.is_active and g.is_saleable and g.reorder_level > 0 and coalesce(s.qty, 0) <= g.reorder_level),
      'low_feed', (
        select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', current_stock, 'unit', unit, 'reorder_level', reorder_level)), '[]'::jsonb)
          from feed_inventory where is_active and current_stock <= reorder_level and reorder_level > 0),
      'low_medicine', (
        select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', current_stock, 'unit', unit, 'reorder_level', reorder_level)), '[]'::jsonb)
          from medicines where is_active and current_stock <= reorder_level and reorder_level > 0),
      'low_packaging', (
        select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', current_stock, 'unit', unit, 'reorder_level', reorder_level)), '[]'::jsonb)
          from packaging_items where is_active and current_stock <= reorder_level and reorder_level > 0),
      'expiring_medicine', (
        select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'batch_no', b.batch_no, 'expiry_date', b.expiry_date,
                                                     'quantity', b.quantity_on_hand, 'expired', b.expiry_date < v_today)
                                  order by b.expiry_date), '[]'::jsonb)
          from medicine_batches b join medicines m on m.id = b.medicine_id
         where b.quantity_on_hand > 0 and b.expiry_date is not null and b.expiry_date <= v_today + v_exp_days),
      'mortality', (
        select coalesce(jsonb_agg(x order by x->>'date' desc), '[]'::jsonb) from (
          select jsonb_build_object('date', m.record_date, 'batch_code', b.batch_code, 'quantity', sum(m.quantity),
                   'cause', string_agg(distinct m.cause, ', '),
                   'pct', round(sum(m.quantity)::numeric / nullif(public.batch_live_birds(b.id, m.record_date) + sum(m.quantity), 0) * 100, 2),
                   'is_high', (sum(m.quantity)::numeric / nullif(public.batch_live_birds(b.id, m.record_date) + sum(m.quantity), 0) * 100) >= v_mort_pct) x
            from mortality_records m join chicken_batches b on b.id = m.batch_id
           where m.status = 'posted' and m.record_date >= v_today - 6
           group by m.record_date, b.id, b.batch_code
           order by m.record_date desc
           limit 10) t),
      'vaccinations_due', (
        select coalesce(jsonb_agg(jsonb_build_object('batch_code', b.batch_code, 'vaccine', v.vaccine_name, 'due', v.next_due_date) order by v.next_due_date), '[]'::jsonb)
          from vaccination_records v join chicken_batches b on b.id = v.batch_id
         where b.status = 'active' and v.next_due_date between v_today and v_today + 7
           and not exists (select 1 from vaccination_records v2 where v2.batch_id = v.batch_id
                             and v2.vaccine_name = v.vaccine_name and v2.vaccination_date >= v.next_due_date))
    )
  );
end;
$$;

create or replace function public.dashboard_charts(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.app_today();
  v_from  date;
  v_show_fin boolean := public.has_perm('accounting', 'view') or public.has_perm('reports', 'view');
begin
  perform public.require_perm('dashboard', 'view');
  v_from := v_today - greatest(least(coalesce(p_days, 30), 366), 1) + 1;
  return jsonb_build_object(
    'production', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d::date,
               'total', coalesce(c.total, 0), 'saleable', coalesce(c.saleable, 0),
               'broken', coalesce(c.broken, 0), 'rate', c.rate) order by d), '[]'::jsonb)
        from generate_series(v_from, v_today, interval '1 day') d
        left join (select collection_date, sum(total_eggs) total, sum(saleable_eggs) saleable,
                          sum(broken_eggs + rejected_eggs) broken,
                          round(sum(saleable_eggs)::numeric / nullif(sum(live_hens), 0) * 100, 1) rate
                     from egg_collections where status = 'posted' and collection_date between v_from and v_today
                    group by collection_date) c on c.collection_date = d::date),
    'sales', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d::date,
               'revenue', case when v_show_fin then coalesce(s.revenue, 0) end,
               'eggs', coalesce(s.eggs, 0)) order by d), '[]'::jsonb)
        from generate_series(v_from, v_today, interval '1 day') d
        left join (select s.sale_date, sum(s.total_amount) revenue,
                          (select sum(i.quantity_eggs) from egg_sale_items i join egg_sales s2 on s2.id = i.sale_id
                            where s2.status = 'confirmed' and s2.sale_date = s.sale_date) eggs
                     from egg_sales s where s.status = 'confirmed' and s.sale_date between v_from and v_today
                    group by s.sale_date) s on s.sale_date = d::date),
    'expenses', case when v_show_fin then (
      select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'amount', coalesce(e.amt, 0)) order by d), '[]'::jsonb)
        from generate_series(v_from, v_today, interval '1 day') d
        left join (select expense_date, sum(amount) amt from expenses where status = 'posted'
                    and expense_date between v_from and v_today group by expense_date) e on e.expense_date = d::date) end,
    'expenses_by_category', case when v_show_fin then (
      select coalesce(jsonb_agg(jsonb_build_object('category', c.name, 'amount', t.amt) order by t.amt desc), '[]'::jsonb)
        from (select category_id, sum(amount) amt from expenses where status = 'posted'
               and expense_date between v_from and v_today group by category_id) t
        join expense_categories c on c.id = t.category_id) end
  );
end;
$$;
