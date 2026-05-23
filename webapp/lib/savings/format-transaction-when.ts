/** Split occurred_at for table display (en-SG). */
export function formatTransactionDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-SG", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatTransactionTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function formatTransactionWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
