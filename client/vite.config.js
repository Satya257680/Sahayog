import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api to the Express API so the browser sees one origin.
// That keeps the HttpOnly session cookie first-party and makes Google/Facebook callbacks work locally.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET || "http://localhost:5000";
  return {
    plugins: [react()],
    resolve: {
      // Exactly one React at runtime. Two copies make every hook fail with
      // "Cannot read properties of null (reading 'useContext')".
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      // Pre-bundle React, the router and icons together on first start, so the dev server never
      // re-optimises mid-session and serves the page a mix of old and new React chunks.
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-router-dom",
        "lucide-react",
      ],
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: { "/api": { target, changeOrigin: false, xfwd: true } },
    },
    preview: {
      port: 4173,
      proxy: { "/api": { target, changeOrigin: false, xfwd: true } },
    },
  };
});
