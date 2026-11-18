'use client';

import { Component, type ReactNode } from 'react';

import { copy } from '@/common/common.constants';
import { ErrorState } from '@/common/ErrorState';

type SectionErrorBoundaryProps = {
  children: ReactNode;
  /** Runs after the boundary resets, so the section can refetch its query. */
  onRetry?: () => void;
  className?: string;
};

type SectionErrorBoundaryState = { hasError: boolean };

/** Keeps one broken part of the screen from taking the rest down (ui-screens 3.5). */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  override state: SectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Nothing is logged: the message, stack and component data can carry customer text.
  }

  private readonly retry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorState
          message={copy.error.section}
          onRetry={this.retry}
          className={this.props.className}
        />
      );
    }
    return this.props.children;
  }
}
