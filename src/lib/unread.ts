import { useEffect } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/social";
import { groupsQuery } from "@/lib/group-chat";

/** Unread message counts keyed by sender id. */
export const unreadQuery = () =>
  queryOptions({
    queryKey: ["unread"],
    queryFn: async () => {
      const me = await currentUserId();
      if (!me) return {} as Record<string, number>;
      const { data, error } = await supabase.from("messages").select("sender_id").eq("recipient_id", me).is("read_at", null).limit(500);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) counts[r.sender_id] = (counts[r.sender_id] ?? 0) + 1;
      return counts;
    },
  });

export async function markRead(senderId: string) {
  await supabase.rpc("mark_messages_read", { p_sender: senderId });
}

/** Keeps unread counts live and pops a toast for new incoming messages. Mount once per page. */
export function useUnread(opts: { notify?: boolean; notifyGroups?: boolean } = {}) {
  const qc = useQueryClient();
  const q = useQuery(unreadQuery());
  useEffect(() => {
    let me: string | null = null;
    void currentUserId().then((id) => (me = id));
    const channel = supabase
      .channel(`unread-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, ({ eventType, new: m }) => {
        void qc.invalidateQueries({ queryKey: ["unread"] });
        const msg = m as { recipient_id?: string; body?: string };
        if (opts.notify && eventType === "INSERT" && me && msg.recipient_id === me) {
          toast("New message", { description: msg.body?.slice(0, 80), action: { label: "Open", onClick: () => (window.location.href = "/teams") } });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages" }, ({ new: m }) => {
        void qc.invalidateQueries({ queryKey: ["group-chats"] });
        const msg = m as { group_id?: string; sender_id?: string; body?: string; kind?: string; attachment_name?: string | null };
        if (!opts.notifyGroups || !me || msg.sender_id === me || !msg.group_id) return;
        if (new URLSearchParams(window.location.search).get("group") === msg.group_id) return;
        const g = qc.getQueryData<{ id: string; name: string }[]>(["group-chats"])?.find((x) => x.id === msg.group_id);
        const gid = msg.group_id;
        toast(g ? `New in ${g.name}` : "New group message", {
          description: (msg.body?.trim() || (msg.attachment_name ? `📎 ${msg.attachment_name}` : "")).slice(0, 80),
          action: { label: "Open", onClick: () => (window.location.href = `/teams?group=${gid}`) },
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, opts.notify, opts.notifyGroups]);
  const groups = useQuery(groupsQuery());
  const counts = q.data ?? {};
  const groupUnread = (groups.data ?? []).reduce((a, g) => a + g.unread, 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + groupUnread;
  return { counts, total };
}
