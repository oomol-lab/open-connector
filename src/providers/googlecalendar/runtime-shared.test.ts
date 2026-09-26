import { describe, expect, it } from "vitest";
import { googlecalendarApiBaseUrl, googlecalendarRequest } from "./runtime-shared.ts";

describe("googlecalendar rate limit details", () => {
  it("preserves Retry-After beside Google's error body on a 429", async () => {
    const fetcher = (async () =>
      Response.json(
        { error: { code: 429, message: "Rate Limit Exceeded", errors: [{ reason: "rateLimitExceeded" }] } },
        { status: 429, headers: { "Retry-After": "73" } },
      )) as typeof fetch;

    await expect(
      googlecalendarRequest(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
        accessToken: "google-calendar-access-token",
        fetcher,
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Rate Limit Exceeded",
      details: { error: { code: 429 }, retryAfterSeconds: 73 },
    });
  });

  it("leaves the details alone when the 429 carries no Retry-After", async () => {
    const fetcher = (async () =>
      Response.json({ error: { code: 429, message: "Rate Limit Exceeded" } }, { status: 429 })) as typeof fetch;

    await expect(
      googlecalendarRequest(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
        accessToken: "google-calendar-access-token",
        fetcher,
      }),
    ).rejects.toMatchObject({ status: 429, details: { error: { code: 429 } } });
    await expect(
      googlecalendarRequest(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
        accessToken: "google-calendar-access-token",
        fetcher,
      }),
    ).rejects.not.toHaveProperty("details.retryAfterSeconds");
  });
});
