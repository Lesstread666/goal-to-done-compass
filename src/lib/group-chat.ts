import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, type Message, type Profile } from "@/lib/social";

export type GroupSummary = { id: string; name: string; owner_id: string; member_count: number; last_body: string | null; last_sender: string | null; last_at: string | null; last_has_attachment: boolean; unread: number; created_at: string };
export type GroupMessage = { id: number; group_id: string; sender_id: string; body: string; attachment_path: string | null; attachment_name: string | null; attachment_size: number | null; attachment_type: string | null; created_at: string };
export type Reaction = { message_id: number; user_id: string; emoji: string };
export type ReactionGroup = { emoji: string; count: number; mine: boolean };

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🙏", "🔥", "✅"];
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Owner manages membership; every member may rename or leave. */
export const groupPermissions = (group: { owner_id: string }, userId: string | null | undefined) => {
  const isOwner = !!userId && group.owner_id === userId;
  return { canAddMembers: isOwner, canRemoveMembers: isOwner, canRename: !!userId, canLeave: !!userId };
};

/** Groups reactions per emoji with a count and whether the viewer reacted, in first-seen order. */
export function groupReactions(reactions: Reaction[], messageId: number, userId: string | null | undefined): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    if (r.message_id !== messageId) continue;
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count += 1;
    if (r.user_id === userId) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function listTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export const groupsQuery = () => queryOptions({
  queryKey: ["group-chats"],
  refetchInterval: 20000,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("my_group_chats");
    if (error) throw error;
    return (data ?? []).map((g) => ({ ...g, member_count: Number(g.member_count), unread: Number(g.unread) })) as GroupSummary[];
  },
});

export const groupMembersQuery = (groupId: string) => queryOptions({
  queryKey: ["group-members", groupId],
  queryFn: async () => {
    const { data, error } = await supabase.from("chat_group_members").select("user_id, joined_at").eq("group_id", groupId).order("joined_at");
    if (error) throw error;
    const ids = (data ?? []).map((m) => m.user_id);
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("*").in("id", ids) : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Profile[];
  },
});

export const groupMessagesQuery = (groupId: string) => queryOptions({
  queryKey: ["group-messages", groupId],
  queryFn: async () => {
    const [m, r] = await Promise.all([
      supabase.from("chat_group_messages").select("*").eq("group_id", groupId).order("id", { ascending: false }).limit(200),
      supabase.from("chat_group_reactions").select("message_id, user_id, emoji").eq("group_id", groupId),
    ]);
    if (m.error) throw m.error;
    if (r.error) throw r.error;
    return { messages: (m.data ?? []).reverse() as GroupMessage[], reactions: (r.data ?? []) as Reaction[] };
  },
});

export type DmSummary = { partner: Profile; last: Message };
export const dmListQuery = () => queryOptions({
  queryKey: ["dm-list"],
  queryFn: async () => {
    const me = await currentUserId();
    if (!me) return [] as DmSummary[];
    const { data, error } = await supabase.from("messages").select("*").or(`sender_id.eq.${me},recipient_id.eq.${me}`).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const latest = new Map<string, Message>();
    for (const m of (data ?? []) as Message[]) {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!latest.has(other)) latest.set(other, m);
    }
    const ids = [...latest.keys()];
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("*").in("id", ids) : { data: [] };
    return (profiles ?? []).map((p) => ({ partner: p as Profile, last: latest.get(p.id)! })).sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  },
});

export async function attachmentUrl(path: string) {
  const { data, error } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
