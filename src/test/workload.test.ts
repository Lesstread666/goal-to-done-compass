import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/goals";
import { getTeamWorkload } from "@/lib/workload";
import { replanTasks } from "@/lib/replan";

const task = (id: string, assignee: string | null, status: Task["status"] = "todo"): Task => ({
  id, goal_id: "g", title: id, description: "", priority: "low", assignee, status,
  deadline: "2026-11-13", position: 0, completed_at: null, created_at: "",
});
const names = ["Michelle", "Vladislav"];
const uneven = [task("a", "Michelle"), task("b", "Michelle"), task("c", "Michelle", "in_progress"), task("d", "Michelle"), task("e", "Vladislav")];

describe("teammate workload", () => {
  it("counts todo and in-progress tasks, excluding completed tasks", () => {
    const loads = getTeamWorkload([...uneven, task("done", "Michelle", "done")], names, null, "2026-11-12");
    expect(loads.map((load) => load.openCount)).toEqual([4, 1]);
  });
  it("flags at least 3 open tasks above 150% of fair share", () => {
    expect(getTeamWorkload(uneven, names, null, "2026-11-12").map((load) => load.overloaded)).toEqual([true, false]);
    const boundary = [task("a", "Michelle"), task("b", "Michelle"), task("c", "Michelle"), task("d", "Vladislav")];
    expect(getTeamWorkload(boundary, names, null, "2026-11-12")[0]?.overloaded).toBe(false);
    expect(getTeamWorkload(boundary.slice(0, 2), names, null, "2026-11-12")[0]?.overloaded).toBe(false);
  });
  it("includes idle participants when measuring fair share", () => {
    const loads = getTeamWorkload(uneven.slice(0, 3), names, null, "2026-11-12");
    expect(loads.map((load) => [load.openCount, load.overloaded])).toEqual([[3, true], [0, false]]);
  });
  it("flags deadline pressure below 3 days per person's task", () => {
    const tasks = [task("a", "Michelle"), task("b", "Michelle"), task("c", "Vladislav")];
    expect(getTeamWorkload(tasks, names, "2026-11-17", "2026-11-12").map((load) => load.overloaded)).toEqual([true, false]);
    expect(getTeamWorkload(tasks, names, "2026-11-18", "2026-11-12")[0]?.overloaded).toBe(false);
  });
  it("clears overload after enough tasks finish", () => {
    const tasks = uneven.map((t, i) => i < 3 ? { ...t, status: "done" as const } : t);
    expect(getTeamWorkload(tasks, names, null, "2026-11-12").map((load) => load.overloaded)).toEqual([false, false]);
  });
  it("does not count unassigned work as a teammate's load", () => {
    const loads = getTeamWorkload([task("a", null), task("b", "Michelle", "done")], names, null, "2026-11-12");
    expect(loads.map((load) => [load.openCount, load.overloaded])).toEqual([[0, false], [0, false]]);
  });
});

describe("workload-aware priorities", () => {
  it("raises a busier teammate's priority while keeping the team average as a floor", () => {
    const patches = replanTasks(uneven, "2026-11-22", "2026-11-12", names);
    expect(patches.filter((p) => p.id !== "e").map((p) => p.priority)).toEqual(["high", "high", "high", "high"]);
    expect(patches.find((p) => p.id === "e")?.priority).toBe("medium");
  });
  it("relaxes priorities when the busy teammate completes work early", () => {
    const tasks = uneven.map((t, i) => ({ ...t, priority: "high" as const, status: i < 3 ? "done" as const : t.status }));
    expect(replanTasks(tasks, "2026-11-22", "2026-11-12", names)).toEqual([
      { id: "d", deadline: "2026-11-13", priority: "low" },
      { id: "e", deadline: "2026-11-13", priority: "low" },
    ]);
    expect(tasks.map((t) => t.assignee)).toEqual(["Michelle", "Michelle", "Michelle", "Michelle", "Vladislav"]);
  });
  it("uses a stable medium floor for overloaded teammates without a goal deadline", () => {
    expect(replanTasks(uneven, null, "2026-11-12", names).map((p) => p.priority)).toEqual(["medium", "medium", "medium", "medium"]);
    expect(replanTasks(uneven.map((t) => ({ ...t, priority: "medium" })), null, "2026-11-12", names)).toEqual([]);
  });
  it("keeps overdue tasks high even with a light personal load", () => {
    expect(replanTasks([{ ...task("a", "Michelle"), deadline: "2026-11-11" }], "2026-12-30", "2026-11-12", names)).toEqual([
      { id: "a", deadline: "2026-11-11", priority: "high" },
    ]);
  });
  it("keeps the project-wide deadline rule for unassigned tasks", () => {
    expect(replanTasks([task("a", null), task("b", "Michelle")], "2026-11-16", "2026-11-12", names)).toEqual([
      { id: "a", deadline: "2026-11-13", priority: "high" },
      { id: "b", deadline: "2026-11-13", priority: "medium" },
    ]);
  });
});