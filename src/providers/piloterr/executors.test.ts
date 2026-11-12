import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Piloterr credential validation", () => {
  it.each([
    { upstreamStatus: 401, message: "Rate limit exceeded", expectedStatus: 429 },
    { upstreamStatus: 429, message: "Too many requests", expectedStatus: 429 },
    { upstreamStatus: 401, message: "Invalid API key", expectedStatus: 400 },
    { upstreamStatus: 403, message: "Access denied", expectedStatus: 400 },
  ])("maps $upstreamStatus $message to $expectedStatus", async ({ upstreamStatus, message, expectedStatus }) => {
    const payload = { message };
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: {} },
        { fetcher: async () => Response.json(payload, { status: upstreamStatus }) },
      ),
    ).rejects.toMatchObject({ status: expectedStatus, message, details: payload });
  });
});
