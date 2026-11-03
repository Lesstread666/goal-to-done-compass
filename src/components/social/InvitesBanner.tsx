import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invitesQuery } from "@/lib/social";
import { Button } from "@/components/ui/button";

export function InvitesBanner({ onJoined }: { onJoined?: (goalId: string) => void }) {
  const qc = useQueryClient();
  const { data: invites = [] } = useQuery(invitesQuery());
  if (!invites.length) return null;
  async function respond(id: string, accept: boolean) {
    if (accept) {
      const { data, error } = await supabase.rpc("accept_goal_invite", { p_invite_id: id });
      if (error) return void toast.error("Could not join that project.");
      toast.success("You're in! The project is now on your dashboard.");
      await qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["goal-people"] });
      onJoined?.(data as string);
    } else {
      await supabase.from("goal_invites").update({ status: "declined" }).eq("id", id);
    }
    qc.invalidateQueries({ queryKey: ["invites"] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
  }
  return (
    <div className="space-y-2">
      {invites.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
          <Mail className="h-4 w-4 text-primary" />
          <span className="flex-1">
            <b>@{i.inviter_username ?? "someone"}</b> invited you to <b>{i.goal_title}</b>
          </span>
          <Button size="sm" onClick={() => respond(i.id, true)}>Accept</Button>
          <Button size="sm" variant="ghost" onClick={() => respond(i.id, false)}>Decline</Button>
        </div>
      ))}
    </div>
  );
}
