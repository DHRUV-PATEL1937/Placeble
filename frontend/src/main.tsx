import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "./styles/index.css";
import "./styles/practice-pages.css";
import "./pages/auth/auth.css";
import "./styles/field-focus.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlacebleApp } from "./pages/PlacebleApp";
import { installScrollFlag } from "./hooks/use-motion";
// Last on purpose: the motion layer refines every stylesheet above and inside the app, so it must win ties.
import "./styles/motion.css";
import "./styles/mobile-app.css";

// No pinch zoom. The viewport tag turns it off on Android, but iPhone Safari ignores that for pinch gestures, so block them here too.
for (const gesture of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(gesture, event => event.preventDefault(), { passive: false });

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

installScrollFlag();

createRoot(rootElement).render(
  <StrictMode>
    <PlacebleApp />
  </StrictMode>
);
