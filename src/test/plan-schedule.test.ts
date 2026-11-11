import { describe, expect, it } from "vitest";
import { schedulePlan, type RawTask } from "@/lib/plan-schedule";

const t = (title: string, extra: Partial<RawTask> = {}): RawTask => ({
  title, description: "", priority: "high", assignee: "A", phase: "", estimated_days: 2, depends_on: [], ...extra,
});
const opts = { today: "2026-11-01", deadline: "2026-12-01", participants: ["A", "B"] };

describe("schedulePlan", () => {
  it("spreads a 30-day project across the timeline, not the first week", () => {
    const raw = Array.from({ length: 8 }, (_, i) => t(`T${i}`, { depends_on: i ? [i - 1] : [] }));
    const { tasks, warning } = schedulePlan(raw, opts);
    expect(warning).toBeNull();
    const last = tasks.map((x) => x.deadline).sort().at(-1)!;
    expect(last > "2026-11-24").toBe(true);
    expect(tasks.every((x) => x.deadline > "2026-11-01" && x.deadline <= "2026-12-01")).toBe(true);
  });
  it("does not mark every task high even when the AI does", () => {
    const { tasks } = schedulePlan(Array.from({ length: 9 }, (_, i) => t(`T${i}`)), opts);
    expect(tasks.filter((x) => x.priority === "high").length).toBeLessThanOrEqual(3);
  });
  it("schedules a dependent task no earlier than its prerequisite", () => {
    const { tasks } = schedulePlan([t("Design", { estimated_days: 5 }), t("Build", { depends_on: [0], assignee: "B" })], opts);
    const d = Object.fromEntries(tasks.map((x) => [x.title, x.deadline]));
    expect(d.Build >= d.Design).toBe(true);
  });
  it("balances work so one participant is not overloaded", () => {
    const { tasks } = schedulePlan(Array.from({ length: 6 }, (_, i) => t(`T${i}`)), opts);
    expect(tasks.filter((x) => x.assignee === "B").length).toBeGreaterThanOrEqual(2);
  });
  it("warns instead of forcing an impossible schedule", () => {
    const raw = Array.from({ length: 5 }, (_, i) => t(`T${i}`, { estimated_days: 10, depends_on: i ? [i - 1] : [] }));
    expect(schedulePlan(raw, opts).warning).toMatch(/only 30/);
  });
});
