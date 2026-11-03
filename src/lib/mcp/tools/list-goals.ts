import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_goals",
  title: "List goal projects",
  description: "List your Ticklist goal projects with deadline, participants and progress.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    const sb = supabaseForUser(ctx);
    const [{ data: goals, error }, { data: tasks, error: tErr }] = await Promise.all([
      sb.from("goals").select("id, title, deadline, participants").order("created_at", { ascending: false }).limit(50),
      sb.from("tasks").select("goal_id, status"),
    ]);
    if (error || tErr) throw new ToolError((error ?? tErr)!.message);
    const rows = (goals ?? []).map((g) => {
      const own = (tasks ?? []).filter((t) => t.goal_id === g.id);
      const done = own.filter((t) => t.status === "done").length;
      const people = Array.isArray(g.participants) ? (g.participants as { name?: string }[]).map((p) => String(p?.name ?? "")) : [];
      return { id: g.id, title: g.title, deadline: g.deadline, participants: people, tasks: own.length, done };
    });
    const text = rows.length
      ? rows.map((g) => `${g.id}: ${g.title} — ${g.done}/${g.tasks} done, due ${g.deadline ?? "n/a"}`).join("\n")
      : "No goal projects yet.";
    return { content: [{ type: "text", text }], structuredContent: { goals: rows } };
  },
});
