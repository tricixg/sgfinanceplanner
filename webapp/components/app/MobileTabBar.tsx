"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

type Item = { href: string; label: string; icon: IconName };

/** Primary destinations on small screens; everything else lives behind "More". */
const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/financial-health", label: "Health", icon: "pulse" },
  { href: "/expenses", label: "Expenses", icon: "receipt" },
  { href: "/transactions", label: "Activity", icon: "list" },
];

type Props = {
  moreOpen: boolean;
  onMore: () => void;
};

export function MobileTabBar({ moreOpen, onMore }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const onPrimary = ITEMS.some((i) => isActive(i.href));

  return (
    <nav className="tabbar" aria-label="Primary">
      {ITEMS.map((item) => {
        const active = !moreOpen && isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`tabbar-item ${active ? "on" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className={`tabbar-item ${moreOpen || !onPrimary ? "on" : ""}`}
        aria-expanded={moreOpen}
        aria-controls="sidebar-nav"
        onClick={onMore}
      >
        <Icon name="more" size={22} />
        <span>More</span>
      </button>
    </nav>
  );
}
