import type { ConnectionService } from "../../connection-service.ts";
import type { CustomMcpService } from "../../custom-mcp/service.ts";

import { Hono } from "hono";
import { customMcpCreateInput, customMcpUpdateInput, customMcpSyncInput } from "./custom-mcp-input.ts";
import { HttpRequestError, readJsonBody } from "./http-utils.ts";

export interface CustomMcpRoutesOptions {
  mcp: CustomMcpService;
  connections: ConnectionService;
  publicOrigin: string;
}

/** Administrator-only configuration; ordinary discovery and execution use the existing runtime routes. */
export function createCustomMcpRoutes({ mcp, connections, publicOrigin }: CustomMcpRoutesOptions): Hono {
  const app = new Hono();
  app.get("/", (context) => context.json(mcp.catalog.listRecords()));
  app.get("/:service", (context) => context.json(mcp.get(context.req.param("service"))));
  app.post("/", async (context) => {
    const parsed = customMcpCreateInput.safeParse(await readJsonBody(context, 32 * 1024));
    if (!parsed.success) throw new HttpRequestError("invalid_input", parsed.error.issues[0].message);
    const redirectUri = `${publicOrigin.replace(/\/$/, "")}/oauth/callback`;
    return context.json(await mcp.create(parsed.data, redirectUri, context.req.raw.signal), 201);
  });
  app.patch("/:service", async (context) => {
    const parsed = customMcpUpdateInput.safeParse(await readJsonBody(context, 32 * 1024));
    if (!parsed.success) throw new HttpRequestError("invalid_input", parsed.error.issues[0].message);
    return context.json(await mcp.update(context.req.param("service"), parsed.data.displayName, parsed.data.enabled));
  });
  app.post("/:service/sync", async (context) => {
    const service = context.req.param("service");
    const parsed = customMcpSyncInput.safeParse(await readJsonBody(context, 32 * 1024));
    if (!parsed.success) throw new HttpRequestError("invalid_input", parsed.error.issues[0].message);
    const record = mcp.get(service);
    const id = parsed.data.connectionId ?? record.syncConnectionId;
    const connection = await connections.resolveConnection(service, undefined, id);
    if (connection.source !== "local") throw new HttpRequestError("invalid_input", "Select a local MCP connection.");
    return context.json(await mcp.sync(service, connection.credential, connection.summary?.id, context.req.raw.signal));
  });
  app.delete("/:service", async (context) => {
    await mcp.delete(context.req.param("service"));
    return context.json({ deleted: true });
  });
  return app;
}
