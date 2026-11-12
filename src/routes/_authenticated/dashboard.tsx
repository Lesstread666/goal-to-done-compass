import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { z } from "zod";
import { ListChecks, Search, Target, AlertTriangle, Layers, Trash2, CalendarDays, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/social/AppNav";
import { InvitesBanner } from "@/components/social/InvitesBanner";
import { InviteDialog } from "@/components/goal/InviteDialog";
import { supabase } from "@/integrations/supabase/client";
import { goalsQuery, tasksQuery, isDelayed, initials, todayStr, type Task, type Goal } from "@/lib/goals";
import { getTeamWorkload } from "@/lib/workload";
import { CreateGoalDialog } from "@/components/goal/CreateGoalDialog";
import { TaskCard } from "@/components/goal/TaskCard";
import { AddTaskDialog } from "@/components/goal/AddTaskDialog";
import { InsightsPanel } from "@/components/goal/InsightsPanel";
import { EditGoalDialog } from "@/components/goal/EditGoalDialog";
import { DeleteDialog } from "@/components/goal/DeleteDialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { autoReplan } from "@/lib/replan-apply";
import { getGoalStatus, type GoalStatusInfo } from "@/lib/goal-status";
import { GoalStatusBadge, GoalStatusIcon, statusStyle } from "@/components/goal/GoalStatusIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function useGoalStatuses(goals: Goal[], activeId?: string) {
  const { data: activeTasks } = useQuery({ ...tasksQuery(activeId ?? ""), enabled: !!activeId });
  const { data: rows = [] } = useQuery({
    queryKey: ["tasks", "all-status", goals.map((g) => g.id).join(",")],
    enabled: goals.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("goal_id, status, deadline").in("goal_id", goals.map((g) => g.id));
      if (error) throw error;
      return data as Pick<Task, "goal_id" | "status" | "deadline">[];
    },
  });
  const map: Partial<Record<string, GoalStatusInfo>> = {};
  for (const g of goals) map[g.id] = getGoalStatus(g.deadline, g.id === activeId && activeTasks ? activeTasks : rows.filter((r) => r.goal_id === g.id));
  return map;
}

const statusTitle = (i?: GoalStatusInfo) => (i ? `${statusStyle[i.status].label}: ${i.reason}` : undefined);

function GoalRowText({ title, info }: { title: string; info?: GoalStatusInfo | undefined }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{title}</span>
      {info && (
        <>
          <span className={cn("block truncate text-[11px]", info.status === "on_track" ? "text-muted-foreground" : statusStyle[info.status].text)}>
            {info.total ? `${info.done}/${info.total} done · ` : ""}{info.detail}
          </span>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full", statusStyle[info.status].bar)} style={{ width: `${info.pct}%` }} />
          </span>
        </>
      )}
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ goal: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Dashboard — Ticklist" },
      { name: "description", content: "Your goal projects, tasks and team progress." },
      { property: "og:title", content: "Dashboard — Ticklist" },
      { property: "og:description", content: "Your goal projects, tasks and team progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(goalsQuery()),
  component: Dashboard,
});

const columns: { key: Task["status"]; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

function Dashboard() {
  const { data: goals } = useSuspenseQuery(goalsQuery());
  const { goal: goalParam } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });
  const goal = goals.find((g) => g.id === goalParam) ?? goals[0];
  const select = (id: string) => navigate({ search: { goal: id } });
  const statuses = useGoalStatuses(goals, goal?.id);

  return (
    <div className="flex min-h-screen pb-20 md:pb-0">
      <AppNav />

      <aside className="hidden w-60 shrink-0 border-r bg-panel p-4 lg:block">
        <h2 className="mb-3 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Goal projects</h2>
        <div className="space-y-1">
          {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => select(g.id)}
              title={statusTitle(statuses[g.id])}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                g.id === goal?.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <GoalStatusIcon status={statuses[g.id]?.status ?? "on_track"} className="mt-0.5" />
              <GoalRowText title={g.title} info={statuses[g.id]} />
            </button>
          ))}
          {!goals.length && <p className="px-2 text-sm text-muted-foreground">No goals yet.</p>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {goal ? (
          <GoalView goal={goal} goals={goals} onSelect={select} statuses={statuses} />
        ) : (
          <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="w-full max-w-xl"><InvitesBanner onJoined={select} /></div>
            <Target className="h-12 w-12 text-primary" />
            <h1 className="text-2xl font-bold">What big goal are you working on?</h1>
            <p className="max-w-sm text-muted-foreground">Create a goal project and let AI break it into small, doable tasks for you and your team.</p>
            <CreateGoalDialog onCreated={select} />
          </div>
        )}
      </div>
    </div>
  );
}

