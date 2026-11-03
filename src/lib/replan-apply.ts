import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { todayStr, type Goal, type Task } from "./goals";
import { replanTasks } from "./replan";

/** Runs after a task is completed: re-plans open tasks and saves the changes. */
export async function autoReplan(qc: QueryClient, goalId: string) {
  const { data, error } = await supabase.from("tasks").select("*").eq("goal_id", goalId);
  if (error || !data) return;
  const goal = qc.getQueryData<Goal[]>(["goals"])?.find((g) => g.id === goalId);
  const patches = replanTasks(data as unknown as Task[], goal?.deadline ?? null, todayStr());
  if (!patches.length) return;
  const results = await Promise.all(
    patches.map((p) => supabase.from("tasks").update({ deadline: p.deadline, priority: p.priority }).eq("id", p.id)),
  );
  await qc.invalidateQueries({ queryKey: ["tasks", goalId] });
  if (results.some((r) => r.error)) toast.error("Some tasks couldn't be re-planned.");
  else toast.success(`Nice progress! Ticklist re-planned ${patches.length} task${patches.length > 1 ? "s" : ""}.`);
}
