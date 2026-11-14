import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import "../../shared/ui/base.css";
import { StudioApp } from "./StudioApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="خطا در اجرای استودیو پلتفرم">
      <StudioApp />
    </ErrorBoundary>
  </StrictMode>,
);
