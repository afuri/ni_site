import React from "react";
import { render, screen } from "@testing-library/react";
import { Card } from "@ui";
import { describe, expect, it } from "vitest";

describe("Card", () => {
  it("renders title, subtitle, body, and footer", () => {
    render(
      <Card title="Title" subtitle="Subtitle" footer={<span>Footer</span>}>
        <p>Body</p>
      </Card>
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Subtitle")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });
});
