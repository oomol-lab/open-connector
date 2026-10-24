import { describe, expect, it, vi } from "vitest";
import { createProviderFetch } from "../providers/provider-runtime.ts";
import { createGuardedFetch } from "./guarded-fetch.ts";
import { getProviderNetworkPolicy, withProviderNetworkPolicy } from "./provider-network-policy.ts";
import { isPrivateNetworkAccessAllowed } from "./request.ts";

describe("runtime network policy", () => {
  it("isolates overlapping asynchronous work and restores the outer policy after failure", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = vi.fn<typeof fetch>(async () => new Response("ok"));
    const fetcher = createProviderFetch({ fetch: transport, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const privateWork = withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      await barrier;
      await expect(fetcher("http://10.0.0.2")).resolves.toBeInstanceOf(Response);
      expect(() =>
        withProviderNetworkPolicy({}, () => {
          throw new Error("failed");
        }),
      ).toThrow("failed");
      expect(isPrivateNetworkAccessAllowed()).toBe(true);
    });
    await withProviderNetworkPolicy({}, async () => {
      release();
      await expect(fetcher("http://10.0.0.2")).rejects.toThrow("private");
      await privateWork;
      expect(isPrivateNetworkAccessAllowed()).toBe(false);
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(getProviderNetworkPolicy()).toEqual({});
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "requires both runtime permission %s and provider opt-in %s for private fetch targets",
    async (permission, optIn) => {
      const transport = vi.fn<typeof fetch>(async () => new Response("ok"));
      const fetcher = createProviderFetch({
        fetch: transport,
        network: { allowPrivateNetwork: permission },
        allowPrivateNetwork: optIn ? isPrivateNetworkAccessAllowed : undefined,
      });
      if (permission && optIn) {
        await expect(fetcher("http://10.0.0.2")).resolves.toBeInstanceOf(Response);
        expect(transport).toHaveBeenCalledTimes(1);
      } else {
        await expect(fetcher("http://10.0.0.2")).rejects.toThrow("private");
        expect(transport).not.toHaveBeenCalled();
      }
      await expect(fetcher("http://169.254.169.254")).rejects.toThrow();
    },
  );

  it("retains injected trusted hosts when rewrapping transport and keeps downloads public-only", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("ok"));
    const trusted = createProviderFetch({
      fetch: transport,
      network: { trustedHosts: ["api.example.com"], allowPrivateNetwork: true },
    });
    const lookup = async () => [{ address: "10.0.0.2", family: 4 }];
    const fetcher = createGuardedFetch({ fetch: trusted, lookup });
    await expect(fetcher("https://api.example.com")).resolves.toBeInstanceOf(Response);
    await expect(fetcher("https://download.example.com")).rejects.toThrow("private");
    await expect(trusted("http://10.0.0.2")).rejects.toThrow("private");
    await expect(
      createGuardedFetch({ fetch: trusted, lookup, allowTrustedHosts: false })("https://api.example.com"),
    ).rejects.toThrow("private");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
