import { expect, it } from "vitest";
import { canManageProject } from "@/lib/project-permissions";

it("only the project creator can edit or delete a project", () => {
  const project = { user_id: "creator" };
  expect(canManageProject(project, "creator")).toBe(true);
  expect(canManageProject(project, "member")).toBe(false);
  expect(canManageProject(project, null)).toBe(false);
  expect(canManageProject(project, undefined)).toBe(false);
});