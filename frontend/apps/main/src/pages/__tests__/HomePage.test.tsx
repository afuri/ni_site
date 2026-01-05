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
    expect(screen.getByText("Стартуйте, развивайтесь, подтверждайте результат")).toBeInTheDocument();
  });

  it("sets hero background image", () => {
    render(<HomePage />);

    const heroMedia = screen.getByTestId("hero-media");
    const heroImage = screen.getByAltText("Невский интеграл над Невой") as HTMLImageElement;
    expect(heroMedia).toBeInTheDocument();
    expect(heroImage.src).toContain("main_picture.jpg");
  });
});
