"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { appConfig } from "@/lib/config";
import { NAV_GROUPS } from "@/lib/nav-config";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AppSidebar({ open, onClose }: Props) {
  const pathname = usePathname();
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);

  useEffect(() => {
    setCollapsedByCategory((prev) => {
      const next = { ...prev };
      for (const group of NAV_GROUPS) {
        const hasActive = group.tabs.some((t) => isActive(t.href));
        if (hasActive) next[group.category] = false;
        else if (!(group.category in next)) next[group.category] = false;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => {
            onClose();
            console.log("[AppSidebar] closed via backdrop");
          }}
        />
      ) : null}

      <aside
        className={`sidebar ${open ? "sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <div className="kicker">{appConfig.kicker}</div>
          <h1 className="sidebar-title">{appConfig.title}</h1>
          <div className="asof">{appConfig.asOf}</div>
        </div>
        <nav className="sidebar-nav" id="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const collapsed = collapsedByCategory[group.category] ?? false;
            return (
            <div key={group.category} className="sidebar-group">
              <button
                type="button"
                className="sidebar-category sidebar-category-toggle"
                aria-expanded={!collapsed}
                onClick={() =>
                  setCollapsedByCategory((prev) => ({
                    ...prev,
                    [group.category]: !collapsed,
                  }))
                }
              >
                <span>{group.category}</span>
                <span className="sidebar-category-caret">{collapsed ? "▸" : "▾"}</span>
              </button>
              <div className={`sidebar-group-tabs ${collapsed ? "sidebar-group-tabs--collapsed" : ""}`}>
                {group.tabs.map((t) => (
                  <Link
                    key={t.id}
                    href={t.href}
                    className={`tab sidebar-tab ${isActive(t.href) ? "on" : ""}`}
                    onClick={() => {
                      onClose();
                      console.log("[AppSidebar] nav", t.href);
                    }}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
