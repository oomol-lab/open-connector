import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { McpToolOptions } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { listMcpTools, callMcpTool } from "../mcp-tools.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";
import { investodayMcpActions } from "./actions.ts";
import { investodayOfficialToolNames } from "./official-actions.ts";
const endpoint = "https://data-api.investoday.net/data/mcp";
const handlers = mapProviderActionHandlers(
  "investoday_mcp",
  investodayMcpActions,
  (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    if (actionName === "list_stock_adjusted_quotes" || actionName === "get_stock_val_indicators") {
      const beginDate = optionalString(input.beginDate);
      const endDate = optionalString(input.endDate);
      if ((beginDate && beginDate < "2020-01-01") || (beginDate && endDate && beginDate > endDate))
        throw new ProviderRequestError(400, "beginDate must be on or after 2020-01-01 and no later than endDate");
    }
    const connection = connectionInput(context.apiKey, context.fetcher, context.signal);
    if (actionName === "list_tools") return { tools: await listMcpTools(connection, { includeAnnotations: true }) };
    return {
      result: await callMcpTool({
        ...connection,
        toolName: investodayOfficialToolNames.get(actionName) ?? requiredInputString(input.toolName, "toolName"),
        arguments: investodayOfficialToolNames.has(actionName) ? input : (optionalRecord(input.arguments) ?? {}),
      }),
    };
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("investoday_mcp", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "investoday_mcp",
  baseUrl: endpoint,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
  redirect: "manual",
  allowedEndpoint(value) {
    const url = new URL(value, endpoint);
    return url.origin === "https://data-api.investoday.net" && url.pathname === "/data/mcp";
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requiredInputString(input.apiKey, "MCP API Key");
    const tools = await listMcpTools(connectionInput(key, fetcher, signal));
    if (!tools.length) throw new ProviderRequestError(400, "Investoday MCP did not expose any tools for this API Key");
    const hash = sha256Hex(key).slice(0, 16);
    return {
      profile: { accountId: `investoday-mcp:${hash}`, displayName: `Investoday MCP · ${hash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
function connectionInput(key: string, fetcher: ProviderFetch, signal?: AbortSignal): McpToolOptions {
  key = key.trim();
  const url = new URL(endpoint);
  url.searchParams.set("apiKey", key);
  return {
    endpoint: url.toString(),
    service: "Investoday",
    fetcher: createInvestodayFetch(fetcher, key),
    signal,
    redirect: "manual",
    terminateSession: true,
  };
}

function createInvestodayFetch(fetcher: ProviderFetch, apiKey: string): ProviderFetch {
  const request = async (...args: Parameters<ProviderFetch>) => {
    const response = await fetcher(...args);

    if (response.ok || args[1]?.method !== "POST" || response.status === 404) return response;
    const body = optionalRecord(await response.json().catch(() => undefined));
    const error = optionalRecord(body?.error);
    const detail = optionalString(error?.message) ?? optionalString(body?.message);
    const code = error?.code;
    const message = detail
      ? detail.split(apiKey).join("[REDACTED]").split(encodeURIComponent(apiKey)).join("[REDACTED]")
      : "Request failed";
    throw new ProviderRequestError(
      response.status,
      `Investoday MCP: ${message}${typeof code === "number" ? ` (code ${code})` : ""}`,
      undefined,
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  };
  return request;
}
