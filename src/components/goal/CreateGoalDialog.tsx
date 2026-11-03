import { useState } from "react";
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
  const qc = useQueryClient();
  const create = useServerFn(createGoalPlan);

  const m = useMutation({
    mutationFn: create,
    onSuccess: ({ goalId }) => {
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
    setNames((prev) => Array.from({ length: c }, (_, i) => prev[i] ?? `Teammate ${i + 1}`));
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
            m.mutate({ data: { title, description, deadline, participants: names.map((n) => n.trim() || "Teammate") } });
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
            <Label>Participant names</Label>
            <div className="grid grid-cols-2 gap-2">
              {names.map((n, i) => (
                <Input key={i} aria-label={`Participant ${i + 1}`} value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
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
