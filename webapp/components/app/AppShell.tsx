"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { navTabForPath } from "@/lib/nav-config";
import { usePathname } from "next/navigation";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const activeTab = navTabForPath(pathname);

  return (
    <div className="wrap app-layout">
      <AppSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="app-main">
        <header className="app-main-header">
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="sidebar-nav"
            onClick={() => {
              setNavOpen((open) => {
                console.log("[AppShell] nav toggle", !open);
                return !open;
              });
            }}
          >
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
          </button>
          <div className="app-main-header-text">
            <h2 className="app-main-title">{activeTab?.label ?? "Dashboard"}</h2>
            {activeTab?.summary ? (
              <p className="sub app-main-summary">{activeTab.summary}</p>
            ) : null}
          </div>
        </header>

        {children}

        <footer>
          Personal planning tool — not financial advice. Data syncs to Supabase when configured;
          otherwise saves to your browser. Project:{" "}
          <a href="https://github.com" style={{ color: "var(--moss)" }}>
            sgfinanceplanner
          </a>
        </footer>
      </div>
    </div>
  );
}
