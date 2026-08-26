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
    rollupOptions: {
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
