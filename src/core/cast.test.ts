import { describe, expect, it } from "vitest";
import { base64Bytes, positiveInteger, readPath } from "./cast.ts";

describe("cast helpers", () => {
  it("decodes strict base64 bytes", () => {
    expect(Array.from(base64Bytes("aGVsbG8=", "payload"))).toEqual([104, 101, 108, 108, 111]);
  });

  it("rejects invalid base64 bytes", () => {
    expect(() => base64Bytes("not base64!", "payload")).toThrow("payload must be valid base64");
    expect(() => base64Bytes("", "payload")).toThrow("payload must be valid base64");
  });

  it("rejects zero for positive integer strings", () => {
    expect(() => positiveInteger("0", "page")).toThrow("page must be a positive integer");
  });

  it("accepts positive integer strings", () => {
    expect(positiveInteger("2", "page")).toBe(2);
  });
});

describe("readPath", () => {
  it("resolves a nested dot path", () => {
    expect(readPath({ test: { id: "abc" } }, "test.id")).toBe("abc");
  });

  it("resolves a top-level field", () => {
    expect(readPath({ requestId: "r1" }, "requestId")).toBe("r1");
  });

  it("returns undefined for a missing segment", () => {
    expect(readPath({ test: { id: "abc" } }, "test.missing")).toBeUndefined();
  });

  it("returns undefined when traversing through a non-object", () => {
    expect(readPath({ test: "abc" }, "test.id")).toBeUndefined();
  });

  it("returns undefined for null or non-object roots", () => {
    expect(readPath(null, "a.b")).toBeUndefined();
    expect(readPath("abc", "a")).toBeUndefined();
  });
});
