import { describe, expect, it } from "vitest";
import {
  base64Bytes,
  booleanString,
  looseArray,
  optionalIntegerOrNull,
  optionalStringArray,
  positiveInteger,
  rawStringOrNull,
  recordOrEmpty,
  requiredBoolean,
  requiredRawString,
  requiredStringArray,
} from "./cast.ts";

describe("cast helpers", () => {
  it("decodes strict base64 bytes", () => {
    expect(Array.from(base64Bytes("aGVsbG8=", "payload"))).toEqual([104, 101, 108, 108, 111]);
  });

  it("rejects invalid base64 bytes", () => {
    expect(() => base64Bytes("not base64!", "payload")).toThrow("payload must be valid base64");
    expect(() => base64Bytes("", "payload")).toThrow("payload must be valid base64");
  });

  it("reports a blank optional integer as missing instead of zero", () => {
    expect(optionalIntegerOrNull("")).toBeNull();
    expect(optionalIntegerOrNull("   ")).toBeNull();
    expect(optionalIntegerOrNull("\n")).toBeNull();
  });

  it("still reads optional integers that are present", () => {
    expect(optionalIntegerOrNull("2")).toBe(2);
    expect(optionalIntegerOrNull(" 2 ")).toBe(2);
    expect(optionalIntegerOrNull(0)).toBe(0);
    expect(optionalIntegerOrNull("0")).toBe(0);
    expect(optionalIntegerOrNull("2.5")).toBeNull();
  });

  it("rejects zero for positive integer strings", () => {
    expect(() => positiveInteger("0", "page")).toThrow("page must be a positive integer");
  });

  it("accepts positive integer strings", () => {
    expect(positiveInteger("2", "page")).toBe(2);
  });

  it("requires a raw string without trimming or rejecting an empty value", () => {
    expect(requiredRawString("  value  ", "value")).toBe("  value  ");
    expect(requiredRawString("", "value")).toBe("");
    expect(() => requiredRawString(1, "value")).toThrow("value must be a string");
  });

  it("requires a boolean without coercion", () => {
    expect(requiredBoolean(false, "enabled")).toBe(false);
    expect(() => requiredBoolean(0, "enabled")).toThrow("enabled must be a boolean");
  });

  it("reads an array containing only strings", () => {
    expect(requiredStringArray(["one", "two"], "values")).toEqual(["one", "two"]);
  });

  it("rejects non-string array items", () => {
    expect(() => requiredStringArray(["one", 2], "values")).toThrow("values must be an array of strings");
  });

  it("optionally reads arrays containing only strings", () => {
    const values = ["one", "two"];

    expect(optionalStringArray(values)).toBe(values);
    expect(optionalStringArray([])).toEqual([]);
    expect(optionalStringArray(["one", 2])).toBeUndefined();
    expect(optionalStringArray(undefined)).toBeUndefined();
  });

  it("reads loose arrays, raw string-or-null, record-or-empty and boolean strings", () => {
    expect(looseArray([1, "a"])).toEqual([1, "a"]);
    expect(looseArray("a")).toEqual([]);
    expect(looseArray(undefined)).toEqual([]);

    expect(rawStringOrNull(" x ")).toBe(" x ");
    expect(rawStringOrNull("")).toBe("");
    expect(rawStringOrNull(1)).toBeNull();
    expect(rawStringOrNull(undefined)).toBeNull();

    expect(recordOrEmpty({ a: 1 })).toEqual({ a: 1 });
    expect(recordOrEmpty([])).toEqual({});
    expect(recordOrEmpty(null)).toEqual({});

    expect(booleanString(true)).toBe("true");
    expect(booleanString(false)).toBe("false");
    expect(booleanString("true")).toBeUndefined();
    expect(booleanString(undefined)).toBeUndefined();
  });
});
