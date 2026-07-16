import { describe, expect, it, vi } from "vitest";

describe("Cloudflare provider egress", () => {
  it("ignores node:dns proxy addresses while keeping literal and redirect guards", async () => {
    vi.resetModules();
    const { createGuardedFetch, setDefaultGuardedFetchDnsLookup } = await import("../core/guarded-fetch.ts");
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "198.18.0.1", family: 4 }]);

    try {
      // Importing the Workers entry point configures the same module graph to
      // avoid node:dns pre-validation before any provider request can run.
      await import("./cloudflare.ts");

      const responses = [
        new Response("ok"),
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
      ];
      const transport = vi.fn(
        async () => responses.shift() ?? new Response("unexpected", { status: 500 }),
      ) as typeof fetch;
      const guarded = createGuardedFetch({ fetch: transport });

      const response = await guarded("https://api.tailscale.com/api/v2/oauth/token");
      expect(await response.text()).toBe("ok");
      await expect(guarded("http://127.0.0.1/admin")).rejects.toThrow("request URL must not target");
      await expect(guarded("https://api.example.com/start")).rejects.toThrow("redirect location must not target");
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      setDefaultGuardedFetchDnsLookup(null);
    }
  });
});
