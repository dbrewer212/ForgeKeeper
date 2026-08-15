import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { getFoundryMeshRuntime } from "./mesh";

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

const mesh = getFoundryMeshRuntime();
void mesh
  .initialize()
  .then(() => {
    const persistDefaults = () => {
      void mesh.save().catch((error) => {
        console.error("Foundry mesh startup snapshot save failed.", error);
      });
    };
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(persistDefaults, { timeout: 1500 });
    } else {
      window.setTimeout(persistDefaults, 250);
    }
  })
  .catch((error) => {
    console.error("Foundry mesh initialization failed.", error);
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
