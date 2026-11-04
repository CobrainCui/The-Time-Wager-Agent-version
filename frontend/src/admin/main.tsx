import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { initAppUpdate } from "../bootstrapAppUpdate";
import AdminApp from "./AdminApp";

initAppUpdate("admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
