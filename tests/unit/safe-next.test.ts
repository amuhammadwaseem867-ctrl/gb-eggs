import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps same-site paths with query strings", () => {
    expect(safeNext("/sales?tab=returns")).toBe("/sales?tab=returns");
    expect(safeNext("/poultry/batches/abc")).toBe("/poultry/batches/abc");
  });

  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/ /evil.com", "/\t/evil.com", "", null, 42])(
    "rejects %s",
    (input) => {
      expect(safeNext(input)).toBe("/dashboard");
    },
  );
});
