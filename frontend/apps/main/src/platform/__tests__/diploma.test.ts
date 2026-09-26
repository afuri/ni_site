import { describe, expect, it, vi } from "vitest";
import { downloadAttemptDiploma } from "../diploma";

const makeWindow = () => ({
  close: vi.fn(),
  closed: false,
  location: { href: "" },
  opener: {} as unknown
});

describe("downloadAttemptDiploma", () => {
  it("shows a clear message when the diploma is not generated", async () => {
    const popup = makeWindow();
    const result = await downloadAttemptDiploma({
      apiBaseUrl: "/api/v1",
      attemptId: 4,
      accessToken: "token",
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
      openWindow: () => popup as unknown as Window
    });
    expect(result).toEqual({ ok: false, message: "Диплом ещё не сформирован. Попробуйте позже." });
    expect(popup.close).toHaveBeenCalled();
  });

  it("explains the school restriction returned as 403", async () => {
    const popup = makeWindow();
    const result = await downloadAttemptDiploma({
      apiBaseUrl: "/api/v1",
      attemptId: 4,
      accessToken: "token",
      fetcher: vi.fn().mockResolvedValue(new Response(
        JSON.stringify({ error: { code: "diploma_school_pending" } }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )),
      openWindow: () => popup as unknown as Window
    });
    expect(result).toEqual({
      ok: false,
      message: "Диплом станет доступен после подтверждения школы администратором."
    });
  });
});
