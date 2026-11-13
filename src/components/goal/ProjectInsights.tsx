import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Loader2, Plus, RotateCcw, ShieldAlert, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { maxTaskDeadline, todayStr, type Goal, type Task } from "@/lib/goals";
import { projectFingerprint, restoreDeadline } from "@/lib/monitor";
import { monitorProjectFn } from "@/lib/monitor.functions";
import { cn } from "@/lib/utils";

const feasibility = {
  on_track: { label: "On track", cls: "text-success border-success/40 bg-success/10" },
  at_risk: { label: "At risk", cls: "text-warning border-warning/40 bg-warning/10" },
  critical: { label: "Critical", cls: "text-destructive border-destructive/40 bg-destructive/10" },
} as const;

type Proposal = { missing_requirement?: string; recommendation?: string; replacement?: { title: string; description: string; priority: string; deadline: string }; original?: { deadline: string | null; assignee: string | null } };
type Insight = { id: string; kind: string; task_id: string | null; deleted_id: string | null; suggested_deadline: string | null; proposal: Proposal | null; from_priority: string | null; to_priority: string | null; severity: string; title: string; explanation: string; task_title: string };
type Draft = { insight: Insight; mode: "restore" | "alternative"; title: string; description: string; priority: Task["priority"]; deadline: string; note?: string };
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString();

