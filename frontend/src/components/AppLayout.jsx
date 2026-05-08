import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { masterDataApi } from "../api/masterData";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/recurring", label: "Recurring" },
  { to: "/budgets", label: "Budgets" },
  { to: "/import-export", label: "Import/Export" },
  { to: "/master-data", label: "Summary" }
];

export default function AppLayout() {
  const qc = useQueryClient();
  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem("fin-carla-theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("fin-carla-theme", theme);
  }, [theme]);

  useEffect(() => {
    qc.prefetchQuery({ queryKey: ["accounts"], queryFn: masterDataApi.accounts, staleTime: 1000 * 60 * 15 });
    qc.prefetchQuery({ queryKey: ["categories"], queryFn: masterDataApi.categories, staleTime: 1000 * 60 * 15 });
  }, [qc]);

  return (
    <div className="shell">
      <header className="header">
        <h1>Financial Tracker</h1>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          aria-label="Toggle theme"
        >
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </header>
      <div className="content-wrap">
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
