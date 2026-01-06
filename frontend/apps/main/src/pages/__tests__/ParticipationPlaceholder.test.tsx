import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ParticipationPlaceholder } from "../ParticipationPlaceholder";
import { describe, expect, it } from "vitest";

describe("ParticipationPlaceholder", () => {
  it("renders countdown placeholder", () => {
    render(
      <MemoryRouter>
        <ParticipationPlaceholder />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Прохождение олимпиады скоро" })).toBeInTheDocument();
    expect(screen.getByText("До начала")).toBeInTheDocument();
  });
});
