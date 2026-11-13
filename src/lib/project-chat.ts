import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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