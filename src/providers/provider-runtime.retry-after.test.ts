import { describe, expect, it } from "vitest";
import { readProviderErrorBody, readRetryAfterSeconds, withRetryAfterSeconds } from "./provider-runtime.ts";

const now = Date.parse("2026-09-26T10:00:00Z");

describe("readRetryAfterSeconds", () => {
  it("reads an integer delay verbatim", () => {
    expect(readRetryAfterSeconds(new Headers({ "Retry-After": "73" }), now)).toBe(73);
    expect(readRetryAfterSeconds(new Headers({ "retry-after": " 0 " }), now)).toBe(0);
  });

  it("reads an HTTP-date as the whole seconds until that instant, never negative", () => {
    expect(readRetryAfterSeconds(new Headers({ "Retry-After": "Sat, 26 Sep 2026 10:01:30 GMT" }), now)).toBe(90);
    expect(readRetryAfterSeconds(new Headers({ "Retry-After": "Sat, 26 Sep 2026 09:00:00 GMT" }), now)).toBe(0);
  });

  it.each(["Saturday, 26-Sep-26 10:01:30 GMT", "Sat Sep 26 10:01:30 2026"])(
    "reads the obsolete HTTP-date form %j as UTC",
    (value) => {
      expect(readRetryAfterSeconds(new Headers({ "Retry-After": value }), now)).toBe(90);
    },
  );

  it.each([
    "",
    "soon",
    "-5",
    "1.5",
    "9007199254740993",
    "wait 5",
    "2026-09-26T10:01:30Z",
    "Sat, 26 Sep 2026 10:01:30 +0800",
    "Sat, 26 Sep 2026",
  ])("ignores an unusable header %j", (value) => {
    expect(readRetryAfterSeconds(new Headers({ "Retry-After": value }), now)).toBeUndefined();
  });

  it("ignores a missing header", () => {
    expect(readRetryAfterSeconds(new Headers(), now)).toBeUndefined();
  });
});

describe("withRetryAfterSeconds", () => {
  it("attaches retryAfterSeconds to record details on a 429 and a 503", () => {
    for (const status of [429, 503]) {
      const response = new Response(null, { status, headers: { "Retry-After": "73" } });
      expect(withRetryAfterSeconds(response, { error: "ratelimited" })).toEqual({
        error: "ratelimited",
        retryAfterSeconds: 73,
      });
    }
  });

  it("builds the details record when the provider had none, and keeps a text body under body", () => {
    const response = new Response(null, { status: 429, headers: { "Retry-After": "73" } });
    expect(withRetryAfterSeconds(response)).toEqual({ retryAfterSeconds: 73 });
    expect(withRetryAfterSeconds(response, "slow down")).toEqual({ body: "slow down", retryAfterSeconds: 73 });
  });

  it("returns the details untouched on other statuses or without a usable header", () => {
    const details = { error: "not_found" };
    expect(withRetryAfterSeconds(new Response(null, { status: 404, headers: { "Retry-After": "73" } }), details)).toBe(
      details,
    );
    expect(withRetryAfterSeconds(new Response(null, { status: 429 }), details)).toBe(details);
    expect(withRetryAfterSeconds(new Response(null, { status: 429 }))).toBeUndefined();
  });
});

describe("readProviderErrorBody", () => {
  it.each([
    ['{"error":{"message":"slow down"}}', { error: { message: "slow down" } }],
    ["slow down", "slow down"],
    ["", {}],
  ])("reads JSON, plain text and empty error bodies: %j", async (body, expected) => {
    expect(await readProviderErrorBody(new Response(body as string, { status: 429 }), "Test")).toEqual(expected);
  });

  it("falls back without retaining an oversized error body", async () => {
    expect(await readProviderErrorBody(new Response("x".repeat(65 * 1024)), "Test")).toEqual({});
  });

  it("preserves the caller's cancellation reason while reading the body", async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream({ start() {} }));
    const reason = new Error("Cancelled by caller");
    const result = readProviderErrorBody(response, "Test", controller.signal);
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
  });
});
