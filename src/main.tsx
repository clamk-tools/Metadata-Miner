import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Latin subsets only, served with the page: the two typefaces of the Clamk Tools identity.
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";

import "./styles/theme.css";
import "./styles/detect.css";
import "./styles/app.css";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
