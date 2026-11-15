import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

const ADMIN_URL = process.env.TEST_DB_ADMIN_URL;
const DB_NAME = process.env.TEST_DB_NAME ?? "gb_eggs_test";
export const dbEnabled = Boolean(ADMIN_URL);

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: `${ADMIN_URL!.replace(/\/$/, "")}/${DB_NAME}`, max: 6 });
  }
  return pool;
}
export async function closePool() {
  await pool?.end();
  pool = null;
}

/** Runs SQL as the database owner (like a migration / service role). */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await getPool().query(text, params);
  return r.rows as T[];
}

/** Runs fn inside a transaction as a signed-in Supabase user (RLS applies). */
export async function asUser<T>(userId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query(userId ? "set local role authenticated" : "set local role anon");
    if (userId) {
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

/** Calls a public RPC as a user, exactly as PostgREST would. */
export async function rpc<T = unknown>(userId: string, fn: string, ...args: unknown[]): Promise<T> {
  return asUser(userId, async (c) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const r = await c.query(`select public.${fn}(${placeholders}) as result`, args);
    return r.rows[0]?.result as T;
  });
}

export type Role = "admin" | "manager" | "accountant" | "staff";

export async function createUser(role: Role): Promise<string> {
  const id = randomUUID();
  await sql("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `${role}-${id.slice(0, 8)}@gb.test`,
    JSON.stringify({ full_name: `Test ${role}` }),
  ]);
  await sql("update public.profiles set role_code = $2, is_active = true where id = $1", [id, role]);
  return id;
}

export type GradeCode = "SMALL" | "MEDIUM" | "LARGE" | "XL" | "DIRTY";

export interface Fixture {
  admin: string;
  manager: string;
  accountant: string;
  staff: string;
  farm: string;
  store: string;
  shed: string;
  batch: string;
  customer: string;
  supplier: string;
  cash: string;
  grades: Record<GradeCode, string>;
}

/** Creates an isolated set of users + master data for one test file. */
export async function createFixture(tag: string, hens = 1000): Promise<Fixture> {
  const admin = await createUser("admin");
  const manager = await createUser("manager");
  const accountant = await createUser("accountant");
  const staff = await createUser("staff");
  const one = async (q: string, p: unknown[]) => (await sql<{ id: string }>(q, p))[0].id;
  const farm = await one("insert into farms (code, name) values ($1, $2) returning id", [`F-${tag}`, `Farm ${tag}`]);
  const store = await one("insert into farms (code, name, farm_type) values ($1, $2, 'store') returning id", [
    `ST-${tag}`,
    `Store ${tag}`,
  ]);
  const shed = await one("insert into sheds (farm_id, code, name) values ($1, 'A', 'Shed A') returning id", [farm]);
  const batch = await one(
    `insert into chicken_batches (batch_code, farm_id, shed_id, placement_date, age_at_placement_days, opening_birds)
     values ($1, $2, $3, app_today() - 60, 126, $4) returning id`,
    [`B-${tag}`, farm, shed, hens],
  );
  const customer = await one("insert into customers (name, opening_balance) values ($1, 1000) returning id", [
    `Customer ${tag}`,
  ]);
  const supplier = await one("insert into suppliers (name, supplier_type) values ($1, 'egg') returning id", [
    `Supplier ${tag}`,
  ]);
  const cash = await one("insert into cash_accounts (name, opening_balance) values ($1, 100000) returning id", [
    `Cash ${tag}`,
  ]);
  const g = await sql<{ id: string; system_code: GradeCode }>(
    "select id, system_code from egg_grades where system_code is not null",
  );
  const grades = Object.fromEntries(g.map((r) => [r.system_code, r.id])) as Record<GradeCode, string>;
  return { admin, manager, accountant, staff, farm, store, shed, batch, customer, supplier, cash, grades };
}

export async function stock(farm: string, grade: string): Promise<number> {
  const r = await sql<{ quantity: number }>("select quantity from egg_inventory where farm_id = $1 and grade_id = $2", [
    farm,
    grade,
  ]);
  return r[0]?.quantity ?? 0;
}

export async function addStock(farm: string, grade: string, qty: number) {
  await sql(
    `insert into egg_stock_adjustments (adjustment_date, farm_id, grade_id, adjustment_type, quantity, reason)
     values (app_today(), $1, $2, 'increase', $3, 'test stock')`,
    [farm, grade, qty],
  );
}

export async function today(): Promise<string> {
  const [{ d }] = await sql<{ d: string }>("select app_today()::text as d");
  return d;
}

export const num = (v: unknown) => Number(v);
