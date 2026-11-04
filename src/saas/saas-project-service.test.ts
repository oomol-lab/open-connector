import type { ProviderDefinition } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { AesGcmSecretCodec, PlainTextSecretCodec } from "../server/secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite/runtime-store.ts";
import { SaasClient } from "./saas-client.ts";
import { SaasProjectService } from "./saas-project-service.ts";

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: [],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://provider.example/authorize",
      tokenUrl: "https://provider.example/token",
      tokenEndpointAuthMethod: "client_secret_post",
      scopes: ["read"],
      authorizationOptions: [
        { id: "read", label: "Read", description: "Read", required: true, defaultSelected: true, risk: "standard" },
      ],
    },
  ],
  actions: [
    {
      id: "example.read",
      service: "example",
      name: "read",
      description: "Read",
      operationType: "read",
      requiredScopes: ["read"],
      providerPermissions: [],
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  ],
};
const discovery = {
  projectId: "project",
  providerConfigs: [
    {
      id: "config",
      service: "example",
      displayName: "Example",
      callbackUrl: "https://saas.example/oauth/callback",
      effectiveScopes: ["read"],
      actionIds: ["example.read", "remote.only"],
      proxyAvailable: true,
    },
  ],
};
const input = { baseUrl: "https://saas.example/", projectApiKey: "project-secret" };
const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});
function setup(origin: string | undefined = "https://connect.example", encrypted = true) {
  const secretCodec = encrypted ? new AesGcmSecretCodec("storage-key") : new PlainTextSecretCodec();
  const database = new SqliteRuntimeDatabase(":memory:", { secretCodec });
  databases.push(database);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ success: true, data: discovery }));
  const catalog = createCatalogStore([provider]);
  const service = new SaasProjectService({
    catalog,
    store: database.saasProjectStore,
    secretCodec,
    configuredOrigin: origin,
    client: new SaasClient(fetcher),
  });
  return { database, fetcher, service, catalog };
}

