import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemen #root tidak ditemukan.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
