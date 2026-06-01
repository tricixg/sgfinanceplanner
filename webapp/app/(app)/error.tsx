"use client";

import { useEffect } from "react";
import { PageErrorFallback } from "@/components/app/PageErrorFallback";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppSegmentError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[app/(app)/error] segment error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return <PageErrorFallback error={error} onRetry={reset} />;
}
