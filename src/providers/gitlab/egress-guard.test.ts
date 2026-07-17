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

describe("GitLab validator egress guard", () => {
  it("rejects a public baseUrl that redirects validation to a metadata target", async () => {
    const calls = stubFetchSequence([
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    ]);

    await expect(
      credentialValidators.apiKey!(
        {
          apiKey: "glpat-test",
          values: { baseUrl: "https://gitlab.example.com" },
        },
        { fetcher: fetch },
      ),
    ).rejects.toThrow(/redirect location/u);
    expect(calls).toHaveLength(1);
  });

  it("still reaches a private baseUrl when the deployment allows private networks", async () => {
    setPrivateNetworkAccessAllowed(true);
    const calls = stubFetchSequence([
      new Response(JSON.stringify({ id: 7, username: "root", name: "Administrator" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]);

    const result = await credentialValidators.apiKey!(
      { apiKey: "glpat-test", values: { baseUrl: "http://10.0.0.5" } },
      { fetcher: fetch },
    );

    if (!result) {
      throw new Error("expected a validation result");
    }
    expect(calls[0]?.url).toBe("http://10.0.0.5/api/v4/user");
    expect(result.profile?.accountId).toBe("gitlab:10.0.0.5:7");
    expect(result.metadata?.apiBaseUrl).toBe("http://10.0.0.5/api/v4");
  });

  it("keeps the GitLab.com account id format for default connections", async () => {
    const calls = stubFetchSequence([
      new Response(JSON.stringify({ id: 42, username: "jane", name: "Jane" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]);

    const result = await credentialValidators.apiKey!({ apiKey: "glpat-test", values: {} }, { fetcher: fetch });

    if (!result) {
      throw new Error("expected a validation result");
    }
    expect(calls[0]?.url).toBe("https://gitlab.com/api/v4/user");
    expect(result.profile?.accountId).toBe("gitlab:42");
    expect(result.metadata?.apiBaseUrl).toBe("https://gitlab.com/api/v4");
  });
});
