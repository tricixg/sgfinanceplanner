import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/** Placeholder block shown while data loads. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/** A few stacked skeleton lines, announced once to assistive tech. */
export function SkeletonLines({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} style={{ display: "grid", gap: 12 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${92 - ((i * 17) % 40)}%`} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty error-state" role="alert">
      <Icon name="alert" />
      <strong>Couldn’t load this</strong>
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn ghost sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
