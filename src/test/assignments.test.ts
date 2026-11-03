import { describe, expect, it } from "vitest";
import { reconcileAssignments, balanceAssignments } from "@/lib/assignments";
import type { Task } from "@/lib/goals";

const tasks = [
  { id: "a", assignee: "Michelle", status: "todo" },
  { id: "b", assignee: "Alex", status: "in_progress" },
  { id: "c", assignee: "Michelle", status: "done" },
] as Task[];
describe("participant changes", () => {
  it("unassigns tasks from a removed participant without deleting tasks", () => {
    expect(reconcileAssignments(tasks, [{ name: "Alex", role: "Designer" }])).toEqual({ a: null, b: "Alex", c: null });
    expect(tasks).toHaveLength(3);
  });
  it("includes new participants when balancing unfinished tasks", () => {
    expect(balanceAssignments(tasks, [{ name: "Alex", role: "" }, { name: "Sam", role: "" }], { a: null, b: "Alex", c: "Alex" })).toEqual({ a: "Alex", b: "Sam", c: "Alex" });
  });
});