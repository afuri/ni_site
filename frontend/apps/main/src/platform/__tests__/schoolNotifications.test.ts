import { describe, expect, it } from "vitest";
import { getSchoolNotifications } from "../schoolNotifications";

describe("getSchoolNotifications", () => {
  it("does not create notifications for a selected school or preschooler", () => {
    expect(getSchoolNotifications("selected")).toEqual([]);
    expect(getSchoolNotifications("not_required")).toEqual([]);
  });

  it.each([
    ["missing", "Укажите школу"],
    ["submission_pending", "Заявка на школу рассматривается"],
    ["submission_rejected", "Заявку на школу нужно исправить"]
  ] as const)("creates a notification for %s without a made-up timestamp", (status, title) => {
    expect(getSchoolNotifications(status)).toEqual([
      expect.objectContaining({ id: `school-${status}`, title })
    ]);
    expect(getSchoolNotifications(status)[0]).not.toHaveProperty("createdAt");
  });
});
