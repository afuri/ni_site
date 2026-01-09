import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../HomePage";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ui", async () => {
  const actual = await vi.importActual<typeof import("@ui")>("@ui");
  return {
    ...actual,
    useAuth: () => ({
      signIn: vi.fn()
    })
  };
});

vi.mock("../assets/main_banner_3.png", () => ({
  default: "hero-banner"
}));
vi.mock("../assets/logo2.png", () => ({
  default: "logo-image"
}));
vi.mock("../assets/math_logo.svg", () => ({
  default: "math-logo"
}));
vi.mock("../assets/cs_logo.svg", () => ({
  default: "cs-logo"
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

  it("opens and closes the mobile menu dropdown", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByTestId("nav-overlay"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("toggles cat quote popover on click", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    expect(screen.queryByRole("dialog", { name: "Цитата" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Кот" }));
    expect(screen.getByRole("dialog", { name: "Цитата" })).toBeInTheDocument();

    await user.click(screen.getByTestId("cat-overlay"));
    expect(screen.queryByRole("dialog", { name: "Цитата" })).toBeNull();
  });

  it("opens and closes the math results modal", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Открыть результаты: Математика" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Результаты: Математика")).toBeInTheDocument();
    expect(screen.getByLabelText("Выберите олимпиаду")).toBeInTheDocument();
    expect(screen.getByText("Задания прошлых лет")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the informatics results modal", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Открыть результаты: Информатика" }));
    expect(screen.getByText("Результаты: Информатика")).toBeInTheDocument();
  });

  it("opens registration modal and switches role fields", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Регистрация" }));
    expect(screen.getByRole("dialog", { name: "Регистрация" })).toBeInTheDocument();
    expect(screen.getByLabelText("Класс")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Роль"), "teacher");
    expect(screen.getByLabelText("Предмет")).toBeInTheDocument();
  });

  it("opens login modal from header", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Войти" }));
    const dialog = screen.getByRole("dialog", { name: "Вход" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Регистрация")).toBeInTheDocument();
    expect(within(dialog).getByText("Восстановить пароль")).toBeInTheDocument();
  });
});
