import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { OlympiadPublic, UserRead } from "@api";
import { HomePage } from "../HomePage";
import { StudentPlatformPage } from "../StudentPlatformPage";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emptyResponse = async (_input: RequestInfo | URL, _init?: RequestInit) => ({
  ok: true,
  status: 200,
  text: async () => "[]"
});
const fetchMock = vi.fn(emptyResponse);
const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  setSession: vi.fn(),
  user: null as UserRead | null,
  status: "unauthenticated" as "authenticated" | "unauthenticated"
}));

vi.mock("@ui", async () => {
  const actual = await vi.importActual<typeof import("@ui")>("@ui");
  return {
    ...actual,
    useAuth: () => ({
      signIn: authMocks.signIn,
      signOut: authMocks.signOut,
      setSession: authMocks.setSession,
      tokens: null,
      user: authMocks.user,
      status: authMocks.status
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
    authMocks.signIn.mockReset();
    authMocks.signOut.mockReset();
    authMocks.user = null;
    authMocks.status = "unauthenticated";
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders the maintenance hero content", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /Олимпиада/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "До старта нового сезона:" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Об олимпиаде" })).toBeInTheDocument();
  });

  it("sets hero background image", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Результаты" })).toHaveAttribute("href", "/results");
  });

  it("opens the schedule countdown modal", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
    expect(await screen.findByLabelText("Регион школы")).toBeInTheDocument();

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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Регистрация" }));
    await user.selectOptions(screen.getByLabelText("Роль"), "student");
    await user.selectOptions(await screen.findByLabelText("Регион школы"), "1");
    await user.type(screen.getByRole("combobox", { name: "Школа" }), "ли");
    await user.click(await screen.findByRole("button", { name: /Лицей № 1.*Москва/i }, { timeout: 1200 }));

    expect(screen.getByText("Город: Москва")).toBeInTheDocument();
    expect(screen.queryByText(/адрес школы/i)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("region_id=1"))).toBe(true);
  });

  it("hides school selection for a preschooler", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

  it("does not create an authenticated session after registration", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/lookup/regions")
        ? [{ id: 1, name: "Москва", country_code: "RU", is_other: false }]
        : url.includes("/auth/register")
          ? { id: 10, login: "student10", role: "student" }
          : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    });
    const user = userEvent.setup();
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HomePage /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Регистрация" }));
    const dialog = screen.getByRole("dialog", { name: "Регистрация" });
    await user.type(dialog.querySelector('input[name="login"]')!, "student10");
    await user.type(dialog.querySelector('input[name="email"]')!, "student10@example.test");
    await user.type(dialog.querySelector('input[name="password"]')!, "Password10");
    await user.type(dialog.querySelector('input[name="passwordConfirm"]')!, "Password10");
    await user.type(dialog.querySelector('input[name="surname"]')!, "Иванов");
    await user.type(dialog.querySelector('input[name="name"]')!, "Иван");
    await user.click(within(dialog).getByRole("radio", { name: "Муж" }));
    await user.selectOptions(dialog.querySelector("#register-class")!, "0");
    await user.selectOptions(await within(dialog).findByLabelText("Регион школы"), "1");
    await user.click(within(dialog).getByRole("checkbox", { name: /Даю согласие/ }));
    await user.click(within(dialog).getByRole("button", { name: "Зарегистрироваться" }));

    expect(await screen.findByRole("dialog", { name: "Поздравляем!" })).toBeInTheDocument();
    expect(authMocks.signIn).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url, init]) => (
      String(url).includes("/auth/register") && init?.method === "POST"
    ))).toBe(true);
  });

  it("opens login modal from header", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

const testOlympiad = (id = 64): OlympiadPublic => ({
  id, title: `Тестовая математика ${id}`, description: null, age_group: "5", attempts_limit: 1,
  duration_sec: 600, pass_percent: 60, is_published: true, results_released: true,
  available_from: new Date(Date.now() - 3600000).toISOString(),
  available_to: new Date(Date.now() + 86400000).toISOString()
});

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="route-state">{location.pathname}{location.search}|{JSON.stringify(location.state)}</output><button onClick={() => navigate(-1)}>Назад</button></>;
}

