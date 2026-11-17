import type { RuntimeDatabase } from "./runtime-database.ts";

import { expect, it } from "vitest";

const credential = {
  authType: "api_key" as const,
  apiKey: "original-token",
  values: {},
  profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
  metadata: {},
};

export function connectionStoreTests(getDatabase: () => RuntimeDatabase): void {
  it.each(["updated", "recreated", "missing"])(
    "rejects conditional deletion of a %s connection without retiring pending authorization",
    async (mode) => {
      const database = getDatabase();
      const store = database.connectionStore;
      const selected = await store.set("example", "work", credential);
      if (mode !== "updated") await store.delete("example", "work");
      const replacement =
        mode === "missing"
          ? undefined
          : await store.set("example", "work", { ...credential, apiKey: "replacement-token" });
      const generation = await store.getRetirementGeneration("example", "work");
      const state = {
        service: "example",
        connectionName: "work",
        retirementGeneration: generation,
        state: "pending-authorization",
        createdAt: new Date().toISOString(),
      };
      await database.oauthStateStore.set(state);

      await expect(store.delete("example", "work", selected)).rejects.toMatchObject({
        code: "connection_changed",
      });
      await expect(store.get("example", "work")).resolves.toEqual(replacement);
      await expect(store.getRetirementGeneration("example", "work")).resolves.toBe(generation);
      await expect(database.oauthStateStore.take(state.state)).resolves.toMatchObject(state);
    },
  );

  it("conditionally deletes the selected revision and retires its pending authorization", async () => {
    const database = getDatabase();
    const store = database.connectionStore;
    const selected = await store.set("example", "work", credential);
    const other = await store.set("example", "other", credential);
    const generation = await store.getRetirementGeneration("example", "work");
    await database.oauthStateStore.set({
      service: "example",
      connectionName: "work",
      retirementGeneration: generation,
      state: "pending-authorization",
      createdAt: new Date().toISOString(),
    });

    await store.delete("example", "work", selected);
    await expect(store.get("example", "work")).resolves.toBeUndefined();
    await expect(store.get("example", "other")).resolves.toEqual(other);
    expect(await store.getRetirementGeneration("example", "work")).not.toBe(generation);
    await expect(database.oauthStateStore.take("pending-authorization")).resolves.toBeUndefined();
  });

  it("stores a scope with a connection and confines lookups to it", async () => {
    const store = getDatabase().connectionStore;
    const a = await store.set("example", "tenant-a-app", credential, "tenant-a");
    const b = await store.set("example", "tenant-b-app", credential, "tenant-b");
    const unscoped = await store.set("example", "plain", credential);

    expect(a.scope).toBe("tenant-a");
    expect(unscoped.scope).toBeUndefined();
    await expect(store.getById(b.id)).resolves.toMatchObject({ scope: "tenant-b" });
    expect((await store.list({ scope: "tenant-a" })).map((connection) => connection.id)).toEqual([a.id]);
    expect((await store.list()).map((connection) => connection.id).sort()).toEqual([a.id, b.id, unscoped.id].sort());
    expect((await store.list({ scope: undefined })).map((connection) => connection.id)).toEqual([unscoped.id]);
    // A lookup confined to a scope never reads another scope's row.
    await expect(store.getById(b.id, { scope: "tenant-a" })).resolves.toBeUndefined();
    await expect(store.get("example", "tenant-b-app", { scope: "tenant-a" })).resolves.toBeUndefined();
    await expect(store.get("example", "tenant-a-app", { scope: undefined })).resolves.toBeUndefined();
    await expect(store.getById(unscoped.id, { scope: undefined })).resolves.toMatchObject({ id: unscoped.id });
    // Updating the credential keeps the scope.
    const replaced = await store.set("example", "tenant-a-app", { ...credential, apiKey: "rotated" }, "tenant-a");
    expect(replaced.scope).toBe("tenant-a");
  });
}
