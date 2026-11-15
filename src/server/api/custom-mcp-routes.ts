import type { ConnectionService } from "../../connection-service.ts";
import type { CustomMcpService } from "../../custom-mcp/service.ts";
import type { ScopedServices, TenantServices } from "../tenant-services.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { readTenantId } from "./auth.ts";
import { HttpRequestError, readJsonBody } from "./http-utils.ts";

export interface CustomMcpRoutesOptions {
  services: ScopedServices;
  publicOrigin: string;
}

interface CustomMcpScopedServices extends TenantServices {
  customMcp: CustomMcpService;
  connections: ConnectionService;
}

/** Administrator-only configuration; ordinary discovery and execution use the existing runtime routes. */
export function createCustomMcpRoutes({ services, publicOrigin }: CustomMcpRoutesOptions): Hono {
  const app = new Hono();
  const scoped = async (context: Context): Promise<CustomMcpScopedServices> => {
    const bundle = await services.forTenant(readTenantId(context));
    if (!bundle.customMcp) throw new HttpRequestError("service_unavailable", "Custom MCP is unavailable.", 503);
    return bundle as CustomMcpScopedServices;
  };
  app.get("/", async (context) => context.json((await scoped(context)).customMcp.catalog.listRecords()));
  app.get("/:service", async (context) =>
    context.json((await scoped(context)).customMcp.get(context.req.param("service"))),
  );
  app.post("/", async (context) => {
    const { customMcpCreateInput } = await import("./custom-mcp-input.ts");
    const parsed = customMcpCreateInput.safeParse(await readJsonBody(context, 32 * 1024));
    if (!parsed.success) throw new HttpRequestError("invalid_input", parsed.error.issues[0].message);
    const redirectUri = `${publicOrigin.replace(/\/$/, "")}/oauth/callback`;
    return context.json(
      await (await scoped(context)).customMcp.create(parsed.data, redirectUri, context.req.raw.signal),
      201,
    );
  });
  app.patch("/:service", async (context) => {
    const { customMcpUpdateInput } = await import("./custom-mcp-input.ts");
    const parsed = customMcpUpdateInput.safeParse(await readJsonBody(context, 32 * 1024));
    if (!parsed.success) throw new HttpRequestError("invalid_input", parsed.error.issues[0].message);
    const { customMcp } = await scoped(context);
    return context.json(
      await customMcp.update(context.req.param("service"), parsed.data.displayName, parsed.data.enabled),
    );
  });
  app.post("/:service/sync", async (context) => {
    const service = context.req.param("service");
    const { customMcpSyncInput } = await import("./custom-mcp-input.ts");
    const parsed = customMcpSyncInput.safeParse(await readJsonBody(context, 32 * 1024));
    if (!parsed.success) throw new HttpRequestError("invalid_input", parsed.error.issues[0].message);
    const { customMcp, connections } = await scoped(context);
    const record = customMcp.get(service);
    const id = parsed.data.connectionId ?? record.syncConnectionId;
    const connection = await connections.resolveConnection(service, undefined, id);
    if (connection.source !== "local") throw new HttpRequestError("invalid_input", "Select a local MCP connection.");
    return context.json(
      await customMcp.sync(service, connection.credential, connection.summary?.id, context.req.raw.signal),
    );
  });
  app.delete("/:service", async (context) => {
    await (await scoped(context)).customMcp.delete(context.req.param("service"));
    return context.json({ deleted: true });
  });
  return app;
}
