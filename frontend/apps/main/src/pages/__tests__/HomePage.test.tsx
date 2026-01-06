import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../HomePage";
import { describe, expect, it, vi } from "vitest";

vi.mock("../assets/main_banner_3.png", () => ({
  default: "hero-banner"
}));
vi.mock("../assets/logo2.png", () => ({
  default: "logo-image"
}));

describe("HomePage", () => {
  it("renders hero content and CTA", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /Олимпиада/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять участие" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Об олимпиаде" })).toBeInTheDocument();
  });

  it("sets hero background image", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const hero = screen.getByTestId("home-hero");
    expect(hero.style.backgroundImage).toContain("main_banner_3.png");
  });

  it("toggles cat quote popover on click", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    expect(screen.queryByText(/Математика/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Кот" }));
    expect(screen.getByText(/Математика/)).toBeInTheDocument();

    await user.click(screen.getByTestId("cat-overlay"));
    expect(screen.queryByText(/Математика/)).toBeNull();
  });
});
