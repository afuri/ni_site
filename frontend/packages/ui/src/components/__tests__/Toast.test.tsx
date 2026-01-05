import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast } from "@ui";
import { describe, expect, it, vi } from "vitest";

describe("Toast", () => {
  it("renders title and description", () => {
    render(<Toast title="Saved" description="Changes applied" variant="success" />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Changes applied")).toBeInTheDocument();
  });

  it("fires onClose", async () => {
    const onClose = vi.fn();
    render(<Toast title="Alert" onClose={onClose} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss toast" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
