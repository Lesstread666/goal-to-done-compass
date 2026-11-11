import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { generateAndSavePlan } from "../../plan-core";

export default defineTool({
  name: "create_goal_plan",
  title: "Split a goal into tasks",
  description: "Create a new goal project; AI splits it into prioritized tasks with deadlines and gives each participant a role.",
  inputSchema: {
    title: z.string().min(2).max(200).describe("The goal, e.g. 'Build a portfolio website'."),
    description: z.string().max(2000).optional().describe("What done looks like."),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Goal deadline, YYYY-MM-DD."),
    participants: z.array(z.string().min(1).max(60)).min(1).max(12).optional().describe("Participant names (default: ['Me'])."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, description, deadline, participants }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    const userId = ctx.getUserId();
    if (!userId) throw new ToolError("Not signed in");
    await ctx.progress({ progress: 0, total: 1, message: "Building your plan…" });
    const { goalId, taskCount, warning } = await generateAndSavePlan(supabaseForUser(ctx), userId, {
      title,
      description: description ?? "",
      deadline,
      participants: participants ?? ["Me"],
    });
    return {
      content: [{ type: "text", text: `Created "${title}" with ${taskCount} tasks (goal id ${goalId}). Use list_tasks to see them.${warning ? " Warning: " + warning : ""}` }],
      structuredContent: { goal_id: goalId, task_count: taskCount },
    };
  },
});
