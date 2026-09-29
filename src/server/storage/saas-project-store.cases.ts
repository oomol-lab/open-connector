import type { PendingSaasRequest, SaasCandidate, SaasRequestLease } from "./connection-request-store.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

import { beforeEach, describe, expect, it } from "vitest";

const project = { id: "managed", projectId: "project", baseUrl: "https://example.com", apiKey: "project-secret" };
const candidate: SaasCandidate = {
  connectedAccountId: "remote-account",
  profile: { accountId: "account", displayName: "User", grantedScopes: ["read"] },
  status: "active",
  comment: null,
};

function pending(): PendingSaasRequest {
  return {
    connectionRequestId: crypto.randomUUID(),
    connectionId: crypto.randomUUID(),
    owner: "admin",
    service: "example",
    connectionName: crypto.randomUUID(),
    managedProjectId: project.id,
    providerConfigId: "config",
    externalUserId: "instance-user",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

export function saasProjectStoreTests(getDatabase: () => RuntimeDatabase): void {
  describe("SaaS project lifecycle", () => {
    beforeEach(async () => {
      expect(await getDatabase().saasProjectStore.saveProject(project)).toBe(true);
    });

    async function ready(request = pending(), account = candidate): Promise<SaasRequestLease> {
      const requests = getDatabase().connectionRequestStore;
      const lease = await requests.createSaas(request);
      expect(await requests.saveSaasRequest(lease, "remote-request")).toBe(true);
      expect(await requests.saveSaasCandidate(lease, account)).toBe(true);
      return lease;
    }

    it("resets only SaaS data and makes an identical retry a no-op", async () => {
      const database = getDatabase();
      const store = database.saasProjectStore;
      const oldId = await store.getInstanceId();
      const lease = await ready();
      await database.connectionRequestStore.completeSaas(lease);
      const abandoned = await ready({ ...pending(), owner: "other" });
      await database.connectionRequestStore.cancelSaas(abandoned.pending.connectionRequestId, "other");
      await store.setSource("example", { managedProjectId: project.id, providerConfigId: "config" });
      const local = await database.connectionStore.set("local", "work", { authType: "no_auth" });
      const marketplace = {
        discoveryUrl: "https://market.example",
        apiKeyEncrypted: "market-key",
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await database.marketplaceStore.setConfig(marketplace);
      const localRequest = {
        connectionRequestId: crypto.randomUUID(),
        owner: "local",
        service: "local",
        connectionName: "work",
        state: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      await database.connectionRequestStore.create(localRequest);
      expect(await store.inspectInstance()).toMatchObject({
        instanceId: oldId,
        connections: 1,
        requests: 2,
        sources: 1,
        projects: 1,
        cleanup: 1,
      });
      const input = { expectedInstanceId: oldId, newInstanceId: crypto.randomUUID() };
      expect(await store.resetInstance(input)).toBe("reset");
      expect(await store.inspectInstance()).toEqual({
        instanceId: input.newInstanceId,
        connections: 0,
        requests: 0,
        sources: 0,
        projects: 0,
        cleanup: 0,
      });
      expect(await database.connectionStore.get("local", "work")).toEqual(local);
      expect(await database.marketplaceStore.getConfig()).toEqual(marketplace);
      expect(await database.connectionRequestStore.get(localRequest.connectionRequestId, "local")).toMatchObject({
        status: "initiated",
      });
      await store.saveProject(project);
      expect(await store.resetInstance(input)).toBe("already_reset");
      expect(await store.getProject()).toEqual(project);
    });

    it("allows only one competing instance reset and leaves conflicts untouched", async () => {
      const store = getDatabase().saasProjectStore;
      const oldId = await store.getInstanceId();
      const nextIds = [crypto.randomUUID(), crypto.randomUUID()];
      const results = await Promise.all(
        nextIds.map((newInstanceId) => store.resetInstance({ expectedInstanceId: oldId, newInstanceId })),
      );
      expect(results.filter((result) => result === "reset")).toHaveLength(1);
      expect(results.filter((result) => result === "conflict")).toHaveLength(1);
      expect(await store.getInstanceId()).toBe(nextIds[results.indexOf("reset")]);
      await store.saveProject(project);
      expect(await store.resetInstance({ expectedInstanceId: oldId, newInstanceId: crypto.randomUUID() })).toBe(
        "conflict",
      );
      expect(await store.getProject()).toEqual(project);
    });

    it("persists cleanup account recovery and pauses only the rejected project key", async () => {
      const database = getDatabase();
      const store = database.saasProjectStore;
      const lease = await ready();
      await database.connectionRequestStore.cancelSaas(lease.pending.connectionRequestId, "admin");
      const task = (await store.claimCleanup(Date.now()))!;
      expect(await store.saveCleanupAccount(task, "recovered-account")).toBe(true);
      await store.pauseCleanup(task, "stale-key");
      expect((await store.getCleanupStats()).paused).toBe(false);
      await store.pauseCleanup(task, project.apiKey);
      expect((await store.getCleanupStats()).paused).toBe(true);
      await store.retryCleanup(task, 0, "oauth_source_unauthorized");
      expect(await store.claimCleanup(Date.now())).toBeUndefined();
      await store.saveProject({ ...project, apiKey: "replacement" });
      expect((await store.getCleanupStats()).paused).toBe(false);
      const resumed = (await store.claimCleanup(Date.now()))!;
      expect(resumed.connectedAccountId).toBe("recovered-account");
      expect(await store.saveCleanupAccount(task, "stale-worker-account")).toBe(false);
      expect(await store.finishCleanup(resumed)).toBe(true);
    });

    it("keeps a single instance identity and only rotates keys for the same project and origin", async () => {
      const store = getDatabase().saasProjectStore;
      const ids = await Promise.all([store.getInstanceId(), store.getInstanceId()]);
      expect(ids[0]).toBe(ids[1]);
      expect(await store.saveProject({ ...project, apiKey: "rotated" })).toBe(true);
      expect(await store.saveProject({ ...project, projectId: "other" })).toBe(false);
      expect(await store.saveProject({ ...project, baseUrl: "https://other.example.com" })).toBe(false);
      expect(await store.getProject()).toEqual({ ...project, apiKey: "rotated" });
    });

    it("prevents project deletion while a default, request, connection or cleanup references it", async () => {
      const database = getDatabase();
      const store = database.saasProjectStore;
      expect(await store.setSource("example", { managedProjectId: project.id, providerConfigId: "config" })).toBe(true);
      expect(await store.listSources()).toEqual([
        { service: "example", managedProjectId: "managed", projectId: "project", providerConfigId: "config" },
      ]);
      expect(await store.deleteProject(project.id)).toBe(false);
      await store.setSource("example", undefined);
      expect(await store.listSources()).toEqual([]);
      const lease = await ready();
      expect(await store.deleteProject(project.id)).toBe(false);
      expect(await database.connectionRequestStore.completeSaas(lease)).toBe("connected");
      expect(await store.deleteProject(project.id)).toBe(false);
      await database.connectionStore.delete("example", lease.pending.connectionName);
      expect(await store.deleteProject(project.id)).toBe(false);
      const task = await store.claimCleanup(Date.now());
      expect(task?.connectedAccountId).toBe(candidate.connectedAccountId);
      expect(await store.finishCleanup(task!)).toBe(true);
      expect(await store.deleteProject(project.id)).toBe(true);
      expect(await store.setSource("example", { managedProjectId: project.id, providerConfigId: "config" })).toBe(
        false,
      );
    });

    it("rolls back supersession if creating the replacement fails", async () => {
      const requests = getDatabase().connectionRequestStore;
      const lease = await ready();
      await expect(requests.createSaas({ ...pending(), managedProjectId: "missing" })).rejects.toThrow();
      expect(await requests.completeSaas(lease)).toBe("connected");
      expect(await getDatabase().saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
    });

    it("persists a reference without credentials and does not revise it on reads", async () => {
      const database = getDatabase();
      const lease = await ready();
      expect(await database.connectionRequestStore.completeSaas(lease)).toBe("connected");
      const connection = await database.connectionStore.get("example", lease.pending.connectionName);
      expect(connection).toMatchObject({
        source: "saas",
        id: lease.pending.connectionId,
        profile: candidate.profile,
        reference: {
          connectedAccountId: candidate.connectedAccountId,
          localRequestId: lease.pending.connectionRequestId,
        },
      });
      expect(connection).not.toHaveProperty("credential");
      expect(await database.connectionStore.get("example", lease.pending.connectionName)).toEqual(connection);
      expect(await database.connectionRequestStore.completeSaas(lease)).toBe("lease_lost");
      expect(await database.saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
    });

    it("recovers after eleven minutes and prevents a stale lease from writing or cleaning up", async () => {
      const database = getDatabase();
      const lease = await ready();
      expect(
        await database.connectionRequestStore.claimSaas(
          lease.pending.connectionRequestId,
          "other",
          Date.now() + 660_000,
        ),
      ).toBeUndefined();
      const claims = await Promise.all(
        [1, 2].map(() =>
          database.connectionRequestStore.claimSaas(lease.pending.connectionRequestId, "admin", Date.now() + 660_000),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(claims.find(Boolean)?.candidate).toEqual(candidate);
      expect(await database.connectionRequestStore.completeSaas(lease)).toBe("lease_lost");
      expect(await database.connectionRequestStore.releaseSaas(lease, 0)).toBe(false);
      expect(await database.saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
      expect(await database.connectionRequestStore.completeSaas(claims.find(Boolean)!)).toBe("connected");
    });

    it("enforces the polling interval and never reclassifies an unknown create as safe to retry", async () => {
      const requests = getDatabase().connectionRequestStore;
      const lease = await requests.createSaas(pending());
      expect(await requests.releaseSaas(lease, 0)).toBe(true);
      expect(await requests.claimSaas(lease.pending.connectionRequestId, "admin")).toBeUndefined();
      const recovered = await requests.claimSaas(lease.pending.connectionRequestId, "admin", Date.now() + 3_000);
      expect(recovered).toMatchObject({ phase: "creating", remoteRequestId: null });
    });

    it("queues the candidate on a reconnect conflict without reviving a deleted connection", async () => {
      const database = getDatabase();
      const original = await ready();
      await database.connectionRequestStore.completeSaas(original);
      const connection = (await database.connectionStore.get("example", original.pending.connectionName))!;
      const replacement = await ready(
        {
          ...pending(),
          connectionName: connection.connectionName,
          target: { id: connection.id, revision: connection.revision },
        },
        { ...candidate, connectedAccountId: "new-account" },
      );
      await database.connectionStore.delete("example", connection.connectionName);
      expect(await database.connectionRequestStore.completeSaas(replacement)).toBe("conflict");
      expect(await database.connectionStore.get("example", connection.connectionName)).toBeUndefined();
      const tasks = await Promise.all([
        database.saasProjectStore.claimCleanup(Date.now()),
        database.saasProjectStore.claimCleanup(Date.now()),
      ]);
      expect(tasks.map((task) => task?.connectedAccountId).sort()).toEqual(["new-account", "remote-account"]);
    });

    it("commits a reconnect and the old account cleanup together", async () => {
      const database = getDatabase();
      const original = await ready();
      await database.connectionRequestStore.completeSaas(original);
      const connection = (await database.connectionStore.get("example", original.pending.connectionName))!;
      const replacement = await ready(
        {
          ...pending(),
          connectionName: connection.connectionName,
          target: { id: connection.id, revision: connection.revision },
        },
        { ...candidate, connectedAccountId: "new-account" },
      );
      expect(await database.connectionRequestStore.completeSaas(replacement)).toBe("connected");
      expect(await database.connectionStore.get("example", connection.connectionName)).toMatchObject({
        id: connection.id,
        reference: { connectedAccountId: "new-account" },
      });
      expect((await database.saasProjectStore.claimCleanup(Date.now()))?.connectedAccountId).toBe("remote-account");
    });

    it("queues SaaS candidates before local supersession and expiry cleanup", async () => {
      const database = getDatabase();
      const lease = await ready();
      await database.connectionRequestStore.create({
        connectionRequestId: crypto.randomUUID(),
        owner: "admin",
        service: "example",
        connectionName: "local",
        state: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(await database.connectionRequestStore.completeSaas(lease)).toBe("lease_lost");
      expect(await database.saasProjectStore.claimCleanup(Date.now())).toMatchObject({
        remoteRequestId: "remote-request",
        connectedAccountId: candidate.connectedAccountId,
      });
      const expired = await ready(
        { ...pending(), owner: "expired", expiresAt: new Date(Date.now() - 90_000_000).toISOString() },
        { ...candidate, connectedAccountId: "expired-account" },
      );
      await database.connectionRequestStore.create({
        connectionRequestId: crypto.randomUUID(),
        owner: "admin",
        service: "example",
        connectionName: "local",
        state: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(await database.connectionRequestStore.get(expired.pending.connectionRequestId, "expired")).toBeUndefined();
      expect((await database.saasProjectStore.claimCleanup(Date.now()))?.connectedAccountId).toBe("expired-account");
    });

    it("supersedes local requests without producing remote cleanup", async () => {
      const database = getDatabase();
      const state = crypto.randomUUID();
      await database.connectionRequestStore.create({
        connectionRequestId: crypto.randomUUID(),
        owner: "admin",
        service: "example",
        connectionName: "local",
        state,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await ready();
      expect(await database.connectionRequestStore.claim(state)).toBeUndefined();
      expect(await database.saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
    });

    it("cancels known requests into cleanup and uses lease CAS for retries", async () => {
      const database = getDatabase();
      const lease = await ready();
      await database.connectionRequestStore.cancelSaas(lease.pending.connectionRequestId, "other");
      expect(await database.saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
      await database.connectionRequestStore.cancelSaas(lease.pending.connectionRequestId, "admin");
      expect(await database.connectionRequestStore.completeSaas(lease)).toBe("lease_lost");
      const first = (await database.saasProjectStore.claimCleanup(Date.now()))!;
      const second = (await database.saasProjectStore.claimCleanup(Date.now() + 46_000))!;
      expect(await database.saasProjectStore.finishCleanup(first)).toBe(false);
      expect(await database.saasProjectStore.retryCleanup(first, 0, "failed")).toBe(false);
      expect(await database.saasProjectStore.retryCleanup(second, Date.now() + 60_000, "failed")).toBe(true);
      expect(await database.saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
      expect(await database.saasProjectStore.claimCleanup(Date.now() + 61_000)).toMatchObject({ attempts: 1 });
    });
  });
}

export function saasMaintenanceTests(
  getDatabase: () => import("./node-runtime-database.ts").NodeRuntimeDatabase,
  reopen: (codec: import("../secrets/secret-codec-core.ts").ISecretCodec) => Promise<void>,
): void {
  it("rotates project and candidate secrets atomically, refuses plaintext, and preserves identity on reset", async () => {
    const { AesGcmSecretCodec, PlainTextSecretCodec } = await import("../secrets/secret-codec.ts");
    let database = getDatabase();
    const identity = await database.saasProjectStore.getInstanceId();
    await database.saasProjectStore.saveProject(project);
    const request = { ...pending(), returnUri: "oomol://return/private" };
    const lease = await database.connectionRequestStore.createSaas(request);
    await database.connectionRequestStore.saveSaasRequest(lease, "remote-request");
    await database.connectionRequestStore.saveSaasCandidate(lease, candidate);
    await expect(database.rotateSecretCodec(new PlainTextSecretCodec())).rejects.toThrow("encrypted storage");
    expect(await database.saasProjectStore.getProject()).toEqual(project);
    let writes = 0;
    const codec = new AesGcmSecretCodec("rotated-key");
    await expect(
      database.rotateSecretCodec({
        encrypted: true,
        decode: (value) => codec.decode(value),
        encode: async (value) => {
          if (++writes === 3) throw new Error("rotation failed");
          return codec.encode(value);
        },
      }),
    ).rejects.toThrow("rotation failed");
    expect(await database.saasProjectStore.getProject()).toEqual(project);
    await database.rotateSecretCodec(codec);
    await reopen(codec);
    database = getDatabase();
    expect(await database.saasProjectStore.getProject()).toEqual(project);
    const recovered = await database.connectionRequestStore.claimSaas(
      request.connectionRequestId,
      request.owner,
      Date.now() + 46_000,
    );
    expect(recovered?.candidate).toEqual(candidate);
    expect(await database.connectionRequestStore.completeSaas(recovered!)).toBe("connected");
    expect(await database.connectionRequestStore.getSaasReturnUri(request.connectionRequestId, request.owner)).toBe(
      request.returnUri,
    );
    await database.resetRuntimeData();
    expect(await database.saasProjectStore.getInstanceId()).toBe(identity);
    expect(await database.saasProjectStore.getProject()).toBeUndefined();
    expect(await database.connectionStore.list()).toEqual([]);
    expect(await database.saasProjectStore.claimCleanup(Date.now())).toBeUndefined();
  });
}
