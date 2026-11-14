import { execSync } from "node:child_process";

/** Recreates the test database once per run when DB tests are enabled. */
export default function setup() {
  if (!process.env.TEST_DB_ADMIN_URL) {
    console.warn("[db tests] TEST_DB_ADMIN_URL not set — database tests will be skipped.");
    return;
  }
  execSync("bash tests/db/reset-db.sh", { stdio: "inherit", env: process.env });
}
