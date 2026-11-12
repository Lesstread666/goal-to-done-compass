import type { Task } from "./goals";
import { replanTasks, type TaskPatch } from "./replan";

export type ReplanUndo = {
  completedAt: string | null;
  changes: { before: TaskPatch; after: TaskPatch }[];
};

export function sameCompletion(a: string | null, b: string | null): boolean {
  return a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));
}

export function captureReplanUndo(tasks: Task[], patches: TaskPatch[], completedAt: string | null): ReplanUndo {
  return {
    completedAt,
    changes: patches.flatMap((after) => {
      const task = tasks.find((item) => item.id === after.id);
      return task ? [{ before: { id: task.id, deadline: task.deadline, priority: task.priority }, after }] : [];
    }),
  };
}

/** Undo only unchanged automatic fields, preserving subsequent manual/team edits. */
export function reopenTaskPatches(tasks: Task[], undo: ReplanUndo | null, goalDeadline: string | null, today: string, names: string[]): TaskPatch[] {
  // Older completions or another browser have no snapshot: reassess urgency without pulling dates forward.
  const reassessed = replanTasks(tasks, goalDeadline, today, names, false);
  if (!undo) return reassessed;
  return undo.changes.flatMap(({ before, after }) => {
    const task = tasks.find((item) => item.id === before.id);
    if (!task || task.status === "done") return [];
    const deadline = task.deadline === after.deadline ? before.deadline : task.deadline;
    const priority = task.priority === after.priority ? before.priority : task.priority;
    return deadline !== task.deadline || priority !== task.priority ? [{ id: task.id, deadline, priority }] : [];
  });
}