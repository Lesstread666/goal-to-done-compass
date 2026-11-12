import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = { id: string; username: string; avatar_url: string | null; bio: string; created_at: string };
export type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string };

/** Usernames: 3–20 characters, lowercase letters, numbers and underscores. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const normalizeUsername = (s: string) => s.trim().toLowerCase().replace(/^@/, "");
export const isValidUsername = (s: string) => USERNAME_RE.test(normalizeUsername(s));

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: async () => {
      const id = await currentUserId();
      if (!id) throw new Error("Not signed in");
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Profile;
    },
  });

export const profileByUsernameQuery = (username: string) =>
  queryOptions({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("profile_by_username", { p_username: normalizeUsername(username) });
      if (error) throw error;
      return ((data ?? [])[0] as Profile | undefined) ?? null;
    },
  });

export const contactsQuery = () =>
  queryOptions({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_contacts").select("contact_id, created_at, profile:profiles!team_contacts_contact_id_fkey(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => r.profile as unknown as Profile).filter(Boolean);
    },
  });

export const invitesQuery = () =>
  queryOptions({
    queryKey: ["invites"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_pending_invites");
      if (error) throw error;
      return data ?? [];
    },
  });

export async function searchProfiles(term: string, excludeId?: string | null) {
  const q = normalizeUsername(term);
  if (q.length < 1) return [] as Profile[];
  const { data, error } = await supabase.rpc("search_profiles", { p_term: q });
  if (error) throw error;
  return ((data ?? []) as Profile[]).filter((p) => p.id !== excludeId);
}

export async function addContact(contactId: string) {
  const me = await currentUserId();
  if (!me || me === contactId) return;
  const { error } = await supabase.from("team_contacts").upsert({ user_id: me, contact_id: contactId }, { onConflict: "user_id,contact_id", ignoreDuplicates: true });
  if (error) throw error;
}
