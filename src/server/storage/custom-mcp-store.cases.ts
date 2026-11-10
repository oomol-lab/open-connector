import type { CustomMcpRecord } from "../../custom-mcp/definition.ts";
import type { RuntimeDatabase } from "./runtime-database.ts";

import { describe, expect, it } from "vitest";

export function customMcpStoreTests(getDatabase: () => RuntimeDatabase): void {
  describe("custom MCP storage", () => {
    function record(): CustomMcpRecord {
      return {
        service: `custom_mcp_${crypto.randomUUID()}`,
        displayName: `MCP ${crypto.randomUUID()}`,
        endpoint: "https://mcp.example.com/mcp",
        transport: "streamable_http",
        auth: { type: "none" },
        enabled: true,
        actions: [],
        revision: crypto.randomUUID(),
      };
    }
    it("enforces unique normalized names and optimistic updates", async () => {
      const store = getDatabase().customMcpStore;
      const first = record();
      await store.create(first);
      await expect(
        store.create({ ...record(), displayName: ` ${first.displayName.toUpperCase()} ` }),
      ).rejects.toMatchObject({ status: 409 });
      const updated = { ...first, revision: crypto.randomUUID(), displayName: "Updated MCP", enabled: false };
      await store.updateSettings(updated, first.revision);
      await expect(
        store.updateSettings({ ...first, revision: crypto.randomUUID() }, first.revision),
      ).rejects.toMatchObject({
        status: 409,
      });
      expect((await store.list()).find((row) => row.service === first.service)).toEqual(updated);
    });
    it("publishes OAuth configuration with its provider without overwriting a conflicting registration", async () => {
      const database = getDatabase();
      const first = record();
      const client = { service: first.service, clientId: "client", clientSecret: "secret", extra: {}, secretExtra: {} };
      await database.customMcpStore.create(first, client);
      expect(await database.oauthClientConfigStore.get(first.service)).toEqual(client);
      await expect(
        database.customMcpStore.create({ ...first, revision: crypto.randomUUID() }, { ...client, clientId: "other" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await database.oauthClientConfigStore.get(first.service)).toEqual(client);
    });
    it("preserves published tools across settings changes and sync failures", async () => {
      const store = getDatabase().customMcpStore;
      const first = record();
      await store.create(first);
      const published = {
        ...first,
        revision: crypto.randomUUID(),
        syncedAt: "2026-11-10T00:00:00.000Z",
        actions: [
          {
            id: `${first.service}.list`,
            service: first.service,
            name: "list",
            description: "List items",
            operationType: "read" as const,
            requiredScopes: [],
            providerPermissions: [],
            inputSchema: {},
            outputSchema: {},
          },
        ],
      };
      await store.publishTools(published, first.revision);
      const settings = {
        service: first.service,
        revision: crypto.randomUUID(),
        displayName: "Renamed",
        enabled: false,
      };
      await store.updateSettings(settings, published.revision);
      const failure = { service: first.service, revision: crypto.randomUUID(), syncError: "Discovery failed" };
      await store.recordSyncFailure(failure, settings.revision);
      expect((await store.list()).find((row) => row.service === first.service)).toEqual({
        ...published,
        ...settings,
        ...failure,
      });
      await expect(store.publishTools(published, first.revision)).rejects.toMatchObject({ status: 409 });
      await expect(store.recordSyncFailure(failure, first.revision)).rejects.toMatchObject({ status: 409 });
      await store.publishTools({ ...published, actions: [], revision: crypto.randomUUID() }, failure.revision);
      const cleared = (await store.list()).find((row) => row.service === first.service)!;
      expect(cleared.actions).toEqual([]);
      expect(cleared.syncError).toBeUndefined();
      expect(cleared.displayName).toBe("Renamed");
      expect(cleared.enabled).toBe(false);
    });
    it("clears deleted sync connections without discarding the published snapshot", async () => {
      const database = getDatabase();
      const store = database.customMcpStore;
      const entry = record();
      await store.create(entry);
      const connection = await database.connectionStore.set(entry.service, "default", {
        authType: "custom_credential",
        values: { Authorization: "secret" },
        profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
        metadata: {},
      });
      const published = {
        ...entry,
        revision: crypto.randomUUID(),
        syncConnectionId: connection.id,
        syncedAt: "2026-11-10T00:00:00.000Z",
      };
      await store.publishTools(published, entry.revision);
      await expect(
        database.connectionStore.delete(entry.service, "default", { id: connection.id, revision: "stale" }),
      ).rejects.toThrow();
      expect((await store.list()).find((row) => row.service === entry.service)?.syncConnectionId).toBe(connection.id);
      await database.connectionStore.delete(entry.service, "default");
      const current = (await store.list()).find((row) => row.service === entry.service)!;
      expect(current.syncConnectionId).toBeUndefined();
      expect(current.syncedAt).toBe(published.syncedAt);
      expect(current.revision).not.toBe(published.revision);
      await store.publishTools({ ...published, revision: crypto.randomUUID() }, current.revision);
      expect((await store.list()).find((row) => row.service === entry.service)?.syncConnectionId).toBeUndefined();
    });
    it("does not delete services with saved connections or resurrect deleted snapshots", async () => {
      const database = getDatabase();
      const entry = record();
      await database.customMcpStore.create(entry);
      const connection = await database.connectionStore.set(entry.service, "default", {
        authType: "custom_credential",
        values: { Authorization: "secret" },
        profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
        metadata: {},
      });
      await expect(database.customMcpStore.delete(entry.service, entry.revision)).rejects.toMatchObject({
        status: 409,
      });
      await database.connectionStore.delete(entry.service, connection.connectionName);
      await database.customMcpStore.delete(entry.service, entry.revision);
      await expect(
        database.customMcpStore.updateSettings({ ...entry, revision: crypto.randomUUID() }, entry.revision),
      ).rejects.toMatchObject({ status: 409 });
    });
  });
}
