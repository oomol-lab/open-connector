import { describe, expect, it } from "vitest";
import { base64Bytes, positiveInteger, requiredStringArray } from "./cast.ts";

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

  it("reads an array containing only strings", () => {
    expect(requiredStringArray(["one", "two"], "values")).toEqual(["one", "two"]);
  });

  it("rejects non-string array items", () => {
    expect(() => requiredStringArray(["one", 2], "values")).toThrow("values must be an array of strings");
  });
});
