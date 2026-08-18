import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlacebleApp } from "./features/auth/components/placeble-app";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <PlacebleApp />
  </StrictMode>
);
