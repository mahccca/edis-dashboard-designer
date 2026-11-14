import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import "../../shared/ui/base.css";
import { RuntimeApp } from "./RuntimeApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="خطا در اجرای رانتایم سایت">
      <RuntimeApp search={window.location.search} />
    </ErrorBoundary>
  </StrictMode>,
);
