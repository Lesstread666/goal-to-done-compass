import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_task",
  title: "Update a task",
  description: "Change a task's status (todo, in_progress, done), priority, deadline or assignee. Get task ids from list_tasks.",
  inputSchema: {
    task_id: z.string().uuid().describe("Task id."),
    status: z.enum(["todo", "in_progress", "done"]).optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
    assignee: z.string().min(1).max(60).optional().describe("Must be one of the goal's participant names."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async ({ task_id, status, priority, deadline, assignee }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    const sb = supabaseForUser(ctx);
    const { data: task, error } = await sb.from("tasks").select("id, title, goal_id, goals(participants)").eq("id", task_id).maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!task) throw new ToolError("Task not found");
    if (assignee) {
      const people = (task.goals as { participants?: { name?: string }[] } | null)?.participants ?? [];
      if (!people.some((p) => p?.name === assignee)) throw new ToolError(`'${assignee}' is not a participant of this goal`);
    }
    const patch: Record<string, string | null> = {};
    if (status) {
      patch.status = status;
      patch.completed_at = status === "done" ? new Date().toISOString() : null;
    }
    if (priority) patch.priority = priority;
    if (deadline) patch.deadline = deadline;
    if (assignee) patch.assignee = assignee;
    if (!Object.keys(patch).length) throw new ToolError("Nothing to update");
    const { error: uErr } = await sb.from("tasks").update(patch).eq("id", task_id);
    if (uErr) throw new ToolError(uErr.message);
    return { content: [{ type: "text", text: `Updated "${task.title}".` }] };
  },
});
