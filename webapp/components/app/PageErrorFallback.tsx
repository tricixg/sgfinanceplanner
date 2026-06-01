"use client";

type Props = {
  error: Error;
  onRetry?: () => void;
};

export function PageErrorFallback({ error, onRetry }: Props) {
  const showDetail = process.env.NODE_ENV !== "production";

  return (
    <div className="card" style={{ marginTop: 16, maxWidth: 560 }}>
      <h3>Something went wrong</h3>
      <p className="note">
        This page hit an unexpected error. You can try again or use the menu to open another
        section.
      </p>
      {showDetail ? (
        <pre
          className="note"
          style={{
            marginTop: 12,
            padding: 12,
            overflow: "auto",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "var(--rust)",
          }}
        >
          {error.message}
        </pre>
      ) : null}
      {onRetry ? (
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
