import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addContact, meQuery, searchProfiles, type Profile } from "@/lib/social";
import { UserAvatar } from "@/components/social/UserAvatar";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createGoalPlan } from "@/lib/plan.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CreateGoalDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [count, setCount] = useState(1);
  const [names, setNames] = useState<string[]>(["Me"]);
  const [picked, setPicked] = useState<(Profile | null)[]>([null]);
  const { data: me } = useQuery(meQuery());
  useEffect(() => {
    if (me) setNames((prev) => (prev[0] === "Me" ? [me.username, ...prev.slice(1)] : prev));
  }, [me]);
  const qc = useQueryClient();
  const create = useServerFn(createGoalPlan);

  const m = useMutation({
    mutationFn: create,
    onSuccess: async ({ goalId }) => {
      const invitees = picked.filter((p): p is Profile => !!p && p.id !== me?.id);
      for (const p of invitees) {
        const { error } = await supabase.from("goal_invites").insert({ goal_id: goalId, invitee_id: p.id });
        if (!error) await addContact(p.id).catch(() => {});
      }
      if (invitees.length) toast.success(`Invites sent to ${invitees.map((p) => "@" + p.username).join(", ")}`);
      setPicked([null]);
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Your plan is ready");
      setOpen(false);
      setTitle("");
      setDescription("");
      setDeadline("");
      onCreated(goalId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create plan"),
  });

  function setParticipantCount(n: number) {
    const c = Math.max(1, Math.min(12, n || 1));
    setCount(c);
    setNames((prev) => Array.from({ length: c }, (_, i) => prev[i] ?? ""));
    setPicked((prev) => Array.from({ length: c }, (_, i) => prev[i] ?? null));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !m.isPending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button className="glow">
          <Plus /> New goal project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a goal project</DialogTitle>
          <DialogDescription>AI will split it into prioritized tasks and give each teammate a role.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({ data: { title, description, deadline, participants: names.map((n, i) => n.trim() || `Teammate ${i + 1}`) } });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="g-title">Goal</Label>
            <Input id="g-title" required placeholder="Build a portfolio website" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">Description</Label>
            <Textarea id="g-desc" rows={3} placeholder="What does done look like?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-count">Participants</Label>
              <Input id="g-count" type="number" min={1} max={12} value={count} onChange={(e) => setParticipantCount(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-deadline">Deadline</Label>
              <Input id="g-deadline" type="date" required min={new Date().toISOString().slice(0, 10)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Participants</Label>
            <p className="text-xs text-muted-foreground">Type a username to pick a Ticklist user — they get an invite and keep the tasks assigned to them.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {names.map((n, i) => (
                <ParticipantField
                  key={i}
                  index={i}
                  value={n}
                  picked={picked[i] ?? null}
                  excludeIds={[me?.id, ...picked.filter((_, j) => j !== i).map((p) => p?.id)].filter(Boolean) as string[]}
                  onChange={(v) => {
                    setNames(names.map((x, j) => (j === i ? v : x)));
                    setPicked(picked.map((x, j) => (j === i ? null : x)));
                  }}
                  onPick={(p) => {
                    setNames(names.map((x, j) => (j === i ? p.username : x)));
                    setPicked(picked.map((x, j) => (j === i ? p : x)));
                  }}
                />
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full glow" disabled={m.isPending}>
            {m.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {m.isPending ? "Building your plan…" : "Divide into tasks"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantField({ index, value, picked, excludeIds, onChange, onPick }: {
  index: number; value: string; picked: Profile | null; excludeIds: string[];
  onChange: (v: string) => void; onPick: (p: Profile) => void;
}) {
  const [results, setResults] = useState<Profile[]>([]);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (picked || !value.trim() || index === 0) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProfiles(value).then((r) => setResults(r.filter((p) => !excludeIds.includes(p.id)))).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value, picked, index, excludeIds.join()]);
  return (
    <div className="relative">
      <Input
        aria-label={`Participant ${index + 1}`}
        placeholder={index === 0 ? "You" : "Search username or type a name"}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onChange(e.target.value)}
        className={picked ? "border-primary pr-16" : undefined}
      />
      {picked && <span className="absolute top-1/2 right-2 -translate-y-1/2 text-[10px] font-semibold text-primary uppercase">Invite</span>}
      {focused && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(p); setResults([]); }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted">
                <UserAvatar username={p.username} url={p.avatar_url} className="h-6 w-6" />
                @{p.username}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
