import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import { EditTaskDialog } from "@/components/goal/EditTaskDialog";
import type { Task } from "@/lib/goals";

afterEach(cleanup);
it.each([undefined, null])("does not crash when participant data is %s", (participants) => {
  const task = { id: "a", title: "Draft plan", description: "", status: "todo", priority: "high", assignee: null, deadline: null } as Task;
  expect(() => render(<QueryClientProvider client={new QueryClient()}><EditTaskDialog task={task} participants={participants} /></QueryClientProvider>)).not.toThrow();
});