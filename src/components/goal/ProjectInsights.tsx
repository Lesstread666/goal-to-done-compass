import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { todayStr, type Goal, type Task } from "@/lib/goals";
import { projectFingerprint } from "@/lib/monitor";
import { monitorProjectFn } from "@/lib/monitor.functions";
import { cn } from "@/lib/utils";

const feasibility = {
  on_track: { label: "On track", cls: "text-success border-success/40 bg-success/10" },
  at_risk: { label: "At risk", cls: "text-warning border-warning/40 bg-warning/10" },
  critical: { label: "Critical", cls: "text-destructive border-destructive/40 bg-destructive/10" },
} as const;

type Insight = { id: string; kind: string; task_id: string | null; from_priority: string | null; to_priority: string | null; severity: string; title: string; explanation: string; task_title: string };

export function ProjectInsights({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const qc = useQueryClient();
  const monitor = useServerFn(monitorProjectFn);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const key = ["project-insights", goal.id];
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

  const a = data?.assessment;
  const status = a ? feasibility[a.status as keyof typeof feasibility] ?? feasibility.on_track : null;
  const prio = data?.insights.filter((i) => i.kind === "priority") ?? [];
  const warns = data?.insights.filter((i) => i.kind !== "priority") ?? [];

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

      {warns.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Project warnings</h4>
          {warns.map((i) => {
            const Icon = i.severity === "critical" ? ShieldAlert : AlertTriangle;
            return (
              <div key={i.id} className={cn("rounded-xl border p-2.5", i.severity === "critical" ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10")}>
                <div className={cn("flex items-start gap-1.5 text-xs font-medium", i.severity === "critical" ? "text-destructive" : "text-warning")}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{i.title}</span></div>
                <p className="mt-1 text-xs leading-relaxed">{i.explanation}</p>
                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => resolve(i, "dismissed")}>Dismiss</Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
