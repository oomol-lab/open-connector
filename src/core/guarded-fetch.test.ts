import type { GuardedFetchDnsLookup } from "./guarded-fetch.ts";

import { describe, expect, it, vi } from "vitest";
import { createGuardedFetch, unwrapGuardedFetch } from "./guarded-fetch.ts";

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
  request: Request | undefined;
}

function createTransport(responses: Response[]): { transport: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const transport = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      init,
      request: input instanceof Request ? input : undefined,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error("transport received an unexpected extra request");
    }
    return response;
  }) as typeof fetch;
  return { transport, calls };
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function lookupTable(entries: Record<string, Array<{ address: string; family: number }>>): GuardedFetchDnsLookup {
  return async (hostname: string) => {
    const result = entries[hostname];
    if (!result) {
      throw new Error(`no lookup entry for ${hostname}`);
    }
    return result;
  };
}

describe("createGuardedFetch redirects", () => {
  it("follows public redirects with manual hops and returns the final response", async () => {
    const { transport, calls } = createTransport([
      redirectTo("https://cdn.example.net/file"),
      new Response("payload", { status: 200 }),
    ]);
    const guarded = createGuardedFetch({ fetch: transport });

    const response = await guarded("https://api.example.com/download", { headers: { accept: "text/plain" } });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("payload");
    expect(calls.map((call) => call.url)).toEqual(["https://api.example.com/download", "https://cdn.example.net/file"]);
    expect(calls.every((call) => call.init?.redirect === "manual")).toBe(true);
  });

  it("resolves relative redirect locations against the current URL", async () => {
    const { transport, calls } = createTransport([redirectTo("/v2/download"), new Response("ok", { status: 200 })]);
    const guarded = createGuardedFetch({ fetch: transport });

    await guarded("https://api.example.com/v1/download");

    expect(calls[1]?.url).toBe("https://api.example.com/v2/download");
  });

  it("blocks redirects to metadata, loopback, link-local, and private targets by default", async () => {
    for (const location of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8080/admin",
      "http://localhost:3000/",
      "http://10.0.0.5/internal",
      "http://metadata.google.internal/computeMetadata/v1/",
      "https://[::1]/",
    ]) {
      const { transport, calls } = createTransport([redirectTo(location)]);
      const guarded = createGuardedFetch({ fetch: transport });

      await expect(guarded("https://attacker.example.com/api")).rejects.toThrow(/redirect location/u);
      expect(calls).toHaveLength(1);
    }
  });

  it("keeps reserved targets blocked on redirects even when private networks are allowed", async () => {
    const { transport, calls } = createTransport([redirectTo("http://169.254.169.254/latest/meta-data/")]);
    const guarded = createGuardedFetch({ fetch: transport, allowPrivateNetwork: () => true });

    await expect(guarded("https://attacker.example.com/api")).rejects.toThrow(/redirect location/u);
    expect(calls).toHaveLength(1);
  });

  it("allows private redirect targets when the caller opted into private networks", async () => {
    const { transport, calls } = createTransport([
      redirectTo("http://10.0.0.5:3000/api"),
      new Response("ok", { status: 200 }),
    ]);
    const guarded = createGuardedFetch({ fetch: transport, allowPrivateNetwork: () => true });

    const response = await guarded("https://dokploy.example.com/api");

    expect(response.status).toBe(200);
    expect(calls[1]?.url).toBe("http://10.0.0.5:3000/api");
  });

  it("rejects non-http redirect schemes", async () => {
    const { transport } = createTransport([redirectTo("ftp://files.example.com/x")]);
    const guarded = createGuardedFetch({ fetch: transport });

    await expect(guarded("https://api.example.com/")).rejects.toThrow(/redirect location/u);
  });

  it("fails after too many redirect hops", async () => {
    const { transport, calls } = createTransport([
      redirectTo("https://api.example.com/1"),
      redirectTo("https://api.example.com/2"),
      redirectTo("https://api.example.com/3"),
    ]);
    const guarded = createGuardedFetch({ fetch: transport, maxRedirects: 2 });

    await expect(guarded("https://api.example.com/0")).rejects.toThrow("redirected too many times");
    expect(calls).toHaveLength(3);
  });

  it("follows a long public redirect chain by default (parity with native follow)", async () => {
    // Previously provider egress used native redirect:"follow" (up to ~20 hops);
    // the default must not fail a legitimate 6-hop CDN/signed-URL chain.
    const responses = [];
    for (let i = 1; i <= 6; i++) {
      responses.push(redirectTo(`https://cdn.example.net/${i}`));
    }
    responses.push(new Response("payload", { status: 200 }));
    const { transport, calls } = createTransport(responses);
    const guarded = createGuardedFetch({ fetch: transport });

    const response = await guarded("https://api.example.com/download");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(7);
  });

  it("returns redirect responses without a location header unchanged", async () => {
    const { transport } = createTransport([new Response(null, { status: 302 })]);
    const guarded = createGuardedFetch({ fetch: transport });

    const response = await guarded("https://api.example.com/");

    expect(response.status).toBe(302);
  });

  it("rewrites POST to GET and drops the body on 301, 302, and 303 redirects", async () => {
    for (const status of [301, 302, 303]) {
      const { transport, calls } = createTransport([
        redirectTo("https://api.example.com/next", status),
        new Response("ok", { status: 200 }),
      ]);
      const guarded = createGuardedFetch({ fetch: transport });

      await guarded("https://api.example.com/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a: 1 }),
      });

      expect(calls[1]?.init?.method).toBe("GET");
      expect(calls[1]?.init?.body).toBeUndefined();
      expect(new Headers(calls[1]?.init?.headers).has("content-type")).toBe(false);
    }
  });

  it("preserves method and body on 307 and 308 redirects", async () => {
    for (const status of [307, 308]) {
      const { transport, calls } = createTransport([
        redirectTo("https://api.example.com/next", status),
        new Response("ok", { status: 200 }),
      ]);
      const guarded = createGuardedFetch({ fetch: transport });

      await guarded("https://api.example.com/create", { method: "POST", body: "payload" });

      expect(calls[1]?.init?.method).toBe("POST");
      expect(calls[1]?.init?.body).toBe("payload");
    }
  });

  it("keeps non-POST methods on 301 and 302 redirects", async () => {
    const { transport, calls } = createTransport([
      redirectTo("https://api.example.com/next", 301),
      new Response("ok", { status: 200 }),
    ]);
    const guarded = createGuardedFetch({ fetch: transport });

    await guarded("https://api.example.com/item", { method: "DELETE" });

    expect(calls[1]?.init?.method).toBe("DELETE");
  });

  it("strips credential headers on cross-origin redirects and keeps them same-origin", async () => {
    const { transport, calls } = createTransport([
      redirectTo("https://api.example.com/moved"),
      redirectTo("https://other.example.net/away"),
      new Response("ok", { status: 200 }),
    ]);
    const guarded = createGuardedFetch({ fetch: transport });

    await guarded("https://api.example.com/", {
      headers: {
        authorization: "Bearer secret",
        cookie: "sid=1",
        "x-api-key": "provider-secret",
        "x-auth-token": "tok",
        "x-trace": "keep",
      },
    });

    const sameOriginHeaders = new Headers(calls[1]?.init?.headers);
    expect(sameOriginHeaders.get("authorization")).toBe("Bearer secret");
    expect(sameOriginHeaders.get("x-api-key")).toBe("provider-secret");
    const crossOriginHeaders = new Headers(calls[2]?.init?.headers);
    expect(crossOriginHeaders.has("authorization")).toBe(false);
    expect(crossOriginHeaders.has("cookie")).toBe(false);
    expect(crossOriginHeaders.has("x-api-key")).toBe(false);
    expect(crossOriginHeaders.has("x-auth-token")).toBe(false);
    expect(crossOriginHeaders.get("x-trace")).toBe("keep");
  });

  it("passes through when the caller handles redirects manually", async () => {
    const { transport, calls } = createTransport([redirectTo("http://169.254.169.254/")]);
    const guarded = createGuardedFetch({ fetch: transport });

    const response = await guarded("https://api.example.com/", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe("manual");
  });

  it("passes redirect error mode through to the transport", async () => {
    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    const guarded = createGuardedFetch({ fetch: transport });

    await guarded("https://api.example.com/", { redirect: "error" });

    expect(calls[0]?.init?.redirect).toBe("error");
  });
});

