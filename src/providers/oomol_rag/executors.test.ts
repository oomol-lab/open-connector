import { describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

describe("OOMOL RAG connection boundary", () => {
  it("validates the API key against the configured team without writing an article", async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://knowledge-base.oomol.com/v1/articles?limit=1");
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-key");
      expect(headers.get("x-oo-team-id")).toBe("team-1");
      return Response.json({ items: [], next_cursor: "" });
    });
    const result = await credentialValidators.apiKey!(
      { apiKey: "test-key", values: { teamId: "team-1" } },
      { fetcher: fetcher as typeof fetch },
    );
    expect(result?.metadata).toEqual({ teamId: "team-1" });
  });

  it("rejects missing team scope before a request is sent", async () => {
    const fetcher = vi.fn();
    await expect(
      credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher: fetcher as typeof fetch }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
    const result = await executors["oomol_rag.create_article"]!(
      { articleId: "a1", title: "Draft" },
      {
        async getCredential() {
          return {
            authType: "api_key",
            apiKey: "test-key",
            values: {},
            profile: { accountId: "test", displayName: "Test", grantedScopes: [] },
            metadata: {},
          };
        },
      },
    );
    expect(result.ok).toBe(false);
  });

  it.each([401, 403, 429])("preserves a non-JSON upstream rejection with status %s", async (status) => {
    const fetcher = vi.fn(async () => new Response("<html>Request rejected</html>", { status }));
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: { teamId: "team-1" } },
        { fetcher: fetcher as typeof fetch },
      ),
    ).rejects.toMatchObject({ status });
  });

  it("still rejects malformed JSON on a successful response", async () => {
    const fetcher = vi.fn(async () => new Response("not json", { status: 200 }));
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: { teamId: "team-1" } },
        { fetcher: fetcher as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("preserves denied team access without leaking a credential echoed upstream", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: "denied test-key" }, { status: 403 }));
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: { teamId: "team-1" } },
        { fetcher: fetcher as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 403, message: "denied [REDACTED]" });
  });
});
