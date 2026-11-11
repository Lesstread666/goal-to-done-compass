/** Pure helpers for the plan review: scoring and AI change proposals. Safe in browser and tests. */
export const CRITERIA = ["clarity", "completeness", "sequence", "prioritization", "timeline", "workload", "feasibility"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERIA_LABELS: Record<Criterion, string> = {
  clarity: "Task clarity", completeness: "Completeness", sequence: "Logical order", prioritization: "Prioritization",
  timeline: "Timeline realism", workload: "Workload balance", feasibility: "Feasibility",
};

/** Overall score = mean of the seven criterion scores (each clamped to 1–10), rounded to one decimal. */
export function overallScore(criteria: Partial<Record<Criterion, number>>): number {
  const vals = CRITERIA.map((c) => Math.max(1, Math.min(10, Number(criteria[c]) || 1)));
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** Below this score the publish button asks the owner to confirm the remaining concerns. */
export const PUBLISH_WARN_BELOW = 7;

export type PlanOp = {
  kind: "add" | "update" | "delete";
  task_id: string; title: string; description: string;
  priority: "" | "high" | "medium" | "low"; assignee: string; deadline: string;
};

export const opSchema = {
  type: "object", additionalProperties: false,
  required: ["summary", "kind", "task_id", "title", "description", "priority", "assignee", "deadline"],
  properties: {
    summary: { type: "string", description: "One sentence explaining what changes and why." },
    kind: { type: "string", enum: ["add", "update", "delete"] },
    task_id: { type: "string", description: "Existing task id for update/delete; empty for add." },
    title: { type: "string", description: "New title; empty = unchanged." },
    description: { type: "string", description: "New description; empty = unchanged." },
    priority: { type: "string", enum: ["", "high", "medium", "low"], description: "Empty = unchanged." },
    assignee: { type: "string", description: "Exact participant name; empty = unchanged." },
    deadline: { type: "string", description: "YYYY-MM-DD; empty = unchanged." },
  },
} as const;

type TaskLike = { id: string; goal_id: string };

/** Turns one accepted op into the database write it needs, or null when it is invalid. */
export function opToWrite(op: PlanOp, tasks: TaskLike[], participants: string[], goalId: string, nextPosition: number):
  | { type: "insert"; row: Record<string, unknown> }
  | { type: "update"; id: string; patch: Record<string, unknown> }
  | { type: "delete"; id: string }
  | null {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(op.deadline) ? op.deadline : "";
  const assignee = participants.includes(op.assignee) ? op.assignee : "";
  if (op.kind === "add") {
    if (!op.title.trim()) return null;
    return { type: "insert", row: { goal_id: goalId, title: op.title.trim(), description: op.description, priority: op.priority || "medium", assignee: assignee || null, deadline: validDate || null, position: nextPosition } };
  }
  if (!tasks.some((t) => t.id === op.task_id)) return null;
  if (op.kind === "delete") return { type: "delete", id: op.task_id };
  const patch: Record<string, unknown> = {};
  if (op.title.trim()) patch["title"] = op.title.trim();
  if (op.description) patch["description"] = op.description;
  if (op.priority) patch["priority"] = op.priority;
  if (assignee) patch["assignee"] = assignee;
  if (validDate) patch["deadline"] = validDate;
  return Object.keys(patch).length ? { type: "update", id: op.task_id, patch } : null;
}
