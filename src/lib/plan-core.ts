import { z } from "zod";
import { schedulePlan, type RawTask } from "./plan-schedule";

export const PlanInput = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participants: z.array(z.string().min(1).max(60)).min(1).max(12),
  /** Confirmed project understanding from the Goal Clarifier. */
  context: z.string().max(8000).optional(),
});

export const ClarifyInput = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participants: z.array(z.string().min(1).max(60)).min(1).max(12),
  messages: z.array(z.object({ role: z.enum(["assistant", "user"]), content: z.string().max(4000) })).max(40),
});

const clarifySchema = {
  type: "object",
  additionalProperties: false,
  required: ["ready", "message", "questions", "summary"],
  properties: {
    ready: { type: "boolean", description: "True when enough is known to plan well." },
    message: { type: "string", description: "Short consultant-style reply: acknowledge, recommend, or explain." },
    questions: { type: "array", items: { type: "string" }, description: "2-3 most important open questions; empty when ready." },
    summary: { type: "string", description: "Organized project understanding so far: outcome, success criteria, scope, resources, constraints, risks, assumptions. Plain text bullets." },
  },
} as const;

const CLARIFY_INSTRUCTIONS =
  "You are a project planning consultant helping someone define ANY kind of goal before a task plan is generated. Do not use fixed categories or questionnaires: decide dynamically what matters for this specific goal. Evaluate the desired outcome, what success looks like, known vs missing requirements, resources/skills/participants, constraints, deadline realism, dependencies and risks, and whether the user needs guidance. If information is sufficient, set ready=true and ask nothing. Otherwise ask only the 2-3 most important questions per round, building on earlier answers; never repeat answered questions. When the user is unsure, offer concrete recommendations or options. Stop asking once further answers would not materially change the plan (usually 1-4 rounds). Always keep summary up to date.";

export type ClarifyResult = { ready: boolean; message: string; questions: string[]; summary: string };

export async function clarifyGoal(data: z.infer<typeof ClarifyInput>): Promise<ClarifyResult> {
  const today = new Date().toISOString().slice(0, 10);
  const convo = data.messages.map((m) => `${m.role === "user" ? "User" : "Consultant"}: ${m.content}`).join("\n");
  const text = await generateJson(
    CLARIFY_INSTRUCTIONS,
    clarifySchema,
    "clarify",
    `Today: ${today}\nGoal: ${data.title}\nDescription: ${data.description || "(none)"}\nDeadline: ${data.deadline}\nParticipants: ${data.participants.join(", ")}\n\nConversation so far:\n${convo || "(none yet)"}`,
  );
  return JSON.parse(text) as ClarifyResult;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["complexity", "roles", "tasks"],
  properties: {
    complexity: { type: "string", enum: ["simple", "short_project", "long_project"] },
    roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role"],
        properties: { name: { type: "string" }, role: { type: "string" } },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "priority", "assignee", "phase", "estimated_days", "depends_on"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Importance/impact, not urgency. High only for critical-path or blocking work." },
          assignee: { type: "string" },
          phase: { type: "string", description: "Stage or milestone name; empty string for simple goals." },
          estimated_days: { type: "number", description: "Realistic working days of effort." },
          depends_on: { type: "array", items: { type: "integer" }, description: "0-based indexes of EARLIER tasks that must finish first." },
        },
      },
    },
  },
} as const;

type Plan = {
  roles: { name: string; role: string }[];
  complexity: string;
  tasks: RawTask[];
};

const INSTRUCTIONS =
  "You are a pragmatic project planner. First classify the goal: 'simple' (a few actions, 2-5 tasks, no phases), 'short_project' (several coordinated tasks, 5-10), or 'long_project' (multi-week: group 8-16 tasks into logical phases/milestones sized to the work, not equal weeks). Never inflate a simple goal into a big plan. For each task estimate realistic working days, list dependencies on earlier tasks (by index) and allow independent tasks to run in parallel. Priority reflects importance and impact: reserve 'high' for critical, blocking work; most tasks should be medium or low. Do not set dates - the app schedules them across the full timeline. Assign each participant a fitting generic role without inventing specific skills, and spread effort evenly.";

function extractText(output: unknown): string {
  let text = "";
  for (const item of (output as { type?: string; content?: { type?: string; text?: string }[] }[] | undefined) ?? []) {
    if (item.type === "message") {
      for (const c of item.content ?? []) if (c.type === "output_text") text += c.text ?? "";
    }
  }
  return text;
}

async function generatePlanText(input: string): Promise<string> {
  return generateJson(INSTRUCTIONS, schema, "plan", input);
}

export async function generateJson(instructions: string, schema: Record<string, unknown>, name: string, input: string): Promise<string> {
  // Lovable hosting injects LOVABLE_API_KEY automatically; self-hosted
  // deployments (e.g. Vercel) fall back to a direct OpenAI call.
  if (process.env["LOVABLE_API_KEY"]) {
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    });
    return extractText(res.output);
  }

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "No AI key configured on this server. Add OPENAI_API_KEY in your hosting environment (Vercel → Project → Settings → Environment Variables) and redeploy, or publish through Lovable where the AI connection is automatic.",
    );
  }
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4.1",
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI request failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const text = extractText((await r.json()).output);
  if (!text) throw new Error("The AI returned an empty plan. Please try again.");
  return text;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** Generates an AI plan and saves the goal + tasks as the given user (RLS applies). */
export async function generateAndSavePlan(supabase: SupabaseClient, userId: string, data: z.infer<typeof PlanInput>) {
    const context = { supabase, userId };
const today = new Date().toISOString().slice(0, 10);
    const text = await generatePlanText(
      `Today: ${today}\nGoal: ${data.title}\nDescription: ${data.description || "(none)"}\nGoal deadline: ${data.deadline}\nParticipants (use these exact names as assignee): ${data.participants.join(", ")}\nConfirmed project details: ${data.context || "(none)"}\nDays available: ${Math.round((Date.parse(data.deadline) - Date.parse(today)) / 86400000)}`,
    );
    const plan = JSON.parse(text) as Plan;

    const participants = data.participants.map((name) => ({
      name,
      role: plan.roles.find((r) => r.name === name)?.role ?? "Contributor",
    }));

    const { data: goal, error } = await context.supabase
      .from("goals")
      .insert({
        title: data.title,
        description: data.description,
        deadline: data.deadline,
        participants,
        requirements: data.context ?? "",
        user_id: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { tasks: scheduled, warning } = schedulePlan(plan.tasks, { today, deadline: data.deadline, participants: data.participants });
    const rows = scheduled.map((t) => ({ ...t, goal_id: goal.id, user_id: context.userId }));
    const { error: tErr } = await context.supabase.from("tasks").insert(rows);
    if (tErr) throw new Error(tErr.message);

        return { goalId: goal.id as string, taskCount: rows.length, warning };
}
