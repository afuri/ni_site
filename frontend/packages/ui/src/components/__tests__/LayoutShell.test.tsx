import React from "react";
import { render, screen } from "@testing-library/react";
import { LayoutShell } from "@ui";
import { describe, expect, it } from "vitest";

describe("LayoutShell", () => {
  it("renders header sections and content", () => {
    render(
      <LayoutShell
        logo={<span>Logo</span>}
        nav={<a href="/">Home</a>}
        actions={<button type="button">Sign in</button>}
        footer={<span>Footer</span>}
      >
        <div>Content</div>
      </LayoutShell>
    );

    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });
});
