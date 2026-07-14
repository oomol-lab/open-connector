import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators } from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

function stubFetchSequence(responses: Response[]): Array<{ url: string }> {
  const calls: Array<{ url: string }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    calls.push({ url: input instanceof Request ? input.url : String(input) });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected extra request");
    }
    return response;
  });
  return calls;
}

describe("Dokploy validator egress guard", () => {
  it("rejects a public baseUrl that redirects validation to a metadata target", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    ]);

    await expect(
      credentialValidators.apiKey!(
        { apiKey: "key", values: { baseUrl: "https://dokploy.example.com" } },
        { fetcher: fetch },
      ),
    ).rejects.toThrow(/redirect location/u);
    expect(calls).toHaveLength(1);
  });

  it("still reaches a private baseUrl when the deployment allows private networks", async () => {
    setPrivateNetworkAccessAllowed(true);
    const calls = stubFetchSequence([
      new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }),
    ]);

    const result = await credentialValidators.apiKey!(
      { apiKey: "key", values: { baseUrl: "http://10.0.0.5:3000" } },
      { fetcher: fetch },
    );

    expect(result).toBeTruthy();
    expect(calls[0]?.url).toContain("http://10.0.0.5:3000/api/project.search");
  });
});
