import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description:
    "List tasks across your goals (or one goal), open ones first by deadline. Use for 'what's my next task?'. Delayed = not done and deadline before today.",
  inputSchema: {
    goal_id: z.string().uuid().optional().describe("Only tasks of this goal."),
    assignee: z.string().max(60).optional().describe("Only tasks assigned to this participant name."),
    include_done: z.boolean().optional().describe("Include completed tasks (default false)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ goal_id, assignee, include_done }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    let q = supabaseForUser(ctx)
      .from("tasks")
      .select("id, goal_id, title, priority, status, assignee, deadline, goals(title)")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(100);
    if (goal_id) q = q.eq("goal_id", goal_id);
    if (assignee) q = q.eq("assignee", assignee);
    if (!include_done) q = q.neq("status", "done");
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const today = new Date().toISOString().slice(0, 10);
    const rows = (data ?? []).map((t) => ({
      id: t.id,
      goal_id: t.goal_id,
      goal: (t.goals as { title?: string } | null)?.title ?? "",
      title: t.title,
      priority: t.priority,
      status: t.status,
      assignee: t.assignee,
      deadline: t.deadline,
      delayed: t.status !== "done" && !!t.deadline && t.deadline < today,
    }));
    const text = rows.length
      ? rows.map((t) => `${t.id}: [${t.status}] ${t.title} (${t.priority}, ${t.assignee ?? "unassigned"}, due ${t.deadline ?? "n/a"}${t.delayed ? ", DELAYED" : ""}) — ${t.goal}`).join("\n")
      : "No matching tasks.";
    return { content: [{ type: "text", text }], structuredContent: { tasks: rows } };
  },
});
