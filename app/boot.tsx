import { ErrorInfo, useState } from "react";

import { createRoot } from "react-dom/client";
import { LocationProvider } from "@swifty.js/docs";
import { DocsProvider, DocsLayout, createContentGuard } from "@swifty.js/docs";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";
import "./main.css";
import { init, enablePlugin } from "@swifty.js/sentry";
import {
  ScreenRecordPlugin,
  PerformancePlugin,
  ExposurePlugin,
} from "@swifty.js/sentry/plugins";
import { ReactErrorBoundary } from "@swifty.js/sentry/react";

init({
  dsn: "/26autumn",
  debug: true,
  beforePushEventList(eventList) {
    if (!import.meta.env.DEV) {
      console.log("@swifty.js/sentry App:", eventList);
      return false;
    }
    return eventList;
  },
});
enablePlugin(new ScreenRecordPlugin());
enablePlugin(new PerformancePlugin());
enablePlugin(new ExposurePlugin());

// Built-in password guard: pages compiled with docsGuardPlugin()
// (frontmatter `protected: true` + DOCS_PASSWORD env) prompt for a
// password; everything else passes through untouched.
const guard = createContentGuard(loadContent);
function ErrorFallback({
  error,
  errorInfo,
}: {
  error: Error;
  errorInfo?: ErrorInfo;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6 font-mono">
      <div className="animate-guard-pop w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
          {error.message || "An unexpected error occurred."}
        </p>

        {errorInfo?.componentStack && (
          <pre className="border-border bg-muted text-muted-foreground mt-5 max-h-28 overflow-auto rounded-md border p-3 text-left text-[0.7rem] leading-relaxed">
            {errorInfo.componentStack.trim()}
          </pre>
        )}

        <div className="mt-6 flex items-center justify-center">
          <button
            onClick={() => setDismissed(true)}
            className="bg-primary text-primary-foreground cursor-pointer rounded-md px-4 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-px active:translate-y-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const fallback = (error: Error, errorInfo?: ErrorInfo) => (
  <ErrorFallback error={error} errorInfo={errorInfo} />
);
function App() {
  return (
    <>
      <guard.ContentGuard />
      <ReactErrorBoundary fallback={fallback}>
        <DocsProvider
          config={docsConfig}
          loadContent={guard.loadContent}
          getSearchIndex={getSearchIndex}
        >
          <LocationProvider>
            <DocsLayout />
          </LocationProvider>
        </DocsProvider>
      </ReactErrorBoundary>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
