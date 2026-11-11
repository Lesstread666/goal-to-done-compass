import { describe, expect, it } from "vitest";
import { overallScore, opToWrite, type PlanOp } from "@/lib/review-ops";

const base: PlanOp = { kind: "update", task_id: "t1", title: "", description: "", priority: "", assignee: "", deadline: "" };
const tasks = [{ id: "t1", goal_id: "g" }];

describe("plan quality score", () => {
  it("is the average of the seven criteria", () => {
    expect(overallScore({ clarity: 8, completeness: 6, sequence: 7, prioritization: 9, timeline: 5, workload: 10, feasibility: 4 })).toBe(7);
  });
  it("clamps scores to 1-10", () => {
    expect(overallScore({ clarity: 20, completeness: 20, sequence: 20, prioritization: 20, timeline: 20, workload: 20, feasibility: 20 })).toBe(10);
  });
});

describe("applying an approved suggestion", () => {
  it("only changes the fields the suggestion sets", () => {
    expect(opToWrite({ ...base, priority: "low" }, tasks, ["Ann"], "g", 0)).toEqual({ type: "update", id: "t1", patch: { priority: "low" } });
  });
  it("ignores unknown participants and bad dates", () => {
    expect(opToWrite({ ...base, assignee: "Bob", deadline: "soon" }, tasks, ["Ann"], "g", 0)).toBeNull();
  });
  it("rejects suggestions for tasks that no longer exist", () => {
    expect(opToWrite({ ...base, kind: "delete", task_id: "gone" }, tasks, ["Ann"], "g", 0)).toBeNull();
  });
});
