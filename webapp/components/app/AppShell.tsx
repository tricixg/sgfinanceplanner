"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTabBar } from "@/components/app/MobileTabBar";
import { PageErrorBoundary } from "@/components/app/PageErrorBoundary";
import { Icon } from "@/components/ui/Icon";
import { navTabForPath } from "@/lib/nav-config";
import { usePathname } from "next/navigation";
import { NotifyHost } from "@/components/app/NotifyHost";
import { OfflineBanner } from "@/components/app/OfflineBanner";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const activeTab = navTabForPath(pathname);
  const title = activeTab?.label ?? "Dashboard";

  // Large title in the page; the compact bar title fades in once it scrolls away.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleHidden, setTitleHidden] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setTitleHidden(!entry.isIntersecting),
      { rootMargin: "-56px 0px 0px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pathname]);

  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleNav = useCallback(() => {
    setNavOpen((open) => {
      const next = !open;
      console.info("[AppShell] nav toggle", { open: next });
      return next;
    });
  }, []);

  return (
    <div className="app-layout">
      <AppSidebar open={navOpen} onClose={closeNav} />

      <div className="app-main">
        {/* Compact sticky bar — tablet and mobile only. */}
        <div className={`app-topbar ${titleHidden ? "app-topbar--scrolled" : ""}`}>
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="sidebar-nav"
            onClick={toggleNav}
          >
            <Icon name="menu" size={22} />
          </button>
          <div className="app-topbar-title" aria-hidden="true">
            {title}
          </div>
          <span className="app-topbar-spacer" />
        </div>

        <main className="app-content">
          <header className="page-head">
            <h1 className="page-title" ref={titleRef}>
              {title}
            </h1>
            {activeTab?.summary ? <p className="page-summary">{activeTab.summary}</p> : null}
          </header>

          <OfflineBanner />
          <PageErrorBoundary>{children}</PageErrorBoundary>

          <footer>
            Personal planning tool — not financial advice. Data syncs to Supabase when
            configured; otherwise saves to your browser. Project:{" "}
            <a
              href="https://github.com/tricixg/sgfinanceplanner"
              target="_blank"
              rel="noopener noreferrer"
            >
              sgfinanceplanner
            </a>
          </footer>
        </main>
      </div>

      <MobileTabBar moreOpen={navOpen} onMore={toggleNav} />
      <NotifyHost />
    </div>
  );
}
