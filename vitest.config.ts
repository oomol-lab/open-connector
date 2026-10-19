import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { providerIconsPlugin } from "./web/provider-icons-plugin.ts";

export default defineConfig({
  plugins: [providerIconsPlugin({ iconUrls: {} })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "web/src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
