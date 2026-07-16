import type { IRuntimeTokenStore } from "./runtime-token-service.ts";

import { describe, expect, it, vi } from "vitest";
import { RuntimeTokenService } from "./runtime-token-service.ts";

describe("RuntimeTokenService", () => {
  it("rejects non-runtime-token values without reading the store", async () => {
    const store: IRuntimeTokenStore = {
      add: vi.fn(),
      list: vi.fn(async () => []),
      revoke: vi.fn(async () => false),
      markUsed: vi.fn(),
    };
    const service = new RuntimeTokenService(store);

    await expect(service.verifyToken("jwt.access.token")).resolves.toBe(false);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.markUsed).not.toHaveBeenCalled();
  });
});
