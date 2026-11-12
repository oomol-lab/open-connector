import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { credentialValidators, mailveriActionHandlers } from "./executors.ts";

const verifyEmail = (fetcher: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) =>
  mailveriActionHandlers.verify_email({ email: "jane.doe@example.com" }, { apiKey: "test-key", fetcher });

describe("MailVeri verify_email", () => {
  it("posts the email with a Bearer key and returns the normalized result", async () => {
    const result = await verifyEmail(async (url, init) => {
      expect(url.toString()).toBe("https://api.mailveri.com/v1/verify-mail/");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      expect(JSON.parse(String(init?.body))).toEqual({ email: "jane.doe@example.com" });
      return Response.json({
        error: 0,
        message: "Verified jane.doe@example.com successfully",
        status: "CATCH_ALL",
        email: "jane.doe@example.com",
        mail: "jane.doe@example.com",
        balance: 4999,
        credits_used: 1,
        quality_score: 61,
        is_forwarding: false,
      });
    });

    expect(result).toEqual({
      status: "CATCH_ALL",
      email: "jane.doe@example.com",
      message: "Verified jane.doe@example.com successfully",
      quality_score: 61,
      is_forwarding: false,
      credits_used: 1,
      balance: 4999,
    });
  });

  it("returns UNKNOWN results instead of raising", async () => {
    const result = await verifyEmail(async () =>
      Response.json({ error: 0, status: "UNKNOWN", email: "jane.doe@example.com", credits_used: 0, balance: 5000 }),
    );
    expect(result).toMatchObject({ status: "UNKNOWN", credits_used: 0 });
  });

  it.each([
    { error: 2, message: "Not enough credits", status: 402, code: "insufficient_credit" },
    { error: 3, message: "Wrong email syntax", status: 400, code: undefined },
  ])("maps HTTP 200 error $error to $status", async ({ error, message, status, code }) => {
    await expect(verifyEmail(async () => Response.json({ error, message }))).rejects.toMatchObject({
      status,
      message,
      code,
    });
  });

  it.each([
    { upstreamStatus: 403, expectedStatus: 401 },
    { upstreamStatus: 429, expectedStatus: 429 },
  ])("maps HTTP $upstreamStatus to $expectedStatus", async ({ upstreamStatus, expectedStatus }) => {
    await expect(
      verifyEmail(async () => new Response("API 403: Forbidden", { status: upstreamStatus })),
    ).rejects.toMatchObject({ status: expectedStatus });
  });
});

describe("MailVeri request failures", () => {
  it("keeps a ProviderRequestError raised by the shared fetcher", async () => {
    const admission = new ProviderRequestError(429, "Too many requests in flight", undefined, "rate_limited");
    await expect(
      verifyEmail(async () => {
        throw admission;
      }),
    ).rejects.toBe(admission);
  });

  it("maps a network failure to 502", async () => {
    await expect(
      verifyEmail(async () => {
        throw new TypeError("fetch failed");
      }),
    ).rejects.toMatchObject({ status: 502, message: "MailVeri request failed: fetch failed" });
  });
});

describe("MailVeri get_balance", () => {
  it("reads the free balance endpoint", async () => {
    const result = await mailveriActionHandlers.get_balance(
      {},
      {
        apiKey: "test-key",
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.mailveri.com/v1/get-balance/");
          expect(init?.method).toBe("GET");
          return Response.json({ error: 0, message: "You have 5000 credits", balance: 5000 });
        },
      },
    );
    expect(result).toEqual({ balance: 5000, message: "You have 5000 credits" });
  });
});

describe("MailVeri credential validation", () => {
  it("validates the key against the balance endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "test-key", values: {} },
      { fetcher: async () => Response.json({ error: 0, message: "You have 5000 credits", balance: 5000 }) },
    );
    expect(result).toMatchObject({
      profile: { displayName: "MailVeri API Key" },
      metadata: { validationEndpoint: "/v1/get-balance/", balance: 5000 },
    });
    expect(result?.profile?.accountId).toMatch(/^mailveri:api_key:[0-9a-f]{16}$/);
  });

  it("rejects a balance response without a balance", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "test-key", values: {} },
        { fetcher: async () => Response.json({ error: 0, message: "ok" }) },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("maps a rejected key to a field error", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "revoked-key", values: {} },
        { fetcher: async () => new Response("API 403: Forbidden", { status: 403 }) },
      ),
    ).rejects.toMatchObject({ status: 400, message: "API 403: Forbidden" });
  });
});
