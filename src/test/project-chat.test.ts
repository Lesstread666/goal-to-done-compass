import { describe, it, expect } from "vitest";
import { countProjectUnread, type ProjectMessage } from "@/lib/project-chat";

const messages = [
  { id: 1, sender_id: "teammate" },
  { id: 2, sender_id: "me" },
  { id: 3, sender_id: "teammate" },
  { id: 4, sender_id: "another-member" },
].map((m) => ({ ...m, goal_id: "project", body: "Update", created_at: "2026-11-13T08:00:00Z" } as ProjectMessage));
describe("project unread messages", () => {
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