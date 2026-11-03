import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Goal, Participant, Task } from "@/lib/goals";
import { balanceAssignments, reconcileAssignments } from "@/lib/assignments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EditGoalDialog({ goal, tasks, loading }: { goal: Goal; tasks: Task[]; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [deadline, setDeadline] = useState(goal.deadline ?? "");
  const [participants, setParticipants] = useState<Participant[]>(goal.participants);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const qc = useQueryClient();
  const names = participants.map((p) => p.name.trim());
  const valid = !!title.trim() && !!deadline && participants.length > 0 && names.every(Boolean) && new Set(names.map((n) => n.toLowerCase())).size === names.length;
  const save = useMutation({
    mutationFn: async () => {
      const team = participants.map((p) => ({ name: p.name.trim(), role: p.role.trim() }));
      const allowed = new Set(team.map((p) => p.name));
      const clean = Object.fromEntries(tasks.map((t) => [t.id, assignments[t.id] && allowed.has(assignments[t.id] as string) ? assignments[t.id] : null]));
      const { error } = await supabase.rpc("edit_goal_team", { p_goal_id: goal.id, p_title: title, p_description: description, p_deadline: deadline, p_participants: team, p_assignments: clean });
      if (error) throw error;
    },
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["goals"] }), qc.invalidateQueries({ queryKey: ["tasks", goal.id] })]); setOpen(false); toast.success("Project updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save project. Reopen the editor and try again."),
  });
  function editParticipant(index: number, patch: Partial<Participant>) {
    const participant = participants[index];
    if (!participant) return;
    const old = participant.name;
    const next = participants.map((p, i) => i === index ? { ...p, ...patch } : p);
    if (patch.name !== undefined) setAssignments((prev) => Object.fromEntries(Object.entries(prev).map(([id, name]) => [id, name === old ? patch.name || null : name])));
    setParticipants(next);
  }
  function removeParticipant(index: number) {
    const participant = participants[index];
    if (!participant) return;
    const name = participant.name;
    setParticipants(participants.filter((_, i) => i !== index));
    setAssignments((prev) => Object.fromEntries(Object.entries(prev).map(([id, assignee]) => [id, assignee === name ? null : assignee])));
  }
  return <>
    <Button variant="outline" disabled={loading} onClick={() => { setTitle(goal.title); setDescription(goal.description); setDeadline(goal.deadline ?? ""); setParticipants(goal.participants.map((p) => ({ ...p }))); setAssignments(reconcileAssignments(tasks, goal.participants)); setOpen(true); }}><Pencil className="h-4 w-4" />Edit project</Button>
    <Dialog open={open} onOpenChange={(v) => { if (!save.isPending) setOpen(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit project</DialogTitle><DialogDescription>{goal.title}</DialogDescription></DialogHeader>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="edit-goal-title">Goal</Label><Input id="edit-goal-title" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-goal-description">Description</Label><Textarea id="edit-goal-description" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-goal-date">Deadline</Label><Input id="edit-goal-date" required type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Participants</h3><Button type="button" size="sm" variant="outline" onClick={() => setParticipants([...participants, { name: "", role: "" }])}><Plus className="h-4 w-4" />Add participant</Button></div>
            {participants.map((p, i) => <div key={i} className="flex items-start gap-2"><div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2"><Input required aria-label={`Participant ${i + 1} name`} placeholder="Name" value={p.name} onChange={(e) => editParticipant(i, { name: e.target.value })} /><Input aria-label={`Participant ${i + 1} role`} placeholder="Role" value={p.role} onChange={(e) => editParticipant(i, { role: e.target.value })} /></div><Button type="button" size="icon" variant="ghost" disabled={participants.length === 1} aria-label={`Remove participant ${i + 1}`} title="Remove participant" className="text-destructive" onClick={() => removeParticipant(i)}><Trash2 className="h-4 w-4" /></Button></div>)}
            {!valid && <p className="text-sm text-destructive">Enter a goal and a unique name for each participant.</p>}
          </section>
          <section className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Task assignments</h3><Button type="button" variant="outline" size="sm" disabled={!valid} onClick={() => setAssignments(balanceAssignments(tasks, participants, assignments))}><Shuffle className="h-4 w-4" />Balance open tasks</Button></div>
            {tasks.map((t) => <div key={t.id} className="grid items-center gap-2 sm:grid-cols-[1fr_180px]"><div className="min-w-0"><p className="break-words text-sm">{t.title}</p><p className="text-xs text-muted-foreground">{t.status === "done" ? "Done" : t.priority + " priority"}</p></div><Select value={assignments[t.id] || "__none"} onValueChange={(v) => setAssignments({ ...assignments, [t.id]: v === "__none" ? null : v })}><SelectTrigger aria-label={`Assign ${t.title}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Unassigned</SelectItem>{participants.filter((p, i, arr) => p.name && arr.findIndex((x) => x.name === p.name) === i).map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}</SelectContent></Select></div>)}
            {!tasks.length && <p className="text-sm text-muted-foreground">No tasks.</p>}
          </section>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={save.isPending || !valid}>{save.isPending ? "Saving…" : "Save project"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}