import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";

describe("Invoice Ninja credential validation", () => {
  afterEach(() => setPrivateNetworkAccessAllowed(false));

  it("validates credentials against an opted-in private instance", async () => {
    setPrivateNetworkAccessAllowed(true);

    const requests: Array<{ url: string; method?: string }> = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), method: init?.method });
      return Response.json({ data: { id: "company-1", settings: { name: "Private Ninja" } } });
    });

    const result = await credentialValidators.apiKey!(
      { apiKey: "invoice-token", values: { instanceUrl: "https://10.0.0.5" } },
      // Guard the mock the way the runtime guards the injected fetcher, so the
      // test fails unless the validator opts private instances into egress.
      { fetcher: createProviderFetch({ fetch: fetchMock }) },
    );

    expect(requests).toEqual([{ url: "https://10.0.0.5/api/v1/companies/current", method: "POST" }]);
    expect(result).toMatchObject({ profile: { accountId: "invoice_ninja:company-1", displayName: "Private Ninja" } });
  });

  it("rejects a private instance without the deployment opt-in", async () => {
    const fetchMock = vi.fn();

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "invoice-token", values: { instanceUrl: "https://10.0.0.5" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }) },
      ),
    ).rejects.toThrow("instanceUrl must not target private or reserved IP addresses");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the caller abort signal to the validation request", async () => {
    setPrivateNetworkAccessAllowed(true);

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return Response.json({ data: { id: "company-1" } });
    });

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "invoice-token", values: { instanceUrl: "https://10.0.0.5" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }), signal: AbortSignal.abort() },
      ),
    ).rejects.toThrow("Invoice Ninja request timed out");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("maps a caller abort reason to the timeout error", async () => {
    setPrivateNetworkAccessAllowed(true);

    // A caller that aborts with its own reason makes fetch reject with that
    // reason object, whose name is not "AbortError".
    const signal = AbortSignal.abort(new Error("cancelled by caller"));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return Response.json({ data: { id: "company-1" } });
    });

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "invoice-token", values: { instanceUrl: "https://10.0.0.5" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }), signal },
      ),
    ).rejects.toThrow("Invoice Ninja request timed out");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.reason).toBe(signal.reason);
  });
});
