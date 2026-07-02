import { describe, expect, it } from "vitest";
import { createWorkerSecretCodec } from "./worker-secret-codec.ts";

describe("worker secret codecs", () => {
  it("round-trips encrypted payloads with a worker-specific prefix", async () => {
    const codec = await createWorkerSecretCodec("test-key");
    const stored = await codec.encode("secret");

    expect(stored).toMatch(/^enc:worker:v1:/);
    expect(stored).not.toContain("secret");
    await expect(codec.decode(stored)).resolves.toBe("secret");
  });

  it("keeps plaintext payloads readable when encryption is disabled", async () => {
    const codec = await createWorkerSecretCodec(undefined);

    await expect(codec.encode("value")).resolves.toBe("value");
    await expect(codec.decode("value")).resolves.toBe("value");
  });
});
