import type { RuntimeDatabase } from "./runtime-database.ts";

import { expect, it } from "vitest";
import { DEFAULT_TENANT_ID } from "../../tenant/tenant-id.ts";

const credential = {
  authType: "api_key" as const,
  apiKey: "tenant-token",
  values: {},
  profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
  metadata: {},
};

const ALPHA = "tenant-alpha";
const BETA = "tenant-beta";

/** Cross-tenant isolation cases; `getDatabase` returns the default ('local') view. */
export function tenantScopeTests(getDatabase: () => RuntimeDatabase): void {
  it("defaults unscoped views to the local tenant", async () => {
    const database = getDatabase();
    const local = database.forTenant(DEFAULT_TENANT_ID);
    await local.connectionStore.set("example", "work", credential);
    await expect(database.connectionStore.get("example", "work")).resolves.toBeDefined();
    await expect(database.forTenant(ALPHA).connectionStore.get("example", "work")).resolves.toBeUndefined();
  });

  it("isolates connections between tenants, including same-name rows", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.connectionStore.set("github", "default", { ...credential, apiKey: "alpha-key" });
    await beta.connectionStore.set("github", "default", { ...credential, apiKey: "beta-key" });

    const alphaRow = await alpha.connectionStore.get("github", "default");
    const betaRow = await beta.connectionStore.get("github", "default");
    expect(alphaRow).toBeDefined();
    expect(betaRow).toBeDefined();
    expect(alphaRow!.id).not.toBe(betaRow!.id);
    expect((alphaRow as { credential: { apiKey: string } }).credential.apiKey).toBe("alpha-key");
    expect((betaRow as { credential: { apiKey: string } }).credential.apiKey).toBe("beta-key");

    expect(await alpha.connectionStore.list()).toHaveLength(1);
    expect(await beta.connectionStore.list()).toHaveLength(1);

    await alpha.connectionStore.delete("github", "default");
    await expect(alpha.connectionStore.get("github", "default")).resolves.toBeUndefined();
    await expect(beta.connectionStore.get("github", "default")).resolves.toBeDefined();
  });

  it("does not let a tenant delete another tenant's connection or its retirement fence", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.connectionStore.set("github", "only", credential);
    // Beta deletes a same-named row that does not exist for beta: no row, no alpha side effects.
    await beta.connectionStore.delete("github", "only");
    await expect(alpha.connectionStore.get("github", "only")).resolves.toBeDefined();

    const generation = await alpha.connectionStore.getRetirementGeneration("github", "only");
    await expect(beta.connectionStore.getRetirementGeneration("github", "only")).resolves.not.toBe(generation);
  });

  it("isolates OAuth states and does not let take() cross tenants", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    const generation = await alpha.connectionStore.getRetirementGeneration("github", "work");
    const state = {
      service: "github",
      connectionName: "work",
      retirementGeneration: generation,
      state: "shared-state-key",
      createdAt: new Date().toISOString(),
    };
    await alpha.oauthStateStore.set(state);

    // Beta cannot consume alpha's state; the row survives for alpha.
    await expect(beta.oauthStateStore.take("shared-state-key")).resolves.toBeUndefined();
    // The credential-free callback resolves the state's tenant instance-wide,
    // then takes it under that tenant's scope.
    await expect(getDatabase().forInstance().oauthStateStore.tenantOf("shared-state-key")).resolves.toBe(ALPHA);
    await expect(alpha.oauthStateStore.take("shared-state-key")).resolves.toMatchObject(state);
    await expect(alpha.oauthStateStore.take("shared-state-key")).resolves.toBeUndefined();
  });

  it("lets two tenants claim the same idempotency key independently", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    const claim = {
      keyHash: "same-client-key",
      claimId: "claim-a",
      requestHash: "request-hash",
      now: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await expect(alpha.idempotencyStore.claim(claim)).resolves.toEqual({ kind: "acquired" });
    // Beta reuses the identical caller-supplied key: a second acquisition, not a replay.
    await expect(beta.idempotencyStore.claim({ ...claim, claimId: "claim-b" })).resolves.toEqual({
      kind: "acquired",
    });
    // Alpha still sees its own in-progress claim.
    await expect(alpha.idempotencyStore.claim({ ...claim, claimId: "claim-a2" })).resolves.toEqual({
      kind: "in_progress",
    });
  });

  it("scopes runtime tokens so one tenant cannot list, find, or revoke another's", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.runtimeTokenStore.add({
      id: "alpha-token",
      name: "Alpha token",
      tenantId: ALPHA,
      tokenHash: "alpha-hash",
      allowedActions: ["github.*"],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
      allowedTriggers: [],
      createdAt: new Date().toISOString(),
    });

    await expect(beta.runtimeTokenStore.findByHash("alpha-hash")).resolves.toBeUndefined();
    await expect(beta.runtimeTokenStore.findById("alpha-token")).resolves.toBeUndefined();
    expect(await beta.runtimeTokenStore.list()).toHaveLength(0);
    await expect(beta.runtimeTokenStore.revoke("alpha-token")).resolves.toBe(false);
    await expect(alpha.runtimeTokenStore.findByHash("alpha-hash")).resolves.toMatchObject({ tenantId: ALPHA });
    // Token authentication resolves the hash across tenants, then binds the request via tenantId.
    await expect(getDatabase().forInstance().runtimeTokenStore.findByHash("alpha-hash")).resolves.toMatchObject({
      tenantId: ALPHA,
    });
  });

  it("scopes run logs per tenant", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.runLogStore.add({
      id: "run-alpha",
      service: "github",
      actionId: "github.search",
      caller: "http",
      startedAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:00:01.000Z",
      durationMs: 1000,
      ok: true,
    });

    await expect(beta.runLogStore.get("run-alpha")).resolves.toBeUndefined();
    expect((await beta.runLogStore.list({})).items).toHaveLength(0);
    await expect(alpha.runLogStore.get("run-alpha")).resolves.toMatchObject({ id: "run-alpha" });
  });

  it("scopes OAuth client configs and custom MCP catalogs per tenant", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.oauthClientConfigStore.set({
      service: "github",
      clientId: "alpha-client",
      clientSecret: "alpha-secret",
      extra: {},
      secretExtra: {},
    });
    await expect(beta.oauthClientConfigStore.get("github")).resolves.toBeUndefined();
    await expect(alpha.oauthClientConfigStore.get("github")).resolves.toMatchObject({ clientId: "alpha-client" });
    expect((await beta.oauthClientConfigStore.list()).map((row) => row.service)).not.toContain("github");

    const mcp = (service: string, displayName: string) => ({
      service,
      displayName,
      endpoint: "https://mcp.example.com/mcp",
      transport: "streamable_http" as const,
      auth: { type: "none" as const },
      enabled: true,
      revision: crypto.randomUUID(),
    });
    // Same service id is allowed per tenant; the catalog stays isolated.
    await alpha.customMcpStore.create(mcp("mcp-a", "Alpha Tools"));
    await beta.customMcpStore.create(mcp("mcp-a", "Beta Tools"));
    expect((await alpha.customMcpStore.list()).map((row) => row.displayName)).toEqual(["Alpha Tools"]);
    expect((await beta.customMcpStore.list()).map((row) => row.displayName)).toEqual(["Beta Tools"]);
    // name_key stays globally unique by design: beta may not reuse alpha's display name.
    await expect(beta.customMcpStore.create(mcp("mcp-b", "alpha tools"))).rejects.toMatchObject({ status: 409 });
  });

  it("scopes OAuth authorization codes and tokens per tenant", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.oauthCodeStore.add({
      tenantId: "local",
      codeHash: "alpha-code-hash",
      clientId: "client",
      redirectUri: "https://app.example/callback",
      scope: "read",
      runtimeTokenId: "token",
      issuedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60_000,
    });
    await expect(beta.oauthCodeStore.consume("alpha-code-hash")).resolves.toBeUndefined();
    await expect(alpha.oauthCodeStore.consume("alpha-code-hash")).resolves.toMatchObject({
      codeHash: "alpha-code-hash",
    });

    await alpha.oauthTokenStore.add({
      tenantId: "local",
      tokenHash: "alpha-access-hash",
      clientId: "client",
      runtimeTokenId: "token",
      scope: "read",
      issuedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60_000,
    });
    await expect(beta.oauthTokenStore.findByAccessTokenHash("alpha-access-hash")).resolves.toBeUndefined();
    await expect(alpha.oauthTokenStore.findByAccessTokenHash("alpha-access-hash")).resolves.toMatchObject({
      tokenHash: "alpha-access-hash",
    });
  });

  it("scopes provider preferences per tenant", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    await alpha.marketplaceStore.setProviderPreference({
      service: "github",
      enabled: true,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    expect((await alpha.marketplaceStore.listProviderPreferences()).map((row) => row.service)).toContain("github");
    expect(await beta.marketplaceStore.listProviderPreferences()).toHaveLength(0);
  });

  it("lets two tenants store source applications under the same digest id", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const beta = getDatabase().forTenant(BETA);
    // applicationId is a content digest of caller input, so identical inputs across
    // tenants collide: beta's save must not be swallowed by alpha's row.
    const digestId = "digest-of-same-owner-and-app";
    const application = { secrets: {}, state: {}, sources: {} } as Parameters<
      RuntimeDatabase["triggerStore"]["saveSourceApplication"]
    >[3];
    await expect(alpha.triggerStore.saveSourceApplication("owner", digestId, null, application)).resolves.toBe(true);
    await expect(beta.triggerStore.saveSourceApplication("owner", digestId, null, application)).resolves.toBe(true);

    const alphaRow = await alpha.triggerStore.getSourceApplication("owner", digestId);
    const betaRow = await beta.triggerStore.getSourceApplication("owner", digestId);
    expect(alphaRow?.revision).toBe(1);
    expect(betaRow?.revision).toBe(1);

    await expect(beta.triggerStore.saveSourceApplication("owner", digestId, 1, application)).resolves.toBe(true);
    expect((await beta.triggerStore.getSourceApplication("owner", digestId))?.revision).toBe(2);
    expect((await alpha.triggerStore.getSourceApplication("owner", digestId))?.revision).toBe(1);
  });

  it("keeps the instance scope cross-tenant for maintenance", async () => {
    const alpha = getDatabase().forTenant(ALPHA);
    const instance = getDatabase().forInstance();
    await alpha.connectionStore.set("github", "inst", credential);
    // forInstance() reads across tenants (sweepers, secret rotation) — it must see alpha's row.
    await expect(instance.connectionStore.get("github", "inst")).resolves.toBeDefined();
  });
}
