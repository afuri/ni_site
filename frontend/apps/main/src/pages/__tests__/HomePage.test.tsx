import React from "react";
import { render, screen } from "@testing-library/react";
import { HomePage } from "../HomePage";
import { describe, expect, it, vi } from "vitest";

vi.mock("../assets/main_picture.jpg", () => ({
  default: "hero-image"
}));

describe("HomePage", () => {
  it("renders hero content and CTA", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Олимпиада «Невский интеграл»" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять участие" })).toBeInTheDocument();
    expect(screen.getByText("Для учеников")).toBeInTheDocument();
  });

  it("sets hero background image", () => {
    render(<HomePage />);

    const hero = screen.getByTestId("home-hero");
    expect(hero.style.backgroundImage).toContain("main_picture.jpg");
  });
});
