import React from "react";
import { LayoutShell, Button, useAuth } from "@ui";
import { Link, NavLink, Outlet } from "react-router-dom";

export function AdminLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="admin-app">
      <LayoutShell
        logo={
          <Link to="/tasks" className="admin-logo">
            NI Admin
          </Link>
        }
        nav={
          <div className="admin-nav">
            <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
              Задания
            </NavLink>
            <NavLink to="/olympiads" className={({ isActive }) => (isActive ? "active" : "")}>
              Олимпиады
            </NavLink>
            <NavLink to="/content" className={({ isActive }) => (isActive ? "active" : "")}>
              Статьи/Новости
            </NavLink>
            <NavLink to="/users" className={({ isActive }) => (isActive ? "active" : "")}>
              Пользователи
            </NavLink>
            <NavLink to="/results" className={({ isActive }) => (isActive ? "active" : "")}>
              Результаты
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => (isActive ? "active" : "")}>
              Отчеты
            </NavLink>
          </div>
        }
        actions={
          <div className="admin-actions">
            <span className="admin-user">{user?.login ?? "admin"}</span>
            <Button type="button" size="sm" variant="outline" onClick={signOut}>
              Выйти
            </Button>
          </div>
        }
      >
        <div className="admin-content">
          <Outlet />
        </div>
      </LayoutShell>
    </div>
  );
}
