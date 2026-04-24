import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { EngineGate } from "@/components/engine-gate";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background p-8 text-foreground">
          <h1 className="page-title">Something went wrong</h1>
          <pre className="mt-4 max-w-full overflow-auto rounded-xl border border-border bg-muted p-4 text-sm whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <p className="page-description mt-4 max-w-none">
            Check the browser console for details. Try a full refresh (reload the page).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <TooltipProvider delayDuration={200}>
        <EngineGate>
          <App />
        </EngineGate>
      </TooltipProvider>
      <Toaster />
    </RootErrorBoundary>
  </StrictMode>,
);
