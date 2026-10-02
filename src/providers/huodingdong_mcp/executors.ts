import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { McpToolOptions } from "../mcp-tools.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  requiredInputString,
} from "../provider-runtime.ts";
const origin = "https://mcp.huodingdong.com";
const endpoint = `${origin}/mcp`;
function connection(context: ApiKeyProviderContext): McpToolOptions {
  return {
    endpoint,
    service: "Huodingdong",
    fetcher: context.fetcher,
    signal: context.signal,
    headers: { "X-Mcp-Key": requiredInputString(context.apiKey, "X-Mcp-Key") },
    redirect: "manual",
    terminateSession: true,
    maxResponseBytes: 16 * 1024 * 1024,
  };
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "huodingdong_mcp",
  {
    async list_tools(_input, context) {
      return {
        tools: await listMcpTools(connection(context), { includeAnnotations: true, includeOutputSchema: true }),
      };
    },
    async call_tool(input, context) {
      const toolName = requiredInputString(input.toolName, "toolName");
      const args = optionalRecord(input.arguments) ?? {};
      // The official connector package requires region even when the live schema omits it.
      if (toolName === "hdd_product_pricing_simulation") requiredInputString(args.region, "region");
      return { result: await callMcpTool({ ...connection(context), toolName, arguments: args }) };
    },
  },
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requiredInputString(input.apiKey, "X-Mcp-Key");
    const tools = await listMcpTools(connection({ apiKey: key, fetcher, signal }));
    const hash = sha256Hex(key);
    return {
      profile: { accountId: `huodingdong-mcp:${hash}`, displayName: `Huodingdong ERP MCP · ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "huodingdong_mcp",
  baseUrl: origin,
  auth: { type: "api_key_header", name: "X-Mcp-Key" },
  skipDnsValidation: true,
  sensitiveHeaders: ["X-Mcp-Key"],
  customizeRequest({ url, headers }) {
    if (url.href !== endpoint)
      throw providerInputError("Huodingdong MCP proxy only supports the official /mcp endpoint without a query string");
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  },
});
