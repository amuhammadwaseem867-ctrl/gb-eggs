-- =============================================================================
-- GB Eggs ERP — DEVELOPMENT SEED DATA ONLY. Never run against production.
-- Generates ~30 days of realistic activity ending today, going through the same
-- triggers and internal functions the application uses, so stock, balances
-- and the cashbook are internally consistent.
-- =============================================================================
do $$
declare
  v_today date := public.app_today();
  v_start date := public.app_today() - 29;
  f_main uuid; f_two uuid; f_store uuid;
  s_a uuid; s_b uuid; s_c uuid;
  br_hy uuid; br_lo uuid;
  b1 uuid; b2 uuid; b3 uuid;
  sup_egg1 uuid; sup_egg2 uuid; sup_chick uuid; sup_feed uuid; sup_med uuid; sup_pack uuid;
  cust uuid[]; c uuid;
  acc_cash uuid; acc_bank uuid; acc_wallet uuid;
  g_s uuid; g_m uuid; g_l uuid; g_xl uuid; g_d uuid;
  feed_layer uuid; feed_grower uuid; fc_cat uuid;
  med_nd uuid; med_vit uuid; med_ab uuid;
  pk_tray uuid; pk_carton uuid;
  e uuid; emp uuid[];
  cat_elec uuid; cat_trans uuid; cat_maint uuid; cat_misc uuid; cat_labour uuid;
  d date; i int; shed record; v_hens int; v_tot int; v_m int; v_l int; v_xl int; v_s int; v_dirty int; v_broken int; v_rej int;
  v_sale uuid; v_stock int; v_qty int; v_trays int; v_price numeric; v_total numeric; v_pay numeric;
  v_purchase uuid; r record;
