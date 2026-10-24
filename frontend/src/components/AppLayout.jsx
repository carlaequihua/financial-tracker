import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  const [navigationCollapsed, setNavigationCollapsed] = useState(() =>
    window.localStorage.getItem("fin-carla-navigation-collapsed") === "true"
  );
  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem("fin-carla-theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("fin-carla-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("fin-carla-navigation-collapsed", String(navigationCollapsed));
  }, [navigationCollapsed]);

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
      <div className={`content-wrap${navigationCollapsed ? " navigation-collapsed" : ""}`}>
        <nav id="main-navigation" className={`nav${navigationCollapsed ? " nav-collapsed" : ""}`} aria-label="Main navigation">
          <button
            type="button"
            className="navigation-toggle"
            onClick={() => setNavigationCollapsed((collapsed) => !collapsed)}
            aria-label={navigationCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={navigationCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!navigationCollapsed}
            aria-controls="navigation-links"
          >
            {navigationCollapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
          </button>
          <div id="navigation-links" className="navigation-links" hidden={navigationCollapsed}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === "/"}>
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
