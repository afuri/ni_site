import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextInput } from "@ui";
import { describe, expect, it, vi } from "vitest";

describe("TextInput", () => {
  it("renders label and helper text", () => {
    render(<TextInput label="Email" helperText="We'll never share" name="email" />);

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("We'll never share")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<TextInput label="Name" error="Required" name="name" />);

    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("calls onChange", async () => {
    const onChange = vi.fn();
    render(<TextInput label="City" name="city" onChange={onChange} />);

    await userEvent.setup().type(screen.getByRole("textbox", { name: "City" }), "SPB");
    expect(onChange).toHaveBeenCalled();
  });
});
