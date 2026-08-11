import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { getFoundryMeshRuntime } from "./mesh";

const mesh = getFoundryMeshRuntime();
void mesh
  .initialize()
  .then(() => mesh.save())
  .catch((error) => {
    console.error("Foundry mesh initialization failed.", error);
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
