import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./app/error-boundary.tsx";
import { ensureDesktopApi } from "./lib/desktop-api.ts";
import "./index.css";

ensureDesktopApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
