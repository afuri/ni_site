import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlatformShell } from "../PlatformShell";

describe("PlatformShell", () => {
  it("opens logout only on a profile click while already in profile", () => {
    const signOut = vi.fn();
    const shell = (activeSection: "home" | "profile") => <MemoryRouter>
      <PlatformShell activeSection={activeSection} userName="Иван" login="student01" classGrade={5} notificationCount={0} onSignOut={signOut}><p>Содержимое</p></PlatformShell>
    </MemoryRouter>;
    const { rerender } = render(shell("home"));
    fireEvent.click(screen.getByRole("link", { name: "Открыть профиль" }));
    expect(document.querySelector(".student-user-popover")).toBeNull();
    rerender(shell("profile"));
    const link = screen.getByRole("link", { name: "Открыть профиль" });
    fireEvent.click(link);
    expect(link).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(link).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(link);
    fireEvent.pointerDown(document.body);
    expect(link).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(link);
    fireEvent.click(within(document.querySelector(".student-user-popover") as HTMLElement).getByRole("button", { name: "Выйти" }));
    expect(signOut).toHaveBeenCalledOnce();
  });
  it("contains only implemented navigation destinations", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlatformShell
          activeSection="home"
          userName="Иван"
          login="student01"
          classGrade={5}
          notificationCount={0}
          onSignOut={vi.fn()}
        >
          <p>Содержимое</p>
        </PlatformShell>
      </MemoryRouter>
    );

    const desktopNavigation = screen.getByRole("navigation", { name: "Разделы кабинета ученика" });
    expect(desktopNavigation).toHaveTextContent("Главная");
    expect(desktopNavigation).not.toHaveTextContent("Олимпиады");
    expect(desktopNavigation).toHaveTextContent("Результаты и дипломы");
    expect(desktopNavigation).toHaveTextContent("Профиль");
    expect(screen.getByRole("navigation", { name: "Основные разделы" })).not.toHaveTextContent("Олимпиады");
    expect(screen.queryByRole("link", { name: "Олимпиады" })).not.toBeInTheDocument();
    expect(desktopNavigation).not.toHaveTextContent(/марафон|трениров|диагност|Integral\+|награ/i);
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});
