import { describe, expect, it } from "vitest";
import { resolvePlatformSection } from "../platformSection";

describe("resolvePlatformSection", () => {
  it("keeps the remaining platform sections", () => {
    expect(resolvePlatformSection("/platform")).toBe("home");
    expect(resolvePlatformSection("/platform/results")).toBe("results");
    expect(resolvePlatformSection("/platform/profile")).toBe("profile");
    expect(resolvePlatformSection("/platform/notifications")).toBe("notifications");
  });

  it("rejects the removed olympiads page and unknown nested routes", () => {
    expect(resolvePlatformSection("/platform/olympiads")).toBeNull();
    expect(resolvePlatformSection("/platform/results/unknown")).toBeNull();
  });
});
