import type { ResolvedCredential } from "../../core/types.ts";
import type { PendingConnectionRequest } from "./connection-request-store.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

import { describe, expect, it } from "vitest";
import { RuntimeTokenService } from "./runtime-token-service.ts";

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

    it("completes alsoConnect siblings in the request's transaction under its connection name and lists them", async () => {
      const database = getDatabase();
      const request = { ...pending(), alsoConnect: ["sibling"] };
      await database.connectionRequestStore.create(request);
      await database.connectionRequestStore.claim(request.state);
      const siblingCredential: ResolvedCredential = { ...credential, apiKey: "sibling-secret" };
      const id = await database.connectionRequestStore.complete(request, credential, undefined, [
        { service: "sibling", credential: siblingCredential },
      ]);
      expect(id).toEqual(expect.any(String));
      const sibling = await database.connectionStore.get("sibling", request.connectionName);
      expect(sibling).toMatchObject({ connectionName: request.connectionName, credential: siblingCredential });
      expect(sibling!.id).not.toBe(id);
      expect(await database.connectionRequestStore.get(request.connectionRequestId, request.owner)).toMatchObject({
        status: "connected",
        appId: id,
        connections: [
          { service: "example", appId: id, alias: request.connectionName },
          { service: "sibling", appId: sibling!.id, alias: request.connectionName },
        ],
      });
    });

    it("keeps a sibling already connected under the name, replacing its credential, and writes none once the request is no longer processing", async () => {
      const database = getDatabase();
      const request = { ...pending(), alsoConnect: ["sibling"] };
      const existing = await database.connectionStore.set("sibling", request.connectionName, credential);
      await database.connectionRequestStore.create(request);
      await database.connectionRequestStore.claim(request.state);
      const siblingCredential: ResolvedCredential = { ...credential, apiKey: "replacement" };
      const id = await database.connectionRequestStore.complete(request, credential, undefined, [
        { service: "sibling", credential: siblingCredential },
      ]);
      const sibling = await database.connectionStore.get("sibling", request.connectionName);
      expect(sibling).toMatchObject({ id: existing.id, credential: siblingCredential });
      expect(sibling!.revision).not.toBe(existing.revision);
      expect(await database.connectionRequestStore.get(request.connectionRequestId, request.owner)).toMatchObject({
        connections: [
          { service: "example", appId: id, alias: request.connectionName },
          { service: "sibling", appId: existing.id, alias: request.connectionName },
        ],
      });

      const failed = { ...pending(), alsoConnect: ["other"] };
      await database.connectionRequestStore.create(failed);
      await database.connectionRequestStore.claim(failed.state);
      await database.connectionRequestStore.fail(failed.connectionRequestId, "provider_error", "Failed");
      expect(
        await database.connectionRequestStore.complete(failed, credential, undefined, [
          { service: "other", credential: siblingCredential },
        ]),
      ).toBeUndefined();
      expect(await database.connectionStore.get("other", failed.connectionName)).toBeUndefined();
      expect(await database.connectionRequestStore.get(failed.connectionRequestId, failed.owner)).toMatchObject({
        status: "failed",
        connections: [],
      });
    });

    it("writes no sibling when the primary's revision moved during the consent", async () => {
      const database = getDatabase();
      const target = await database.connectionStore.set("example", "work", credential);
      const request: PendingConnectionRequest = {
        ...pending(),
        connectionName: "work",
        target: { id: target.id, revision: crypto.randomUUID() },
        alsoConnect: ["sibling"],
      };
      await database.connectionRequestStore.create(request);
      await database.connectionRequestStore.claim(request.state);
      expect(
        await database.connectionRequestStore.complete(request, { ...credential, apiKey: "new" }, undefined, [
          { service: "sibling", credential: { ...credential, apiKey: "sibling-secret" } },
        ]),
      ).toBeUndefined();
      expect(await database.connectionStore.get("example", "work")).toMatchObject({
        revision: target.revision,
        credential,
      });
      expect(await database.connectionStore.get("sibling", "work")).toBeUndefined();
    });

    it("writes nothing when a sibling row is bound to Trigger subscriptions for another account", async () => {
      const database = getDatabase();
      const request = { ...pending(), alsoConnect: ["sibling"] };
      // The name already holds a sibling connection of another provider account, and a live
      // subscription binds that row: SqlConnectionStore.set would refuse to replace it, and the
      // landing shares one token across its rows, so the whole landing is refused.
      const held = await database.connectionStore.set("sibling", request.connectionName, {
        ...credential,
        profile: { ...credential.profile, accountId: "someone-else" },
        metadata: { providerAccountVerified: true },
      });
      const token = await new RuntimeTokenService(database.runtimeTokenStore).createToken("holder");
      await database.triggerStore.insertFlowTrigger({
        id: "held-trigger",
        mode: "webhook",
        tokenId: token.record.id,
        service: "sibling",
        connectionId: held.id,
        connectionRevision: held.revision,
        providerAccountId: "someone-else",
        triggerId: "sibling.on_event",
        requestKey: "binding",
        config: {},
        endpointUrl: "https://callback.example/hook",
        callbackNonce: "nonce",
        callbackSecret: "secret",
        checkpoint: null,
        subscription: {},
        reconcileAt: 1_000,
        status: "active",
      });
      await database.connectionRequestStore.create(request);
      await database.connectionRequestStore.claim(request.state);
      expect(
        await database.connectionRequestStore.complete(request, credential, undefined, [
          { service: "sibling", credential: { ...credential, apiKey: "sibling-secret" } },
        ]),
      ).toBeUndefined();
      expect(await database.connectionStore.get("example", request.connectionName)).toBeUndefined();
      expect(await database.connectionStore.get("sibling", request.connectionName)).toMatchObject({
        id: held.id,
        revision: held.revision,
      });
      expect(await database.connectionRequestStore.get(request.connectionRequestId, request.owner)).toMatchObject({
        status: "initiated",
        connections: [],
      });
    });
  });
}
