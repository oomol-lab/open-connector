import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";

describe("Mautic credential validation", () => {
  afterEach(() => setPrivateNetworkAccessAllowed(false));

  it("validates credentials against an opted-in private instance", async () => {
    setPrivateNetworkAccessAllowed(true);

    const requests: string[] = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      requests.push(String(url));
      return Response.json({ user: { id: 1, username: "admin" } });
    });

    const result = await credentialValidators.customCredential!(
      { values: { baseUrl: "https://10.0.0.5", username: "admin", password: "secret" } },
      // Guard the mock the way the runtime guards the injected fetcher, so the
      // test fails unless the validator opts private instances into egress.
      { fetcher: createProviderFetch({ fetch: fetchMock }) },
    );

    expect(requests).toEqual(["https://10.0.0.5/api/users/self"]);
    expect(result).toMatchObject({ profile: { accountId: "mautic:https://10.0.0.5/api/:1" } });
  });

  it("rejects a private instance without the deployment opt-in", async () => {
    const fetchMock = vi.fn();

    await expect(
      credentialValidators.customCredential!(
        { values: { baseUrl: "https://10.0.0.5", username: "admin", password: "secret" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }) },
      ),
    ).rejects.toThrow("baseUrl must not target private or reserved IP addresses");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the caller abort signal to the validation request", async () => {
    setPrivateNetworkAccessAllowed(true);

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return Response.json({ user: { id: 1, username: "admin" } });
    });

    await expect(
      credentialValidators.customCredential!(
        { values: { baseUrl: "https://10.0.0.5", username: "admin", password: "secret" } },
        { fetcher: createProviderFetch({ fetch: fetchMock }), signal: AbortSignal.abort() },
      ),
    ).rejects.toThrow("Mautic request timed out");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
