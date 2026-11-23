import { defineConfig } from "vitest/config";
import config from "./vitest.config.ts";

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ["src/**/*.probe.ts", "scripts/**/*.probe.ts", "web/src/**/*.probe.ts"],
  },
});
