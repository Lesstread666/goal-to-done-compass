import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Participant, Task } from "@/lib/goals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export function EditTaskDialog({ task, participants }: { task: Task; participants?: Participant[] | null | undefined }) {
  const team = participants ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(task);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").update({ title: draft.title.trim(), description: draft.description, deadline: draft.deadline || null, priority: draft.priority, assignee: draft.assignee, status: draft.status, completed_at: draft.status === "done" ? task.completed_at ?? new Date().toISOString() : null }).eq("id", task.id).select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["tasks", task.goal_id] }); setOpen(false); toast.success("Task updated"); },
    onError: () => toast.error("Could not save task. Please try again."),
  });
  return <>
    <Button size="icon" variant="ghost" title="Edit task" aria-label="Edit task" className="ml-auto shrink-0" onClick={() => { setDraft(task); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={(v) => { if (!save.isPending) setOpen(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription>{task.title}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (draft.title.trim()) save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="task-title">Task</Label><Input id="task-title" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="task-description">Description</Label><Textarea id="task-description" rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="task-date">Deadline</Label><Input id="task-date" type="date" value={draft.deadline ?? ""} onChange={(e) => setDraft({ ...draft, deadline: e.target.value || null })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Priority</Label><Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as Task["priority"] })}><SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger><SelectContent>{["high", "medium", "low"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Status</Label><Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Task["status"] })}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To do</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="done">Done</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label>Assignee</Label><Select value={draft.assignee ?? "__none"} onValueChange={(v) => setDraft({ ...draft, assignee: v === "__none" ? null : v })}><SelectTrigger aria-label="Assignee"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Unassigned</SelectItem>{team.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={save.isPending || !draft.title.trim()} type="submit">{save.isPending ? "Saving…" : "Save task"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}