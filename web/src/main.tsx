import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/heebo/800.css";
import "./styles.css";
import "./i18n";

import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { WorkoutProvider } from "./session/WorkoutContext";

// Installs the service worker (offline app shell). With autoUpdate, a new version
// downloads in the background and takes over the next time the app is opened.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WorkoutProvider>
          <App />
        </WorkoutProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
