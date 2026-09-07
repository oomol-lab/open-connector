import type { ResolvedCredential } from "../../core/types.ts";
import type { PendingConnectionRequest } from "./connection-request-store.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

import { describe, expect, it } from "vitest";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "secret",
  values: { apiKey: "secret" },
  profile: { accountId: "user", displayName: "User", grantedScopes: [] },
  metadata: {},
};

function pending(owner = "admin"): PendingConnectionRequest {
  return {
    connectionRequestId: crypto.randomUUID(),
    state: crypto.randomUUID(),
    owner,
    service: "example",
    connectionName: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

/** The same transaction and lifecycle contracts must hold on every persistent backend. */
export function connectionRequestStoreTests(getDatabase: () => RuntimeDatabase): void {
  describe("connection request lifecycle", () => {
    it("isolates owners and claims each callback exactly once", async () => {
      const { connectionRequestStore: requests } = getDatabase();
      const request = pending();
      await requests.create(request);
      expect(await requests.get(request.connectionRequestId, "other")).toBeUndefined();
      const claims = await Promise.all([requests.claim(request.state), requests.claim(request.state)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(claims.find(Boolean)).toEqual(request);
    });

    it("rolls back supersession when the new request cannot be saved", async () => {
      const { connectionRequestStore: requests } = getDatabase();
      const request = pending();
      await requests.create(request);
      await expect(
        requests.create({ ...pending(), connectionRequestId: request.connectionRequestId }),
      ).rejects.toThrow();
      expect(await requests.get(request.connectionRequestId, request.owner)).toMatchObject({
        status: "initiated",
        errorCode: null,
      });
      expect(await requests.claim(request.state)).toEqual(request);
    });

    it("does not supersede a claimed callback and never overwrites its terminal result", async () => {
      const database = getDatabase();
      const requests = database.connectionRequestStore;
      const request = pending();
      await requests.create(request);
      await requests.claim(request.state);
      await requests.create(pending());
      const id = await requests.complete(request, credential);
      expect(id).toEqual(expect.any(String));
      expect(await requests.get(request.connectionRequestId, request.owner)).toMatchObject({
        status: "connected",
        appId: id,
      });
      await requests.fail(request.connectionRequestId, "late", "Late error");
      expect(await requests.complete(request, credential)).toBeUndefined();
      expect(await requests.get(request.connectionRequestId, request.owner)).toMatchObject({
        status: "connected",
        appId: id,
      });
      expect((await database.connectionStore.list()).filter((connection) => connection.id === id)).toHaveLength(1);
    });

    it("retains the original credential when reconnect races with a replacement", async () => {
      const database = getDatabase();
      const original = await database.connectionStore.set("example", crypto.randomUUID(), credential);
      const request = {
        ...pending(),
        connectionName: original.connectionName,
        target: { id: original.id, revision: original.revision },
      };
      await database.connectionRequestStore.create(request);
      await database.connectionRequestStore.claim(request.state);
      const replacement: ResolvedCredential = { ...credential, apiKey: "replacement" };
      await database.connectionStore.updateCredential({ ...original, credential: replacement });
      expect(await database.connectionRequestStore.complete(request, credential)).toBeUndefined();
      expect((await database.connectionStore.get(original.service, original.connectionName))?.credential).toEqual(
        replacement,
      );
      expect(await database.connectionRequestStore.get(request.connectionRequestId, request.owner)).toMatchObject({
        status: "initiated",
        appId: null,
      });
    });

    it("never writes credentials after the request has failed", async () => {
      const database = getDatabase();
      const request = pending();
      await database.connectionRequestStore.create(request);
      await database.connectionRequestStore.claim(request.state);
      await database.connectionRequestStore.fail(request.connectionRequestId, "provider_error", "Failed");
      expect(await database.connectionRequestStore.complete(request, credential)).toBeUndefined();
      expect(await database.connectionStore.get(request.service, request.connectionName!)).toBeUndefined();
    });
  });
}
