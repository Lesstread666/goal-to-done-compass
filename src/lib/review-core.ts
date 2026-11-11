import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJsonText } from "./plan-core";
import { CRITERIA, opSchema, overallScore, type PlanOp } from "./review-ops";

type Row = { id: string; title: string; description: string; priority: string; assignee: string | null; deadline: string | null; manually_edited: boolean };

async function loadPlan(supabase: SupabaseClient, goalId: string) {
  const { data: goal, error } = await supabase.from("goals").select("id,title,description,deadline,participants").eq("id", goalId).single();
  if (error || !goal) throw new Error("Project not found");
  const { data: tasks, error: tErr } = await supabase.from("tasks").select("id,title,description,priority,assignee,deadline,manually_edited").eq("goal_id", goalId).order("position");
  if (tErr) throw new Error(tErr.message);
  const participants = ((goal.participants as { name: string; role: string }[]) ?? []);
  const today = new Date().toISOString().slice(0, 10);
  const text = [
    `Today: ${today}`, `Goal: ${goal.title}`, `Description: ${goal.description || "(none)"}`, `Goal deadline: ${goal.deadline}`,
    `Participants: ${participants.map((p) => `${p.name} (${p.role})`).join(", ")}`, "Tasks:",
    ...((tasks ?? []) as Row[]).map((t) => `- id=${t.id}${t.manually_edited ? " [EDITED BY OWNER]" : ""} | ${t.title} | priority ${t.priority} | ${t.assignee ?? "unassigned"} | due ${t.deadline ?? "none"}\n  ${t.description.replace(/\n+/g, " ")}`),
  ].join("\n");
  return { text, participants: participants.map((p) => p.name) };
}

const RULES = "Proposals are suggestions the owner accepts or rejects one by one; each changes exactly one task. Tasks marked [EDITED BY OWNER] were changed by hand: do not propose changes to them unless the owner explicitly asks. Use exact task ids and participant names. Keep deadlines on or before the goal deadline.";

const reviewSchema = {
  type: "object", additionalProperties: false, required: ["criteria", "summary", "problems", "recommendations", "proposals"],
  properties: {
    criteria: { type: "object", additionalProperties: false, required: [...CRITERIA], properties: Object.fromEntries(CRITERIA.map((c) => [c, { type: "integer", description: "1-10" }])) },
    summary: { type: "string" },
    problems: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
    proposals: { type: "array", items: opSchema },
  },
};

/** Separate AI reviewer: scores the current draft, stores the review and its proposals (pending). */
export async function reviewAndStore(supabase: SupabaseClient, goalId: string) {
  const { text } = await loadPlan(supabase, goalId);
  const out = JSON.parse(await generateJsonText(
    "You are a strict, fair project-plan quality reviewer. Score each criterion 1-10 against the actual plan: clarity (actionable, not vague or over-complicated), completeness (missing stages/preparation), sequence (logical order, dependencies), prioritization (high reserved for critical work), timeline (realistic deadlines spread over the duration, no conflicts), workload (balanced across participants), feasibility (achievable by the deadline, risks). A 10 means nothing to improve. List concrete problems and recommendations, and up to 6 specific proposals that fix the biggest problems. " + RULES,
    text, "plan_review", reviewSchema,
  )) as { criteria: Record<string, number>; summary: string; problems: string[]; recommendations: string[]; proposals: (PlanOp & { summary: string })[] };

  // Older pending review suggestions are replaced by the new review's.
  await supabase.from("plan_proposals").update({ status: "superseded" }).eq("goal_id", goalId).eq("source", "review").eq("status", "pending");
  const { error } = await supabase.from("plan_reviews").insert({ goal_id: goalId, score: overallScore(out.criteria), summary: out.summary, criteria: out.criteria, problems: out.problems, recommendations: out.recommendations });
  if (error) throw new Error(error.message);
  await saveProposals(supabase, goalId, "review", out.proposals);
}

async function saveProposals(supabase: SupabaseClient, goalId: string, source: string, ps: (PlanOp & { summary: string })[]) {
  if (!ps.length) return;
  const rows = ps.map(({ summary, ...op }) => ({ goal_id: goalId, source, summary, op }));
  const { error } = await supabase.from("plan_proposals").insert(rows);
  if (error) throw new Error(error.message);
}

const chatSchema = {
  type: "object", additionalProperties: false, required: ["reply", "proposals"],
  properties: { reply: { type: "string" }, proposals: { type: "array", items: opSchema } },
};

/** Planning chat: answers the owner and turns requests into individual pending proposals. */
export async function chatAndStore(supabase: SupabaseClient, goalId: string, message: string) {
  const { text } = await loadPlan(supabase, goalId);
  const { data: hist } = await supabase.from("plan_chat").select("role,content").eq("goal_id", goalId).order("created_at", { ascending: false }).limit(12);
  const history = (hist ?? []).reverse().map((m) => `${m.role === "user" ? "Owner" : "Assistant"}: ${m.content}`).join("\n");
  const { error: uErr } = await supabase.from("plan_chat").insert({ goal_id: goalId, role: "user", content: message });
  if (uErr) throw new Error(uErr.message);
  const out = JSON.parse(await generateJsonText(
    "You are Ticklist's planning assistant helping a project owner refine a draft plan before publishing. Read the owner's request and propose the task changes that fulfil it (split a task = update the original + add new ones; remove = delete). Reply briefly and say what you proposed; if the request is unclear, ask instead of proposing. " + RULES,
    `${text}\n\nConversation so far:\n${history || "(none)"}\n\nOwner: ${message}`, "plan_chat", chatSchema,
  )) as { reply: string; proposals: (PlanOp & { summary: string })[] };
  const { error: aErr } = await supabase.from("plan_chat").insert({ goal_id: goalId, role: "assistant", content: out.reply });
  if (aErr) throw new Error(aErr.message);
  await saveProposals(supabase, goalId, "chat", out.proposals);
}
