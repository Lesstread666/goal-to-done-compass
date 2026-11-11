import { z } from "zod";
import { schedulePlan, type RawTask } from "./plan-schedule";

export const PlanInput = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participants: z.array(z.string().min(1).max(60)).min(1).max(12),
});

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
  // Lovable hosting injects LOVABLE_API_KEY automatically; self-hosted
  // deployments (e.g. Vercel) fall back to a direct OpenAI call.
  if (process.env["LOVABLE_API_KEY"]) {
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions: INSTRUCTIONS,
      input,
      text: { format: { type: "json_schema", name: "plan", strict: true, schema } },
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
      instructions: INSTRUCTIONS,
      input,
      text: { format: { type: "json_schema", name: "plan", strict: true, schema } },
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
      `Today: ${today}\nGoal: ${data.title}\nDescription: ${data.description || "(none)"}\nGoal deadline: ${data.deadline}\nParticipants (use these exact names as assignee): ${data.participants.join(", ")}\nDays available: ${Math.round((Date.parse(data.deadline) - Date.parse(today)) / 86400000)}`,
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
