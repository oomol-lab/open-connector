import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { McpToolOptions, McpToolSummary } from "../mcp-tools.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
} from "../provider-runtime.ts";
import { baizhiMcpActions } from "./actions.ts";

const service = "baizhi_mcp";
const endpoint = "https://agent-toolkit.app.baizhi.cloud/mcp";
const allowedToolNames = new Set(["websearch_search", "web_scrape", "web_extract"]);

const handlers = mapProviderActionHandlers(
  service,
  baizhiMcpActions,
  (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const connection = connectionInput(context.apiKey, context.fetcher, context.signal);
    if (actionName === "list_tools") {
      const tools = await safeMcpRequest(context.apiKey, () => listMcpTools(connection, { includeAnnotations: true }));
      return { tools: selectReadableTools(tools) };
    }

    const toolName = requiredInputString(input.toolName, "toolName");
    if (!allowedToolNames.has(toolName)) {
      throw providerInputError("Only Baizhi web search, page reading, and extraction tools are supported");
    }
    return {
      result: await safeMcpRequest(context.apiKey, () =>
        callMcpTool({
          ...connection,
          toolName,
          arguments: optionalRecord(input.arguments) ?? {},
          authorizeTool(tool) {
            if (!tool || !isReadableTool(tool)) {
              throw providerInputError(`Baizhi MCP tool ${toolName} is unavailable or not read-only`);
            }
          },
        }),
      ),
    };
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requiredInputString(input.apiKey, "Baizhi API Key");
    const tools = await safeMcpRequest(key, () =>
      listMcpTools(connectionInput(key, fetcher, signal), { includeAnnotations: true }),
    );
    if (selectReadableTools(tools).length === 0) {
      throw providerInputError("Baizhi MCP did not advertise a supported read-only web tool");
    }
    const hash = sha256Hex(key).slice(0, 16);
    return {
      profile: { accountId: `baizhi-mcp:${hash}`, displayName: `Baizhi Cloud · ${hash.slice(-6)}` },
      metadata: { mcpEndpoint: endpoint },
    };
  },
};

function connectionInput(key: string, fetcher: ProviderFetch, signal?: AbortSignal): McpToolOptions {
  const apiKey = requiredInputString(key, "Baizhi API Key");
  if (/^Bearer\s+/i.test(apiKey)) {
    throw providerInputError("Paste the Baizhi API Key without the Bearer prefix");
  }
  return {
    endpoint,
    service: "Baizhi",
    fetcher,
    headers: { authorization: `Bearer ${apiKey}` },
    // Cloudflare Workers rejects `redirect: "error"`; a 3xx under "manual" still fails the MCP request.
    redirect: "manual",
    terminateSession: true,
    signal,
    maxResponseBytes: 8 * 1024 * 1024,
    toolListMaxBytes: 2 * 1024 * 1024,
    toolListMaxPages: 20,
    toolListMaxTools: 1_000,
  };
}

function isReadableTool(tool: McpToolSummary): boolean {
  return (
    allowedToolNames.has(tool.name) &&
    tool.annotations?.readOnlyHint !== false &&
    tool.annotations?.destructiveHint !== true
  );
}

function selectReadableTools(tools: McpToolSummary[]): McpToolSummary[] {
  const selected = tools.filter((tool) => allowedToolNames.has(tool.name));
  const names = new Set<string>();
  for (const tool of selected) {
    if (names.has(tool.name)) {
      throw providerResponseError("Baizhi MCP tools/list returned duplicate web tool names");
    }
    names.add(tool.name);
  }
  return selected.filter(isReadableTool);
}

/**
 * Redact the API Key from MCP errors, which can echo upstream response bodies.
 * The shared MCP mapper tags 401/403 as provider_error; clearing that code lets
 * the runtime report them as authorization_failed.
 */
async function safeMcpRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof ProviderRequestError)) throw error;
    const rawKey = key.trim();
    const message = error.message.split(rawKey).join("[redacted]").split(encodeURIComponent(rawKey)).join("[redacted]");
    const code = error.status === 401 || error.status === 403 ? undefined : error.code;
    throw new ProviderRequestError(error.status, message, error.details, code);
  }
}
