import React from "react";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@ui";
import { describe, expect, it } from "vitest";

describe("EmptyState", () => {
  it("renders title, description, and action", () => {
    render(
      <EmptyState
        title="No items"
        description="Try adjusting filters"
        action={<button type="button">Reset</button>}
      />
    );

    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});
