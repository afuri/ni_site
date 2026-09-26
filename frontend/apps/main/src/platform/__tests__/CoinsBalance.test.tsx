import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoinsBalance } from "../CoinsBalance";

describe("CoinsBalance", () => {
  it("has no accessible UI when the feature is disabled", () => {
    render(<CoinsBalance enabled={false} balance={27} />);
    expect(screen.queryByRole("button", { name: /баланс/i })).not.toBeInTheDocument();
  });

  it("shows the passed zero balance and opens an empty local history", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CoinsBalance enabled balance={0} />);

    const trigger = screen.getByRole("button", { name: "Баланс: 0 монет. Открыть историю начислений" });
    expect(trigger).toHaveTextContent("0");
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "История начислений" })).toBeInTheDocument();
    expect(screen.getByText("Начислений пока нет.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
