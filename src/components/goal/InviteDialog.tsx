import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addContact, type Profile } from "@/lib/social";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserSearch } from "@/components/social/UserSearch";
import { UserAvatar } from "@/components/social/UserAvatar";
import type { Goal } from "@/lib/goals";

export const goalPeopleQuery = (goalId: string) => ({
  queryKey: ["goal-people", goalId],
  queryFn: async () => {
    const [m, i] = await Promise.all([
      supabase.from("goal_members").select("user_id, role").eq("goal_id", goalId),
      supabase.from("goal_invites").select("id, invitee_id, status").eq("goal_id", goalId).eq("status", "pending"),
    ]);
    if (m.error) throw m.error;
    if (i.error) throw i.error;
    const ids = [...(m.data ?? []).map((x) => x.user_id), ...(i.data ?? []).map((x) => x.invitee_id)];
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("*").in("id", ids) : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
    return {
      members: (m.data ?? []).map((x) => ({ role: x.role, profile: byId.get(x.user_id) })).filter((x) => x.profile) as { role: string; profile: Profile }[],
      pending: (i.data ?? []).map((x) => ({ id: x.id, profile: byId.get(x.invitee_id) })).filter((x) => x.profile) as { id: string; profile: Profile }[],
    };
  },
});

export function InviteDialog({ goal, className }: { goal: Goal; className?: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery(goalPeopleQuery(goal.id));
  const taken = new Set([...(data?.members ?? []).map((m) => m.profile.id), ...(data?.pending ?? []).map((p) => p.profile.id)]);

  async function invite(p: Profile) {
    const { error } = await supabase.from("goal_invites").insert({ goal_id: goal.id, invitee_id: p.id });
    if (error) return void toast.error(error.code === "23505" ? `@${p.username} was already invited.` : "Could not send the invite.");
    await addContact(p.id).catch(() => {});
    toast.success(`Invite sent to @${p.username}`);
    qc.invalidateQueries({ queryKey: ["goal-people", goal.id] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
  }
  async function cancel(id: string) {
    await supabase.from("goal_invites").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["goal-people", goal.id] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}><UserPlus /> Invite</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite teammates</DialogTitle>
          <DialogDescription>Find people by username. They join “{goal.title}” once they accept in Ticklist.</DialogDescription>
        </DialogHeader>
        <UserSearch
          action={(p) =>
            taken.has(p.id) ? <span className="text-xs text-muted-foreground">Added</span> : <Button size="sm" onClick={() => invite(p)}>Invite</Button>
          }
        />
        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">In this project</h3>
          {data?.members.map(({ profile, role }) => (
            <Link key={profile.id} to="/u/$username" params={{ username: profile.username }} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-muted">
              <UserAvatar username={profile.username} url={profile.avatar_url} className="h-8 w-8" />
              <span className="flex-1 text-sm">@{profile.username}</span>
              <span className="text-xs text-muted-foreground capitalize">{role}</span>
            </Link>
          ))}
          {!!data?.pending.length && <h3 className="pt-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Waiting to accept</h3>}
          {data?.pending.map(({ id, profile }) => (
            <div key={id} className="flex items-center gap-3 px-1 py-1">
              <UserAvatar username={profile.username} url={profile.avatar_url} className="h-8 w-8 opacity-70" />
              <span className="flex-1 text-sm text-muted-foreground">@{profile.username}</span>
              <Button size="icon" variant="ghost" aria-label={`Cancel invite for ${profile.username}`} onClick={() => cancel(id)}><X /></Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
