import { describe, expect, it } from "vitest";
import {
  createIdempotencyExpiry,
  hashActionRequest,
  hashIdempotencyKey,
  readIdempotencyKey,
} from "./action-idempotency.ts";

describe("action idempotency", () => {
  it("reads optional keys within the public byte limit", () => {
    expect(readIdempotencyKey(undefined)).toEqual({ ok: true, key: undefined });
    expect(readIdempotencyKey(" request-1 ")).toEqual({ ok: true, key: "request-1" });
    expect(readIdempotencyKey("x".repeat(255))).toEqual({ ok: true, key: "x".repeat(255) });
    expect(readIdempotencyKey(" ")).toEqual({
      ok: false,
      message: "Idempotency-Key must not be empty.",
    });
    expect(readIdempotencyKey("界".repeat(86))).toEqual({
      ok: false,
      message: "Idempotency-Key must not exceed 255 bytes.",
    });
  });

  it("canonicalizes action requests before hashing", () => {
    const left = hashActionRequest({
      actionId: "example.echo",
      connectionName: "work",
      input: { query: "hello", nested: { first: 1, second: 2, 界: 3, "!": 4 } },
    });
    const right = hashActionRequest({
      actionId: "example.echo",
      connectionName: "work",
      input: { nested: { "!": 4, 界: 3, second: 2, first: 1 }, query: "hello" },
    });

    expect(left).toBe(right);
    expect(left).not.toBe(
      hashActionRequest({
        actionId: "example.echo",
        connectionName: "personal",
        input: { query: "hello", nested: { first: 1, second: 2, 界: 3, "!": 4 } },
      }),
    );
    expect(hashIdempotencyKey("request-1")).not.toBe("request-1");
  });

  it("expires records 24 hours after the supplied time", () => {
    expect(createIdempotencyExpiry(new Date("2026-07-15T00:00:00.000Z"))).toBe("2026-07-16T00:00:00.000Z");
  });
});
