import { describe, expect, it } from "vitest";
import {
  actionInputMaxDepth,
  ActionInputDepthError,
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
    expect(left).toBe("dbs9TrhPtVXlhZLp9sqNAryjv1DwdBfOX_QaOzR01KA");
    expect(left).not.toBe(
      hashActionRequest({
        actionId: "example.echo",
        connectionName: "personal",
        input: { query: "hello", nested: { first: 1, second: 2, 界: 3, "!": 4 } },
      }),
    );
    expect(hashIdempotencyKey("request-1")).not.toBe("request-1");
  });

  it("binds stored-token requests without changing unscoped fingerprints", () => {
    const request = {
      actionId: "example.echo",
      connectionName: "default",
      input: { message: "hello" },
    };
    const unscoped = hashActionRequest(request);

    expect(hashActionRequest({ ...request, runtimeTokenId: undefined })).toBe(unscoped);
    expect(hashActionRequest({ ...request, runtimeTokenId: "token-a" })).not.toBe(unscoped);
    expect(hashActionRequest({ ...request, runtimeTokenId: "token-a" })).not.toBe(
      hashActionRequest({ ...request, runtimeTokenId: "token-b" }),
    );
  });

  it("rejects action inputs beyond the fingerprint depth limit", () => {
    expect(() =>
      hashActionRequest({
        actionId: "example.echo",
        connectionName: "default",
        input: nestedInput(actionInputMaxDepth),
      }),
    ).not.toThrow();

    const hashTooDeepInput = () =>
      hashActionRequest({
        actionId: "example.echo",
        connectionName: "default",
        input: nestedInput(actionInputMaxDepth + 1),
      });
    expect(hashTooDeepInput).toThrow(ActionInputDepthError);
    expect(hashTooDeepInput).toThrow(
      `Action input must not exceed an object/array nesting depth of ${actionInputMaxDepth} levels when Idempotency-Key is provided.`,
    );
  });

  it("expires records 24 hours after the supplied time", () => {
    expect(createIdempotencyExpiry(new Date("2026-07-15T00:00:00.000Z"))).toBe("2026-07-16T00:00:00.000Z");
  });
});

function nestedInput(depth: number): unknown {
  let value: unknown = "leaf";
  for (let index = 0; index < depth; index += 1) {
    value = index % 2 === 0 ? { value } : [value];
  }
  return value;
}
