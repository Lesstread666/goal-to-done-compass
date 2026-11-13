import { describe, it, expect } from "vitest";
import { groupPermissions, groupReactions } from "@/lib/group-chat";

describe("group chat permissions", () => {
  it("owner can add and remove members", () => {
    const p = groupPermissions({ owner_id: "owner" }, "owner");
    expect(p.canAddMembers).toBe(true);
    expect(p.canRemoveMembers).toBe(true);
  });
  it("members cannot add or remove members", () => {
    const p = groupPermissions({ owner_id: "owner" }, "member");
    expect(p.canAddMembers).toBe(false);
    expect(p.canRemoveMembers).toBe(false);
  });
  it("members can rename and leave", () => {
    const p = groupPermissions({ owner_id: "owner" }, "member");
    expect(p.canRename).toBe(true);
    expect(p.canLeave).toBe(true);
  });
});

describe("reactions", () => {
  it("counts per emoji and marks the viewer's own", () => {
    const r = [
      { message_id: 1, user_id: "a", emoji: "👍" },
      { message_id: 1, user_id: "me", emoji: "👍" },
      { message_id: 1, user_id: "a", emoji: "🎉" },
      { message_id: 2, user_id: "me", emoji: "👍" },
    ];
    expect(groupReactions(r, 1, "me")).toEqual([{ emoji: "👍", count: 2, mine: true }, { emoji: "🎉", count: 1, mine: false }]);
  });
});
