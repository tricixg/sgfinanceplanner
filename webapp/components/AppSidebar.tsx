"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { appConfig } from "@/lib/config";
import { HOME_HREF, NAV_GROUPS } from "@/lib/nav-config";

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

  // Drawer behaviour (tablet / mobile): Escape closes, page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => {
            onClose();
            console.info("[AppSidebar] closed via backdrop");
          }}
        />
      ) : null}

      <aside
        className={`sidebar ${open ? "sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <Link href={HOME_HREF} prefetch={false} className="sidebar-brand" onClick={onClose}>
          <div className="kicker">{appConfig.kicker}</div>
          <div className="sidebar-title">{appConfig.title}</div>
          <div className="asof">{appConfig.asOf}</div>
        </Link>
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
                  <span className="sidebar-category-caret">
                    <Icon name="chevron-down" size={14} />
                  </span>
                </button>
                <div
                  className={`sidebar-group-tabs ${collapsed ? "sidebar-group-tabs--collapsed" : ""}`}
                >
                  {group.tabs.map((t) => {
                    const active = isActive(t.href);
                    return (
                      <Link
                        key={t.id}
                        href={t.href}
                        // Every page is a static client shell, so prefetching all ~26 of them
                        // on each page load buys almost nothing and costs a request each.
                        prefetch={false}
                        className={`sidebar-tab ${active ? "on" : ""}`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          onClose();
                          console.info("[AppSidebar] nav", t.href);
                        }}
                      >
                        <Icon name={t.icon} />
                        <span>{t.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
