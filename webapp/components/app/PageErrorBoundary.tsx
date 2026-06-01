"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { PageErrorFallback } from "@/components/app/PageErrorFallback";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches client render errors in page content without unmounting AppShell chrome. */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[PageErrorBoundary] render error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return <PageErrorFallback error={error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
