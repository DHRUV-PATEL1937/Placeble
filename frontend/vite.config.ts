import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors the `@/*` tsconfig path — allows "@/src/..." imports from components
      "@": resolve(__dirname, "."),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    // Allow current and future ngrok free-domain tunnels
    allowedHosts: [".ngrok-free.dev"],
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Warn if any chunk exceeds 1 MB (informational only)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split vendor libraries into separate chunks for better caching
        manualChunks(id: string) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
        },
      },
    },
  },
});
