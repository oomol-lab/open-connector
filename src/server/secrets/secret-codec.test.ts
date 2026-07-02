import { describe, expect, it } from "vitest";
import { AesGcmSecretCodec, PlainTextSecretCodec } from "./secret-codec.ts";

describe("secret codecs", () => {
  it("round-trips encrypted payloads without storing plaintext", async () => {
    const codec = new AesGcmSecretCodec("test-key");
    const stored = await codec.encode('{"apiKey":"secret-token"}');

    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain("secret-token");
    await expect(codec.decode(stored)).resolves.toBe('{"apiKey":"secret-token"}');
  });

  it("keeps plaintext payloads readable for development mode", async () => {
    const codec = new PlainTextSecretCodec();

    await expect(codec.encode("value")).resolves.toBe("value");
    await expect(codec.decode("value")).resolves.toBe("value");
  });
});
