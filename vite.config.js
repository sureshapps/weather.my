import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In production (Vercel) /api/weather/* is served by the serverless
// functions in /api. In local dev there is no serverless runtime, so we
// mirror the same routes with Vite's dev-server proxy, forwarding straight
// to MET Malaysia's API server-to-server (again, no browser CORS involved).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/weather": {
        target: "https://api.data.gov.my",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
