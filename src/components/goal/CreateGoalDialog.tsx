import type React from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addContact, meQuery, searchProfiles, type Profile } from "@/lib/social";
import { UserAvatar } from "@/components/social/UserAvatar";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Minus, Plus, Send, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { clarifyGoalFn, createGoalPlan } from "@/lib/plan.functions";
import type { ClarifyResult } from "@/lib/plan-core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CreateGoalDialog({ onCreated, className, icon }: { onCreated: (id: string) => void; className?: string; icon?: React.ReactNode }) {
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
  const clarify = useServerFn(clarifyGoalFn);
  const [step, setStep] = useState<"form" | "clarify">("form");
  const [chat, setChat] = useState<{ role: "assistant" | "user"; content: string }[]>([]);
  const [latest, setLatest] = useState<ClarifyResult | null>(null);
  const [reply, setReply] = useState("");
  const participantList = () => names.map((n, i) => n.trim() || `Teammate ${i + 1}`);
  const ask = useMutation({
    mutationFn: (messages: { role: "assistant" | "user"; content: string }[]) =>
      clarify({ data: { title, description, deadline, participants: participantList(), messages } }),
    onSuccess: (r, messages) => {
      const text = [r.message, ...r.questions.map((q, i) => `${i + 1}. ${q}`)].filter(Boolean).join("\n");
      setChat([...messages, { role: "assistant", content: text }]);
      setLatest(r);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "The clarifier could not respond"),
  });
  const buildPlan = () =>
    m.mutate({ data: { title, description, deadline, participants: participantList(), context: latest?.summary || undefined } });

  const m = useMutation({
    mutationFn: create,
    onSuccess: async ({ goalId, warning }) => {
      const invitees = picked.filter((p): p is Profile => !!p && p.id !== me?.id);
      for (const p of invitees) {
        const { error } = await supabase.from("goal_invites").insert({ goal_id: goalId, invitee_id: p.id });
        if (!error) await addContact(p.id).catch(() => {});
      }
      if (invitees.length) toast.success(`Invites sent to ${invitees.map((p) => "@" + p.username).join(", ")}`);
      setPicked([null]);
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Your plan is ready");
      if (warning) toast.warning(warning, { duration: 10000 });
      setOpen(false);
      setTitle("");
      setDescription("");
      setDeadline("");
      setStep("form");
      setChat([]);
      setLatest(null);
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
        <Button className={className ?? "glow"}>
          {icon ?? <Plus />} New goal project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a goal project</DialogTitle>
          <DialogDescription>
            {step === "form" ? "First, our AI clarifier makes sure it understands your goal. Then it splits it into prioritized tasks." : "Answer a few questions so the plan fits what you really need."}
          </DialogDescription>
        </DialogHeader>
        {step === "clarify" ? (
          <div className="space-y-3">
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-panel/60 p-3">
              {chat.map((c, i) => (
                <div key={i} className={c.role === "user" ? "ml-8 rounded-lg bg-primary/15 p-2 text-sm whitespace-pre-wrap" : "mr-8 rounded-lg bg-muted p-2 text-sm whitespace-pre-wrap"}>
                  {c.content}
                </div>
              ))}
              {ask.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</p>}
            </div>
            {latest?.ready ? (
              <div className="rounded-xl border border-primary/50 p-3">
                <p className="mb-1 text-sm font-semibold">Here's what I understood — does this look right?</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{latest.summary}</p>
              </div>
            ) : null}
            {!ask.isPending && latest && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reply.trim()) return;
                  ask.mutate([...chat, { role: "user", content: reply.trim() }]);
                  setReply("");
                }}
              >
                <Textarea rows={2} aria-label="Your answer" placeholder={latest.ready ? "Anything to correct or add?" : "Type your answers…"} value={reply} onChange={(e) => setReply(e.target.value)} />
                <Button type="submit" size="icon" aria-label="Send"><Send /></Button>
              </form>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" disabled={m.isPending} onClick={() => setStep("form")}><ArrowLeft /> Back</Button>
              <Button type="button" className="flex-1 glow" disabled={m.isPending || ask.isPending} onClick={buildPlan}>
                {m.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {m.isPending ? "Building your plan…" : latest?.ready ? "Looks right — divide into tasks" : "Skip questions & divide into tasks"}
              </Button>
            </div>
          </div>
        ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStep("clarify");
            if (!chat.length) ask.mutate([]);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="g-title">Goal</Label>
            <Input id="g-title" required placeholder="Build a portfolio website" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">Description</Label>
            <Textarea id="g-desc" rows={4} placeholder="What does done look like?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label id="g-count-label">Participants</Label>
              <div className="flex items-center gap-2" role="group" aria-labelledby="g-count-label">
                <Button type="button" variant="outline" size="icon" aria-label="Fewer participants" disabled={count <= 1} onClick={() => setParticipantCount(count - 1)}><Minus className="h-4 w-4" /></Button>
                <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">{count}</span>
                <Button type="button" variant="outline" size="icon" aria-label="More participants" disabled={count >= 12} onClick={() => setParticipantCount(count + 1)}><Plus className="h-4 w-4" /></Button>
              </div>
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
          <Button type="submit" className="w-full glow">
            <Sparkles /> Continue
          </Button>
        </form>
        )}
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
