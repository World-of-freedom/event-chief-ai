import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this (e.g. the route path) clears the error. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches rendering crashes so one broken page doesn't blank the whole app. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="This page hit an unexpected error"
        description={this.state.error.message || "Try again, or go back to the dashboard."}
        action={<Button onClick={() => this.setState({ error: null })}>Try again</Button>}
      />
    );
  }
}
