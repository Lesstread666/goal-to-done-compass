import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listGoals from "./tools/list-goals";
import listTasks from "./tools/list-tasks";
import updateTask from "./tools/update-task";
import createGoalPlan from "./tools/create-goal-plan";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "goal-to-done-compass",
  title: "Goal To Done Compass",
  version: "0.1.0",
  instructions:
    "Ticklist turns big goals into small tasks. List goals and tasks (open, delayed, by assignee), update task status/priority/deadline/assignee, and create new AI-planned goals. Only the signed-in user's projects are visible.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listGoals, listTasks, updateTask, createGoalPlan],
});