begin
  if exists (select 1 from public.farms) then
    raise notice 'Seed skipped: data already present';
    return;
  end if;
  perform setseed(0.42);

  update public.app_settings set address = 'Plot 14, Raiwind Road, Lahore, Punjab, Pakistan',
         phone = '+92 300 1234567', email = 'info@gbeggs.example', ntn_number = '1234567-8' where id = 1;

  select id into acc_cash from public.cash_accounts where name = 'Cash in Hand';
  update public.cash_accounts set opening_balance = 150000 where id = acc_cash;
  insert into public.cash_accounts (name, account_type, bank_name, account_number, opening_balance)
  values ('Meezan Bank — Current', 'bank', 'Meezan Bank', 'PK36MEZN0001234567890', 750000) returning id into acc_bank;
  insert into public.cash_accounts (name, account_type, opening_balance) values ('JazzCash Wallet', 'mobile_wallet', 25000) returning id into acc_wallet;

  select id into g_s from public.egg_grades where system_code = 'SMALL';
  select id into g_m from public.egg_grades where system_code = 'MEDIUM';
  select id into g_l from public.egg_grades where system_code = 'LARGE';
  select id into g_xl from public.egg_grades where system_code = 'XL';
  select id into g_d from public.egg_grades where system_code = 'DIRTY';
  update public.egg_grades set default_price = 24, reorder_level = 900 where id = g_s;
  update public.egg_grades set default_price = 27, reorder_level = 1500 where id = g_m;
  update public.egg_grades set default_price = 30, reorder_level = 1500 where id = g_l;
  update public.egg_grades set default_price = 33, reorder_level = 600 where id = g_xl;
  update public.egg_grades set default_price = 18, reorder_level = 0 where id = g_d;

  insert into public.farms (code, name, location, manager_name, phone, capacity)
  values ('GB-MAIN', 'GB Main Farm', 'Raiwind Road, Lahore', 'Imran Ali', '+92 301 1112233', 12000) returning id into f_main;
  insert into public.farms (code, name, location, manager_name, phone, capacity)
  values ('GB-SKP', 'GB Sheikhupura Farm', 'Sheikhupura', 'Usman Tariq', '+92 302 4445566', 6000) returning id into f_two;
  insert into public.farms (code, name, farm_type, location)
  values ('GB-STORE', 'GB City Store', 'store', 'Township, Lahore') returning id into f_store;

  insert into public.sheds (farm_id, code, name, shed_type, capacity) values (f_main, 'A', 'Shed A', 'layer', 6000) returning id into s_a;
  insert into public.sheds (farm_id, code, name, shed_type, capacity) values (f_main, 'B', 'Shed B', 'layer', 5000) returning id into s_b;
  insert into public.sheds (farm_id, code, name, shed_type, capacity) values (f_two, 'C', 'Shed C', 'layer', 4000) returning id into s_c;

  insert into public.chicken_breeds (name, bird_type, description) values ('Hy-Line Brown', 'layer', 'Brown egg layer, high persistency') returning id into br_hy;
  insert into public.chicken_breeds (name, bird_type, description) values ('Lohmann Brown-Classic', 'layer', 'Robust brown layer') returning id into br_lo;
  insert into public.chicken_breeds (name, bird_type) values ('Novogen White', 'layer');

  insert into public.suppliers (code, name, business_name, supplier_type, phone, city, opening_balance) values
    ('S-001', 'Haji Rafiq', 'Rafiq Poultry Farm', 'egg', '+92 300 5551001', 'Kasur', 0) returning id into sup_egg1;
  insert into public.suppliers (code, name, business_name, supplier_type, phone, city, opening_balance) values
    ('S-002', 'Waqas Ahmed', 'Punjab Layers', 'egg', '+92 321 5551002', 'Okara', 35000) returning id into sup_egg2;
  insert into public.suppliers (code, name, business_name, supplier_type, phone, city) values
    ('S-003', 'Big Bird Hatcheries', 'Big Bird Group', 'chicken', '+92 42 3555100', 'Lahore') returning id into sup_chick;
  insert into public.suppliers (code, name, business_name, supplier_type, phone, city, opening_balance) values
    ('S-004', 'Hi-Tech Feeds', 'Hi-Tech Feeds (Pvt) Ltd', 'feed', '+92 42 3555200', 'Lahore', 120000) returning id into sup_feed;
  insert into public.suppliers (code, name, business_name, supplier_type, phone, city) values
    ('S-005', 'Vet Care Pharma', 'Vet Care Pharma', 'medicine', '+92 42 3555300', 'Lahore') returning id into sup_med;
  insert into public.suppliers (code, name, business_name, supplier_type, phone, city) values
    ('S-006', 'Lahore Pulp Trays', 'Lahore Pulp Industries', 'packaging', '+92 42 3555400', 'Lahore') returning id into sup_pack;

  insert into public.customers (code, name, business_name, phone, address, city, opening_balance, credit_limit) values
    ('C-001', 'Ahmed Raza',  'Raza General Store',     '+92 300 7001001', 'Model Town Market', 'Lahore', 18000, 2500000),
    ('C-002', 'Bilal Khan',  'Khan Bakers',            '+92 301 7001002', 'Johar Town',        'Lahore', 0,     3000000),
    ('C-003', 'Sana Malik',  'Malik Hotel & Restaurant','+92 302 7001003', 'Gulberg III',      'Lahore', 42000, 3000000),
    ('C-004', 'Kashif Iqbal','Iqbal Egg Traders',      '+92 303 7001004', 'Akbari Mandi',     'Lahore', 0,     null),
    ('C-005', 'Farah Naz',   'Fresh Mart',             '+92 304 7001005', 'DHA Phase 5',      'Lahore', 0,     2000000),
    ('C-006', 'Zeeshan Ali', 'Ali Super Store',        '+92 305 7001006', 'Sheikhupura Road', 'Sheikhupura', 9500, 2000000);
  select array_agg(id order by code) into cust from public.customers;

  -- Flocks placed ~4 months ago at 18 weeks of age.
  insert into public.chicken_batches (batch_code, farm_id, shed_id, breed_id, bird_type, placement_date, age_at_placement_days, opening_birds)
  values ('B-2026-01', f_main, s_a, br_hy, 'layer', v_today - 130, 126, 5500) returning id into b1;
  insert into public.chicken_batches (batch_code, farm_id, shed_id, breed_id, bird_type, placement_date, age_at_placement_days, opening_birds)
  values ('B-2026-02', f_main, s_b, br_lo, 'layer', v_today - 110, 126, 4200) returning id into b2;
  insert into public.chicken_batches (batch_code, farm_id, shed_id, breed_id, bird_type, placement_date, age_at_placement_days, opening_birds)
  values ('B-2026-03', f_two, s_c, br_hy, 'layer', v_today - 95, 126, 3300) returning id into b3;

  insert into public.chicken_purchases (batch_id, supplier_id, purchase_date, invoice_no, quantity, rate, paid_amount, payment_method, cash_account_id)
  values (b2, sup_chick, v_today - 60, 'BB-77812', 300, 1150, 200000, 'bank_transfer', acc_bank);
  insert into public.chicken_transfers (from_batch_id, to_batch_id, transfer_date, quantity, notes)
  values (b1, b3, v_today - 50, 150, 'Balancing shed density');

  insert into public.vaccination_records (batch_id, vaccination_date, vaccine_name, disease_target, dose, method, birds_vaccinated, administered_by, next_due_date)
  values (b1, v_today - 40, 'ND-IB Live', 'Newcastle / Bronchitis', '1 dose', 'drinking_water', 5300, 'Dr. Asif (Vet)', v_today + 3),
         (b2, v_today - 35, 'ND Killed', 'Newcastle', '0.5 ml', 'injection', 4450, 'Dr. Asif (Vet)', v_today + 5),
         (b3, v_today - 20, 'AI H9', 'Avian Influenza H9', '0.5 ml', 'injection', 3400, 'Dr. Asif (Vet)', v_today + 70);

  -- Packaging material
  insert into public.packaging_items (name, packaging_code, unit, reorder_level, unit_cost) values
    ('Pulp egg tray (30)', 'tray', 'pcs', 2000, 9) returning id into pk_tray;
  insert into public.packaging_items (name, packaging_code, unit, reorder_level, unit_cost) values
    ('Corrugated carton (12 trays)', 'carton', 'pcs', 100, 85) returning id into pk_carton;
  insert into public.packaging_movements (movement_date, item_id, movement_type, quantity, unit_cost, notes)
  values (v_start, pk_tray, 'opening', 6000, 9, 'Opening stock'), (v_start, pk_carton, 'opening', 250, 85, 'Opening stock');
  insert into public.packaging_movements (movement_date, item_id, movement_type, quantity, unit_cost, supplier_id, invoice_no, paid_amount, payment_method, cash_account_id)
  values (v_today - 12, pk_tray, 'purchase', 8000, 9.5, sup_pack, 'LP-5521', 40000, 'cash', acc_cash);

  -- Feed
  insert into public.feed_categories (name, description) values ('Layer feed', 'Complete layer rations') returning id into fc_cat;
  insert into public.feed_categories (name) values ('Grower feed'), ('Concentrates');
  insert into public.feed_inventory (name, category_id, unit, opening_stock, opening_cost, reorder_level)
  values ('Layer Mash 17% CP', fc_cat, 'kg', 25000, 112, 8000) returning id into feed_layer;
  insert into public.feed_inventory (name, category_id, unit, opening_stock, opening_cost, reorder_level)
  values ('Layer Concentrate 35%', fc_cat, 'kg', 2000, 165, 500) returning id into feed_grower;

  -- Medicines
  insert into public.medicines (name, category, unit, manufacturer, reorder_level) values ('ND-IB Live Vaccine (1000 ds)', 'vaccine', 'vial', 'Ceva', 5) returning id into med_nd;
  insert into public.medicines (name, category, unit, manufacturer, reorder_level) values ('Multivitamin AD3E', 'vitamin', 'l', 'Vet Care', 10) returning id into med_vit;
  insert into public.medicines (name, category, unit, manufacturer, reorder_level) values ('Tylosin 20%', 'antibiotic', 'kg', 'Vet Care', 2) returning id into med_ab;
  insert into public.medicine_movements (movement_date, medicine_id, movement_type, batch_no, expiry_date, quantity, unit_cost, supplier_id, invoice_no, paid_amount, payment_method, cash_account_id)
  values (v_today - 28, med_nd, 'purchase', 'CEV-2311', v_today + 20, 12, 3200, sup_med, 'VC-1001', 38400, 'cash', acc_cash),
         (v_today - 28, med_vit, 'purchase', 'AD3E-889', v_today + 300, 30, 1450, sup_med, 'VC-1001', 0, null, null),
         (v_today - 15, med_ab, 'purchase', 'TYL-552', v_today + 180, 4, 5200, sup_med, 'VC-1033', 10000, 'bank_transfer', acc_bank);
  insert into public.medicine_movements (movement_date, medicine_id, movement_type, quantity, chicken_batch_id, shed_id, administered_by, notes)
  values (v_today - 20, med_vit, 'usage', 8, b1, s_a, 'Farm supervisor', 'Heat stress support'),
         (v_today - 18, med_vit, 'usage', 6, b2, s_b, 'Farm supervisor', 'Heat stress support'),
         (v_today - 10, med_ab, 'usage', 1.5, b3, s_c, 'Dr. Asif (Vet)', 'Respiratory signs in Shed C'),
         (v_today - 6, med_nd, 'usage', 6, b1, s_a, 'Dr. Asif (Vet)', 'Booster');

  -- Employees
  insert into public.employees (employee_code, full_name, cnic, phone, position, department, farm_id, joining_date, basic_salary) values
    ('EMP-001', 'Imran Ali',     '35202-1234567-1', '+92 301 1112233', 'Farm Manager',   'Operations', f_main, v_today - 900, 95000),
    ('EMP-002', 'Usman Tariq',   '35401-2345678-3', '+92 302 4445566', 'Farm Supervisor','Operations', f_two,  v_today - 600, 65000),
    ('EMP-003', 'Shahid Hussain','35202-3456789-5', '+92 303 7778899', 'Shed Worker',    'Operations', f_main, v_today - 400, 38000),
    ('EMP-004', 'Nadeem Akhtar', '35202-4567890-7', '+92 304 1212121', 'Driver',         'Logistics',  f_main, v_today - 300, 42000),
    ('EMP-005', 'Ayesha Siddiqui','35202-5678901-2','+92 305 3434343', 'Accountant',     'Finance',    f_store, v_today - 250, 75000);
  select array_agg(id order by employee_code) into emp from public.employees;

  insert into public.employee_advances (employee_id, advance_date, amount, cash_account_id, notes)
  values (emp[3], v_today - 25, 10000, acc_cash, 'Family emergency'), (emp[4], v_today - 9, 5000, acc_cash, null);

  -- Salary for last month: paid for most, one pending.
  insert into public.salary_records (employee_id, salary_month, working_days, present_days, basic_salary, allowances, overtime, deductions, advance_deduction)
  select id, date_trunc('month', v_today - interval '1 month')::date, 26, 25, basic_salary,
         case when position = 'Farm Manager' then 10000 else 3000 end, 0, 0,
         case when employee_code = 'EMP-003' then 5000 else 0 end
    from public.employees;
  for r in select sr.id, e2.employee_code from public.salary_records sr join public.employees e2 on e2.id = sr.employee_id loop
    if r.employee_code <> 'EMP-005' then
      -- direct internal call (seed runs without a signed-in user)
      perform public._internal(true);
      update public.salary_records set status = 'paid', paid_date = date_trunc('month', v_today)::date + 2,
             cash_account_id = acc_bank, payment_method = 'bank_transfer' where id = r.id;
      perform public._internal(false);
      perform public._post_transaction(date_trunc('month', v_today)::date + 2, acc_bank, 'out',
        (select net_salary from public.salary_records where id = r.id), 'salary', 'salary_record', r.id, 'Salary — ' || r.employee_code, null);
    end if;
  end loop;

  select id into cat_elec from public.expense_categories where name = 'Electricity';
  select id into cat_trans from public.expense_categories where name = 'Transportation';
  select id into cat_maint from public.expense_categories where name = 'Maintenance';
  select id into cat_misc from public.expense_categories where name = 'Miscellaneous';
  select id into cat_labour from public.expense_categories where name = 'Labour';

  -- Opening stock in the city store
  insert into public.egg_stock_adjustments (adjustment_date, farm_id, grade_id, adjustment_type, quantity, reason)
  values (v_start, f_store, g_l, 'opening', 3000, 'Opening stock'), (v_start, f_store, g_m, 'opening', 2400, 'Opening stock');

  -- ---------------------------------------------------------------------------
  -- Daily operations
  -- ---------------------------------------------------------------------------
  d := v_start;
  while d <= v_today loop
    -- Mortality (small, occasional)
    for shed in select b.id as batch_id from public.chicken_batches b loop
      if random() < 0.55 then
        insert into public.mortality_records (batch_id, record_date, quantity, cause)
        values (shed.batch_id, d, 1 + floor(random() * 4)::int,
                (array['Natural','Heat stress','Respiratory','Prolapse','Unknown'])[1 + floor(random() * 5)::int]);
      end if;
    end loop;

    -- Egg collections
    for shed in select b.id as batch_id, b.farm_id, b.shed_id from public.chicken_batches b where b.status = 'active' loop
      v_hens := public.batch_live_birds(shed.batch_id, d);
      v_tot := floor(v_hens * (0.86 + random() * 0.07))::int;
      v_broken := floor(v_tot * (0.008 + random() * 0.01))::int;
      v_rej := floor(v_tot * 0.003)::int;
      v_dirty := floor(v_tot * (0.02 + random() * 0.01))::int;
      v_s := floor(v_tot * 0.10)::int;
      v_xl := floor(v_tot * 0.12)::int;
      v_l := floor(v_tot * 0.42)::int;
      v_m := v_tot - v_broken - v_rej - v_dirty - v_s - v_xl - v_l;
      insert into public.egg_collections (collection_date, farm_id, shed_id, batch_id, morning_eggs, evening_eggs,
        small_eggs, medium_eggs, large_eggs, xl_eggs, dirty_eggs, broken_eggs, rejected_eggs)
      values (d, shed.farm_id, shed.shed_id, shed.batch_id, floor(v_tot * 0.62)::int, v_tot - floor(v_tot * 0.62)::int,
        v_s, v_m, v_l, v_xl, v_dirty, v_broken, v_rej);
    end loop;

    -- Feed consumption ~115 g / bird / day
    for shed in select b.id as batch_id, b.farm_id, b.shed_id from public.chicken_batches b where b.status = 'active' loop
      insert into public.feed_consumption (consumption_date, farm_id, shed_id, batch_id, feed_id, quantity)
      values (d, shed.farm_id, shed.shed_id, shed.batch_id, feed_layer, round(public.batch_live_birds(shed.batch_id, d) * 0.115, 1));
    end loop;
    if extract(dow from d) in (1, 4) then
      insert into public.feed_purchases (purchase_date, supplier_id, feed_id, invoice_no, quantity, unit_cost, paid_amount, payment_method, cash_account_id)
      values (d, sup_feed, feed_layer, 'HTF-' || to_char(d, 'MMDD'), 6000, 112 + floor(random() * 4),
              case when random() < 0.6 then 400000 else 0 end, 'bank_transfer', acc_bank);
    end if;

    -- Occasional egg purchases into the store
    if extract(dow from d) = 3 then
      insert into public.egg_purchases (purchase_no, supplier_id, farm_id, purchase_date, supplier_invoice_no)
      values (public._next_document_number('egg_purchase'), case when random() < 0.5 then sup_egg1 else sup_egg2 end, f_store, d, 'SUP-' || to_char(d, 'MMDD'))
      returning id into v_purchase;
      v_trays := 60 + floor(random() * 60)::int;
      insert into public.egg_purchase_items (purchase_id, grade_id, unit_code, unit_qty, eggs_per_unit, quantity_eggs, rate, line_total)
      values (v_purchase, g_l, 'tray', v_trays, 30, v_trays * 30, 780, v_trays * 780);
      update public.egg_purchases set subtotal = v_trays * 780, total_amount = v_trays * 780 where id = v_purchase;
      perform public._confirm_egg_purchase(v_purchase);
      perform public._post_document_payment('egg_purchase', v_purchase, 'supplier', null,
        (select supplier_id from public.egg_purchases where id = v_purchase), 'out',
        round(v_trays * 780 * 0.7, 0), 'cash', acc_cash, d, 'Part payment');
    end if;

    -- Sales: 3 invoices per day across grades, sized to available stock
    for i in 1..5 loop
      c := cust[1 + floor(random() * array_length(cust, 1))::int];
      insert into public.egg_sales (invoice_no, customer_id, farm_id, sale_date, tax_rate)
      values (public._next_document_number('egg_sale'), c, case when i = 5 then f_store when i = 4 then f_two else f_main end, d, 0)
      returning id into v_sale;
      v_total := 0;
      for r in select g.id, g.default_price, g.code from public.egg_grades g where g.id in (g_l, g_m, g_xl) order by g.sort_order loop
        select coalesce(quantity, 0) into v_stock from public.egg_inventory
         where farm_id = (select farm_id from public.egg_sales where id = v_sale) and grade_id = r.id;
        v_trays := least(floor(coalesce(v_stock, 0) * 0.28 / 30)::int, 20 + floor(random() * 40)::int);
        if v_trays > 0 then
          v_price := r.default_price * 30 - floor(random() * 3) * 10;
          insert into public.egg_sale_items (sale_id, grade_id, unit_code, unit_qty, eggs_per_unit, quantity_eggs, unit_price, line_total)
          values (v_sale, r.id, 'tray', v_trays, 30, v_trays * 30, v_price, v_trays * v_price);
          v_total := v_total + v_trays * v_price;
        end if;
      end loop;
      if v_total = 0 then
        delete from public.egg_sales where id = v_sale;
      else
        update public.egg_sales set subtotal = v_total, discount = case when v_total > 50000 then 500 else 0 end,
               total_amount = v_total - case when v_total > 50000 then 500 else 0 end where id = v_sale;
        perform public._confirm_egg_sale(v_sale);
        v_pay := round((select total_amount from public.egg_sales where id = v_sale) * (array[1, 0.5, 0.7, 0, 1])[1 + floor(random() * 5)::int], 0);
        if v_pay > 0 then
          perform public._post_document_payment('egg_sale', v_sale, 'customer', c, null, 'in', v_pay,
            (array['cash','bank_transfer','mobile_wallet'])[1 + floor(random() * 3)::int],
            (array[acc_cash, acc_bank, acc_wallet])[1 + floor(random() * 3)::int], d, null);
        end if;
      end if;
    end loop;

    -- Small dirty/small egg walk-in sale
    select coalesce(quantity, 0) into v_stock from public.egg_inventory where farm_id = f_main and grade_id = g_s;
    v_qty := least(coalesce(v_stock, 0), 300);
    if v_qty >= 30 then
      v_trays := v_qty / 30;
      insert into public.egg_sales (invoice_no, walk_in_name, walk_in_phone, farm_id, sale_date, subtotal, total_amount)
      values (public._next_document_number('egg_sale'), 'Walk-in customer', null, f_main, d, v_trays * 700, v_trays * 700) returning id into v_sale;
      insert into public.egg_sale_items (sale_id, grade_id, unit_code, unit_qty, eggs_per_unit, quantity_eggs, unit_price, line_total)
      values (v_sale, g_s, 'tray', v_trays, 30, v_trays * 30, 700, v_trays * 700);
      perform public._confirm_egg_sale(v_sale);
      perform public._post_document_payment('egg_sale', v_sale, 'customer', null, null, 'in', v_trays * 700, 'cash', acc_cash, d, null);
    end if;

    -- Breakages in handling
    if random() < 0.3 then
      insert into public.egg_damages (damage_date, farm_id, grade_id, quantity, source, reason)
      values (d, f_main, g_m, 10 + floor(random() * 30)::int, 'handling', 'Breakage during grading');
    end if;

    -- Customer collections on old balances (not revenue)
    if extract(dow from d) = 6 then
      insert into public.payments (payment_no, payment_date, party_type, customer_id, direction, amount, method, cash_account_id, notes)
      values (null, d, 'customer', cust[3], 'in', 15000, 'cash', acc_cash, 'On-account collection');
    end if;

    -- Expenses
    insert into public.expenses (expense_no, expense_date, category_id, amount, payment_method, cash_account_id, farm_id, description)
    values (null, d, cat_trans, 2500 + floor(random() * 2500), 'cash', acc_cash, f_main, 'Delivery fuel');
    if random() < 0.25 then
      insert into public.expenses (expense_no, expense_date, category_id, amount, payment_method, cash_account_id, farm_id, description)
      values (null, d, cat_maint, 1500 + floor(random() * 8000), 'cash', acc_cash, f_main, 'Repairs & spare parts');
    end if;
    if extract(day from d) = 5 then
      insert into public.expenses (expense_no, expense_date, category_id, amount, payment_method, cash_account_id, farm_id, reference, description)
      values (null, d, cat_elec, 185000, 'bank_transfer', acc_bank, f_main, 'LESCO-' || to_char(d, 'YYYYMM'), 'Electricity bill');
    end if;
    if extract(dow from d) = 1 then
      insert into public.expenses (expense_no, expense_date, category_id, amount, payment_method, cash_account_id, farm_id, description)
      values (null, d, cat_labour, 12000, 'cash', acc_cash, f_two, 'Daily-wage labour');
    end if;

    -- Attendance
    for e in select id from public.employees loop
      if extract(dow from d) <> 0 then
        insert into public.attendance (employee_id, attendance_date, status, check_in, check_out)
        values (e, d, case when random() < 0.93 then 'present' when random() < 0.5 then 'leave' else 'absent' end, '08:00', '17:00');
      end if;
    end loop;

    d := d + 1;
  end loop;

  -- One cancelled invoice for audit-trail demonstration
  insert into public.egg_sales (invoice_no, customer_id, farm_id, sale_date, subtotal, total_amount, status, cancelled_at, cancel_reason)
  values (public._next_document_number('egg_sale'), cust[5], f_main, v_today - 3, 9000, 9000, 'cancelled', now(), 'Customer cancelled order before dispatch');

  -- Other income
  insert into public.other_incomes (income_no, income_date, category, amount, cash_account_id, received_from, description)
  values (null, v_today - 7, 'manure', 28000, acc_cash, 'Green Fields Nursery', 'Poultry manure — 4 trolleys');

  raise notice 'GB Eggs development seed complete';
end;
$$;
