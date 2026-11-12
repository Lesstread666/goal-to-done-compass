import type { Task } from "./goals";
import { getTeamWorkload } from "./workload";

const DAY = 86_400_000;
const toDay = (s: string) => Date.parse(s + "T00:00:00Z");
const toStr = (n: number) => new Date(n).toISOString().slice(0, 10);

export type TaskPatch = { id: string; deadline: string | null; priority: Task["priority"] };

/**
 * Auto-replan the open tasks of a goal after progress is made.
 * 1. Deadlines: the open queue is pulled forward so the next open task is due tomorrow
 *    (relative gaps between tasks are kept; tasks are never pushed later).
 * 2. Priority: based on days of runway per teammate's open task load —
 *    < 3 days each = high, < 7 = medium, otherwise low. Tasks due today/overdue stay high.
 *    The team's average load is a floor; unassigned tasks keep the project-wide rule.
 * Returns only tasks that actually change.
 */
export function replanTasks(tasks: Task[], goalDeadline: string | null, today: string, participantNames: string[] = [], pullDeadlines = true): TaskPatch[] {
  const open = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.position - b.position);
  if (!open.length) return [];

  const t0 = toDay(today);
  const tomorrow = t0 + DAY;
  const first = open.find((t) => t.deadline)?.deadline;
  const shift = pullDeadlines && first ? Math.max(0, toDay(first) - tomorrow) : 0;
  const runway = goalDeadline ? Math.max(0, (toDay(goalDeadline) - t0) / DAY) : null;
  const loads = getTeamWorkload(tasks, participantNames, goalDeadline, today);
  const averageLoad = loads.length ? open.filter((task) => task.assignee).length / loads.length : open.length;

  const out: TaskPatch[] = [];
  for (const t of open) {
    const deadline = t.deadline ? toStr(toDay(t.deadline) - shift) : null;
    const teammate = loads.find((load) => load.name === t.assignee);
    const effectiveLoad = teammate ? Math.max(teammate.openCount, averageLoad) : open.length;
    const perTask = runway === null ? null : runway / effectiveLoad;
    let priority = t.priority;
    if (deadline && toDay(deadline) <= t0) priority = "high";
    else if (perTask !== null) priority = perTask < 3 ? "high" : perTask < 7 ? "medium" : "low";
    // Without a goal deadline, use a stable urgency floor rather than escalating each run.
    else if (teammate?.overloaded && priority === "low") priority = "medium";
    if (deadline !== t.deadline || priority !== t.priority) out.push({ id: t.id, deadline, priority });
  }
  return out;
}
