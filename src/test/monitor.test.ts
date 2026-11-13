import { describe, expect, it } from "vitest";
import { projectFingerprint, validPriorityChanges, priorityKey, deadlineBucket } from "@/lib/monitor";
import { datesOnly } from "@/lib/replan";
import type { Task } from "@/lib/goals";

const t = (id: string, priority: Task["priority"], status: Task["status"] = "todo", deadline: string | null = "2026-11-20"): Task => ({
  id, goal_id: "g", title: id, description: "", priority, assignee: null, status, deadline, position: 0, completed_at: null, created_at: "",
});

describe("project monitor", () => {
  it("fingerprint is stable when nothing changes, so no repeat AI check", () => {
    const tasks = [t("a", "medium"), t("b", "low")];
    expect(projectFingerprint(tasks, { deadline: "2026-12-01" }, "2026-11-13")).toBe(projectFingerprint([...tasks].reverse(), { deadline: "2026-12-01" }, "2026-11-13"));
  });
  it("completing, deleting or a task becoming overdue changes the fingerprint", () => {
    const base = projectFingerprint([t("a", "medium"), t("b", "low")], { deadline: "2026-12-01" }, "2026-11-13");
    expect(projectFingerprint([t("a", "medium", "done"), t("b", "low")], { deadline: "2026-12-01" }, "2026-11-13")).not.toBe(base);
    expect(projectFingerprint([t("a", "medium")], { deadline: "2026-12-01" }, "2026-11-13", 1)).not.toBe(base);
    expect(projectFingerprint([t("a", "medium"), t("b", "low")], { deadline: "2026-12-01" }, "2026-11-21")).not.toBe(base);
  });
  it("an idle day with no new overdue tasks does not trigger a check", () => {
    const tasks = [t("a", "medium", "todo", "2026-11-28")];
    expect(projectFingerprint(tasks, { deadline: "2026-12-30" }, "2026-11-13")).toBe(projectFingerprint(tasks, { deadline: "2026-12-30" }, "2026-11-14"));
  });
  it("deadline approaching moves the bucket", () => {
    expect(deadlineBucket("2026-11-15", "2026-11-13")).toBe("3d");
    expect(deadlineBucket("2026-11-10", "2026-11-13")).toBe("passed");
  });
  it("drops suggestions for done/missing tasks or no actual change", () => {
    const tasks = [t("a", "medium"), t("b", "high", "done")];
    const r = validPriorityChanges([
      { task_id: "a", to_priority: "high", reason: "x" },
      { task_id: "a", to_priority: "low", reason: "dup" },
      { task_id: "b", to_priority: "low", reason: "done" },
      { task_id: "zzz", to_priority: "low", reason: "missing" },
      { task_id: "a", to_priority: "medium", reason: "same" },
    ], tasks);
    expect(r.map((x) => [x.task.id, x.change.to_priority])).toEqual([["a", "high"]]);
  });
  it("dismissed suggestion key changes when the task deadline changes", () => {
    expect(priorityKey(t("a", "medium"), "high")).not.toBe(priorityKey(t("a", "medium", "todo", "2026-11-18"), "high"));
  });
  it("completion updates dates automatically but never priorities", () => {
    const tasks = [t("a", "medium", "todo", "2026-11-20"), t("b", "low", "todo", "2026-11-25")];
    const r = datesOnly(tasks, [{ id: "a", deadline: "2026-11-14", priority: "high" }, { id: "b", deadline: "2026-11-25", priority: "high" }]);
    expect(r).toEqual([{ id: "a", deadline: "2026-11-14", priority: "medium" }]);
  });
});

import { restoreDeadline, validDeadlineSuggestions } from "@/lib/monitor";
describe("task recovery and deadline suggestions", () => {
  it("restore keeps a still-valid original deadline", () => {
    expect(restoreDeadline("2026-11-20", "2026-11-13", "2026-12-01")).toEqual({ deadline: "2026-11-20", conflict: false });
  });
  it("restore flags a past deadline and proposes tomorrow", () => {
    expect(restoreDeadline("2026-11-01", "2026-11-13", "2026-12-01")).toEqual({ deadline: "2026-11-14", conflict: true });
  });
  it("restore flags when no day fits before the project deadline", () => {
    expect(restoreDeadline("2026-11-01", "2026-11-13", "2026-11-14")).toEqual({ deadline: null, conflict: true });
  });
  it("never suggests a deadline for a task that already has one", () => {
    expect(validDeadlineSuggestions([{ task_id: "a", fits: true, date: "2026-11-20", reason: "" }], [t("a", "medium")], "2026-11-13", "2026-12-01")).toEqual([]);
  });
  it("accepts a date before the project deadline for an undated task", () => {
    const r = validDeadlineSuggestions([{ task_id: "a", fits: true, date: "2026-11-25", reason: "x" }], [t("a", "medium", "todo", null)], "2026-11-13", "2026-12-01");
    expect(r[0]?.date).toBe("2026-11-25");
  });
  it("a date on or after the project deadline is flagged instead of invented", () => {
    const r = validDeadlineSuggestions([{ task_id: "a", fits: true, date: "2026-12-01", reason: "x" }], [t("a", "medium", "todo", null)], "2026-11-13", "2026-12-01");
    expect(r[0]?.date).toBeNull();
  });
});
