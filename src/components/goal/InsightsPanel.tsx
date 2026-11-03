import { Area, ComposedChart, CartesianGrid, Line, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { initials, isDelayed, type Goal, type Task } from "@/lib/goals";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/social/UserAvatar";

function lastDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function InsightsPanel({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const names = goal.participants.map((p) => p.name);
  const { data: profiles } = useQuery({
    queryKey: ["participant-profiles", goal.id, names.join(",")],
    enabled: names.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, username, avatar_url").in("username", names);
      return data ?? [];
    },
  });
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const delayed = tasks.filter((t) => isDelayed(t)).length;

  const days = lastDays(7);
  const activity = days.map((d) => ({
    day: new Date(d).toLocaleDateString(undefined, { weekday: "short" }),
    completed: tasks.filter((t) => t.completed_at?.slice(0, 10) === d).length,
    delayed: tasks.filter((t) => t.deadline && t.deadline <= d && (!t.completed_at || t.completed_at.slice(0, 10) > d)).length,
  }));

  return (
    <aside className="space-y-5">
      <section>
        <h3 className="mb-3 text-base font-semibold">Team</h3>
        <div className="grid grid-cols-4 gap-3">
          {goal.participants.map((p) => {
            const mine = tasks.filter((t) => t.assignee === p.name);
            const late = mine.some((t) => isDelayed(t));
            const prof = profiles?.find((x) => x.username === p.name);
            return (
              <div key={p.name} className="text-center" title={`${p.name} — ${p.role}`}>
                <div className="relative mx-auto h-11 w-11">
                  {prof ? (
                    <UserAvatar username={prof.username} url={prof.avatar_url} className="h-11 w-11" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{initials(p.name)}</div>
                  )}
                  <span className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-background ${late ? "bg-destructive" : "bg-success"}`} />
                </div>
                <div className="mt-1 truncate text-xs">{p.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{p.role}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Progress: {pct}%</h3>
        <p className="text-xs text-muted-foreground">
          {done} of {tasks.length} tasks done{delayed ? ` · ${delayed} delayed` : ""}
        </p>
        <div className="relative mx-auto h-40 w-40">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={[{ v: done || 0.0001 }, { v: tasks.length - done || (done ? 0 : 1) }]} dataKey="v" innerRadius={52} outerRadius={70} startAngle={90} endAngle={-270} stroke="none">
                <Cell fill="var(--chart-1)" />
                <Cell fill="var(--chart-2)" fillOpacity={0.35} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-bold">{pct}%</span>
            <span className="text-[11px] text-muted-foreground">Complete</span>
          </div>
        </div>
        <div className="mt-2 space-y-2.5">
          {goal.participants.map((p) => {
            const mine = tasks.filter((t) => t.assignee === p.name);
            const d = mine.filter((t) => t.status === "done").length;
            const v = mine.length ? Math.round((d / mine.length) * 100) : 0;
            return (
              <div key={p.name}>
                <div className="flex justify-between text-xs">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">
                    {d}/{mine.length} · {v}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Productivity overview</h3>
        <p className="text-xs text-muted-foreground">Tasks completed vs. overdue, last 7 days</p>
        <div className="mt-3 h-40">
          <ResponsiveContainer>
            <ComposedChart data={activity} margin={{ left: -24, right: 4, top: 4 }}>
              <defs>
                <linearGradient id="fillDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="completed" name="Completed" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fillDone)" />
              <Line type="monotone" dataKey="delayed" name="Overdue" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-1" />Completed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-3" />Overdue</span>
        </div>
      </section>
    </aside>
  );
}
