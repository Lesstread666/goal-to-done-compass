import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername } from "@/lib/social";

describe("usernames", () => {
  it("accepts 3–20 lowercase letters, numbers and underscores", () => {
    expect(isValidUsername("ana_92")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(21))).toBe(false);
    expect(isValidUsername("ana-92")).toBe(false);
  });
  it("normalizes case and a leading @", () => {
    expect(normalizeUsername(" @Ana_92 ")).toBe("ana_92");
  });
});
