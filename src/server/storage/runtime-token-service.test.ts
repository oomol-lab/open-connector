import type { IRuntimeTokenStore } from "./runtime-token-service.ts";

import { describe, expect, it, vi } from "vitest";
import { hashRuntimeToken, RuntimeTokenService } from "./runtime-token-service.ts";

describe("RuntimeTokenService", () => {
  it("rejects non-runtime-token values without reading the store", async () => {
    const store: IRuntimeTokenStore = {
      add: vi.fn(),
      list: vi.fn(async () => []),
      findByHash: vi.fn(),
      updatePolicy: vi.fn(),
      revoke: vi.fn(async () => false),
      markUsed: vi.fn(),
    };
    const service = new RuntimeTokenService(store);

    await expect(service.verifyToken("jwt.access.token")).resolves.toBe(false);
    expect(store.findByHash).not.toHaveBeenCalled();
    expect(store.markUsed).not.toHaveBeenCalled();
  });

  it("resolves stored tokens by hash into a scoped grant", async () => {
    const token = "oct_secret";
    const record = {
      id: "token-1",
      name: "Issue bot",
      tokenHash: hashRuntimeToken(token),
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
      allowedProxies: ["github"],
      createdAt: "2026-07-20T00:00:00.000Z",
    };
    const store: IRuntimeTokenStore = {
      add: vi.fn(),
      list: vi.fn(async () => [record]),
      findByHash: vi.fn(async () => record),
      updatePolicy: vi.fn(),
      revoke: vi.fn(async () => false),
      markUsed: vi.fn(),
    };

    await expect(new RuntimeTokenService(store).resolveToken(token)).resolves.toEqual({
      tokenId: "token-1",
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
      allowedProxies: ["github"],
    });
    expect(store.findByHash).toHaveBeenCalledWith(record.tokenHash);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.markUsed).toHaveBeenCalledWith("token-1", expect.any(String));
  });

  it("keeps a matched token valid when the last-use write fails", async () => {
    const token = "oct_secret";
    const record = {
      id: "token-1",
      name: "Issue bot",
      tokenHash: hashRuntimeToken(token),
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      createdAt: "2026-07-20T00:00:00.000Z",
    };
    const store: IRuntimeTokenStore = {
      add: vi.fn(),
      list: vi.fn(async () => [record]),
      findByHash: vi.fn(async () => record),
      updatePolicy: vi.fn(),
      revoke: vi.fn(async () => false),
      markUsed: vi.fn(async () => {
        throw new Error("D1_ERROR: network connection lost");
      }),
    };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

    await expect(new RuntimeTokenService(store, logger).resolveToken(token)).resolves.toEqual({
      tokenId: "token-1",
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { tokenId: "token-1", err: expect.any(Error) },
      "runtime token last use update failed",
    );
  });
});
