/** Turns the AI's raw plan into a realistic schedule spanning the whole project timeline. */
export type RawTask = {
  title: string; description: string; priority: string; assignee: string;
  phase: string; estimated_days: number; depends_on: number[];
};
export type ScheduledTask = {
  title: string; description: string; priority: "high" | "medium" | "low";
  assignee: string; deadline: string; position: number;
};

const DAY = 86_400_000;
const toDay = (s: string) => Date.parse(s + "T00:00:00Z");
const toStr = (n: number) => new Date(n).toISOString().slice(0, 10);
const W: Record<string, number> = { high: 2, medium: 1, low: 0 };

export function schedulePlan(
  raw: RawTask[],
  opts: { today: string; deadline: string; participants: string[] },
): { tasks: ScheduledTask[]; warning: string | null } {
  const { today, deadline, participants } = opts;
  const n = raw.length;
  if (!n) return { tasks: [], warning: "The AI returned no tasks." };
  const span = Math.max(1, Math.round((toDay(deadline) - toDay(today)) / DAY));
  const est = raw.map((t) => Math.max(0.5, Math.min(60, Number(t.estimated_days) || 1)));
  // Only earlier tasks can be dependencies (keeps order logical, no cycles).
  const deps = raw.map((t, i) => [...new Set((t.depends_on ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d < i))]);

  // Balance workload: valid assignee, and move work off anyone well above average.
  const load = new Map(participants.map((p) => [p, 0]));
  const avg = est.reduce((a, b) => a + b, 0) / participants.length;
  const assignee = raw.map((t, i) => {
    let a = participants.includes(t.assignee) ? t.assignee : "";
    if (!a || (participants.length > 1 && load.get(a)! + est[i]! > avg * 1.25)) {
      a = [...load.entries()].sort((x, y) => x[1] - y[1])[0]![0];
    }
    load.set(a, load.get(a)! + est[i]!);
    return a;
  });

  // Earliest schedule: wait for dependencies and for the assignee to be free.
  const finish: number[] = [];
  const free = new Map(participants.map((p) => [p, 0]));
  for (let i = 0; i < n; i++) {
    const start = Math.max(free.get(assignee[i]!)!, ...deps[i]!.map((d) => finish[d]!), 0);
    finish[i]! = start + est[i]!;
    free.set(assignee[i]!, finish[i]!);
  }
  const length = Math.max(...finish);
  // Leave ~10% buffer before the deadline; stretch short plans across the timeline, squeeze long ones.
  const usable = Math.max(1, span * 0.9);
  const scale = usable / length;
  const warning = length > span
    ? `This plan needs about ${Math.ceil(length)} working days but only ${span} are available. Consider a later deadline, more participants or a smaller scope.`
    : null;

  // Slack = how late a task could finish without delaying anything after it.
  const latest = finish.map(() => length);
  for (let i = n - 1; i >= 0; i--) for (const d of deps[i]!) latest[d]! = Math.min(latest[d]!, latest[i]! - est[i]!);

  const due = finish.map((f) => Math.min(span, Math.max(1, Math.round(f * scale))));
  const score = raw.map((t, i) => {
    const critical = latest[i]! - finish[i]! < 0.5 ? 1 : 0;
    const soon = due[i]! <= Math.max(3, span * 0.25) ? 1 : 0;
    const blocks = deps.some((d) => d.includes(i)) ? 0.5 : 0;
    return (W[t.priority] ?? 1) + critical + soon + blocks;
  });
  // Reserve High for genuinely critical work: at most ~a third of tasks.
  const maxHigh = Math.max(1, Math.ceil(n / 3));
  const highSet = new Set(score.map((s, i): [number, number] => [s, i]).filter(([s]) => s >= 3).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, maxHigh).map(([, i]) => i));

  const order = raw.map((_, i) => i).sort((a, b) => due[a]! - due[b]! || a - b);
  const tasks = order.map((i, pos) => {
    const after = deps[i]!.map((d) => `"${raw[d]!.title}"`).join(", ");
    const notes = [raw[i]!.phase && `Phase: ${raw[i]!.phase}`, `~${est[i]!} day${est[i]! === 1 ? "" : "s"}`, after && `After: ${after}`].filter(Boolean).join(" · ");
    return {
      title: raw[i]!.title,
      description: [raw[i]!.description, notes].filter(Boolean).join("\n\n"),
      priority: (highSet.has(i) ? "high" : score[i]! >= 2 ? "medium" : "low") as ScheduledTask["priority"],
      assignee: assignee[i]!,
      deadline: toStr(toDay(today) + due[i]! * DAY),
      position: pos,
    };
  });
  return { tasks, warning };
}
