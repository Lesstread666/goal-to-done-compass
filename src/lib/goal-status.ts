import { isDelayed, todayStr, type Task } from "@/lib/goals";

export type GoalStatus = "completed" | "failed" | "at_risk" | "on_track";
export type GoalStatusInfo = { status: GoalStatus; done: number; total: number; pct: number; daysLeft: number | null; overdueTasks: number; reason: string; detail: string };

/** Days before the project deadline at which open work counts as "at risk". */
export const AT_RISK_DAYS = 3;

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export function getGoalStatus(goalDeadline: string | null, tasks: Pick<Task, "status" | "deadline">[], today = todayStr()): GoalStatusInfo {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const open = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdueTasks = tasks.filter((t) => isDelayed(t, today)).length;
  const daysLeft = goalDeadline ? dayDiff(today, goalDeadline) : null;
  const base = { done, total, pct, daysLeft, overdueTasks };
  if (total > 0 && open === 0) return { ...base, status: "completed", reason: "All tasks are done", detail: "Completed" };
  if (daysLeft !== null && daysLeft < 0 && open > 0)
    return { ...base, status: "failed", reason: `Project deadline passed with ${open} task${open > 1 ? "s" : ""} unfinished`, detail: `Overdue by ${-daysLeft} day${daysLeft === -1 ? "" : "s"}` };
  const left = daysLeft === null ? "No deadline" : daysLeft === 0 ? "Due today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  if (open > 0 && ((daysLeft !== null && daysLeft <= AT_RISK_DAYS) || overdueTasks > 0)) {
    const reason = overdueTasks > 0 ? `${overdueTasks} task${overdueTasks > 1 ? "s are" : " is"} past due` : `Only ${left.toLowerCase()} with ${open} open task${open > 1 ? "s" : ""}`;
    return { ...base, status: "at_risk", reason, detail: left };
  }
  return { ...base, status: "on_track", reason: total ? "On track" : "No tasks yet", detail: left };
}
