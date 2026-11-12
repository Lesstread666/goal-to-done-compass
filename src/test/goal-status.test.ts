import { describe, expect, it } from "vitest";
import { getGoalStatus } from "@/lib/goal-status";

const t = (status: "todo" | "done", deadline: string | null = null) => ({ status, deadline });
const today = "2026-11-12";

describe("getGoalStatus", () => {
  it("completed when every task is done", () => expect(getGoalStatus("2026-11-01", [t("done"), t("done")], today).status).toBe("completed"));
  it("failed when project deadline passed with open tasks", () => {
    const s = getGoalStatus("2026-11-10", [t("done"), t("todo")], today);
    expect(s.status).toBe("failed");
    expect(s.detail).toBe("Overdue by 2 days");
  });
  it("at risk within 3 days of the deadline", () => expect(getGoalStatus("2026-11-15", [t("todo")], today).status).toBe("at_risk"));
  it("on track 4 days out", () => expect(getGoalStatus("2026-11-16", [t("todo")], today).status).toBe("on_track"));
  it("at risk when a task is overdue even if project is far away", () => expect(getGoalStatus("2026-12-30", [t("todo", "2026-11-11")], today).status).toBe("at_risk"));
  it("no tasks and no deadline is on track", () => expect(getGoalStatus(null, [], today).status).toBe("on_track"));
});
