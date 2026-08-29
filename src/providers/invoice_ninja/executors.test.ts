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
});
