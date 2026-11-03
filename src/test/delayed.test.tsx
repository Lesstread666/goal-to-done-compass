import { describe, expect, it } from "vitest";
import { isDelayed } from "@/lib/goals";

describe("isDelayed", () => {
  it("marks unfinished tasks past their deadline as delayed", () => {
    expect(isDelayed({ status: "todo", deadline: "2026-11-01" }, "2026-11-03")).toBe(true);
  });
  it("does not mark finished or on-time tasks", () => {
    expect(isDelayed({ status: "done", deadline: "2026-11-01" }, "2026-11-03")).toBe(false);
    expect(isDelayed({ status: "in_progress", deadline: "2026-11-03" }, "2026-11-03")).toBe(false);
  });
});
