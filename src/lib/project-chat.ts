import { useEffect } from "react";
import { queryOptions, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { goalsQuery } from "@/lib/goals";

export function totalProjectUnread(counts: (number | undefined)[]) {
  return counts.reduce<number>((total, count) => total + (count ?? 0), 0);
}

/** Reuses each project's read cursor and cache, including projects not currently open. */
export function useProjectUnread() {
  const qc = useQueryClient();
  const { data: goals = [] } = useQuery(goalsQuery());
  const unread = useQueries({ queries: goals.map((goal) => projectUnreadQuery(goal.id)) });
  useEffect(() => {
    const channel = supabase.channel(`project-unread-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_messages" }, () => {
        void qc.invalidateQueries({ queryKey: ["project-chat-unread"] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);
  return totalProjectUnread(unread.map((query) => query.data));
}

export type ProjectMessage = { id: number; goal_id: string; sender_id: string; body: string; created_at: string };

export function countProjectUnread(messages: ProjectMessage[], userId: string, lastReadId: number) {
  return messages.filter((m) => m.sender_id !== userId && m.id > lastReadId).length;
}

export const projectUnreadQuery = (goalId: string) => queryOptions({
  queryKey: ["project-chat-unread", goalId],
  refetchInterval: 15000,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("project_chat_unread", { p_goal_id: goalId });
    if (error) throw error;
    return Number(data ?? 0);
  },
});

export const projectMessagesQuery = (goalId: string) => queryOptions({
  queryKey: ["project-chat-messages", goalId],
  refetchInterval: 15000,
  queryFn: async () => {
    const { data, error } = await supabase.from("project_messages").select("*").eq("goal_id", goalId).order("id", { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).reverse() as ProjectMessage[];
  },
});