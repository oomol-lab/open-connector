import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { McpClientToolResult } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";

import { ProtocolError } from "@modelcontextprotocol/client";
import { sha256Hex } from "../../core/aws-sigv4.ts";
import { listMcpTools, withMcpToolClient } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const origin = "https://mcp.didichuxing.com";
const endpoint = `${origin}/mcp-servers`;
const handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {};
for (const name of [
  "maps_direction_bicycling",
  "maps_direction_driving",
  "maps_direction_transit",
  "maps_direction_walking",
  "maps_place_around",
  "maps_regeocode",
  "maps_textsearch",
  "taxi_cancel_order",
  "taxi_create_order",
  "taxi_estimate",
  "taxi_generate_ride_app_link",
  "taxi_get_driver_location",
  "taxi_query_order",
]) {
  handlers[name] = (input, context) =>
    withMcpToolClient(connection(context), async (client) => {
      let result: McpClientToolResult;
      try {
        result = await client.callTool({ name, arguments: input }, { signal: context.signal });
      } catch (error) {
        if (error instanceof ProtocolError)
          throw new ProviderRequestError(502, `DiDi error ${error.code}: ${error.message}`, {
            upstreamCode: error.code,
          });
        throw error;
      }
      if (!("content" in result)) throw new ProviderRequestError(502, "DiDi returned no MCP content");
      if (result.isError) {
        const message = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("; ");
        throw new ProviderRequestError(502, `DiDi tool failed: ${message}`);
      }
      let data: unknown = result.structuredContent ?? null;
      if (result.structuredContent === undefined && name.startsWith("maps_")) {
        const text = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");
        try {
          data = JSON.parse(text);
        } catch {
          throw new ProviderRequestError(502, "DiDi maps returned invalid JSON text");
        }
      }
      return { data, content: result.content };
    });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("didi", handlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "didi",
  baseUrl: origin,
  auth: { type: "api_key_query", name: "key" },
  allowedEndpoint: (endpoint) => ["/mcp-servers", "/mcp-servers-sandbox"].includes(endpoint),
  redirect: "manual",
  customizeRequest({ headers }) {
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("accept", "application/json, text/event-stream");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const tools = await listMcpTools(connection({ apiKey: input.apiKey, fetcher, signal }));
    if (!tools.some((tool) => Object.hasOwn(handlers, tool.name)))
      throw new ProviderRequestError(502, "DiDi returned no supported tools");
    const hash = sha256Hex(requiredInputString(input.apiKey, "MCP Key"));
    return {
      profile: { accountId: `didi:${hash}`, displayName: `DiDi · ${hash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
function connection(context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">) {
  const url = new URL(endpoint);
  url.searchParams.set("key", requiredInputString(context.apiKey, "MCP Key"));
  return {
    endpoint: url.href,
    service: "DiDi",
    fetcher: context.fetcher,
    signal: context.signal,
    redirect: "manual" as const,
    headers: { "content-type": "application/json; charset=utf-8" },
    maxResponseBytes: 16 * 1024 * 1024,
  };
}
