import type { Task } from "./goals";

const DAY = 86_400_000;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** Bucket of how close the project deadline is; changing bucket counts as a meaningful time event. */
export function deadlineBucket(goalDeadline: string | null, today: string): string {
  if (!goalDeadline) return "none";
  const d = (day(goalDeadline) - day(today)) / DAY;
  return d < 0 ? "passed" : d <= 3 ? "3d" : d <= 7 ? "7d" : d <= 14 ? "14d" : "far";
}

/**
 * Snapshot of everything the monitor reacts to. Unchanged fingerprint => no AI call.
 * Time only matters through overdue / due-soon counts and the deadline bucket, so idle days cost nothing.
 */
export function projectFingerprint(
  tasks: Pick<Task, "id" | "status" | "priority" | "deadline">[],
  goal: { deadline: string | null; requirements?: string },
  today: string,
  deletedCount = 0,
): string {
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.deadline && t.deadline < today).length;
  const soon = open.filter((t) => t.deadline && t.deadline >= today && (day(t.deadline) - day(today)) / DAY <= 2).length;
  const rows = [...tasks].sort((a, b) => a.id.localeCompare(b.id)).map((t) => `${t.id}:${t.status}:${t.priority}:${t.deadline ?? ""}`);
  const raw = [goal.deadline ?? "", (goal.requirements ?? "").length, deletedCount, overdue, soon, deadlineBucket(goal.deadline, today), ...rows].join("|");
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}-${tasks.length}`;
}

export type PriorityChange = { task_id: string; to_priority: Task["priority"]; reason: string };

/** Key for a suggestion; a dismissed suggestion returns only if the task's situation changes. */
export function priorityKey(task: Pick<Task, "id" | "deadline" | "status">, to: string) {
  return `prio:${task.id}:${to}:${task.deadline ?? "none"}:${task.status}`;
}

/** Keep only AI suggestions that refer to a real open task and actually change its priority. */
export function validPriorityChanges(changes: PriorityChange[], tasks: Task[]) {
  const seen = new Set<string>();
  return changes.flatMap((c) => {
    const t = tasks.find((x) => x.id === c.task_id);
    if (!t || t.status === "done" || t.priority === c.to_priority || seen.has(t.id)) return [];
    if (!["high", "medium", "low"].includes(c.to_priority)) return [];
    seen.add(t.id);
    return [{ task: t, change: c, key: priorityKey(t, c.to_priority) }];
  });
}

const addDays = (s: string, n: number) => new Date(day(s) + n * DAY).toISOString().slice(0, 10);
/** Last allowed task date: the day before the project deadline. */
const lastDay = (goalDeadline: string | null) => (goalDeadline ? addDays(goalDeadline, -1) : null);

/**
 * Deadline to use when restoring a deleted task. A past date or one on/after the project deadline is a conflict;
 * then propose tomorrow (clamped to the last allowed day), or null when no future day fits.
 */
export function restoreDeadline(old: string | null, today: string, goalDeadline: string | null): { deadline: string | null; conflict: boolean } {
  const max = lastDay(goalDeadline);
  if (!old) return { deadline: null, conflict: false };
  if (old >= today && (!max || old <= max)) return { deadline: old, conflict: false };
  const tomorrow = addDays(today, 1);
  if (max && max < tomorrow) return { deadline: null, conflict: true };
  return { deadline: max && max < tomorrow ? max : tomorrow, conflict: true };
}

export type DeadlineSuggestion = { task_id: string; fits: boolean; date: string; reason: string };

/** Only open tasks with NO deadline get suggestions; dates must be from today up to the day before the project deadline. */
export function validDeadlineSuggestions(list: DeadlineSuggestion[], tasks: Task[], today: string, goalDeadline: string | null) {
  const max = lastDay(goalDeadline);
  const seen = new Set<string>();
  return list.flatMap((s) => {
    const t = tasks.find((x) => x.id === s.task_id);
    if (!t || t.deadline || t.status === "done" || seen.has(t.id)) return [];
    seen.add(t.id);
    const ok = s.fits && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.date >= today && (!max || s.date <= max);
    return [{ task: t, date: ok ? s.date : null, reason: s.reason, key: `deadline:${t.id}:${ok ? "fit" : "nofit"}` }];
  });
}
