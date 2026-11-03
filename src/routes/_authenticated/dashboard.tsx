import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Footprints, LayoutGrid, LogOut, Search, Target, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { goalsQuery, tasksQuery, isDelayed, initials, type Task, type Goal } from "@/lib/goals";
import { CreateGoalDialog } from "@/components/goal/CreateGoalDialog";
import { TaskCard } from "@/components/goal/TaskCard";
import { InsightsPanel } from "@/components/goal/InsightsPanel";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ goal: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Dashboard — Ticklist" },
      { name: "description", content: "Your goal projects, tasks and team progress." },
      { property: "og:title", content: "Dashboard — Ticklist" },
      { property: "og:description", content: "Your goal projects, tasks and team progress." },
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

  return (
    <div className="flex min-h-screen">
      <nav className="hidden w-20 flex-col items-center gap-2 border-r bg-sidebar py-6 md:flex">
        <div className="mb-6 text-primary">
          <Footprints className="h-7 w-7" />
        </div>
        <NavIcon icon={LayoutGrid} label="Dashboard" active />
        <div className="mt-auto">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex flex-col items-center gap-1 text-xs text-sidebar-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        </div>
      </nav>

      <aside className="hidden w-60 shrink-0 border-r bg-panel p-4 lg:block">
        <h2 className="mb-3 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Goal projects</h2>
        <div className="space-y-1">
          {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => select(g.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm",
                g.id === goal?.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <Target className="h-4 w-4 shrink-0" />
              <span className="truncate">{g.title}</span>
            </button>
          ))}
          {!goals.length && <p className="px-2 text-sm text-muted-foreground">No goals yet.</p>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {goal ? (
          <GoalView goal={goal} goals={goals} onSelect={select} />
        ) : (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
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

function NavIcon({ icon: Icon, label, active }: { icon: typeof Users; label: string; active?: boolean }) {
  return (
    <div className={cn("flex w-full flex-col items-center gap-1 border-l-2 py-3 text-xs", active ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground" : "border-transparent text-sidebar-foreground")}>
      <Icon className="h-5 w-5" />
      {label}
    </div>
  );
}

function GoalView({ goal, goals, onSelect }: { goal: Goal; goals: Goal[]; onSelect: (id: string) => void }) {
  const { data: tasks = [], isLoading } = useQuery(tasksQuery(goal.id));
  const [q, setQ] = useState("");
  const [view, setView] = useState<"board" | "team">("board");
  const filtered = tasks.filter((t) => (t.title + t.description + (t.assignee ?? "")).toLowerCase().includes(q.toLowerCase()));
  const delayedCount = tasks.filter((t) => isDelayed(t)).length;

  return (
    <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">Goal projects › <span className="text-foreground">{goal.title}</span></div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{goal.title}</h1>
            {goal.deadline && <p className="mt-1 text-sm text-muted-foreground">Deadline {new Date(goal.deadline).toLocaleDateString()}</p>}
          </div>
          <CreateGoalDialog onCreated={onSelect} />
        </div>

        <select
          aria-label="Choose goal"
          className="mt-4 w-full rounded-lg border bg-card p-2 text-sm lg:hidden"
          value={goal.id}
          onChange={(e) => onSelect(e.target.value)}
        >
          {goals.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>

        {delayedCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {delayedCount} task{delayedCount > 1 ? "s are" : " is"} past the deadline.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tasks" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "board" | "team")}>
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="team">By teammate</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <p className="mt-8 text-muted-foreground">Loading tasks…</p>
        ) : view === "board" ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {columns.map((c) => {
              const list = filtered.filter((t) => t.status === c.key);
              return (
                <div key={c.key} className="rounded-2xl border bg-panel/60 p-3">
                  <h3 className="mb-3 px-1 text-sm font-semibold tracking-wide uppercase">
                    {c.label} <span className="text-muted-foreground">({list.length})</span>
                  </h3>
                  <div className="space-y-3">
                    {list.map((t) => <TaskCard key={t.id} task={t} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {goal.participants.map((p) => {
              const mine = filtered.filter((t) => t.assignee === p.name);
              return (
                <div key={p.name} className="rounded-2xl border bg-panel/60 p-3">
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{initials(p.name)}</span>
                    <div>
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.role}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {mine.map((t) => <TaskCard key={t.id} task={t} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <InsightsPanel goal={goal} tasks={tasks} />
    </div>
  );
}
