import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@ui";
import { describe, expect, it, vi } from "vitest";

describe("Button", () => {
  it("renders label and handles click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    const button = screen.getByRole("button", { name: "Click me" });
    await userEvent.setup().click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows loading state and disables interaction", async () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Loading
      </Button>
    );

    const button = screen.getByRole("button", { name: "Loading" });
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
