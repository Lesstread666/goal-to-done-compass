import type { Participant, Task } from "@/lib/goals";

export function reconcileAssignments(tasks: Task[], participants: Participant[]) {
  const names = new Set(participants.map((p) => p.name));
  return Object.fromEntries(tasks.map((t) => [t.id, t.assignee && names.has(t.assignee) ? t.assignee : null])) as Record<string, string | null>;
}

export function balanceAssignments(tasks: Task[], participants: Participant[], current: Record<string, string | null>) {
  const result = { ...current };
  if (!participants.length) return result;
  let i = 0;
  for (const task of tasks) {
    if (task.status === "done") continue;
    result[task.id] = participants[i % participants.length].name;
    i++;
  }
  return result;
}