function GoalView({ goal, goals, onSelect, statuses }: { goal: Goal; goals: Goal[]; onSelect: (id: string) => void; statuses: Partial<Record<string, GoalStatusInfo>> }) {
  const info = statuses[goal.id];
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery(tasksQuery(goal.id));
  const [q, setQ] = useState("");
  const [view, setView] = useState<"board" | "team">("board");
  const filtered = tasks.filter((t) => (t.title + t.description + (t.assignee ?? "")).toLowerCase().includes(q.toLowerCase()));
  const delayedCount = tasks.filter((t) => isDelayed(t)).length;
  const workload = getTeamWorkload(tasks, goal.participants.map((p) => p.name), goal.deadline, todayStr());

  return (
    <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between md:hidden">
          <span className="flex items-center gap-2 font-semibold text-primary"><ListChecks className="h-5 w-5" /> Ticklist</span>
        </div>
        <div className="mb-4"><InvitesBanner onJoined={onSelect} /></div>
        <div className="text-sm text-muted-foreground">Goal projects › <span className="text-foreground">{goal.title}</span></div>
        <div className="mt-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-2xl font-bold break-words md:text-3xl">{goal.title}</h1>
            {info && <GoalStatusBadge status={info.status} title={info.reason} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {goal.deadline && <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />Deadline {new Date(goal.deadline).toLocaleDateString()}</span>}
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{goal.participants.length} member{goal.participants.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border bg-panel/60 p-2 sm:flex sm:flex-wrap sm:items-center xl:flex-nowrap [&_button]:sm:h-9 [&_button]:sm:px-3">
          <InviteDialog goal={goal} className="w-full sm:w-auto" />
          <EditGoalDialog goal={goal} tasks={tasks} loading={isLoading} className="w-full sm:w-auto" />
          <AddTaskDialog goalId={goal.id} tasks={tasks} participants={goal.participants} goalDeadline={goal.deadline} className="col-span-2 w-full glow sm:w-auto" />
          <CreateGoalDialog onCreated={onSelect} icon={<Layers />} className="col-span-2 w-full border border-primary bg-transparent text-primary hover:bg-primary/10 sm:w-auto" />
          <div className="col-span-2 sm:ml-auto sm:flex sm:items-center sm:gap-2">
            <span className="hidden h-6 w-px bg-border xl:block" />
            <DeleteDialog label="Delete project" description={`Remove “${goal.title}” and all its tasks.`} trigger={(open) => (
              <Button variant="outline" onClick={open} aria-label="Delete project" title="Delete project" className="w-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"><Trash2 /><span className="xl:hidden 2xl:inline">Delete project</span></Button>
            )} onDelete={async () => {
              const { error } = await supabase.from("goals").delete().eq("id", goal.id).select("id").single();
              if (error) throw error;
              qc.removeQueries({ queryKey: ["tasks", goal.id] });
              await qc.invalidateQueries({ queryKey: ["goals"] });
              onSelect(goals.find((g) => g.id !== goal.id)?.id ?? "");
            }} />
          </div>
        </div>

        <div className="mt-4 lg:hidden">
          <Select value={goal.id} onValueChange={onSelect}>
            <SelectTrigger aria-label="Choose goal" className="h-auto w-full min-w-0 bg-card py-2 text-left whitespace-normal [&>span]:line-clamp-none [&>span]:min-w-0 [&>span]:flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
              {goals.map((g) => (
                <SelectItem key={g.id} value={g.id} className="min-w-0 [&>span]:min-w-0 [&>span]:flex-1">
                  <span className="flex min-w-0 items-start gap-2">
                    <GoalStatusIcon status={statuses[g.id]?.status ?? "on_track"} className="mt-0.5" />
                    <GoalRowText title={g.title} info={statuses[g.id]} />
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {delayedCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {delayedCount} task{delayedCount > 1 ? "s are" : " is"} past the deadline.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:min-w-48 sm:flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tasks" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "board" | "team")} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="team">By teammate</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <p className="mt-8 text-muted-foreground">Loading tasks…</p>
        ) : view === "board" ? (
          <Board goal={goal} tasks={filtered} />
        ) : (
          <div className="mt-5 space-y-4">
            {goal.participants.map((p) => {
              const mine = filtered.filter((t) => t.assignee === p.name);
              const load = workload.find((item) => item.name === p.name);
              return (
                <div key={p.name} className="rounded-2xl border bg-panel/60 p-3">
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{initials(p.name)}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {p.name}
                        <span className="text-xs font-normal text-muted-foreground">{load?.openCount ?? 0} open</span>
                        {load?.overloaded && <span title="Overloaded: uneven task load or less than 3 days per open task" className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" />Overloaded</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.role}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {mine.map((t) => <TaskCard key={t.id} task={t} participants={goal.participants} goalDeadline={goal.deadline} />)}
                  </div>
                </div>
              );
            })}
            {filtered.some((t) => !t.assignee || !goal.participants.some((p) => p.name === t.assignee)) && <section className="border-t pt-4"><h3 className="mb-3 text-sm font-semibold">Unassigned</h3><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.filter((t) => !t.assignee || !goal.participants.some((p) => p.name === t.assignee)).map((t) => <TaskCard key={t.id} task={t} participants={goal.participants} goalDeadline={goal.deadline} />)}</div></section>}
          </div>
        )}
      </div>
      <InsightsPanel goal={goal} tasks={tasks} />
    </div>
  );
}

function Board({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const qc = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  async function onDragEnd(e: DragEndEvent) {
    const status = e.over?.id as Task["status"] | undefined;
    const task = tasks.find((t) => t.id === e.active.id);
    if (!status || !task || task.status === status) return;
    const key = ["tasks", goal.id];
    const prev = qc.getQueryData<Task[]>(key);
    const patch = { status, completed_at: status === "done" ? new Date().toISOString() : null };
    qc.setQueryData<Task[]>(key, (old) => old?.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) {
      qc.setQueryData(key, prev);
      toast.error("Could not move task. Please try again.");
      return void qc.invalidateQueries({ queryKey: key });
    }
    await qc.invalidateQueries({ queryKey: key });
    await autoReplan(qc, goal.id, { taskId: task.id, previousStatus: task.status, status, completedAt: status === "done" ? patch.completed_at : task.completed_at });
  }
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setHidden((h) => ({ ...h, [id]: !h[id] }));
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {columns.map((c) => {
          const list = tasks.filter((t) => t.status === c.key);
          return (
            <Column key={c.key} id={c.key} label={c.label} count={list.length} collapsed={!!hidden[c.key]} onToggle={() => toggle(c.key)}>
              {list.map((t) => (
                <DraggableTask key={t.id} id={t.id}>
                  <TaskCard task={t} participants={goal.participants} goalDeadline={goal.deadline} />
                </DraggableTask>
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({ id, label, count, children, collapsed, onToggle }: { id: string; label: string; count: number; children: ReactNode; collapsed: boolean; onToggle: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("rounded-2xl border bg-panel/60 p-3 transition", isOver && "border-primary bg-primary/10")}>
      <h3 className="mb-3 px-1 text-sm font-semibold tracking-wide uppercase">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Show" : "Hide"} ${label} tasks`}
          className="flex w-full items-center justify-between gap-2 text-left md:pointer-events-none"
        >
          <span>
            {label} <span className="text-muted-foreground">({count})</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform md:hidden", collapsed && "-rotate-90")} />
        </button>
      </h3>
      <div className={cn("min-h-16 space-y-3", collapsed && "hidden md:block")}>{children}</div>
    </div>
  );
}

function DraggableTask({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("cursor-grab touch-manipulation active:cursor-grabbing", isDragging && "relative z-50 opacity-80 shadow-2xl")}
    >
      {children}
    </div>
  );
}
