import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { McpToolOptions } from "../mcp-tools.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import {
  defineApiKeyProviderExecutors,
  mapProviderActionHandlers,
  providerInputError,
  requiredInputString,
} from "../provider-runtime.ts";
import { timemSpaceActions } from "./actions.ts";
const endpoint = "https://api.space.timem.cloud/mcp/";
function connection(context: ApiKeyProviderContext): McpToolOptions {
  return {
    endpoint,
    service: "TiMEM Space",
    fetcher: context.fetcher,
    signal: context.signal,
    headers: { "X-API-Key": requiredInputString(context.apiKey, "TiMEM Space API Key") },
    redirect: "manual",
    terminateSession: true,
    requestTimeoutMs: 130_000,
    maxResponseBytes: 8 * 1024 * 1024,
    toolListMaxBytes: 2 * 1024 * 1024,
    toolListMaxPages: 10,
    toolListMaxTools: 200,
  };
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "timem_space",
  mapProviderActionHandlers(
    "timem_space",
    timemSpaceActions,
    (_action, name) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const options = connection(context);
      if (name === "list_tools")
        return { tools: await listMcpTools(options, { includeAnnotations: true, includeOutputSchema: true }) };
      return {
        result: await callMcpTool({
          ...options,
          toolName: name === "call_tool" ? requiredInputString(input.toolName, "toolName") : name,
          arguments: name === "call_tool" ? (optionalRecord(input.arguments) ?? {}) : input,
        }),
      };
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requiredInputString(input.apiKey, "TiMEM Space API Key");
    const tools = await listMcpTools(connection({ apiKey: key, fetcher, signal }), {
      includeAnnotations: true,
      includeOutputSchema: true,
    });
    const names = new Set(tools.map((t) => t.name));
    if (!names.has("search_memories") || !names.has("ready"))
      throw providerInputError("TiMEM Space MCP did not expose the expected memory and connectivity tools");
    const hash = sha256Hex(key).slice(0, 16);
    return {
      profile: { accountId: `timem-space:${hash}`, displayName: `TiMEM Space · ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