describe("createGuardedFetch request URL guard", () => {
  it("blocks unsafe initial URLs before any request is issued", async () => {
    const { transport, calls } = createTransport([]);
    const guarded = createGuardedFetch({ fetch: transport });

    for (const url of ["http://127.0.0.1/", "http://169.254.169.254/", "http://10.0.0.5/", "file:///etc/passwd"]) {
      await expect(guarded(url)).rejects.toThrow(/request URL/u);
    }
    expect(calls).toHaveLength(0);
  });

  it("uses the caller error factory for guard violations", async () => {
    class PolicyError extends Error {}
    const { transport } = createTransport([]);
    const guarded = createGuardedFetch({ fetch: transport, createError: (message) => new PolicyError(message) });

    await expect(guarded("http://127.0.0.1/")).rejects.toBeInstanceOf(PolicyError);
  });

  it("resolves the global fetch per call so test stubs apply", async () => {
    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    vi.stubGlobal("fetch", transport);
    try {
      const guarded = createGuardedFetch();
      await guarded("https://api.example.com/");
      expect(calls).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createGuardedFetch resolved-address validation", () => {
  it("blocks hostnames resolving to reserved or metadata addresses", async () => {
    const { transport, calls } = createTransport([]);
    const guarded = createGuardedFetch({
      fetch: transport,
      lookup: lookupTable({ "metadata.attacker.com": [{ address: "169.254.169.254", family: 4 }] }),
    });

    await expect(guarded("http://metadata.attacker.com/latest/meta-data/")).rejects.toThrow(
      "request URL must not resolve to private or reserved IP addresses",
    );
    expect(calls).toHaveLength(0);
  });

  it("blocks hostnames resolving to private addresses unless private networks are allowed", async () => {
    const entries = { "internal.attacker.com": [{ address: "10.0.0.5", family: 4 }] };
    const blocked = createGuardedFetch({ fetch: createTransport([]).transport, lookup: lookupTable(entries) });
    await expect(blocked("http://internal.attacker.com/")).rejects.toThrow(/must not resolve/u);

    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    const allowed = createGuardedFetch({
      fetch: transport,
      lookup: lookupTable(entries),
      allowPrivateNetwork: () => true,
    });
    await allowed("http://internal.attacker.com/");
    expect(calls).toHaveLength(1);
  });

  it("blocks IPv6 loopback, unique-local, and v4-embedded reserved lookup results", async () => {
    for (const address of ["::1", "fd00::1", "::ffff:169.254.169.254", "fe80::1"]) {
      const guarded = createGuardedFetch({
        fetch: createTransport([]).transport,
        lookup: lookupTable({ "host.example.com": [{ address, family: 6 }] }),
      });
      await expect(guarded("https://host.example.com/")).rejects.toThrow(/must not resolve/u);
    }
  });

  it("rejects when any resolved address is blocked even if others are public", async () => {
    const guarded = createGuardedFetch({
      fetch: createTransport([]).transport,
      lookup: lookupTable({
        "rebind.example.com": [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      }),
    });

    await expect(guarded("https://rebind.example.com/")).rejects.toThrow(/must not resolve/u);
  });

  it("allows hostnames resolving to public addresses", async () => {
    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    const guarded = createGuardedFetch({
      fetch: transport,
      lookup: lookupTable({
        "api.example.com": [
          { address: "93.184.216.34", family: 4 },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ],
      }),
    });

    await guarded("https://api.example.com/");
    expect(calls).toHaveLength(1);
  });

  it("skips DNS resolution for canonical IPv4 literals already validated by the URL guard", async () => {
    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    const guarded = createGuardedFetch({
      fetch: transport,
      lookup: async (hostname) => {
        throw new Error(`lookup must not run for literal ${hostname}`);
      },
    });

    await guarded("https://93.184.216.34/");
    expect(calls).toHaveLength(1);
  });

  it("skips the resolved-address check when skipDnsValidation is set", async () => {
    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    const guarded = createGuardedFetch({
      fetch: transport,
      skipDnsValidation: true,
      lookup: () => {
        throw new Error("lookup must not run when skipDnsValidation is set");
      },
    });

    await guarded("https://api.example.com/");
    expect(calls).toHaveLength(1);
  });

  it("still validates the request URL and redirects when skipDnsValidation is set", async () => {
    const { transport, calls } = createTransport([redirectTo("http://169.254.169.254/latest/meta-data/")]);
    const guarded = createGuardedFetch({ fetch: transport, skipDnsValidation: true });

    // URL literal + redirect Location guards still run; only the DNS check is skipped.
    await expect(guarded("https://api.example.com/")).rejects.toThrow(/redirect location/u);
    await expect(guarded("http://127.0.0.1/")).rejects.toThrow(/request URL/u);
    expect(calls).toHaveLength(1);
  });

  it("fails closed and does not call the transport when an enabled lookup fails", async () => {
    const { transport, calls } = createTransport([]);
    const guarded = createGuardedFetch({
      fetch: transport,
      lookup: async () => {
        throw new Error("ENOTFOUND");
      },
    });

    await expect(guarded("https://unresolvable.example.com/")).rejects.toThrow(/could not be resolved/u);
    expect(calls).toHaveLength(0);
  });

  it("re-validates resolved addresses for every redirect hop", async () => {
    const { transport, calls } = createTransport([redirectTo("https://metadata.attacker.com/creds")]);
    const guarded = createGuardedFetch({
      fetch: transport,
      lookup: lookupTable({
        "api.example.com": [{ address: "93.184.216.34", family: 4 }],
        "metadata.attacker.com": [{ address: "169.254.169.254", family: 4 }],
      }),
    });

    await expect(guarded("https://api.example.com/")).rejects.toThrow(
      "redirect location must not resolve to private or reserved IP addresses",
    );
    expect(calls).toHaveLength(1);
  });

  it("validates resolved addresses before manual-redirect passthrough requests", async () => {
    const { transport, calls } = createTransport([]);
    const guarded = createGuardedFetch({
      fetch: transport,
      lookup: lookupTable({ "metadata.attacker.com": [{ address: "169.254.169.254", family: 4 }] }),
    });

    await expect(guarded("http://metadata.attacker.com/", { redirect: "manual" })).rejects.toThrow(/must not resolve/u);
    expect(calls).toHaveLength(0);
  });
});

describe("unwrapGuardedFetch", () => {
  it("lets a private-network guard replace a public-only guard instead of stacking", async () => {
    const { transport, calls } = createTransport([new Response("ok", { status: 200 })]);
    const publicOnly = createGuardedFetch({ fetch: transport });
    const privateAllowed = createGuardedFetch({ fetch: publicOnly, allowPrivateNetwork: () => true });

    const response = await privateAllowed("http://10.0.0.2:3000/api");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("returns non-guarded fetchers unchanged", () => {
    const { transport } = createTransport([]);
    expect(unwrapGuardedFetch(transport)).toBe(transport);
    expect(unwrapGuardedFetch(undefined)).toBeUndefined();
  });
});
