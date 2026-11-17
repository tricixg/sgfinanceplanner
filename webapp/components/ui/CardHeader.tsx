import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Destination for the detail page this card summarises. */
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
};

/** Title row for dashboard cards, with an optional drill-down link. */
export function CardHeader({ title, subtitle, href, linkLabel = "See all", action }: Props) {
  return (
    <div className="card-head">
      <div className="card-head-text">
        <h3>{title}</h3>
        {subtitle ? <div className="card-sub">{subtitle}</div> : null}
      </div>
      {action}
      {href ? (
        <Link href={href} className="link-more">
          {linkLabel}
          <Icon name="chevron-right" />
        </Link>
      ) : null}
    </div>
  );
}
