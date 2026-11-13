import { describe, it, expect } from "vitest";
import { countProjectUnread, totalProjectUnread, type ProjectMessage } from "@/lib/project-chat";

const messages = [
  { id: 1, sender_id: "teammate" },
  { id: 2, sender_id: "me" },
  { id: 3, sender_id: "teammate" },
  { id: 4, sender_id: "another-member" },
].map((m) => ({ ...m, goal_id: "project", body: "Update", created_at: "2026-11-13T08:00:00Z" } as ProjectMessage));
describe("project unread messages", () => {
  it("adds unread messages across all dashboard projects, including unopened projects", () => {
    expect(totalProjectUnread([2, 3, 1])).toBe(6);
  });
  it("decreases the sidebar total when a project is read without clearing other projects", () => {
    expect(totalProjectUnread([2, 0, 1])).toBe(3);
  });
  it("has no badge count for read projects or projects still loading", () => {
    expect(totalProjectUnread([0, undefined, 0])).toBe(0);
  });
  it("counts messages from every other project member, not your own", () => {
    expect(countProjectUnread(messages, "me", 0)).toBe(3);
  });
  it("excludes messages already read including the read cursor", () => {
    expect(countProjectUnread(messages, "me", 3)).toBe(1);
  });
  it("clears unread count after the latest message is read", () => {
    expect(countProjectUnread(messages, "me", 4)).toBe(0);
  });
});