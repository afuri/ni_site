import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../HomePage";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emptyResponse = async (_input: RequestInfo | URL, _init?: RequestInit) => ({
  ok: true,
  status: 200,
  text: async () => "[]"
});
const fetchMock = vi.fn(emptyResponse);

vi.mock("@ui", async () => {
  const actual = await vi.importActual<typeof import("@ui")>("@ui");
  return {
    ...actual,
    useAuth: () => ({
      signIn: vi.fn(),
      signOut: vi.fn(),
      user: null,
      status: "unauthenticated"
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
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(emptyResponse);
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders the maintenance hero content", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /Олимпиада/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "На сайте проводятся технические работы" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Об олимпиаде" })).toBeInTheDocument();
  });

  it("sets hero background image", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const hero = screen.getByTestId("home-hero");
    expect(hero.querySelector(".home-hero-image")).toHaveAttribute(
      "src",
      expect.stringContaining("main_banner_3.png")
    );
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

  it("links to the results page", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Результаты" })).toHaveAttribute("href", "/results");
  });

  it("opens the schedule countdown modal", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Олимпиада по математике.*Дошкольники/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("До олимпиады осталось")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Роль")).toHaveValue("student");
    await user.selectOptions(screen.getByLabelText("Роль"), "student");
    expect(screen.getByLabelText("Пол")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Регистрация" })).getByText("Класс")).toBeInTheDocument();
    expect(document.getElementById("register-class")).toBeInstanceOf(HTMLSelectElement);
    expect(await screen.findByLabelText("Регион")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Роль"), "teacher");
    expect(document.querySelector('input[name="subject"]')).toBeInstanceOf(HTMLInputElement);
  });

  it("searches schools within a region and shows the city without an address", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/lookup/regions")
        ? [{ id: 1, name: "Москва", country_code: "RU", is_other: false }]
        : url.includes("/lookup/schools")
          ? [{ id: 10, short_name: "Лицей № 1", full_name: "ГБОУ Лицей № 1", city: "Москва" }]
          : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Регистрация" }));
    await user.selectOptions(screen.getByLabelText("Роль"), "student");
    await user.selectOptions(await screen.findByLabelText("Регион"), "1");
    await user.type(screen.getByRole("combobox", { name: "Школа" }), "ли");
    await user.click(await screen.findByRole("button", { name: /Лицей № 1.*Москва/i }, { timeout: 1200 }));

    expect(screen.getByText("Город: Москва")).toBeInTheDocument();
    expect(screen.queryByText(/адрес школы/i)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("region_id=1"))).toBe(true);
  });

  it("hides school selection for a preschooler", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Регистрация" }));
    await user.selectOptions(screen.getByLabelText("Роль"), "student");
    const classSelect = document.getElementById("register-class") as HTMLSelectElement;
    await user.selectOptions(classSelect, "0");
    expect(screen.queryByRole("combobox", { name: "Школа" })).toBeNull();
    expect(screen.getByText("Для дошкольника выбор школы не требуется.")).toBeInTheDocument();
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
