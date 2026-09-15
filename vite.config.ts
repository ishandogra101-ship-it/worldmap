import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

/**
 * A stamp that changes whenever the data might have.
 *
 * Vite content-hashes the JS and CSS it builds, so a new bundle is always
 * fetched. Everything under public/ keeps its own name: data/borders/world_1815
 * .geojson is the same URL before and after the file behind it is rebuilt. A
 * returning visitor therefore kept whatever their browser had cached, which
 * meant border corrections, a smoother rebuild and a fresh Wikidata import
 * could all ship and the map on screen would not move.
 *
 * The commit is the right stamp: it changes exactly when the repository does,
 * and it is the same for everyone so the cache is shared rather than busted per
 * visit. Falling back to the build time is only for a checkout without git.
 */
function buildStamp(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return String(Date.now());
  }
}

// BASE_PATH lets GitHub Pages serve the app from /<repo>/.
// Locally it stays "/". Data files are fetched with import.meta.env.BASE_URL
// so both environments resolve the same way.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
