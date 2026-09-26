import { describe, expect, it } from "vitest";
import { granolaActionHandlers } from "./runtime.ts";

describe("Granola rate limit details", () => {
  it("preserves Retry-After on a 429", async () => {
    const fetcher = (async () =>
      Response.json(
        { message: "Too many requests" },
        { status: 429, headers: { "Retry-After": "73" } },
      )) as typeof fetch;

    await expect(
      granolaActionHandlers.get_note({ note_id: "note-1" }, { apiKey: "granola_api_key", fetcher }),
    ).rejects.toMatchObject({ status: 429, message: "Too many requests", details: { retryAfterSeconds: 73 } });
  });

  it("reads an HTTP-date Retry-After as seconds from now", async () => {
    const retryAt = new Date(Date.now() + 120_000).toUTCString();
    const fetcher = (async () =>
      Response.json(
        { message: "Too many requests" },
        { status: 429, headers: { "Retry-After": retryAt } },
      )) as typeof fetch;

    const error = await granolaActionHandlers
      .get_note({ note_id: "note-1" }, { apiKey: "granola_api_key", fetcher })
      .then(
        () => undefined,
        (reason: unknown) => reason as { details?: { retryAfterSeconds?: number } },
      );
    const seconds = error?.details?.retryAfterSeconds;
    expect(seconds).toBeGreaterThanOrEqual(118);
    expect(seconds).toBeLessThanOrEqual(120);
  });
});
