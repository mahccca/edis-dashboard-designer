import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/ui/base.css";
import { RuntimeApp } from "./RuntimeApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RuntimeApp search={window.location.search} />
  </StrictMode>,
);
