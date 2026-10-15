import { describe, expect, it, vi } from "vitest";
import { arcmiraActionHandlers, validateArcmiraCredential } from "./runtime.ts";

describe("Arcmira", () => {
  it("encodes search filters and authenticates with the connected key", async () => {
    const fetcher = vi.fn(async () => Response.json({ query: "AI & video", chunks: [], returned: 0 }));
    const result = await arcmiraActionHandlers.search_transcripts(
      { q: "AI & video", by: "ent_42", limit: 3 },
      { apiKey: "test-key", fetcher },
    );
    expect(result).toEqual({ query: "AI & video", chunks: [], returned: 0 });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.arcmira.com/v1/search?q=AI+%26+video&by=ent_42&limit=3",
      expect.objectContaining({ headers: { Authorization: "Bearer test-key", Accept: "application/json" } }),
    );
  });

  it("preserves pending Premium jobs and explicit false flags without polling", async () => {
    const pending = { state: "pending", quality: "premium", video_id: "abcdefghijk", job: { next_poll_seconds: 10 } };
    const fetcher = vi.fn(async () => Response.json(pending, { status: 202 }));
    expect(
      await arcmiraActionHandlers.get_transcript(
        { video_id: "abcdefghijk", quality: "premium", retry: false, start: 0, end: 30 },
        { apiKey: "test-key", fetcher },
      ),
    ).toEqual(pending);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.arcmira.com/v1/transcripts/abcdefghijk?quality=premium&retry=false&start=0&end=30",
      expect.anything(),
    );
  });

  it("validates the account whose credits the key uses", async () => {
    const fetcher = async () =>
      Response.json({ user_id: "person", account: { id: "team", name: "Research" }, scopes: ["read"] });
    expect(await validateArcmiraCredential({ apiKey: "test-key", fetcher })).toEqual({
      accountId: "team",
      displayName: "Research",
      grantedScopes: ["read"],
    });
  });

  it.each([401, 403])("maps %i to a validation error only during connection", async (status) => {
    const fetcher = async () => Response.json({ error: { message: "Key refused" } }, { status });
    const context = { apiKey: "test-key", fetcher };
    await expect(validateArcmiraCredential(context)).rejects.toMatchObject({ status: 400, message: "Key refused" });
    await expect(arcmiraActionHandlers.get_account({}, context)).rejects.toMatchObject({
      status,
      message: "Key refused",
    });
  });

  it("preserves credit errors and rate-limit retry guidance", async () => {
    await expect(
      arcmiraActionHandlers.get_account(
        {},
        {
          apiKey: "test-key",
          fetcher: async () =>
            Response.json({ error: { code: "quota_exceeded", message: "Credit limit reached" } }, { status: 402 }),
        },
      ),
    ).rejects.toMatchObject({ status: 402, code: "insufficient_credit", message: "Credit limit reached" });
    await expect(
      arcmiraActionHandlers.get_account(
        {},
        {
          apiKey: "test-key",
          fetcher: async () =>
            Response.json({ error: { message: "Slow down" } }, { status: 429, headers: { "Retry-After": "12" } }),
        },
      ),
    ).rejects.toMatchObject({ status: 429, details: { retryAfterSeconds: 12 } });
  });
});
