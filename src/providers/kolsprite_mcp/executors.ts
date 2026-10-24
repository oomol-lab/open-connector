import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  requiredInputString,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { kolspriteMcpActions } from "./actions.ts";
const origin = "https://mcp.kolsprite.com";
const endpoint = `${origin}/mcp`;
function connectionInput(key: string, fetcher: typeof fetch, signal?: AbortSignal) {
  return {
    endpoint,
    signal,
    service: "KOLSprite",
    headers: { "secret-key": key },
    fetcher,
    redirect: "manual" as const,
    maxResponseBytes: 16 * 1024 * 1024,
  };
}
function parseResponse(result: unknown) {
  let body = requiredResponseRecord(result, "KOLSprite MCP");
  if (Array.isArray(body.content)) {
    const content = body.content;
    const block = content.length === 1 ? optionalRecord(content[0]) : undefined;
    const text = block?.type === "text" ? optionalString(block.text) : undefined;
    if (text === undefined) {
      throw providerResponseError("KOLSprite MCP returned an unsupported content response");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      throw providerResponseError("KOLSprite MCP returned invalid JSON");
    }
    body = requiredResponseRecord(decoded, "KOLSprite MCP");
  }
  const code = optionalString(body.code);
  if (body.success === false || (code !== undefined && code !== "OK")) {
    const message = optionalString(body.message) ?? "Tool request failed";
    throw providerResponseError(`KOLSprite ${code ?? "error"}: ${message}`);
  }
  if (!("data" in body)) {
    throw providerResponseError("KOLSprite MCP response is missing data");
  }
  return body;
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const args = values;
  if (
    typeof args.page_num === "number" &&
    typeof args.page_size === "number" &&
    args.page_num * args.page_size > 1000
  ) {
    throw providerInputError("page_num multiplied by page_size must not exceed 1000");
  }
  const key = requiredInputString(apiKey, "MCP Key");
  const result = await callMcpTool({
    ...connectionInput(key, fetcher, context.signal),
    toolName: actionName,
    arguments: args,
  });
  return parseResponse(result);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requiredInputString(input.apiKey, "MCP Key");
    const tools = await listMcpTools(connectionInput(key, fetcher, signal));
    const hash = sha256Hex(key);
    return {
      profile: { accountId: `kolsprite-mcp:${hash}`, displayName: `KOLSprite MCP · ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "kolsprite_mcp",
  Object.fromEntries(
    kolspriteMcpActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "kolsprite_mcp",
  baseUrl: origin,
  auth: { type: "api_key_header", name: "secret-key" },
  redirect: "manual",
  allowedEndpoint(value) {
    return new URL(value, origin).href === endpoint;
  },
  customizeRequest({ url, headers }) {
    if (url.href !== endpoint)
      throw providerInputError("KOLSprite MCP proxy only supports /mcp without a query string");
    headers.set("accept", "application/json, text/event-stream");
  },
});
