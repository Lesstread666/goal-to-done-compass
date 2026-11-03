import { describe, expect, it } from "vitest";
import { replanTasks } from "@/lib/replan";
import type { Task } from "@/lib/goals";

const t = (id: string, deadline: string | null, status: Task["status"] = "todo", priority: Task["priority"] = "high"): Task => ({
  id, goal_id: "g", title: id, description: "", priority, assignee: null, status, deadline, position: 0, completed_at: null, created_at: "",
});

describe("replanTasks", () => {
  it("user example: after finishing today's and tomorrow's tasks, the last is pulled to tomorrow and lowered", () => {
    const r = replanTasks([t("a", "2026-11-03", "done"), t("b", "2026-11-04", "done"), t("c", "2026-11-05")], "2026-11-30", "2026-11-03");
    expect(r).toEqual([{ id: "c", deadline: "2026-11-04", priority: "low" }]);
  });
  it("keeps gaps and never pushes tasks later", () => {
    const r = replanTasks([t("a", "2026-11-06"), t("b", "2026-11-08")], "2026-11-30", "2026-11-03");
    expect(r.map((p) => p.deadline)).toEqual(["2026-11-04", "2026-11-06"]);
  });
  it("stays high when runway is tight", () => {
    const r = replanTasks([t("a", "2026-11-04", "todo", "low"), t("b", "2026-11-05", "todo", "low")], "2026-11-06", "2026-11-03");
    expect(r.every((p) => p.priority === "high")).toBe(true);
  });
  it("overdue tasks stay high and keep their date", () => {
    const r = replanTasks([t("a", "2026-11-01", "todo", "low")], "2026-12-30", "2026-11-03");
    expect(r).toEqual([{ id: "a", deadline: "2026-11-01", priority: "high" }]);
  });
  it("no open tasks → no changes", () => {
    expect(replanTasks([t("a", "2026-11-03", "done")], null, "2026-11-03")).toEqual([]);
  });
});
