import { AlertTriangle, CheckCircle2, Target, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoalStatus } from "@/lib/goal-status";

export const statusStyle: Record<GoalStatus, { label: string; text: string; bar: string; Icon: typeof Target }> = {
  completed: { label: "Completed", text: "text-success", bar: "bg-success", Icon: CheckCircle2 },
  failed: { label: "Failed", text: "text-destructive", bar: "bg-destructive", Icon: XCircle },
  at_risk: { label: "At risk", text: "text-warning", bar: "bg-warning", Icon: AlertTriangle },
  on_track: { label: "On track", text: "text-primary", bar: "bg-primary", Icon: Target },
};

export function GoalStatusIcon({ status, className }: { status: GoalStatus; className?: string }) {
  const { Icon, text, label } = statusStyle[status];
  return <Icon aria-label={label} className={cn("h-4 w-4 shrink-0", text, className)} />;
}

export function GoalStatusBadge({ status, title, detail }: { status: GoalStatus; title?: string; detail?: string | undefined }) {
  const s = statusStyle[status];
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border border-current/40 px-2 py-0.5 text-xs font-semibold", s.text)}>
      <s.Icon className="h-3.5 w-3.5" /> {s.label}
      {detail && <> · {detail}</>}
    </span>
  );
}
