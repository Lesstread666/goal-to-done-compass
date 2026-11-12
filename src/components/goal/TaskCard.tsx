import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { EditTaskDialog } from "@/components/goal/EditTaskDialog";
import { DeleteDialog } from "@/components/goal/DeleteDialog";
import { supabase } from "@/integrations/supabase/client";
import { initials, isDelayed, maxTaskDeadline, type Task, type Participant } from "@/lib/goals";
import { cn } from "@/lib/utils";
import { autoReplan } from "@/lib/replan-apply";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const prio = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-accent text-accent-foreground",
};

export function TaskCard({ task, participants = [], goalDeadline }: { task: Task; participants?: Participant[] | null; goalDeadline?: string | null | undefined }) {
  const qc = useQueryClient();
  const maxDate = maxTaskDeadline(goalDeadline);
  const delayed = isDelayed(task);
  const update = useMutation({
    mutationFn: async (patch: Partial<Task>) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: async (_d, patch) => {
      await qc.invalidateQueries({ queryKey: ["tasks", task.goal_id] });
      if (patch.status) await autoReplan(qc, task.goal_id, { taskId: task.id, previousStatus: task.status, status: patch.status, completedAt: patch.status === "done" ? patch.completed_at ?? null : task.completed_at });
    },
    onError: () => toast.error("Could not update task. Please try again."),
  });

  return (
    <div className={cn("glass rounded-xl p-3.5 transition", delayed && "border-destructive/60 bg-destructive/10")}>
      <div className="flex items-start gap-2">
        {task.status === "done" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
        <h4 className={cn("min-w-0 flex-1 break-words text-sm font-semibold leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</h4>
      </div>
      <div className="flex justify-end gap-1">
        <EditTaskDialog task={task} participants={participants} goalDeadline={goalDeadline} />
        <DeleteDialog label="Delete task" description={`Remove “${task.title}” from this project.`} onDelete={async () => {
          const { error } = await supabase.from("tasks").delete().eq("id", task.id).select("id").single();
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: ["tasks", task.goal_id] });
        }} />
      </div>
      {task.description && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
      {delayed && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground">
          <AlertTriangle className="h-3 w-3" /> Delayed
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-full px-2.5 py-0.5 font-medium capitalize", prio[task.priority])}>{task.priority}</span>
        <label className={cn("inline-flex items-center gap-1 text-muted-foreground", delayed && "text-destructive")}>
          <CalendarDays className="h-3.5 w-3.5" />
          <input
            type="date"
            aria-label="Task deadline"
            className="w-[7.2rem] bg-transparent outline-none [color-scheme:dark]"
            max={maxDate}
            value={task.deadline ?? ""}
            onChange={(e) => {
              const value = e.target.value || null;
              if (value && maxDate && value > maxDate) {
                toast.error("Task deadline must be before the project deadline.");
                return;
              }
              update.mutate({ deadline: value });
            }}
          />
        </label>
        {task.assignee && (
          <span title={task.assignee} className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
            {initials(task.assignee)}
          </span>
        )}
      </div>
      <Select
        value={task.status}
        disabled={update.isPending}
        onValueChange={(v) =>
          update.mutate({ status: v as Task["status"], completed_at: v === "done" ? new Date().toISOString() : null })
        }
      >
        <SelectTrigger className="mt-3 h-8 text-xs" aria-label="Task status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todo">To do</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
