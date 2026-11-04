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

  it("retains explicit revocation intent across later opt-out deletions", async () => {
    const store = getDatabase().connectionStore;
    const first = await store.set("example", "work", credential);
    const firstGeneration = await store.getRetirementGeneration("example", "work");
    await store.delete("example", "work", first, "first-authorization");
    const second = await store.set("example", "work", credential);
    const secondGeneration = await store.getRetirementGeneration("example", "work");
    await store.delete("example", "work", second);
    expect(await store.wasRevocationRequested(firstGeneration, "first-authorization")).toBe(true);
    expect(await store.wasRevocationRequested(firstGeneration, "another-authorization")).toBe(false);
    expect(await store.wasRevocationRequested(secondGeneration, "first-authorization")).toBe(false);
  });

  it("does not record revocation intent when a stale delete is rejected", async () => {
    const store = getDatabase().connectionStore;
    const first = await store.set("example", "work", credential);
    const generation = await store.getRetirementGeneration("example", "work");
    await store.set("example", "work", { ...credential, apiKey: "replacement" });
    await expect(store.delete("example", "work", first, "first-authorization")).rejects.toMatchObject({
      code: "connection_changed",
    });
    expect(await store.wasRevocationRequested(generation, "first-authorization")).toBe(false);
  });

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
}
