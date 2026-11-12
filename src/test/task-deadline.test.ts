import { describe, expect, it } from "vitest";
import { maxTaskDeadline } from "@/lib/goals";

describe("maxTaskDeadline", () => {
  it("is the day before the project deadline", () => {
    expect(maxTaskDeadline("2026-11-20")).toBe("2026-11-19");
  });

  it("rolls back across a month boundary", () => {
    expect(maxTaskDeadline("2026-12-01")).toBe("2026-11-30");
  });

  it("is undefined when the project has no deadline", () => {
    expect(maxTaskDeadline(null)).toBeUndefined();
    expect(maxTaskDeadline(undefined)).toBeUndefined();
  });
});
