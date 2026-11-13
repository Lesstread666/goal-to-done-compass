import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "./plan-core";
import type { Task } from "./goals";
import { projectFingerprint, validPriorityChanges, type PriorityChange } from "./monitor";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "uncertainty", "priority_changes", "deletion_reviews", "warnings"],
  properties: {
    status: { type: "string", enum: ["on_track", "at_risk", "critical"] },
    summary: { type: "string", description: "1-3 sentences explaining the status using concrete project facts." },
    uncertainty: { type: "string", description: "What is unknown and limits confidence; empty if information is sufficient." },
    priority_changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task_id", "to_priority", "reason"],
        properties: { task_id: { type: "string" }, to_priority: { type: "string", enum: ["high", "medium", "low"] }, reason: { type: "string" } },
      },
    },
    deletion_reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["deleted_id", "essential", "covered_by_task", "severity", "message"],
        properties: {
          deleted_id: { type: "string" },
          essential: { type: "boolean", description: "True if removing it leaves a requirement of the goal that no remaining task clearly covers (e.g. testing a feature is not the same as building it). False for duplicates or nonessential work." },
          covered_by_task: { type: "string", description: "Title of a remaining task covering the same need, or empty." },
          severity: { type: "string", enum: ["warning", "critical"] },
          message: { type: "string" },
        },
      },
    },
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "severity", "title", "message"],
        properties: {
          key: { type: "string", description: "Short stable slug for this risk, e.g. 'deadline-overdue-testing'." },
          severity: { type: "string", enum: ["warning", "critical"] },
          title: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `You are Ticklist's project monitoring agent. Assess an EXISTING project during execution as a whole.
Status: on_track = achievable in the remaining time; at_risk = delays, missing tasks or scheduling problems may affect success; critical = unlikely to reach the goal or deadline without significant change. Base it on real facts (remaining work vs remaining days, overdue tasks, deleted essential work), never arbitrary percentages. If information is thin, say so in "uncertainty" and do not overstate risk.
Priority changes: only suggest changes that are clearly warranted by urgency, importance to the goal, sequence/dependencies (task order reflects the planned sequence; earlier unfinished tasks may block later ones) and project impact. Never mark everything high; lowering is allowed when a task became less urgent. Suggest at most 5. Explain each reason in 1-2 plain sentences naming the from and to priority.
Deleted tasks: only review those marked NEW. Compare purpose with the goal and requirements; check whether a remaining task covers it. Duplicate or nonessential deletions must have essential=false. Messages should name the task and explain the impact.
Warnings: only important risks to completion (max 3), not restatements of priority suggestions. Never propose creating, deleting or reassigning tasks automatically.`;

type AiResult = {
  status: "on_track" | "at_risk" | "critical";
  summary: string;
  uncertainty: string;
  priority_changes: PriorityChange[];
  deletion_reviews: { deleted_id: string; essential: boolean; covered_by_task: string; severity: string; message: string }[];
  warnings: { key: string; severity: string; title: string; message: string }[];
};

/** Reassess a project; skips the AI entirely when nothing meaningful changed since the last check. */
export async function monitorProject(supabase: SupabaseClient, goalId: string, force = false) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: goal, error: gErr }, { data: taskRows }, { data: deleted }, { data: prev }, { data: insights }] = await Promise.all([
    supabase.from("goals").select("id,title,description,deadline,requirements").eq("id", goalId).single(),
    supabase.from("tasks").select("*").eq("goal_id", goalId).order("position"),
    supabase.from("deleted_tasks").select("*").eq("goal_id", goalId).order("deleted_at", { ascending: false }).limit(30),
    supabase.from("project_assessments").select("*").eq("goal_id", goalId).maybeSingle(),
    supabase.from("project_insights").select("id,dedupe_key,kind,status").eq("goal_id", goalId),
  ]);
  if (gErr || !goal) throw new Error("Project not found.");
  const tasks = (taskRows ?? []) as Task[];
  const fresh = (deleted ?? []).filter((d) => !d.evaluated);
  const fp = projectFingerprint(tasks, goal, today, (deleted ?? []).length);
  if (!force && prev?.fingerprint === fp) return { skipped: true };

  const taskLines = tasks.map((t, i) =>
    `${i + 1}. id=${t.id} | ${t.title} | status=${t.status} | priority=${t.priority} | due=${t.deadline ?? "none"} | assignee=${t.assignee ?? "none"}${t.description ? ` | ${t.description.slice(0, 200)}` : ""}`).join("\n");
  const delLines = (deleted ?? []).map((d) => `${fresh.includes(d) ? "NEW " : ""}id=${d.id} | ${d.title} | was ${d.status}, ${d.priority}${d.description ? ` | ${d.description.slice(0, 200)}` : ""}`).join("\n");
  const input = `Today: ${today}\nGoal: ${goal.title}\nDescription: ${goal.description || "(none)"}\nConfirmed requirements: ${goal.requirements || "(not recorded)"}\nProject deadline: ${goal.deadline ?? "none"}\n\nTasks in planned order:\n${taskLines || "(none)"}\n\nDeleted tasks:\n${delLines || "(none)"}`;
  const ai = JSON.parse(await generateJson(INSTRUCTIONS, schema, "project_monitor", input)) as AiResult;

  const existing = insights ?? [];
  const priority = validPriorityChanges(ai.priority_changes, tasks);
  const rows: Record<string, unknown>[] = priority.map(({ task, change, key }) => ({
    goal_id: goalId, kind: "priority", dedupe_key: key, task_id: task.id, task_title: task.title,
    from_priority: task.priority, to_priority: change.to_priority, severity: "info",
    title: `${task.title}: ${task.priority} → ${change.to_priority}`, explanation: change.reason,
  }));
  for (const r of ai.deletion_reviews) {
    const d = fresh.find((x) => x.id === r.deleted_id);
    if (!d || !r.essential) continue;
    rows.push({ goal_id: goalId, kind: "deletion", dedupe_key: `deleted:${d.id}`, task_title: d.title, severity: r.severity === "critical" ? "critical" : "warning", title: `Deleted: ${d.title}`, explanation: r.message });
  }
  const warnKeys = ai.warnings.map((w) => `warn:${w.key.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60)}`);
  ai.warnings.forEach((w, i) => rows.push({ goal_id: goalId, kind: "warning", dedupe_key: warnKeys[i], severity: w.severity === "critical" ? "critical" : "warning", title: w.title, explanation: w.message }));
  if (rows.length) await supabase.from("project_insights").upsert(rows, { onConflict: "goal_id,dedupe_key", ignoreDuplicates: true });

  // Open suggestions/warnings the latest analysis no longer supports are retired so the list reflects current data.
  const keep = new Set([...priority.map((p) => p.key), ...warnKeys]);
  const stale = existing.filter((x) => x.status === "open" && x.kind !== "deletion" && !keep.has(x.dedupe_key)).map((x) => x.id);
  if (stale.length) await supabase.from("project_insights").update({ status: "expired", resolved_at: new Date().toISOString() }).in("id", stale);
  if (fresh.length) await supabase.from("deleted_tasks").update({ evaluated: true }).in("id", fresh.map((d) => d.id));

  await supabase.from("project_assessments").upsert({ goal_id: goalId, status: ai.status, summary: ai.summary, uncertainty: ai.uncertainty, fingerprint: fp, checked_at: new Date().toISOString() });
  return { skipped: false };
}
