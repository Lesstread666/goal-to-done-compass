import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { todayStr, type Goal, type Task } from "./goals";
import { replanTasks, datesOnly } from "./replan";
import { captureReplanUndo, reopenTaskPatches, sameCompletion, type ReplanUndo } from "./replan-undo";

type StatusTransition = { taskId: string; previousStatus: Task["status"]; status: Task["status"]; completedAt: string | null };

function readUndo(key: string): ReplanUndo | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReplanUndo;
    return Array.isArray(parsed.changes) ? parsed : null;
  } catch { return null; }
}

/** Completion saves its automatic changes; reopening reverses them in the same browser. */
export async function autoReplan(qc: QueryClient, goalId: string, transition: StatusTransition) {
  const reopening = transition.previousStatus === "done" && transition.status !== "done";
  if (!reopening && (transition.status !== "done" || transition.previousStatus === "done")) return;
  const { data, error } = await supabase.from("tasks").select("*").eq("goal_id", goalId);
  if (error || !data) {
    toast.error("Task moved, but priorities couldn't be updated. Please try again.");
    return;
  }
  const tasks = data as unknown as Task[];
  const goal = qc.getQueryData<Goal[]>(["goals"])?.find((g) => g.id === goalId);
  const names = goal?.participants.map((p) => p.name) ?? [];
  const key = `ticklist:replan-undo:${goalId}:${transition.taskId}`;
  const saved = reopening ? readUndo(key) : null;
  const undo = saved && sameCompletion(saved.completedAt, transition.completedAt) ? saved : null;
  // Priorities now change only through accepted AI Project Insights; dates still move automatically.
  const patches = datesOnly(tasks, reopening
    ? reopenTaskPatches(tasks, undo, goal?.deadline ?? null, todayStr(), names)
    : replanTasks(tasks, goal?.deadline ?? null, todayStr(), names));
  if (!reopening) {
    try { window.localStorage.setItem(key, JSON.stringify(captureReplanUndo(tasks, patches, transition.completedAt))); } catch { /* Storage may be disabled; reopening still reassesses urgency. */ }
  }
  if (!patches.length) return;
  const results = await Promise.all(
    patches.map((p) => {
      const current = tasks.find((task) => task.id === p.id);
      let update = supabase.from("tasks").update({ deadline: p.deadline, priority: p.priority }).eq("id", p.id).eq("goal_id", goalId).neq("status", "done");
      if (current) {
        update = update.eq("priority", current.priority);
        update = current.deadline === null ? update.is("deadline", null) : update.eq("deadline", current.deadline);
      }
      return update;
    }),
  );
  await qc.invalidateQueries({ queryKey: ["tasks", goalId] });
  if (results.some((r) => r.error)) toast.error("Some tasks couldn't be re-planned.");
  else {
    if (reopening) { try { window.localStorage.removeItem(key); } catch { /* Optional undo history. */ } }
    toast.success(reopening ? "Task reopened. Dates updated." : `Nice progress! Ticklist moved ${patches.length} date${patches.length > 1 ? "s" : ""}.`);
  }
}
