import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Check, Loader2, Plus, RefreshCw, Rocket, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { tasksQuery, type Goal, type Task } from "@/lib/goals";
import { CRITERIA, CRITERIA_LABELS, PUBLISH_WARN_BELOW, opToWrite, type Criterion, type PlanOp } from "@/lib/review-ops";
import { chatPlan, reviewPlan } from "@/lib/review.functions";
import { EditTaskDialog } from "@/components/goal/EditTaskDialog";
import { DeleteDialog } from "@/components/goal/DeleteDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Review = { id: string; score: number; summary: string; criteria: Partial<Record<Criterion, number>>; problems: string[]; recommendations: string[]; created_at: string };
type Proposal = { id: string; source: string; summary: string; op: PlanOp; status: string };
type ChatMsg = { id: string; role: string; content: string };

const prio: Record<string, string> = { high: "bg-destructive/15 text-destructive", medium: "bg-primary/15 text-primary", low: "bg-muted text-muted-foreground" };

export function PlanReview({ goal, goals, onSelect }: { goal: Goal; goals: Goal[]; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery(tasksQuery(goal.id));
  const reviews = useQuery({ queryKey: ["plan-review", goal.id], queryFn: async () => {
    const { data, error } = await supabase.from("plan_reviews").select("*").eq("goal_id", goal.id).order("created_at", { ascending: false }).limit(1);
    if (error) throw error; return (data?.[0] ?? null) as unknown as Review | null;
  } });
  const proposals = useQuery({ queryKey: ["plan-proposals", goal.id], queryFn: async () => {
    const { data, error } = await supabase.from("plan_proposals").select("*").eq("goal_id", goal.id).eq("status", "pending").order("created_at");
    if (error) throw error; return (data ?? []) as unknown as Proposal[];
  } });
  const chat = useQuery({ queryKey: ["plan-chat", goal.id], queryFn: async () => {
    const { data, error } = await supabase.from("plan_chat").select("id,role,content").eq("goal_id", goal.id).order("created_at");
    if (error) throw error; return (data ?? []) as ChatMsg[];
  } });
  const refresh = () => Promise.all(["tasks", "plan-review", "plan-proposals", "plan-chat"].map((k) => qc.invalidateQueries({ queryKey: [k, goal.id] })));

  const review = useServerFn(reviewPlan);
  const reReview = useMutation({ mutationFn: () => review({ data: { goalId: goal.id } }), onSuccess: () => { refresh(); toast.success("Plan re-assessed"); }, onError: () => toast.error("The review didn't finish. Please try again.") });

  const send = useServerFn(chatPlan);
  const [msg, setMsg] = useState("");
  const ask = useMutation({ mutationFn: (m: string) => send({ data: { goalId: goal.id, message: m } }), onSuccess: async () => { setMsg(""); await refresh(); reReview.mutate(); }, onError: () => toast.error("The assistant couldn't answer. Your message is still in the box.") });

  const [changed, setChanged] = useState<Set<string>>(new Set());
  const decide = useMutation({
    mutationFn: async ({ p, accept }: { p: Proposal; accept: boolean }) => {
      let title = "", id: string | null = null;
      if (accept) {
        const w = opToWrite(p.op, tasks, goal.participants.map((x) => x.name), goal.id, tasks.length);
        if (!w) throw new Error("This suggestion no longer matches the plan.");
        const r = w.type === "insert" ? await supabase.from("tasks").insert(w.row as never)
          : w.type === "update" ? await supabase.from("tasks").update(w.patch as never).eq("id", w.id)
          : await supabase.from("tasks").delete().eq("id", w.id);
        if (r.error) throw r.error;
        title = w.type === "insert" ? String(w.row["title"]) : tasks.find((t) => t.id === w.id)?.title ?? "task";
        id = w.type === "update" ? w.id : null;
      }
      const { error } = await supabase.from("plan_proposals").update({ status: accept ? "accepted" : "rejected" }).eq("id", p.id).eq("status", "pending");
      if (error) throw error;
      return { accept, title, id };
    },
    onSuccess: async (res) => {
      if (res.accept) { toast.success(`Plan updated: ${res.title}`); if (res.id) setChanged((s) => new Set(s).add(res.id!)); }
      await refresh();
      reReview.mutate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not apply the change"),
  });

  const addTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").insert({ goal_id: goal.id, title: "New task", position: tasks.length, deadline: goal.deadline, manually_edited: true });
      if (error) throw error;
    },
    onSuccess: refresh, onError: () => toast.error("Could not add a task"),
  });

  const [confirm, setConfirm] = useState(false);
  const publish = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("publish_goal", { p_goal_id: goal.id });
      if (error) throw error; return data as number;
    },
    onSuccess: async (sent) => {
      await qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success(sent ? `Project published — ${sent} invite${sent > 1 ? "s" : ""} sent` : "Project published");
    },
    onError: () => toast.error("Could not publish. Please try again."),
  });
  const r = reviews.data;
  const onPublish = () => (!r || r.score < PUBLISH_WARN_BELOW ? setConfirm(true) : publish.mutate());

  return (
    <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-5">
        <div>
          <div className="text-sm text-muted-foreground">Goal projects › <span className="text-foreground">{goal.title}</span> <span className="ml-1 rounded bg-muted px-1.5 text-[10px] font-semibold uppercase">Draft</span></div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Review your plan</h1>
              <p className="mt-1 font-medium">{goal.title}</p>
              {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
              {goal.deadline && <p className="mt-1 text-sm text-muted-foreground">Deadline {new Date(goal.deadline).toLocaleDateString()}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <DeleteDialog label="Discard draft" description={`Remove the draft “${goal.title}”.`} onDelete={async () => {
                const { error } = await supabase.from("goals").delete().eq("id", goal.id);
                if (error) throw error;
                await qc.invalidateQueries({ queryKey: ["goals"] });
                onSelect(goals.find((g) => g.id !== goal.id)?.id ?? "");
              }} />
              <Button variant="outline" onClick={() => reReview.mutate()} disabled={reReview.isPending}>
                {reReview.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-review
              </Button>
              <Button className="glow" onClick={onPublish} disabled={publish.isPending}><Rocket /> Approve &amp; Publish Project</Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Nothing is shared yet: teammates get their invites and tasks only after you publish.</p>
        </div>

        <section className="rounded-2xl border bg-panel/60 p-4">
          {r ? (
            <>
              <div className="flex items-center gap-4">
                <div className={cn("flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4", r.score >= 8 ? "border-primary" : r.score >= PUBLISH_WARN_BELOW ? "border-chart-4" : "border-destructive")}>
                  <span className="text-xl font-bold">{Number(r.score).toFixed(1)}</span>
                </div>
                <div><h2 className="font-semibold">Plan Quality Score</h2><p className="text-sm text-muted-foreground">{r.summary}</p></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CRITERIA.map((c) => (
                  <div key={c} className="rounded-lg bg-muted/50 px-2 py-1.5 text-xs"><div className="text-muted-foreground">{CRITERIA_LABELS[c]}</div><div className="font-semibold">{r.criteria[c] ?? "–"}/10</div></div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <List title="Problems found" items={r.problems} />
                <List title="Recommendations" items={r.recommendations} />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{reviews.isLoading ? "Loading review…" : "No review yet."}</span>
              {!reviews.isLoading && <Button size="sm" onClick={() => reReview.mutate()} disabled={reReview.isPending}>Run review</Button>}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Tasks ({tasks.length})</h2>
            <Button size="sm" variant="outline" onClick={() => addTask.mutate()} disabled={addTask.isPending}><Plus /> Add task</Button>
          </div>
          <div className="space-y-2">
            {tasks.map((t) => <ReviewTask key={t.id} task={t} goal={goal} onChanged={refresh} highlight={changed.has(t.id)} />)}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border bg-panel/60 p-4">
          <h2 className="mb-1 font-semibold">Suggested changes</h2>
          <p className="mb-2 text-xs text-muted-foreground">Waiting for your OK. Each Accept or Reject re-assesses the plan.</p>
          {reReview.isPending && <p className="mb-2 flex items-center gap-2 text-xs text-primary"><Loader2 className="h-3 w-3 animate-spin" /> Re-assessing the plan…</p>}
          {!proposals.data?.length ? <p className="text-sm text-muted-foreground">No pending suggestions.</p> : (
            <ul className="space-y-2">
              {proposals.data.map((p) => (
                <li key={p.id} className="rounded-lg border bg-card p-2.5 text-sm">
                  <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{p.op.kind} task · from {p.source === "chat" ? "chat" : "review"}</div>
                  <p>{p.summary}</p>
                  {p.op.title && p.op.kind !== "delete" && <p className="mt-1 text-xs text-muted-foreground">→ {p.op.title}{p.op.priority && ` · ${p.op.priority}`}{p.op.assignee && ` · ${p.op.assignee}`}{p.op.deadline && ` · due ${p.op.deadline}`}</p>}
                  {p.op.task_id && tasks.find((t) => t.id === p.op.task_id)?.manually_edited && <p className="mt-1 text-xs text-chart-4">You edited this task by hand.</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => decide.mutate({ p, accept: true })} disabled={decide.isPending || reReview.isPending}><Check /> Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ p, accept: false })} disabled={decide.isPending || reReview.isPending}><X /> Reject</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex max-h-[520px] flex-col rounded-2xl border bg-panel/60 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-primary" /> Plan assistant</h2>
          <div className="min-h-24 flex-1 space-y-2 overflow-y-auto text-sm">
            {!chat.data?.length && <p className="text-muted-foreground">Ask for changes, e.g. “Split the design task into smaller tasks” or “Reduce the workload for {goal.participants[1]?.name ?? "participant 2"}”.</p>}
            {chat.data?.map((m) => (
              <div key={m.id} className={cn("max-w-[90%] rounded-xl px-3 py-2", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>{m.content}</div>
            ))}
            {ask.isPending && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) ask.mutate(msg.trim()); }}>
            <Textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Request a change…" aria-label="Message the plan assistant"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (msg.trim() && !ask.isPending) ask.mutate(msg.trim()); } }} />
            <Button type="submit" size="icon" disabled={ask.isPending || !msg.trim()} aria-label="Send"><Send /></Button>
          </form>
        </section>
      </aside>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Publish with open concerns?</AlertDialogTitle>
            <AlertDialogDescription>
              {r ? `The plan scored ${Number(r.score).toFixed(1)}/10.` : "This plan hasn't been reviewed."} {r?.problems.slice(0, 3).join(" ")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => publish.mutate()}>Publish anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {items.length ? <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-muted-foreground">None.</p>}
    </div>
  );
}

function ReviewTask({ task, goal, onChanged, highlight }: { task: Task; goal: Goal; onChanged: () => void; highlight?: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border bg-card p-3", highlight && "border-primary ring-1 ring-primary/40")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{task.title}</span>
          <span className={cn("rounded px-1.5 text-[10px] font-semibold uppercase", prio[task.priority])}>{task.priority}</span>
          {task.manually_edited && <span className="text-[10px] text-muted-foreground uppercase">edited</span>}
          {highlight && <span className="text-[10px] font-semibold uppercase text-primary">updated</span>}
        </div>
        {task.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{task.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{task.assignee ?? "Unassigned"} · {task.deadline ? `due ${new Date(task.deadline).toLocaleDateString()}` : "no deadline"}</p>
      </div>
      <EditTaskDialog task={task} participants={goal.participants} />
      <DeleteDialog label="Delete task" description={`Remove “${task.title}” from the draft.`} onDelete={async () => {
        const { error } = await supabase.from("tasks").delete().eq("id", task.id);
        if (error) throw error;
        onChanged();
      }} />
    </div>
  );
}
