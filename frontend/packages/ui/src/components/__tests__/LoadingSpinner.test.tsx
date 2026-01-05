import React from "react";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "@ui";
import { describe, expect, it } from "vitest";

describe("LoadingSpinner", () => {
  it("renders label", () => {
    render(<LoadingSpinner label="Loading data" />);
    expect(screen.getByText("Loading data")).toBeInTheDocument();
  });
});
