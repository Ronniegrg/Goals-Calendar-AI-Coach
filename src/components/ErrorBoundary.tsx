import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "An unexpected error occurred."
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Application ErrorBoundary caught error:", error, info);
  }

  private getFriendlyMessage(raw: string): string {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === "string") {
        if (parsed.error.toLowerCase().includes("quota")) {
          return "Daily cloud database free-tier quota was reached. Your local data remains safely cached and quota resets tomorrow.";
        }
        if (parsed.error.toLowerCase().includes("permission")) {
          return "Could not verify cloud permissions for this operation. Please make sure you are signed in with a verified Google account.";
        }
        return parsed.error;
      }
    } catch {
      // Not a JSON-serialized FirestoreErrorInfo
    }
    return raw || "Something went wrong while rendering the page.";
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Something interrupted this view</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Your saved study notes and schedules remain preserved.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-300 bg-slate-950/70 border border-slate-800 rounded-xl p-3 break-words">
            {this.getFriendlyMessage(this.state.errorMessage)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload Application</span>
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
