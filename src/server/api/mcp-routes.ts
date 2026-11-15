import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type * as McpRuntime from "../../mcp.ts";
import type { McpOutputMode } from "../mcp-settings.ts";
import type { ScopedServices } from "../tenant-services.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { PromiseCache } from "../../core/promise-cache.ts";
import { readRuntimeGrant, readTenantId } from "./auth.ts";
import { HttpRequestError } from "./http-utils.ts";

export type McpModule = typeof McpRuntime;

const mcpModule = new PromiseCache<McpModule>();

export function loadMcpModule(): Promise<McpModule> {
  return mcpModule.get("", () => import("../../mcp.ts"));
}

function rejectMcpMethod(context: Context): Response {
  return context.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    405,
  );
}

export interface McpRoutesOptions {
  services: ScopedServices;
  outputMode?: McpOutputMode;
  getPolicySnapshot: (context: Context) => Promise<ActionPolicySnapshot>;
}

/** MCP transport and tool discovery routes. */
export function createMcpRoutes({ services, outputMode, getPolicySnapshot }: McpRoutesOptions): Hono {
  const app = new Hono();

  app.post("/mcp", async (context) => {
    const { catalog, connections, actions } = await services.forTenant(readTenantId(context));
    if (!actions) throw new HttpRequestError("service_unavailable", "MCP execution is unavailable.", 503);
    const { handleMcpRequest } = await loadMcpModule();
    return await handleMcpRequest(context.req.raw, {
      catalog,
      connections,
      actions,
      actionSearch: { get: () => catalog.getSearchIndex() },
      outputMode,
      getPolicySnapshot: () => getPolicySnapshot(context),
      runtimeGrant: readRuntimeGrant(context),
      signal: context.req.raw.signal,
    });
  });

  app.get("/mcp", (context) => rejectMcpMethod(context));
  app.delete("/mcp", (context) => rejectMcpMethod(context));

  app.get("/mcp/tools", async (context) => context.json({ tools: (await loadMcpModule()).listMcpToolSummaries() }));

  return app;
}
