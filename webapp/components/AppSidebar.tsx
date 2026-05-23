"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appConfig } from "@/lib/config";
import { NAV_GROUPS } from "@/lib/nav-config";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AppSidebar({ open, onClose }: Props) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);

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
          {NAV_GROUPS.map((group) => (
            <div key={group.category} className="sidebar-group">
              <div className="sidebar-category">{group.category}</div>
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
          ))}
        </nav>
      </aside>
    </>
  );
}
