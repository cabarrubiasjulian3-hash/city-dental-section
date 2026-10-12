import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/city-dental-section/" : "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["sandpit-moody-zips.ngrok-free.dev"],
  },
});
