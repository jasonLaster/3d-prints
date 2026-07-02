import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexEnabled =
  Boolean(convexUrl) && import.meta.env.VITE_DISABLE_CONVEX !== "true";
const app = <App convexEnabled={convexEnabled} />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convexEnabled && convexUrl ? (
      <ConvexProvider client={new ConvexReactClient(convexUrl)}>
        {app}
      </ConvexProvider>
    ) : (
      app
    )}
  </React.StrictMode>,
);
