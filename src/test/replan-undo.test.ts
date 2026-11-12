import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/goals";
import { replanTasks } from "@/lib/replan";
import { captureReplanUndo, reopenTaskPatches, sameCompletion } from "@/lib/replan-undo";

const task = (id: string, deadline: string, priority: Task["priority"] = "high"): Task => ({
  id, goal_id: "g", title: id, description: "", priority, assignee: "Michelle", status: "todo", deadline, position: 0, completed_at: null, created_at: "",
});
const before = [task("a", "2026-11-13"), task("b", "2026-11-16"), task("c", "2026-11-18")];
const completed = before.map((t) => t.id === "a" ? { ...t, status: "done" as const } : t);
const patches = replanTasks(completed, "2026-12-12", "2026-11-12", ["Michelle"]);
const undo = captureReplanUndo(completed, patches, "2026-11-12T07:15:00Z");
const reopened = before.map((t) => ({ ...t, ...patches.find((p) => p.id === t.id) }));

describe("accidental completion undo", () => {
  it("matches database-normalized timestamps after reload but rejects another completion", () => {
    expect(sameCompletion("2026-11-12T07:15:00.000Z", "2026-11-12T07:15:00+00:00")).toBe(true);
    expect(sameCompletion("2026-11-12T07:15:00.000Z", "2026-11-12T07:16:00+00:00")).toBe(false);
  });
  it("restores the exact priorities and dates from before the mistaken completion", () => {
    expect(patches).toEqual([
      { id: "b", priority: "low", deadline: "2026-11-13" },
      { id: "c", priority: "low", deadline: "2026-11-15" },
    ]);
    const restored = reopenTaskPatches(reopened, undo, "2026-12-12", "2026-11-12", ["Michelle"]);
    expect(reopened.map((t) => ({ ...t, ...restored.find((p) => p.id === t.id) }))).toEqual(before);
  });
  it("also reverses completion when returned to In progress", () => {
    const state = reopened.map((t) => t.id === "a" ? { ...t, status: "in_progress" as const } : t);
    expect(reopenTaskPatches(state, undo, "2026-12-12", "2026-11-12", ["Michelle"])).toEqual([
      { id: "b", priority: "high", deadline: "2026-11-16" }, { id: "c", priority: "high", deadline: "2026-11-18" },
    ]);
  });
  it("preserves later priority edits while restoring unchanged automatic dates", () => {
    const state = reopened.map((t) => t.id === "b" ? { ...t, priority: "medium" as const } : t);
    expect(reopenTaskPatches(state, undo, null, "2026-11-12", ["Michelle"]).find((p) => p.id === "b")).toEqual({ id: "b", priority: "medium", deadline: "2026-11-16" });
  });
  it("never modifies tasks completed since the mistaken move", () => {
    const state = reopened.map((t) => t.id === "b" ? { ...t, status: "done" as const } : t);
    expect(reopenTaskPatches(state, undo, null, "2026-11-12", ["Michelle"]).map((p) => p.id)).toEqual(["c"]);
  });
  it("reassesses reopened workload without moving dates when no undo history exists", () => {
    const state = [task("a", "2026-11-16", "low"), task("b", "2026-11-18", "low"), task("c", "2026-11-20", "low")];
    expect(reopenTaskPatches(state, null, "2026-11-20", "2026-11-12", ["Michelle"])).toEqual(state.map((t) => ({ id: t.id, deadline: t.deadline, priority: "high" })));
  });
});