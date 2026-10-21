import type { CatalogStore } from "../../catalog-store.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { TriggerMaintenance } from "../../triggers/maintenance.ts";
import type { TriggerRunner } from "../../triggers/trigger-runner.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { optionalString } from "../../core/cast.ts";
import { readRuntimeGrant } from "./auth.ts";
import { HttpRequestError, readConnectionName as defaultReadConnectionName, readJsonBody } from "./http-utils.ts";
import { serializeRuntimeTriggerPermissions, writeRuntimeSuccess } from "./runtime-api.ts";

export interface TriggerRoutesOptions {
  catalog: CatalogStore;
  triggers?: TriggerRunner;
  triggerMaintenance?: TriggerMaintenance;
  getPolicySnapshot: (context: Context) => Promise<ActionPolicySnapshot>;
  readConnectionName?: (context: Context, body?: Record<string, unknown>) => string | undefined;
}

/** Trigger execution and subscription management routes. */
export function createTriggerRoutes({
  catalog,
  triggers,
  triggerMaintenance,
  getPolicySnapshot,
  readConnectionName = defaultReadConnectionName,
}: TriggerRoutesOptions): Hono {
  const app = new Hono();

  app.get("/v1/providers/:service/trigger-permissions", (context) => {
    const service = context.req.param("service");
    const provider = catalog.providers.find((item) => item.service === service);
    if (!provider) throw new HttpRequestError("provider_not_found", "Provider not found.", 404);
    return writeRuntimeSuccess(context, serializeRuntimeTriggerPermissions(provider));
  });

  app.post("/v1/providers/:service/triggers/:triggerId/execute", async (context) => {
    if (!triggers) throw new HttpRequestError("trigger_not_supported", "Trigger execution is unavailable.", 501);
    const { readTriggerRequest } = await import("../../triggers/request.ts");
    const request = readTriggerRequest(await readJsonBody(context, 2 * 1024 * 1024));
    const signal = AbortSignal.any([context.req.raw.signal, AbortSignal.timeout(45_000)]);
    const result = await triggers.run({
      service: context.req.param("service")!,
      triggerId: context.req.param("triggerId")!,
      request,
      connectionName: readConnectionName(context),
      connectionId: optionalString(context.req.header("x-oo-connector-app-id")),
      policy: await getPolicySnapshot(context),
      grant: readRuntimeGrant(context),
      signal,
    });
    return writeRuntimeSuccess(context, result);
  });

  app.get("/api/trigger-subscriptions", async (context) => context.json((await triggerMaintenance?.list()) ?? []));

  app.post("/api/trigger-subscriptions/:id/cancel", async (context) => {
    if (!triggerMaintenance)
      throw new HttpRequestError("trigger_not_supported", "Trigger subscriptions are unavailable.", 501);
    await triggerMaintenance.cancel(context.req.param("id"), context.req.raw.signal);
    return context.json({ ok: true });
  });

  app.post("/api/trigger-subscriptions/:id/abandon", async (context) => {
    if (!triggerMaintenance)
      throw new HttpRequestError("trigger_not_supported", "Trigger subscriptions are unavailable.", 501);
    await triggerMaintenance.abandon(context.req.param("id"), context.req.raw.signal);
    return context.json({ ok: true });
  });

  return app;
}