export function ProjectInsights({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const qc = useQueryClient();
  const monitor = useServerFn(monitorProjectFn);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const key = ["project-insights", goal.id];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [dateEdit, setDateEdit] = useState<Record<string, string>>({});
  const maxDate = maxTaskDeadline(goal.deadline);
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [a, i] = await Promise.all([
        supabase.from("project_assessments").select("*").eq("goal_id", goal.id).maybeSingle(),
        supabase.from("project_insights").select("*").eq("goal_id", goal.id).eq("status", "open").order("created_at", { ascending: false }),
      ]);
      return { assessment: a.data, insights: (i.data ?? []) as Insight[] };
    },
  });

  // Event-driven: any meaningful task change (complete, add, delete, re-date, overdue) changes the fingerprint.
  const fp = projectFingerprint(tasks, goal, todayStr());
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === fp) return;
    const t = setTimeout(async () => {
      last.current = fp;
      setChecking(true);
      try {
        const r = await monitor({ data: { goalId: goal.id } });
        if (!r.skipped) await qc.invalidateQueries({ queryKey: key });
      } finally { setChecking(false); }
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp, goal.id]);

  async function resolve(i: Insight, status: "accepted" | "dismissed" | "expired") {
    await supabase.from("project_insights").update({ status, resolved_at: new Date().toISOString() }).eq("id", i.id);
    await qc.invalidateQueries({ queryKey: key });
  }

  async function accept(i: Insight) {
    if (!i.task_id || !i.to_priority || !i.from_priority) return;
    const { data: rows, error } = await supabase.from("tasks").update({ priority: i.to_priority }).eq("id", i.task_id).eq("priority", i.from_priority).neq("status", "done").select("id");
    if (error) return void toast.error("Couldn't update the priority. Please try again.");
    if (!rows?.length) {
      await resolve(i, "expired");
      return void toast.info("This task changed since the suggestion, so it was skipped.");
    }
    await resolve(i, "accepted");
    await qc.invalidateQueries({ queryKey: ["tasks", goal.id] });
    toast.success(`Priority set to ${i.to_priority}.`);
  }

  async function refreshAll() {
    await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ["tasks", goal.id] })]);
  }

  async function doRestore(i: Insight, deadline: string | null) {
    setBusy(true);
    const { error } = await supabase.rpc("restore_deleted_task", { p_deleted_id: i.deleted_id!, p_deadline: deadline as string });
    setBusy(false);
    if (error) {
      if (/already restored/i.test(error.message)) { await resolve(i, "expired"); return void toast.info("This task was already restored."); }
      return void toast.error(/project deadline/i.test(error.message) ? "Pick a date before the project deadline." : "Couldn't restore the task. Please try again.");
    }
    setDraft(null);
    await refreshAll();
    toast.success(`Restored “${i.task_title}”.`);
  }

  function startRestore(i: Insight) {
    const r = restoreDeadline(i.proposal?.original?.deadline ?? null, todayStr(), goal.deadline);
    if (!r.conflict) return void doRestore(i, r.deadline);
    setDraft({ insight: i, mode: "restore", title: i.task_title, description: "", priority: "medium", deadline: r.deadline ?? "",
      note: r.deadline ? `Its original deadline (${fmt(i.proposal!.original!.deadline!)}) no longer fits the schedule, so a new date is proposed.` : "No day before the project deadline is left. Restore it without a date or extend the project first." });
  }

  function startAlternative(i: Insight) {
    const r = i.proposal?.replacement;
    setDraft({ insight: i, mode: "alternative", title: r?.title ?? "", description: r?.description ?? "", priority: (r?.priority as Task["priority"]) ?? "medium", deadline: r?.deadline ?? "" });
  }

  async function createAlternative(d: Draft) {
    setBusy(true);
    const position = tasks.reduce((m, t) => Math.max(m, t.position), -1) + 1;
    const { error } = await supabase.from("tasks").insert({ goal_id: goal.id, title: d.title.trim(), description: d.description, priority: d.priority, deadline: d.deadline || null, status: "todo", position });
    setBusy(false);
    if (error) return void toast.error("Couldn't create the task. Please try again.");
    await resolve(d.insight, "accepted");
    setDraft(null);
    await refreshAll();
    toast.success("Alternative task added.");
  }

  async function applyDeadline(i: Insight, date: string) {
    if (!i.task_id || !date) return;
    if (maxDate && date > maxDate) return void toast.error("Pick a date before the project deadline.");
    const { data: rows, error } = await supabase.from("tasks").update({ deadline: date }).eq("id", i.task_id).is("deadline", null).select("id");
    if (error) return void toast.error("Couldn't set the deadline. Please try again.");
    if (!rows?.length) { await resolve(i, "expired"); return void toast.info("This task already has a deadline, so nothing was changed."); }
    await resolve(i, "accepted");
    await refreshAll();
    toast.success(`Deadline set to ${fmt(date)}.`);
  }

  const a = data?.assessment;
  const status = a ? feasibility[a.status as keyof typeof feasibility] ?? feasibility.on_track : null;
  const prio = data?.insights.filter((i) => i.kind === "priority") ?? [];
  const dates = data?.insights.filter((i) => i.kind === "deadline") ?? [];
  const warns = data?.insights.filter((i) => i.kind !== "priority" && i.kind !== "deadline") ?? [];

  return (
    <section className="glass rounded-2xl p-4" aria-label="AI Project Insights">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI Project Insights</h3>
        {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Checking project" />}
      </div>
      {!a ? (
        <p className="mt-2 text-xs text-muted-foreground">{checking ? "Reviewing your project…" : "Insights appear after the first check."}</p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Feasibility</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", status?.cls)}>{status?.label}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed">{a.summary}</p>
          {a.uncertainty && <p className="mt-1 text-[11px] text-muted-foreground italic">Uncertain: {a.uncertainty}</p>}
        </>
      )}

      {prio.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Priority suggestions</h4>
          {prio.map((i) => (
            <div key={i.id} className="rounded-xl border bg-card/60 p-2.5">
              <div className="text-xs font-medium break-words">{i.task_title}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] capitalize text-muted-foreground">{i.from_priority} <ArrowRight className="h-3 w-3" /> <span className="font-semibold text-foreground">{i.to_priority}</span></div>
              {open[i.id] && <p className="mt-1.5 text-xs leading-relaxed">{i.explanation}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => accept(i)}><Check className="h-3.5 w-3.5" />Accept</Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => resolve(i, "dismissed")}><X className="h-3.5 w-3.5" />Dismiss</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-expanded={!!open[i.id]} onClick={() => setOpen((o) => ({ ...o, [i.id]: !o[i.id] }))}>{open[i.id] ? "Hide" : "Details"}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dates.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Deadline suggestions</h4>
          {dates.map((i) => (
            <div key={i.id} className={cn("rounded-xl border p-2.5", i.suggested_deadline ? "bg-card/60" : "border-warning/40 bg-warning/10")}>
              <div className="text-xs font-medium break-words">{i.task_title}</div>
              {i.suggested_deadline
                ? <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarClock className="h-3 w-3" /> Suggested: <span className="font-semibold text-foreground">{fmt(i.suggested_deadline)}</span></div>
                : <div className="mt-1 text-[11px] font-medium text-warning">Doesn't fit the remaining schedule</div>}
              <p className="mt-1.5 text-xs leading-relaxed">{i.explanation}</p>
              {dateEdit[i.id] !== undefined && (
                <div className="mt-2 flex gap-1.5">
                  <Input type="date" aria-label="Choose deadline" className="h-8 text-xs" min={todayStr()} max={maxDate} value={dateEdit[i.id]} onChange={(e) => setDateEdit((s) => ({ ...s, [i.id]: e.target.value }))} />
                  <Button size="sm" className="h-8 px-2 text-xs" disabled={!dateEdit[i.id]} onClick={() => applyDeadline(i, dateEdit[i.id]!)}>Apply</Button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.suggested_deadline && <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => applyDeadline(i, i.suggested_deadline!)}><Check className="h-3.5 w-3.5" />Accept Deadline</Button>}
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setDateEdit((s) => ({ ...s, [i.id]: s[i.id] ?? i.suggested_deadline ?? "" }))}><CalendarClock className="h-3.5 w-3.5" />Change Date</Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => resolve(i, "dismissed")}><X className="h-3.5 w-3.5" />Dismiss</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {warns.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Project warnings</h4>
          {warns.map((i) => {
            const Icon = i.severity === "critical" ? ShieldAlert : AlertTriangle;
            return (
              <div key={i.id} className={cn("rounded-xl border p-2.5", i.severity === "critical" ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10")}>
                <div className={cn("flex items-start gap-1.5 text-xs font-medium", i.severity === "critical" ? "text-destructive" : "text-warning")}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{i.title}</span></div>
                <p className="mt-1 text-xs leading-relaxed">{i.explanation}</p>
                {i.proposal?.missing_requirement && <p className="mt-1 text-[11px]"><span className="font-semibold">Missing:</span> {i.proposal.missing_requirement}</p>}
                {i.proposal?.recommendation && <p className="mt-0.5 text-[11px]"><span className="font-semibold">Recommended:</span> {i.proposal.recommendation}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {i.deleted_id && <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => startRestore(i)}><RotateCcw className="h-3.5 w-3.5" />Restore Task</Button>}
                  {i.proposal?.replacement?.title && <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => startAlternative(i)}><Plus className="h-3.5 w-3.5" />Create Alternative</Button>}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => resolve(i, "dismissed")}>Dismiss</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!draft} onOpenChange={(v) => { if (!v && !busy) setDraft(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.mode === "restore" ? "Restore task" : "Create alternative task"}</DialogTitle>
                <DialogDescription>{draft.mode === "restore" ? draft.note : `Suggested to replace “${draft.insight.task_title}”. Review and edit before creating it.`}</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (draft.mode === "restore") void doRestore(draft.insight, draft.deadline || null); else if (draft.title.trim()) void createAlternative(draft); }}>
                {draft.mode === "alternative" && (
                  <>
                    <div className="space-y-1.5"><Label htmlFor="alt-title">Task</Label><Input id="alt-title" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label htmlFor="alt-desc">Description</Label><Textarea id="alt-desc" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as Task["priority"] })}>
                        <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                        <SelectContent>{["high", "medium", "low"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="draft-date">Deadline</Label>
                  <Input id="draft-date" type="date" min={todayStr()} max={maxDate} value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button>
                  <Button type="submit" disabled={busy || (draft.mode === "alternative" && !draft.title.trim())}>{busy ? "Saving…" : draft.mode === "restore" ? "Restore task" : "Create task"}</Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