describe("SaasProjectService", () => {
  it("coalesces execution discovery and expires successful snapshots after 30 seconds", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { service, fetcher } = setup();
    await service.configure(input);
    fetcher.mockClear();

    const configs = await Promise.all(
      Array.from({ length: 10 }, () => service.resolveExecutionConfig("example", "config", undefined)),
    );
    expect(configs.every(({ config }) => config.actionIds.includes("example.read"))).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    now = 29_999;
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).toHaveBeenCalledOnce();
    now = 30_000;
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["health", "configs", "authorization"])("refreshes execution capabilities through %s reads", async (kind) => {
    const { service, fetcher } = setup();
    await service.configure(input);
    await service.resolveExecutionConfig("example", "config", undefined);
    fetcher.mockClear();
    fetcher.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: {
          ...discovery,
          providerConfigs: [{ ...discovery.providerConfigs[0], actionIds: [] }],
        },
      }),
    );

    if (kind === "health") await service.getState();
    else if (kind === "configs") await service.listProviderConfigs();
    else await service.resolveConfig("example", "config");

    expect((await service.resolveExecutionConfig("example", "config", undefined)).config.actionIds).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("detects keys rotated by another instance and keeps late invalidations away from the replacement", async () => {
    const { service, database, fetcher } = setup();
    await service.configure(input);
    const previous = (await database.saasProjectStore.getProject())!;
    await service.resolveExecutionConfig("example", "config", undefined);
    await database.saasProjectStore.saveProject({ ...previous, apiKey: "rotated-key" });
    fetcher.mockClear();

    const current = await service.resolveExecutionConfig("example", "config", undefined);
    expect(current.project.apiKey).toBe("rotated-key");
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer rotated-key");
    service.invalidateDiscovery(previous);
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("discards execution capabilities when the project configuration is saved with the same key", async () => {
    const { service, fetcher } = setup();
    await service.configure(input);
    await service.resolveExecutionConfig("example", "config", undefined);
    fetcher.mockImplementation(async () =>
      Response.json({
        success: true,
        data: {
          ...discovery,
          providerConfigs: [{ ...discovery.providerConfigs[0], actionIds: ["replacement.action"] }],
        },
      }),
    );
    await service.configure(input);
    expect((await service.resolveExecutionConfig("example", "config", undefined)).config.actionIds).toEqual([
      "replacement.action",
    ]);
  });

  it("rechecks the stored binding even while capabilities are cached", async () => {
    const { service, database, fetcher } = setup();
    await service.configure(input);
    const previous = (await database.saasProjectStore.getProject())!;
    await service.resolveExecutionConfig("example", "config", previous.id);
    fetcher.mockClear();
    expect(await database.saasProjectStore.deleteProject(previous.id)).toBe(true);
    await expect(service.resolveExecutionConfig("example", "config", previous.id)).rejects.toMatchObject({
      code: "oauth_source_not_configured",
    });
    await database.saasProjectStore.saveProject({ ...previous, id: "replacement-binding" });
    await expect(service.resolveExecutionConfig("example", "config", previous.id)).rejects.toMatchObject({
      code: "oauth_source_mismatch",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["network", "identity"])("retries discovery after a %s failure without caching it", async (failure) => {
    const { service, fetcher } = setup();
    await service.configure(input);
    fetcher.mockClear();
    if (failure === "network") fetcher.mockRejectedValueOnce(new TypeError("network unavailable"));
    else fetcher.mockResolvedValueOnce(Response.json({ success: true, data: { ...discovery, projectId: "other" } }));
    await expect(service.resolveExecutionConfig("example", "config", undefined)).rejects.toMatchObject({
      code: failure === "network" ? "oauth_source_unavailable" : "oauth_source_mismatch",
    });
    await service.resolveExecutionConfig("example", "config", undefined);
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retain a healthy snapshot after an explicit refresh rejects the key", async () => {
    const { service, fetcher } = setup();
    await service.configure(input);
    await service.resolveExecutionConfig("example", "config", undefined);
    fetcher.mockClear();
    fetcher.mockImplementation(async () => new Response("rejected", { status: 401 }));
    expect(await service.getState()).toMatchObject({ status: "auth_error" });
    await expect(service.resolveExecutionConfig("example", "config", undefined)).rejects.toMatchObject({
      code: "oauth_source_unauthorized",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps shared discovery alive when only one waiting caller cancels", async () => {
    const { service, database, fetcher } = setup();
    await service.configure(input);
    vi.spyOn(database.saasProjectStore, "getProject").mockResolvedValue(await database.saasProjectStore.getProject());
    fetcher.mockClear();
    const started = Promise.withResolvers<AbortSignal>();
    const reply = Promise.withResolvers<Response>();
    fetcher.mockImplementationOnce(async (_url, init) => {
      started.resolve(init!.signal!);
      return reply.promise;
    });
    const controller = new AbortController();
    const first = service.resolveExecutionConfig("example", "config", undefined, controller.signal);
    const second = service.resolveExecutionConfig("example", "config", undefined);
    const sharedSignal = await started.promise;
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal.aborted).toBe(false);
    reply.resolve(Response.json({ success: true, data: discovery }));
    await expect(second).resolves.toMatchObject({ config: { id: "config" } });
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("aborts discovery after all callers cancel and does not cache a late response", async () => {
    const { service, database, fetcher } = setup();
    await service.configure(input);
    vi.spyOn(database.saasProjectStore, "getProject").mockResolvedValue(await database.saasProjectStore.getProject());
    fetcher.mockClear();
    const started = Promise.withResolvers<AbortSignal>();
    const reply = Promise.withResolvers<Response>();
    fetcher.mockImplementationOnce(async (_url, init) => {
      started.resolve(init!.signal!);
      return reply.promise;
    });
    const controllers = [new AbortController(), new AbortController()];
    const pending = controllers.map((controller) =>
      service.resolveExecutionConfig("example", "config", undefined, controller.signal),
    );
    const sharedSignal = await started.promise;
    controllers.forEach((controller) => controller.abort());
    expect((await Promise.allSettled(pending)).every((result) => result.status === "rejected")).toBe(true);
    expect(sharedSignal.aborted).toBe(true);
    await service.resolveExecutionConfig("example", "config", undefined);
    reply.resolve(Response.json({ success: true, data: { ...discovery, providerConfigs: [] } }));
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not let an old discovery overwrite a rotated project's capabilities", async () => {
    const { service, database, fetcher } = setup();
    await service.configure(input);
    const previous = (await database.saasProjectStore.getProject())!;
    fetcher.mockClear();
    const started = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<Response>();
    fetcher.mockImplementationOnce(async () => {
      started.resolve();
      return reply.promise;
    });
    const pending = service.resolveExecutionConfig("example", "config", undefined);
    await started.promise;
    await database.saasProjectStore.saveProject({ ...previous, apiKey: "new-key" });
    fetcher.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: {
          ...discovery,
          providerConfigs: [{ ...discovery.providerConfigs[0], actionIds: ["replacement.action"] }],
        },
      }),
    );
    await service.resolveExecutionConfig("example", "config", undefined);
    reply.resolve(Response.json({ success: true, data: discovery }));
    await pending;
    expect((await service.resolveExecutionConfig("example", "config", undefined)).config.actionIds).toEqual([
      "replacement.action",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects an already cancelled cache hit without evicting the snapshot", async () => {
    const { service, database, fetcher } = setup();
    await service.configure(input);
    await service.resolveExecutionConfig("example", "config", undefined);
    fetcher.mockClear();
    const getProject = vi.spyOn(database.saasProjectStore, "getProject");
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.resolveExecutionConfig("example", "config", undefined, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getProject).not.toHaveBeenCalled();
    await service.resolveExecutionConfig("example", "config", undefined);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts keys, rotates only within the project, and derives a persistent external identity", async () => {
    const { service, database } = setup();
    const saved = await service.configure(input);
    expect(saved).toMatchObject({
      configured: true,
      projectId: "project",
      baseUrl: "https://saas.example",
      status: "available",
    });
    expect(JSON.stringify(saved)).not.toContain("project-secret");
    expect(await service.configure({ ...input, projectApiKey: "rotated" })).toMatchObject({
      managedProjectId: saved.managedProjectId,
    });
    expect((await database.saasProjectStore.getProject())?.apiKey).toBe("rotated");
    const ids = await Promise.all([service.externalUserId(), service.externalUserId()]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toBe(`open-connector:${await database.saasProjectStore.getInstanceId()}`);
    await expect(service.configure({ ...input, baseUrl: "https://other.example" })).rejects.toMatchObject({
      code: "oauth_source_mismatch",
    });
  });

  it("keeps existing configuration and defaults when a replacement key belongs to another project", async () => {
    const { service, fetcher, database } = setup();
    await service.configure(input);
    await service.setSource("example", { mode: "saas", providerConfigId: "config" });
    fetcher.mockResolvedValueOnce(Response.json({ success: true, data: { ...discovery, projectId: "other" } }));
    await expect(service.configure({ ...input, projectApiKey: "other-key" })).rejects.toMatchObject({
      code: "oauth_source_mismatch",
    });
    expect((await database.saasProjectStore.getProject())?.apiKey).toBe("project-secret");
    expect(await service.getSource("example")).toMatchObject({ mode: "saas", projectId: "project" });
  });

  it("keeps configured separate from health and permits explicit local fallback during an outage", async () => {
    const { service, fetcher } = setup();
    await service.configure(input);
    await service.setSource("example", { mode: "saas", providerConfigId: "config" });
    fetcher.mockImplementation(async () => new Response("secret error", { status: 401 }));
    expect(await service.getState()).toMatchObject({ configured: true, status: "auth_error" });
    fetcher.mockImplementation(async () => {
      throw new Error("private details");
    });
    expect(await service.getState()).toMatchObject({ configured: true, status: "unavailable" });
    await expect(service.remove()).rejects.toMatchObject({ code: "oauth_source_in_use" });
    await service.setSource("example", { mode: "local" });
    await service.remove();
    expect(await service.getState()).toMatchObject({ configured: false });
  });

  it("intersects remote capabilities without modifying the catalog", async () => {
    const { service, catalog } = setup();
    await service.configure(input);
    const configs = await service.listProviderConfigs();
    expect(configs.providerConfigs[0].actionIds).toEqual(["example.read"]);
    expect(catalog.actions.map((action) => action.id)).toEqual(["example.read"]);
    expect(await service.setSource("example", { mode: "saas", providerConfigId: "config" })).toMatchObject({
      mode: "saas",
      providerConfigId: "config",
    });
  });

  it("retries a failed health check once and reports recovery", async () => {
    const { service, fetcher } = setup();
    await service.configure(input);
    fetcher.mockClear();
    fetcher.mockRejectedValueOnce(new TypeError("fetch failed"));

    expect(await service.getState()).toMatchObject({ configured: true, status: "available" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stops after two failed health checks without removing the project", async () => {
    const { service, fetcher, database } = setup();
    await service.configure(input);
    fetcher.mockClear();
    fetcher.mockImplementation(async () => new Response("Unavailable", { status: 503 }));

    expect(await service.getState()).toMatchObject({ configured: true, status: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await database.saasProjectStore.getProject()).not.toBeNull();
  });

  it.each([401, 403, 404, 429])("does not retry a definitive health check failure: %s", async (status) => {
    const { service, fetcher } = setup();
    await service.configure(input);
    fetcher.mockClear();
    fetcher.mockImplementation(async () => new Response("Rejected", { status }));

    expect(await service.getState()).toMatchObject({
      status: status === 401 || status === 403 ? "auth_error" : "unavailable",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry a cancelled health check", async () => {
    const { service, fetcher } = setup();
    await service.configure(input);
    fetcher.mockClear();
    const controller = new AbortController();
    fetcher.mockImplementationOnce(async () => {
      controller.abort();
      throw controller.signal.reason;
    });

    await expect(service.getState(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([{ effectiveScopes: [] }, { service: "other" }, { actionIds: [], proxyAvailable: false }])(
    "rejects incompatible remote configuration %j",
    async (changes) => {
      const { service, fetcher } = setup();
      await service.configure(input);
      fetcher.mockResolvedValue(
        Response.json({
          success: true,
          data: { ...discovery, providerConfigs: [{ ...discovery.providerConfigs[0], ...changes }] },
        }),
      );
      await expect(service.setSource("example", { mode: "saas", providerConfigId: "config" })).rejects.toThrow();
      expect(await service.getSource("example")).toEqual({ mode: "local" });
    },
  );

  it.each([
    "",
    "javascript:alert(1)",
    "https://user:secret@connect.example",
    "https://connect.example/path",
    "https://connect.example?query",
  ])("requires an explicit valid origin: %s", async (origin) => {
    const { service, fetcher } = setup(origin);
    await expect(service.configure(input)).rejects.toMatchObject({ code: "oauth_source_configuration_error" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not recreate a source if its project is removed during capability discovery", async () => {
    const { service, database, fetcher } = setup();
    const state = await service.configure(input);
    fetcher.mockImplementationOnce(async () => {
      expect(await database.saasProjectStore.deleteProject(state.managedProjectId!)).toBe(true);
      return Response.json({ success: true, data: discovery });
    });
    await expect(service.setSource("example", { mode: "saas", providerConfigId: "config" })).rejects.toMatchObject({
      code: "oauth_source_mismatch",
    });
    expect(await service.getSource("example")).toEqual({ mode: "local" });
  });

  it("rejects plaintext storage before sending the key", async () => {
    const { service, fetcher } = setup("https://connect.example", false);
    await expect(service.configure(input)).rejects.toMatchObject({ code: "oauth_source_configuration_error" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
