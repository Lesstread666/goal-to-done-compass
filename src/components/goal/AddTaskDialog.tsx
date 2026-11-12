import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Participant, Task } from "@/lib/goals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const emptyDraft = { title: "", description: "", deadline: "", priority: "medium" as Task["priority"], assignee: null as string | null };

export function AddTaskDialog({ goalId, tasks, participants }: { goalId: string; tasks: Task[]; participants?: Participant[] | null | undefined }) {
  const team = participants ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async () => {
      const position = tasks.reduce((max, t) => Math.max(max, t.position), -1) + 1;
      const { error } = await supabase
        .from("tasks")
        .insert({ goal_id: goalId, title: draft.title.trim(), description: draft.description, deadline: draft.deadline || null, priority: draft.priority, assignee: draft.assignee, status: "todo", position })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks", goalId] });
      setDraft(emptyDraft);
      setOpen(false);
      toast.success("Task added");
    },
    onError: () => toast.error("Could not add task. Please try again."),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Task
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!add.isPending) setOpen(v); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a task</DialogTitle>
            <DialogDescription>Add a new task to this project. It starts in To do.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (draft.title.trim()) add.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="new-task-title">Task</Label>
              <Input id="new-task-title" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What needs to be done?" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-task-description">Description</Label>
              <Textarea id="new-task-description" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-task-date">Deadline</Label>
              <Input id="new-task-date" type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as Task["priority"] })}>
                  <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                  <SelectContent>{["high", "medium", "low"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={draft.assignee ?? "__none"} onValueChange={(v) => setDraft({ ...draft, assignee: v === "__none" ? null : v })}>
                  <SelectTrigger aria-label="Assignee"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {team.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" disabled={add.isPending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={add.isPending || !draft.title.trim()} type="submit">{add.isPending ? "Adding…" : "Add task"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
