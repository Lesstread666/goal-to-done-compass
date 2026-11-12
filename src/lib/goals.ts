import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Participant = { name: string; role: string };
export type Goal = {
  id: string;
  title: string;
  description: string;
  deadline: string | null;
  participants: Participant[];
  created_at: string;
};
export type Task = {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  assignee: string | null;
  status: "todo" | "in_progress" | "done";
  deadline: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
};

export const todayStr = () => new Date().toISOString().slice(0, 10);

/** Latest selectable task deadline: the day before the project deadline (null when the project has none). */
export function maxTaskDeadline(goalDeadline: string | null | undefined): string | undefined {
  if (!goalDeadline) return undefined;
  const d = new Date(`${goalDeadline}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A task is delayed when it is not done and its deadline is before today. */
export function isDelayed(t: Pick<Task, "status" | "deadline">, today = todayStr()) {
  return t.status !== "done" && !!t.deadline && t.deadline < today;
}

export const goalsQuery = () =>
  queryOptions({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Goal[]).map((goal) => ({ ...goal, participants: Array.isArray(goal.participants) ? goal.participants : [] }));
    },
  });

export const tasksQuery = (goalId: string) =>
  queryOptions({
    queryKey: ["tasks", goalId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("goal_id", goalId).order("position");
      if (error) throw error;
      return data as unknown as Task[];
    },
  });

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
