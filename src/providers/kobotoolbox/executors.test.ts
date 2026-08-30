import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";

describe("KoboToolbox credential validation", () => {
  afterEach(() => setPrivateNetworkAccessAllowed(false));

  it("validates credentials against an opted-in private instance", async () => {
    setPrivateNetworkAccessAllowed(true);

    const requests: string[] = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      requests.push(String(url));
      return Response.json({ username: "alice" });
    });

    const result = await credentialValidators.apiKey!(
      { apiKey: "kobo-token", values: { baseUrl: "https://10.0.0.5" } },
      // Guard the mock the way the runtime guards the injected fetcher, so the
      // test fails unless the validator opts private instances into egress.
      { fetcher: createProviderFetch({ fetch: fetchMock }) },
    );

    expect(requests).toEqual(["https://10.0.0.5/me/"]);
    expect(result).toMatchObject({ profile: { accountId: "kobotoolbox:10.0.0.5:alice" } });
  });

  it("rejects a private instance without the deployment opt-in", async () => {
    const fetchMock = vi.fn();

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "kobo-token", values: { baseUrl: "https://10.0.0.5" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }) },
      ),
    ).rejects.toThrow("baseUrl must not target private or reserved IP addresses");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the caller abort signal to the validation request", async () => {
    setPrivateNetworkAccessAllowed(true);

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return Response.json({ username: "alice" });
    });

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "kobo-token", values: { baseUrl: "https://10.0.0.5" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }), signal: AbortSignal.abort() },
      ),
    ).rejects.toThrow("KoboToolbox request timed out");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("maps a caller abort reason to the timeout error", async () => {
    setPrivateNetworkAccessAllowed(true);

    // A caller that aborts with its own reason makes fetch reject with that
    // reason object, whose name is not "AbortError".
    const signal = AbortSignal.abort(new Error("cancelled by caller"));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return Response.json({ username: "alice" });
    });

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "kobo-token", values: { baseUrl: "https://10.0.0.5" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }), signal },
      ),
    ).rejects.toThrow("KoboToolbox request timed out");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.reason).toBe(signal.reason);
  });

  it("rejects reserved metadata targets even with the deployment opt-in", async () => {
    setPrivateNetworkAccessAllowed(true);

    const fetchMock = vi.fn();

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "kobo-token", values: { baseUrl: "https://169.254.169.254" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }) },
      ),
    ).rejects.toThrow("baseUrl must not target private or reserved IP addresses");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
