import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH lets GitHub Pages serve the app from /<repo>/.
// Locally it stays "/". Data files are fetched with import.meta.env.BASE_URL
// so both environments resolve the same way.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
