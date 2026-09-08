import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sm3Hex } from "./sm3.ts";

describe("SM3 digest", () => {
  it("matches the two GB/T 32905-2016 sample vectors", () => {
    expect(sm3Hex("abc")).toBe("66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0");
    expect(sm3Hex("abcd".repeat(16))).toBe("debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732");
  });

  it("hashes a string as its UTF-8 bytes", () => {
    const text = "顺丰速运";
    expect(sm3Hex(text)).toBe(sm3Hex(new TextEncoder().encode(text)));
  });

  it("agrees with OpenSSL across the padding boundaries", () => {
    // 55 and 56 bytes straddle the point where the length no longer fits the
    // final block, and 64 is a whole block, so each takes a different path.
    const lengths = [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000];
    for (const length of lengths) {
      const message = Buffer.alloc(length, "a");
      expect(sm3Hex(message)).toBe(createHash("sm3").update(message).digest("hex"));
    }
  });

  it("keeps a message with high code points byte-identical to OpenSSL", () => {
    const message = "运单 SF1040275268927 备注：加急 🚚";
    expect(sm3Hex(message)).toBe(createHash("sm3").update(message, "utf8").digest("hex"));
  });
});
