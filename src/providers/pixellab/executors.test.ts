import { describe, expect, it, vi } from "vitest";
import { createGuardedFetch } from "../../core/guarded-fetch.ts";
import { credentialValidators } from "./executors.ts";

describe("PixelLab credential validator egress", () => {
  it("skips reserved Fake-IP DNS results for the fixed PixelLab API host", async () => {
    const transport = vi.fn(async () => Response.json([])) as unknown as typeof fetch;
    const defaultFetcher = createGuardedFetch({
      fetch: transport,
      lookup: async () => [{ address: "198.18.0.130", family: 4 }],
    });

    await expect(
      credentialValidators.apiKey!({ apiKey: "test-token", values: {} }, { fetcher: defaultFetcher }),
    ).resolves.toMatchObject({ grantedScopes: [] });

    expect(transport).toHaveBeenCalledOnce();
  });

  it("still blocks redirects from PixelLab to reserved targets", async () => {
    const transport = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    ) as unknown as typeof fetch;

    await expect(
      credentialValidators.apiKey!({ apiKey: "test-token", values: {} }, { fetcher: transport }),
    ).rejects.toThrow(/redirect location/u);

    expect(transport).toHaveBeenCalledOnce();
  });
});