describe("Olympiad entry from the student platform", () => {
  beforeEach(() => {
    authMocks.user = {
      id: 2, login: "student01", name: "Иван", role: "student", class_grade: 5,
      is_email_verified: true, school_status: "selected", coins: 0
    } as UserRead;
    authMocks.status = "authenticated";
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/olympiads/my") ? [testOlympiad()]
        : url.endsWith("/attempts/start") ? { id: 900 } : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  const startRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/attempts/start"));
  const renderFlow = () => render(
    <MemoryRouter initialEntries={["/platform"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RouteProbe />
      <Routes>
        <Route path="/platform" element={<StudentPlatformPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/olympiad" element={<p>Олимпиада открыта</p>} />
      </Routes>
    </MemoryRouter>
  );

  it("uses the homepage instructions and starts the exact variant only after confirmation", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Начать: Тестовая математика 64" }));
    const dialog = await screen.findByRole("dialog", { name: "Инструкция перед началом" });
    await waitFor(() => expect(screen.getByTestId("route-state")).toHaveTextContent("/|null"));
    expect(screen.queryByRole("dialog", { name: "Начать олимпиаду?" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Тестовая математика 64")).toBeInTheDocument();
    expect(within(dialog).getByText("Время прохождения: 10 минут.")).toBeInTheDocument();
    expect(startRequests()).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Начать" }));
    expect(await screen.findByText("Олимпиада открыта")).toBeInTheDocument();
    expect(screen.getByTestId("route-state")).toHaveTextContent("/olympiad?attemptId=900");
    expect(startRequests()).toHaveLength(1);
    expect(JSON.parse(startRequests()[0][1]!.body as string)).toEqual({ olympiad_id: 64 });
    await user.click(screen.getByRole("button", { name: "Назад" }));
    await waitFor(() => expect(screen.getByTestId("route-state")).toHaveTextContent("/|null"));
    expect(screen.queryByRole("dialog", { name: "Инструкция перед началом" })).not.toBeInTheDocument();
    expect(startRequests()).toHaveLength(1);
  });

  it("does not create a timed attempt when the instructions are cancelled", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Начать: Тестовая математика 64" }));
    const dialog = await screen.findByRole("dialog", { name: "Инструкция перед началом" });
    await user.click(within(dialog).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("dialog", { name: "Инструкция перед началом" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("route-state")).toHaveTextContent("/|null"));
    expect(startRequests()).toHaveLength(0);
  });

  it("shows a visible error instead of switching to another variant if the selected one disappeared", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => ({
      ok: true, status: 200, text: async () => JSON.stringify(String(input).endsWith("/olympiads/my") ? [testOlympiad(65)] : [])
    }));
    render(
      <MemoryRouter initialEntries={[{ pathname: "/", state: { startOlympiadId: 64 } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RouteProbe /><HomePage />
      </MemoryRouter>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Олимпиада больше недоступна");
    expect(screen.queryByRole("dialog", { name: "Инструкция перед началом" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("route-state")).toHaveTextContent("/|null"));
    expect(startRequests()).toHaveLength(0);
  });

  it("keeps Continue going directly to the existing attempt without instructions or a new start", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/olympiads/my") ? [testOlympiad()]
        : url.endsWith("/attempts/results/my") ? [{ attempt_id: 901, olympiad_id: 64, status: "active" }]
          : url.endsWith("/attempts/901") ? { attempt: {
            id: 901, olympiad_id: 64, status: "active", deadline_at: new Date(Date.now() + 600000).toISOString()
          } } : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    });
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Продолжить: Тестовая математика 64" }));
    expect(await screen.findByText("Олимпиада открыта")).toBeInTheDocument();
    expect(screen.getByTestId("route-state")).toHaveTextContent("/olympiad?attemptId=901");
    expect(screen.queryByRole("dialog", { name: "Инструкция перед началом" })).not.toBeInTheDocument();
    expect(startRequests()).toHaveLength(0);
  });

  it.each(["future", "closed"])("rejects a %s window during the entry recheck", async (schedule) => {
    const olympiad = testOlympiad();
    if (schedule === "future") olympiad.available_from = new Date(Date.now() + 3600000).toISOString();
    else olympiad.available_to = new Date(Date.now() - 1000).toISOString();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => ({
      ok: true, status: 200, text: async () => JSON.stringify(String(input).endsWith("/olympiads/my") ? [olympiad] : [])
    }));
    render(
      <MemoryRouter initialEntries={[{ pathname: "/", state: { startOlympiadId: 64 } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Сейчас олимпиада недоступна по времени.");
    expect(screen.queryByRole("dialog", { name: "Инструкция перед началом" })).not.toBeInTheDocument();
    expect(startRequests()).toHaveLength(0);
  });

  it("keeps the server's active-attempt restriction and shows its error outside the hidden subject selector", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/attempts/start")) return {
        ok: false, status: 409,
        text: async () => JSON.stringify({ error: { code: "active_attempt_exists" } })
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(String(input).endsWith("/olympiads/my") ? [testOlympiad()] : []) };
    });
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Начать: Тестовая математика 64" }));
    const dialog = await screen.findByRole("dialog", { name: "Инструкция перед началом" });
    await user.click(within(dialog).getByRole("button", { name: "Начать" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("У вас уже есть активная попытка. Сначала завершите её.");
    expect(screen.queryByText("Олимпиада открыта")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Инструкция перед началом" })).not.toBeInTheDocument();
  });
});
