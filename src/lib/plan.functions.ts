import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participants: z.array(z.string().min(1).max(60)).min(1).max(12),
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["roles", "tasks"],
  properties: {
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
        required: ["title", "description", "priority", "assignee", "deadline"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          assignee: { type: "string" },
          deadline: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
} as const;

type Plan = {
  roles: { name: string; role: string }[];
  tasks: { title: string; description: string; priority: string; assignee: string; deadline: string }[];
};

export const createGoalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const today = new Date().toISOString().slice(0, 10);
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions:
        "You are a project planner who helps overwhelmed people turn big goals into small, concrete, actionable tasks. Each task should be doable in a few hours to two days. Order tasks in logical sequence. Assign each participant a fitting role and spread tasks across participants by role. Deadlines must be between today and the goal deadline, spaced realistically.",
      input: `Today: ${today}\nGoal: ${data.title}\nDescription: ${data.description || "(none)"}\nGoal deadline: ${data.deadline}\nParticipants (use these exact names as assignee): ${data.participants.join(", ")}\nCreate 6-14 tasks.`,
      text: { format: { type: "json_schema", name: "plan", strict: true, schema } },
    });

    let text = "";
    for (const item of res.output ?? []) {
      if (item.type === "message") {
        for (const c of item.content) if (c.type === "output_text") text += c.text;
      }
    }
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

    const valid = /^\d{4}-\d{2}-\d{2}$/;
    const rows = plan.tasks.map((t, i) => ({
      goal_id: goal.id,
      user_id: context.userId,
      title: t.title,
      description: t.description,
      priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
      assignee: data.participants.includes(t.assignee) ? t.assignee : (data.participants[i % data.participants.length] ?? null),
      deadline: valid.test(t.deadline) ? t.deadline : data.deadline,
      position: i,
    }));
    const { error: tErr } = await context.supabase.from("tasks").insert(rows);
    if (tErr) throw new Error(tErr.message);

    return { goalId: goal.id as string };
  });
