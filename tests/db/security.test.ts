import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, closePool, createFixture, dbEnabled, type Fixture, rpc, sql } from "./helpers";

describe.skipIf(!dbEnabled)("self sign-up & internal helpers", () => {
  let f: Fixture;
  let stranger: string;
  beforeAll(async () => {
    f = await createFixture("sec");
    // Someone signs up straight through the auth API (no admin involved).
    stranger = randomUUID();
    await sql("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      stranger,
      `stranger-${stranger.slice(0, 8)}@example.test`,
      JSON.stringify({ full_name: "Stranger" }),
    ]);
  });
  afterAll(closePool);

  it("a self sign-up gets an inactive profile with no access", async () => {
    const [p] = await sql<{ role_code: string; is_active: boolean }>("select role_code, is_active from profiles where id = $1", [stranger]);
    expect(p).toEqual({ role_code: "staff", is_active: false });
    expect(await rpc(stranger, "has_perm", "production", "view")).toBe(false);
    const rows = await asUser(stranger, async (c) => (await c.query("select id from farms")).rows);
    expect(rows).toHaveLength(0);
    await expect(rpc(stranger, "dashboard_summary")).rejects.toThrow(/Permission denied|not active|denied/i);
  });

  it("balance and flock helpers cannot be called over the API", async () => {
    await expect(rpc(f.admin, "customer_balance", randomUUID())).rejects.toThrow(/permission denied for function/);
    await expect(rpc(f.admin, "supplier_balance", randomUUID())).rejects.toThrow(/permission denied for function/);
    await expect(asUser(f.admin, (c) => c.query("select public.batch_live_birds($1::uuid, current_date)", [randomUUID()]))).rejects.toThrow(/permission denied for function/);
  });
});
