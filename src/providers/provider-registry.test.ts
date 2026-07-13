import { describe, expect, it } from "vitest";
import { ProviderLoader } from "./provider-loader.ts";
import {
  executableActionIds as cloudflareExecutableActionIds,
  executorModules as cloudflareExecutorModules,
} from "./registry.cloudflare.generated.ts";
import {
  executableActionIds as nodeExecutableActionIds,
  executorModules as nodeExecutorModules,
} from "./registry.generated.ts";

describe("provider registries", () => {
  it("keeps Node-only providers out of the Cloudflare runtime", () => {
    for (const service of ["netease_mail", "qq_mail"]) {
      expect(nodeExecutorModules[service]).toBeTypeOf("function");
      expect(nodeExecutableActionIds[service]).not.toBeUndefined();
      expect(cloudflareExecutorModules[service]).toBeUndefined();
      expect(cloudflareExecutableActionIds[service]).toBeUndefined();
    }
  });

  it("uses the selected registry as the proxy boundary", async () => {
    const loader = new ProviderLoader({});

    await expect(loader.loadProxyExecutor("hackernews")).resolves.toBeUndefined();
  });
});
