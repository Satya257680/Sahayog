import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { AppErrorBoundary } from "./ErrorBoundary.jsx";
import "./styles.css";
import "./app.css";
import "./auth.css";
import "./splash.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Outermost: a render error anywhere below shows a recovery screen instead of a blank page. */}
    <AppErrorBoundary>
      {/* React Router v7: the former v7_* future flags are now the default behaviour. */}
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
