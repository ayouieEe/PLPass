import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    modulePreload: {
      polyfill: false,
      resolveDependencies(_filename, dependencies) {
        // Keep only the React runtime in the document's preload set. The
        // remaining vendor chunks are still normal ESM dependencies and are
        // fetched by the entry module when the corresponding providers or
        // routes are evaluated. This prevents the initial document from
        // eagerly downloading query, Supabase, and icon code before it is
        // needed.
        return dependencies.filter((dependency) => dependency.includes("react-vendor"));
      }
    },
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        scanner: path.resolve(__dirname, "scanner.html")
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) return "react-vendor";
          if (id.includes("node_modules/@supabase/")) return "supabase-vendor";
          if (id.includes("node_modules/@tanstack/")) return "query-vendor";
          if (id.includes("node_modules/lucide-react/")) return "icons-vendor";
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    setupFiles: "./tests/setup.ts",
    testTimeout: 20000,
    css: true
  }
});
