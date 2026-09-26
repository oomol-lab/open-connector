import { describe, expect, it } from "vitest";
import { readRetryAfterSeconds, withRetryAfterSeconds } from "./provider-runtime.ts";

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

  it.each(["", "soon", "-5", "1.5", "9007199254740993"])("ignores an unusable header %j", (value) => {
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
