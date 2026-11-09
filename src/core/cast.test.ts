import { describe, expect, it } from "vitest";
import {
  base64Bytes,
  booleanString,
  integer,
  looseArray,
  nullableBoolean,
  nullableRawString,
  optionalIntegerLike,
  optionalIntegerOrNull,
  optionalNumberLike,
  optionalStringArray,
  pickOptionalInteger,
  positiveInteger,
  rawStringOrNull,
  recordOrEmpty,
  requiredArray,
  requiredBoolean,
  requiredNumber,
  requiredRawString,
  requiredStringArray,
} from "./cast.ts";

describe("cast helpers", () => {
  it("reads finite numbers from numbers and numeric strings", () => {
    expect(optionalNumberLike(1.5)).toBe(1.5);
    expect(optionalNumberLike("2.5")).toBe(2.5);
    expect(optionalNumberLike("")).toBeUndefined();
    expect(optionalNumberLike("not-a-number")).toBeUndefined();
  });

  it("treats whitespace-only optional numbers as missing", () => {
    expect(optionalNumberLike(" \t\n")).toBeUndefined();
  });

  it("preserves present optional numbers including zero and padded decimals", () => {
    expect(optionalNumberLike(0)).toBe(0);
    expect(optionalNumberLike("0")).toBe(0);
    expect(optionalNumberLike(5.5)).toBe(5.5);
    expect(optionalNumberLike(" 5.5 ")).toBe(5.5);
  });

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

  it("treats whitespace-only optional integers as missing", () => {
    expect(optionalIntegerLike("", "count")).toBeUndefined();
    expect(optionalIntegerLike("   ", "count")).toBeUndefined();
    expect(optionalIntegerLike("\t\n", "count")).toBeUndefined();
  });

  it("preserves present optional integers including zero and padded values", () => {
    expect(optionalIntegerLike(0, "count")).toBe(0);
    expect(optionalIntegerLike("0", "count")).toBe(0);
    expect(optionalIntegerLike(2, "count")).toBe(2);
    expect(optionalIntegerLike(" 2 ", "count")).toBe(2);
    expect(() => optionalIntegerLike("2.5", "count")).toThrow("count must be an integer");
  });

  it("rejects a whitespace-only required integer instead of reading it as zero", () => {
    expect(integer(" 2 ", "count")).toBe(2);
    expect(() => integer("   ", "count")).toThrow("count must be an integer");
    expect(() => integer("", "count")).toThrow("count must be an integer");
  });

  it("skips a blank integer when picking from a record", () => {
    expect(pickOptionalInteger({ count: "   " }, "count")).toBeUndefined();
    expect(pickOptionalInteger({ count: "   ", fallback: "3" }, "count", "fallback")).toBe(3);
    expect(pickOptionalInteger({ count: " 4 " }, "count")).toBe(4);
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

  it("requires a finite number without coercion", () => {
    expect(requiredNumber(1.5, "weight")).toBe(1.5);
    expect(() => requiredNumber("1.5", "weight")).toThrow("weight must be a number");
    expect(() => requiredNumber(undefined, "weight")).toThrow("weight must be a number");
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

  it("keeps null apart from absent values in the nullable raw string and boolean readers", () => {
    expect(nullableRawString(null)).toBeNull();
    expect(nullableRawString("")).toBe("");
    expect(nullableRawString(" x ")).toBe(" x ");
    expect(nullableRawString(1)).toBeUndefined();
    expect(nullableRawString(undefined)).toBeUndefined();

    expect(nullableBoolean(null)).toBeNull();
    expect(nullableBoolean(false)).toBe(false);
    expect(nullableBoolean(true)).toBe(true);
    expect(nullableBoolean("true")).toBeUndefined();
    expect(nullableBoolean(undefined)).toBeUndefined();
  });
});

it("requires arrays without filtering provider-defined elements", () => {
  const values = [null, 1, "value", { nested: true }];
  expect(requiredArray(values, "data")).toBe(values);
  expect(requiredArray([], "data")).toEqual([]);
  for (const value of [null, undefined, {}, "[]"])
    expect(() => requiredArray(value, "data", (message) => new Error(message))).toThrow("data must be an array");
});
