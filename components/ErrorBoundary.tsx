import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });

    // In production, you would send this to an error tracking service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDevelopment = import.meta.env.DEV;
      const errorMessage = this.state.error?.message || 'An unexpected error occurred';
      const errorStack = this.state.error?.stack;
      const componentStack = this.state.errorInfo?.componentStack;

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-slate-900 border border-red-500/20 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">Something went wrong</h1>
                <p className="text-slate-400 text-sm">An error occurred while rendering this component</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6">
              <p className="text-red-400 font-mono text-sm mb-2">{errorMessage}</p>
              
              {isDevelopment && errorStack && (
                <details className="mt-4">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 mb-2">
                    Error Stack Trace
                  </summary>
                  <pre className="text-xs text-slate-600 overflow-auto max-h-48 bg-slate-900 p-3 rounded border border-slate-800">
                    {errorStack}
                  </pre>
                </details>
              )}

              {isDevelopment && componentStack && (
                <details className="mt-4">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 mb-2">
                    Component Stack
                  </summary>
                  <pre className="text-xs text-slate-600 overflow-auto max-h-48 bg-slate-900 p-3 rounded border border-slate-800">
                    {componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Reload Page
              </button>
            </div>

            {!isDevelopment && (
              <p className="text-xs text-slate-500 text-center mt-6">
                If this problem persists, please contact support with the error details above.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
