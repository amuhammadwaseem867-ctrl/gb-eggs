-- =============================================================================
-- GB Eggs ERP — 0006 Expenses, other income, employees, attendance & payroll
-- =============================================================================

create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  expense_no       text not null unique,
  expense_date     date not null,
  category_id      uuid not null references public.expense_categories(id) on delete restrict,
  amount           numeric(14,2) not null check (amount > 0),
  payment_method   text not null default 'cash',
  cash_account_id  uuid not null references public.cash_accounts(id) on delete restrict,
  farm_id          uuid references public.farms(id) on delete restrict,
  reference        text,
  payee            text,
  description      text,
  status           text not null default 'posted' check (status in ('posted','void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index expenses_date_idx on public.expenses(expense_date);
create index expenses_category_idx on public.expenses(category_id);

create or replace function public._expense_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expense_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  if new.expense_no is null or new.expense_no = '' then
    new.expense_no := public._next_document_number('expense');
  end if;
  return new;
end;
$$;
create trigger expenses_before before insert on public.expenses for each row execute function public._expense_before();

create or replace function public._expense_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text;
begin
  select name into v_cat from public.expense_categories where id = new.category_id;
  perform public._post_transaction(new.expense_date, new.cash_account_id, 'out', new.amount, 'expense',
    'expense', new.id, coalesce(v_cat, 'Expense') || coalesce(' — ' || new.description, ''), null);
  return new;
end;
$$;
create trigger expenses_after after insert on public.expenses for each row execute function public._expense_after();

create table public.other_incomes (
  id               uuid primary key default gen_random_uuid(),
  income_no        text not null unique,
  income_date      date not null,
  category         text not null check (category in ('manure','empty_trays','scrap','rent','interest','owner_capital','loan_received','misc')),
  amount           numeric(14,2) not null check (amount > 0),
  cash_account_id  uuid not null references public.cash_accounts(id) on delete restrict,
  payment_method   text not null default 'cash',
  received_from    text,
  description      text,
  status           text not null default 'posted' check (status in ('posted','void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index other_incomes_date_idx on public.other_incomes(income_date);

create or replace function public._income_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.income_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  if new.income_no is null or new.income_no = '' then
    new.income_no := public._next_document_number('income');
  end if;
  return new;
end;
$$;
create trigger other_incomes_before before insert on public.other_incomes for each row execute function public._income_before();

create or replace function public._income_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Owner capital and loans are cash in, but not business income.
  perform public._post_transaction(new.income_date, new.cash_account_id, 'in', new.amount,
    case when new.category in ('owner_capital','loan_received') then new.category else 'other_income' end,
    'other_income', new.id, coalesce(new.description, initcap(replace(new.category, '_', ' '))), null);
  return new;
end;
$$;
create trigger other_incomes_after after insert on public.other_incomes for each row execute function public._income_after();

-- -----------------------------------------------------------------------------
-- Employees
-- -----------------------------------------------------------------------------
create table public.employees (
  id            uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name     text not null,
  cnic          text,
  phone         text,
  email         text,
  address       text,
  position      text not null,
  department    text,
  farm_id       uuid references public.farms(id) on delete set null,
  joining_date  date not null,
  leaving_date  date,
  basic_salary  numeric(12,2) not null default 0 check (basic_salary >= 0),
  status        text not null default 'active' check (status in ('active','inactive','terminated')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (leaving_date is null or leaving_date >= joining_date)
);
create index employees_status_idx on public.employees(status);
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();

create table public.attendance (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  attendance_date  date not null,
  status           text not null check (status in ('present','absent','leave','half_day','holiday')),
  check_in         time,
  check_out        time,
  notes            text,
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, attendance_date),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index attendance_date_idx on public.attendance(attendance_date);
create trigger attendance_updated_at before update on public.attendance for each row execute function public.set_updated_at();

create or replace function public._attendance_guard()
returns trigger
language plpgsql
as $$
begin
  if new.attendance_date > public.app_today() then raise exception 'Attendance cannot be marked for a future date'; end if;
  return new;
end;
$$;
create trigger attendance_guard before insert or update on public.attendance for each row execute function public._attendance_guard();

create table public.employee_advances (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete restrict,
  advance_date     date not null,
  amount           numeric(12,2) not null check (amount > 0),
  recovered_amount numeric(12,2) not null default 0 check (recovered_amount >= 0),
  cash_account_id  uuid not null references public.cash_accounts(id),
  payment_method   text not null default 'cash',
  notes            text,
  status           text not null default 'posted' check (status in ('posted','void')),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (recovered_amount <= amount)
);
create index employee_advances_emp_idx on public.employee_advances(employee_id);
create trigger employee_advances_guard before update on public.employee_advances
  for each row execute function public._guard_internal_columns('amount', 'recovered_amount', 'employee_id', 'cash_account_id', 'advance_date');

create or replace function public._advance_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.advance_date > public.app_today() then raise exception 'Date cannot be in the future'; end if;
  select full_name into v_name from public.employees where id = new.employee_id;
  perform public._post_transaction(new.advance_date, new.cash_account_id, 'out', new.amount, 'employee_advance',
    'employee_advance', new.id, 'Salary advance — ' || v_name, null);
  return new;
end;
$$;
create trigger employee_advances_after after insert on public.employee_advances for each row execute function public._advance_after();

create table public.salary_records (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete restrict,
  salary_month      date not null check (extract(day from salary_month) = 1),
  working_days      int check (working_days is null or working_days between 0 and 31),
  present_days      numeric(4,1) check (present_days is null or present_days >= 0),
  basic_salary      numeric(12,2) not null check (basic_salary >= 0),
  allowances        numeric(12,2) not null default 0 check (allowances >= 0),
  overtime          numeric(12,2) not null default 0 check (overtime >= 0),
  deductions        numeric(12,2) not null default 0 check (deductions >= 0),
  advance_deduction numeric(12,2) not null default 0 check (advance_deduction >= 0),
  gross_salary      numeric(12,2) generated always as (basic_salary + allowances + overtime - deductions) stored,
  net_salary        numeric(12,2) generated always as (basic_salary + allowances + overtime - deductions - advance_deduction) stored,
  status            text not null default 'pending' check (status in ('pending','paid','void')),
  paid_date         date,
  cash_account_id   uuid references public.cash_accounts(id),
  payment_method    text,
  notes             text,
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (basic_salary + allowances + overtime - deductions - advance_deduction >= 0)
);
create unique index salary_records_unique_month on public.salary_records(employee_id, salary_month) where status <> 'void';
create index salary_records_month_idx on public.salary_records(salary_month);
create trigger salary_records_updated_at before update on public.salary_records for each row execute function public.set_updated_at();

create or replace function public._salary_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outstanding numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'pending' and current_setting('gb.internal', true) is distinct from 'on' then
    raise exception 'Paid or void salary records cannot be edited' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and current_setting('gb.internal', true) is distinct from 'on'
     and (new.status is distinct from old.status or new.paid_date is distinct from old.paid_date) then
    raise exception 'Use the pay / void actions to change a salary status' using errcode = '42501';
  end if;
  if new.advance_deduction > 0 and new.status = 'pending' then
    select coalesce(sum(amount - recovered_amount), 0) into v_outstanding
      from public.employee_advances where employee_id = new.employee_id and status = 'posted';
    if new.advance_deduction > v_outstanding then
      raise exception 'Advance deduction (%) exceeds outstanding advances (%)', new.advance_deduction, v_outstanding;
    end if;
  end if;
  return new;
end;
$$;
create trigger salary_records_guard before insert or update on public.salary_records
  for each row execute function public._salary_guard();

create or replace function public.pay_salary(p_id uuid, p_cash_account uuid, p_method text, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s     public.salary_records%rowtype;
  v_left  numeric;
  v_take  numeric;
  r       record;
  v_name  text;
begin
  if not (public.has_perm('employees', 'edit') or public.has_perm('accounting', 'create')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select * into v_s from public.salary_records where id = p_id for update;
  if not found then raise exception 'Salary record not found'; end if;
  if v_s.status <> 'pending' then raise exception 'Salary is already %', v_s.status; end if;
  if p_date is null or p_date > public.app_today() then raise exception 'Invalid payment date'; end if;
  if p_cash_account is null then raise exception 'Select the account the salary is paid from'; end if;

  -- Recover advances oldest first.
  v_left := v_s.advance_deduction;
  for r in select * from public.employee_advances
            where employee_id = v_s.employee_id and status = 'posted' and recovered_amount < amount
            order by advance_date, created_at for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount - r.recovered_amount);
    perform public._internal(true);
    update public.employee_advances set recovered_amount = recovered_amount + v_take where id = r.id;
    perform public._internal(false);
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then raise exception 'Outstanding advances are lower than the advance deduction'; end if;

  perform public._internal(true);
  update public.salary_records
     set status = 'paid', paid_date = p_date, cash_account_id = p_cash_account, payment_method = coalesce(p_method, 'cash')
   where id = p_id;
  perform public._internal(false);

  select full_name into v_name from public.employees where id = v_s.employee_id;
  if v_s.net_salary > 0 then
    perform public._post_transaction(p_date, p_cash_account, 'out', v_s.net_salary, 'salary', 'salary_record', p_id,
      'Salary ' || to_char(v_s.salary_month, 'Mon YYYY') || ' — ' || v_name, null);
  end if;
end;
$$;

create or replace function public.void_salary(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.salary_records%rowtype;
begin
  perform public.require_perm('employees', 'delete');
  select * into v_s from public.salary_records where id = p_id for update;
  if not found then raise exception 'Salary record not found'; end if;
  if v_s.status <> 'pending' then raise exception 'Only pending salary records can be voided; paid salaries are final'; end if;
  perform public._internal(true);
  update public.salary_records set status = 'void', notes = coalesce(notes || E'\n', '') || 'Void: ' || p_reason where id = p_id;
  perform public._internal(false);
end;
$$;

-- Void an expense / income / advance by posting a reversing cash entry.
create or replace function public.void_cash_record(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv public.employee_advances%rowtype;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p_kind = 'expense' then
    perform public.require_perm('expenses', 'delete');
    update public.expenses set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id and status = 'posted';
    if not found then raise exception 'Expense not found or already void'; end if;
    perform public._reverse_transactions('expense', p_id, p_reason);
  elsif p_kind = 'income' then
    perform public.require_perm('accounting', 'delete');
    update public.other_incomes set status = 'void', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
     where id = p_id and status = 'posted';
    if not found then raise exception 'Income not found or already void'; end if;
    perform public._reverse_transactions('other_income', p_id, p_reason);
  elsif p_kind = 'advance' then
    perform public.require_perm('employees', 'delete');
    select * into v_adv from public.employee_advances where id = p_id and status = 'posted' for update;
    if not found then raise exception 'Advance not found or already void'; end if;
    if v_adv.recovered_amount > 0 then raise exception 'This advance has been partly recovered and cannot be voided'; end if;
    perform public._internal(true);
    update public.employee_advances set status = 'void', notes = coalesce(notes || E'\n', '') || 'Void: ' || p_reason where id = p_id;
    perform public._internal(false);
    perform public._reverse_transactions('employee_advance', p_id, p_reason);
  else
    raise exception 'Unknown record type %', p_kind;
  end if;
end;
$$;

select public._enable_audit('public.expenses');
select public._enable_audit('public.other_incomes');
select public._enable_audit('public.employees');
select public._enable_audit('public.attendance');
select public._enable_audit('public.employee_advances');
select public._enable_audit('public.salary_records');
