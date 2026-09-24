import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { McpToolOptions } from "../mcp-tools.ts";
import type { McpClientToolResult } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalString, optionalNumber, looseArray, recordOrEmpty } from "../../core/cast.ts";
import { listMcpTools, callMcpTool } from "../mcp-tools.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { finchinaActions } from "./actions.ts";
const endpoint = "https://mcp.finchina.com/finchina-data-mcp-server/mcp";
const handlers = mapProviderActionHandlers(
  "finchina",
  finchinaActions,
  (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const connection = mcpInput(context.apiKey, context.fetcher, context.signal);
    if (actionName === "list_tools") {
      return { tools: await listMcpTools(connection, { includeAnnotations: true }) };
    }
    let toolName = "execute_tool";
    let toolArguments: Record<string, unknown>;
    if (actionName === "discover_tools") {
      toolName = requiredInputString(input.toolName, "toolName");
      if (!toolName.startsWith("query_") && !toolName.startsWith("screen_")) {
        throw new ProviderRequestError(
          400,
          "toolName must be a query_* or screen_* navigation tool from list_tools",
          undefined,
          "invalid_input",
        );
      }
      toolArguments = {};
    } else if (actionName === "get_metadata") {
      toolName = "caihui_mcp_metadata";
      toolArguments = recordOrEmpty(input.arguments);
    } else if (actionName === "execute_tool") {
      toolArguments = { tool_name: input.toolName, arguments: input.arguments };
    } else {
      const query = { ...(optionalRecord(input.additionalArguments) ?? {}) };
      if (input.sort !== undefined) {
        if (Object.hasOwn(query, "sort_list"))
          throw new ProviderRequestError(
            400,
            "additionalArguments must not repeat sort_list",
            undefined,
            "invalid_input",
          );
        query.sort_list = looseArray(input.sort).map((value) => {
          const rule = recordOrEmpty(value);
          return {
            sort_by: requiredInputString(rule.field, "sort.field"),
            order: requiredInputString(rule.order, "sort.order"),
          };
        });
      }
      for (const [source, target] of Object.entries({
        companies: "target_company",
        indicators: "indicator_name",
        date: "date",
      })) {
        if (input[source] !== undefined) {
          if (Object.hasOwn(query, target))
            throw new ProviderRequestError(
              400,
              `additionalArguments must not repeat ${target}`,
              undefined,
              "invalid_input",
            );
          query[target] = input[source];
        }
      }
      toolArguments = { tool_name: actionName, arguments: query };
    }
    const result = await callMcpTool({
      ...connection,
      toolName,
      arguments: toolArguments,
      transformToolResult: decodeFinchinaResult,
    });
    if (toolName !== "execute_tool") return { result };
    const envelope = requiredResponseRecord(result, "FinChina query result");
    const status = requiredResponseRecord(envelope.status, "FinChina query status");
    if (optionalNumber(status.code) === undefined || !Object.hasOwn(envelope, "data")) {
      throw new ProviderRequestError(
        502,
        "FinChina query result is missing data or status.code",
        undefined,
        "provider_error",
      );
    }
    return envelope;
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("finchina", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "finchina",
  baseUrl: endpoint,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey;
    const tools = await listMcpTools(mcpInput(apiKey, fetcher, signal));
    if (!tools.some((tool) => tool.name === "execute_tool")) {
      throw new ProviderRequestError(
        502,
        "FinChina did not expose its execute_tool query entry point for this account",
        undefined,
        "provider_error",
      );
    }
    return {
      profile: { accountId: `finchina:${sha256Hex(apiKey).slice(0, 32)}`, displayName: "FinChina Account" },

      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
function mcpInput(apiKey: string, fetcher: ProviderFetch, signal?: AbortSignal): McpToolOptions {
  return {
    endpoint,
    signal,
    service: "FinChina",
    headers: { "x-api-key": apiKey },
    fetcher,
    redirect: "manual",
    terminateSession: true,
  };
}

function decodeFinchinaResult(result: McpClientToolResult): McpClientToolResult {
  if (!("content" in result)) return result;
  let payload = optionalRecord(result.structuredContent);
  if (payload === undefined && result.content[0]?.type === "text") {
    try {
      payload = optionalRecord(JSON.parse(result.content[0].text));
    } catch {
      /* Preserve non-JSON MCP navigation content. */
    }
  }
  const status = optionalRecord(payload?.status);
  const code = optionalNumber(status?.code);
  if (code !== undefined && code >= 100) {
    const error = optionalRecord(status?.error);
    const message =
      optionalString(error?.message) ??
      optionalString(status?.error) ??
      optionalString(status?.message) ??
      "FinChina query failed";
    const invalidInput = code === 100 || code === 300 || code === 400;
    throw new ProviderRequestError(
      invalidInput ? 400 : code === 200 ? 403 : 502,
      message,
      { providerCode: code, providerStatus: status },
      invalidInput ? "invalid_input" : "provider_error",
    );
  }
  return { ...result, structuredContent: payload };
}
