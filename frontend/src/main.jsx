import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./interactive.css";
import App from "./App.jsx";
import InteractiveLayer from "./components/Interactivelayer.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <InteractiveLayer>
      <App />
    </InteractiveLayer>
  </StrictMode>
);