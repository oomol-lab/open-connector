import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Verbatim `lookup(hostname, { all: true })` output captured from workerd
 * (nodejs_compat, compatibility date 2026-07-02). workerd resolves over DoH and
 * maps every answer record into an entry without filtering by record type, so a
 * CNAME answer arrives with the CNAME target hostname in `address`, alongside the
 * host's real A/AAAA records.
 */
const workerdResults: Record<string, Array<{ address: string; family: number }>> = {
  "api.tailscale.com": [
    { address: "controlplane.tailscale.com.", family: 4 },
    { address: "192.200.0.108", family: 4 },
    { address: "controlplane.tailscale.com.", family: 6 },
    { address: "2606:b740:49::115", family: 6 },
  ],
  // A CNAME'd host whose real record still points at the metadata endpoint: the
  // CNAME entry must not be what decides this, the address must.
  "metadata.attacker.com": [
    { address: "origin.attacker.com.", family: 4 },
    { address: "169.254.169.254", family: 4 },
  ],
  // A CNAME chain that resolves to no address at all. Filtering leaves nothing to
  // check, so the guard must reject rather than pass vacuously.
  "dangling.attacker.com": [
    { address: "nowhere.attacker.com.", family: 4 },
    { address: "nowhere.attacker.com.", family: 6 },
  ],
  "empty.attacker.com": [],
};

async function loadGuardedFetchWithNodeDns(): Promise<typeof import("./guarded-fetch.ts")> {
  vi.resetModules();
  vi.doMock("node:dns/promises", () => ({
    lookup: async (hostname: string) => workerdResults[hostname] ?? [],
  }));
  const module = await import("./guarded-fetch.ts");
  // vitest.setup.ts disables the module default for the whole suite; restore the
  // automatic `node:dns` default so these cases exercise the real adapter.
  module.setDefaultGuardedFetchDnsLookup(undefined);
  return module;
}

afterEach(() => {
  vi.doUnmock("node:dns/promises");
  vi.resetModules();
});

describe("default node:dns lookup adapter", () => {
  it("ignores the CNAME entries workerd reports as addresses and allows the host's real addresses", async () => {
    const { createGuardedFetch } = await loadGuardedFetchWithNodeDns();
    const transport = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const guarded = createGuardedFetch({ fetch: transport });

    const response = await guarded("https://api.tailscale.com/api/v2/oauth/token");

    expect(await response.text()).toBe("ok");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("still rejects a CNAME'd hostname whose resolved address is reserved", async () => {
    const { createGuardedFetch } = await loadGuardedFetchWithNodeDns();
    const transport = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const guarded = createGuardedFetch({ fetch: transport });

    await expect(guarded("http://metadata.attacker.com/latest/meta-data/")).rejects.toThrow(
      "request URL must not resolve to private or reserved IP addresses",
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails closed when filtering leaves no address to validate", async () => {
    const { createGuardedFetch } = await loadGuardedFetchWithNodeDns();
    const transport = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const guarded = createGuardedFetch({ fetch: transport });

    // Passing an empty list to the check would allow the request vacuously, so a
    // resolver answering with only CNAMEs must not be a way to skip validation.
    for (const host of ["dangling.attacker.com", "empty.attacker.com"]) {
      await expect(guarded(`https://${host}/`)).rejects.toThrow("request URL could not be resolved for validation");
    }
    expect(transport).not.toHaveBeenCalled();
  });
});
