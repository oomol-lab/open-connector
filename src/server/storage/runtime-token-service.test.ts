import type { TokenPolicy } from "../../core/action-policy.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "./runtime-token-service.ts";

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
      allowedConnections: ["work"],
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
      allowedConnections: ["work"],
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
      allowedConnections: [],
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
      allowedConnections: [],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { tokenId: "token-1", err: expect.any(Error) },
      "runtime token last use update failed",
    );
  });

  it("preserves allowedConnections across create, list, resolve, and update", async () => {
    const service = new RuntimeTokenService(new MemoryRuntimeTokenStore());
    const created = await service.createToken("Issue bot", {
      allowedActions: ["github.*"],
      blockedActions: ["github.delete_repository"],
      allowedProxies: ["github"],
      allowedConnections: ["work", "personal"],
    });

    expect(created.record.allowedConnections).toEqual(["work", "personal"]);
    await expect(service.listTokens()).resolves.toMatchObject([
      { id: created.record.id, allowedConnections: ["work", "personal"] },
    ]);
    await expect(service.resolveToken(created.token)).resolves.toMatchObject({
      tokenId: created.record.id,
      allowedConnections: ["work", "personal"],
    });
    await expect(
      service.updateTokenPolicy(created.record.id, {
        allowedActions: ["github.get_current_user"],
        blockedActions: [],
        allowedProxies: ["slack"],
        allowedConnections: ["work"],
      }),
    ).resolves.toMatchObject({ allowedConnections: ["work"] });
    await expect(service.resolveToken(created.token)).resolves.toMatchObject({
      allowedConnections: ["work"],
    });
  });

  it("defaults omitted allowedConnections to an unrestricted empty list", async () => {
    const created = await new RuntimeTokenService(new MemoryRuntimeTokenStore()).createToken("Issue bot");
    expect(created.record.allowedConnections).toEqual([]);
    expect(created.record).toMatchObject({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
    });
  });
});

class MemoryRuntimeTokenStore implements IRuntimeTokenStore {
  private readonly tokens = new Map<string, RuntimeTokenRecord>();

  async add(record: RuntimeTokenRecord): Promise<void> {
    this.tokens.set(record.id, record);
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    return [...this.tokens.values()];
  }

  async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    return [...this.tokens.values()].find((token) => token.tokenHash === tokenHash);
  }

  async updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined> {
    const token = this.tokens.get(id);
    if (!token) {
      return undefined;
    }
    const updated = {
      ...token,
      ...policy,
      allowedConnections: policy.allowedConnections ?? [],
    };
    this.tokens.set(id, updated);
    return updated;
  }

  async revoke(id: string): Promise<boolean> {
    return this.tokens.delete(id);
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token) {
      this.tokens.set(id, { ...token, lastUsedAt: usedAt });
    }
  }
}
