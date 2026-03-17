import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
          <div className="mx-4 max-w-md rounded-lg border border-[var(--glass-border)] bg-white/[0.04] p-6 text-center">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Something went wrong</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleRetry}
              className="mt-4 rounded-md bg-white/[0.06] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.12] transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
