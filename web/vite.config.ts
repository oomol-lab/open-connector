import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { providerIconsPlugin } from "./provider-icons-plugin";

const envDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const apiTarget = loadEnv(mode, envDir, "VITE_").VITE_API_TARGET || `http://localhost:${process.env.PORT ?? "3000"}`;

  return {
    plugins: [react(), tailwindcss(), providerIconsPlugin()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": apiTarget,
        "/docs": apiTarget,
        "/mcp": apiTarget,
        "/openapi.json": apiTarget,
        "/v1": apiTarget,
      },
    },
    build: {
      outDir: "../dist/web",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/recharts/")) {
              return "charts";
            }
          },
        },
      },
    },
  };
});
