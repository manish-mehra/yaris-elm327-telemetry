import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // When the backend exists, proxy /api to it during development:
  // server: { proxy: { "/api": "http://localhost:3000" } },
});
