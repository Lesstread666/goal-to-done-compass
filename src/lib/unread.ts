import { useEffect } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/social";

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
export function useUnread(opts: { notify?: boolean } = {}) {
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, opts.notify]);
  const counts = q.data ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}
