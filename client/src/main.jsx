import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import "./styles.css";
import "./app.css";
import "./auth.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Opt in to the React Router v7 behaviours now (v6.30 supports both flags; no relative splat links exist). */}
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
