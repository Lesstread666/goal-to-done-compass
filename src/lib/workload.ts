import type { Task } from "./goals";

const DAY = 86_400_000;

export type TeammateLoad = {
  name: string;
  openCount: number;
  daysPerTask: number | null;
  overloaded: boolean;
};

/** Project-local task counts; no effort estimates or availability are stored. */
export function getTeamWorkload(tasks: Task[], names: string[], goalDeadline: string | null, today: string) {
  const open = tasks.filter((task) => task.status !== "done");
  const roster = [...new Set([...names, ...open.flatMap((task) => task.assignee ? [task.assignee] : [])])];
  const assigned = open.filter((task) => task.assignee).length;
  const fairShare = roster.length ? assigned / roster.length : 0;
  const runway = goalDeadline
    ? Math.max(0, (Date.parse(`${goalDeadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)
    : null;

  return roster.map((name): TeammateLoad => {
    const openCount = open.filter((task) => task.assignee === name).length;
    const daysPerTask = runway !== null && openCount > 0 ? runway / openCount : null;
    return {
      name,
      openCount,
      daysPerTask,
      overloaded: openCount > 0 && (
        (openCount >= 3 && openCount > fairShare * 1.5) ||
        (daysPerTask !== null && daysPerTask < 3)
      ),
    };
  });
}