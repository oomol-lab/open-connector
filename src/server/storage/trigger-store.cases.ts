import type { ResolvedCredential } from "../../core/types.ts";
import type { TriggerSubscription } from "../../triggers/store.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

import { expect, it } from "vitest";
import { RuntimeTokenService } from "./runtime-token-service.ts";

function credential(accountId: string): ResolvedCredential {
  return {
    authType: "api_key",
    apiKey: `secret-${accountId}`,
    values: { apiKey: `secret-${accountId}` },
    profile: { accountId, displayName: accountId, grantedScopes: [] },
    metadata: { providerAccountVerified: true },
  };
}

export function triggerStoreTests(getDatabase: () => RuntimeDatabase): void {
  async function fixture() {
    const database = getDatabase();
    const connection = await database.connectionStore.set("github", "trigger-account", credential("original"));
    const { record: token } = await new RuntimeTokenService(database.runtimeTokenStore).createToken("trigger-owner", {
      allowedActions: [],
      blockedActions: ["*"],
      allowedProxies: [],
      allowedTriggers: ["github.on_repo_event"],
    });
    const record: TriggerSubscription = {
      id: `subscription-${crypto.randomUUID()}`,
      mode: "webhook",
      tokenId: token.id,
      connectionId: connection.id,
      connectionRevision: connection.revision,
      providerAccountId: "original",
      service: "github",
      triggerId: "github.on_repo_event",
      requestKey: "binding",
      config: { owner: "original", repo: "repository" },
      endpointUrl: "https://callback.example/hook",
      callbackNonce: "nonce",
      callbackSecret: "private-callback-secret",
      checkpoint: null,
      subscription: { remoteId: "upstream-hook" },
      reconcileAt: Date.now() + 3600000,
      status: "active",
    };
    return { database, connection, token, record };
  }

  it("persists ownership and enforces lease expiry and stale saves", async () => {
    const { database, record } = await fixture();
    const store = database.triggerStore;
    await store.insertFlowTrigger(record);
    expect(await store.getFlowTrigger(record.id)).toEqual(record);
    expect(await store.claimFlowTrigger(record.id, "first", 100, 200)).toBe(true);
    expect(await store.claimFlowTrigger(record.id, "other", 101, 201)).toBe(false);
    expect(await store.saveFlowTrigger({ ...record, checkpoint: "old" }, "first", 200)).toBe(false);
    expect(await store.claimFlowTrigger(record.id, "other", 200, 300)).toBe(true);
    await store.releaseFlowTrigger(record.id, "first");
    expect(await store.saveFlowTrigger({ ...record, checkpoint: "current" }, "other", 201)).toBe(true);
    expect((await store.getFlowTrigger(record.id))?.checkpoint).toBe("current");
  });

  it("blocks disconnect and account replacement until cleanup while allowing verified same-account recovery", async () => {
    const { database, connection, record } = await fixture();
    await database.triggerStore.insertFlowTrigger(record);
    await expect(database.connectionStore.delete("github", "trigger-account")).rejects.toMatchObject({
      code: "connection_has_subscriptions",
      status: 409,
    });
    await expect(
      database.connectionStore.set("github", "trigger-account", credential("different")),
    ).rejects.toMatchObject({ code: "connection_has_subscriptions" });
    const recovered = await database.connectionStore.set("github", "trigger-account", credential("original"));
    expect(recovered.id).toBe(connection.id);
    expect(recovered.revision).not.toBe(connection.revision);
    expect(await database.connectionStore.updateCredential({ ...recovered, credential: credential("different") })).toBe(
      false,
    );
    expect(
      await database.connectionStore.updateCredential({ ...recovered, credential: credential("original") }, true),
    ).toBe(true);
    expect(await database.triggerStore.claimFlowTrigger(record.id, "cleanup", 0, Date.now() + 60000)).toBe(true);
    await database.triggerStore.saveFlowTrigger({ ...record, status: "deleted" }, "cleanup", Date.now());
    await database.triggerStore.releaseFlowTrigger(record.id, "cleanup");
    await database.connectionStore.delete("github", "trigger-account");
    expect(await database.connectionStore.get("github", "trigger-account")).toBeUndefined();
  });

  it("refuses stale connection creation and revoked owners and retains abandoned records", async () => {
    const { database, connection, token, record } = await fixture();
    const replaced = await database.connectionStore.set("github", "trigger-account", credential("different"));
    expect(replaced.id).toBe(connection.id);
    await expect(database.triggerStore.insertFlowTrigger(record)).rejects.toMatchObject({
      code: "trigger_connection_error",
    });
    await database.runtimeTokenStore.revoke(token.id);
    await expect(
      database.triggerStore.insertFlowTrigger({ ...record, connectionRevision: replaced.revision }),
    ).rejects.toMatchObject({ code: "trigger_connection_error" });
    const owner = await new RuntimeTokenService(database.runtimeTokenStore).createToken("new-owner");
    const abandoned = {
      ...record,
      tokenId: owner.record.id,
      connectionRevision: replaced.revision,
      providerAccountId: "different",
      status: "abandoned" as const,
    };
    await database.triggerStore.insertFlowTrigger(abandoned);
    await database.connectionStore.delete("github", "trigger-account");
    expect((await database.triggerStore.getFlowTrigger(record.id))?.status).toBe("abandoned");
    expect(await database.triggerStore.listFlowTriggersForMaintenance(Date.now(), 10)).toEqual([]);
  });

  it("checks authorization independently of provider renewal times", async () => {
    const { database, record } = await fixture();
    await database.triggerStore.insertFlowTrigger(record);
    expect(await database.triggerStore.listFlowTriggersForMaintenance(Date.now(), 10)).toContainEqual(record);
    expect(await database.triggerStore.claimFlowTrigger(record.id, "check", Date.now(), Date.now() + 60000)).toBe(true);
    await database.triggerStore.saveFlowTrigger(record, "check", Date.now());
    await database.triggerStore.releaseFlowTrigger(record.id, "check");
    expect(await database.triggerStore.listFlowTriggersForMaintenance(Date.now(), 10)).toEqual([]);
  });
}
