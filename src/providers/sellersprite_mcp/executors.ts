import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { ProtocolError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { withMcpClient } from "../mcp-client.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { sellerSpriteMcpOfficialActions } from "./official-actions.ts";

const service = "sellersprite_mcp";
const endpoint = "https://mcp.sellersprite.com/mcp";
const timeoutMs = 60_000;
type Context = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;
const handlers: Record<string, (input: Record<string, unknown>, context: Context) => Promise<unknown>> = {
  async list_tools(_input, context) {
    return { tools: await discover(context) };
  },
  call_tool(input, context) {
    return call(context, required(input.toolName, "toolName"), object(input.arguments));
  },
};
for (const action of sellerSpriteMcpOfficialActions)
  handlers[action.name] = (input, context) => call(context, action.name, input);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    const tools = await discover({ apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal });
    if (tools.length === 0)
      throw new ProviderRequestError(400, "SellerSprite MCP did not expose any tools for this Secret Key");
    const hash = createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16);
    return {
      profile: { accountId: `sellersprite-mcp:${hash}`, displayName: `SellerSprite MCP - ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: tools.length },
    };
  },
};
async function discover(context: Context): Promise<unknown[]> {
  return withClient(context, async (client) => {
    const result = await client.listTools({}, { timeout: timeoutMs });
    const tools = result.tools.filter((tool) => tool.name !== "secret_invalid");
    if (tools.length === 0)
      throw new ProviderRequestError(401, "SellerSprite MCP Secret Key is invalid, expired, or inactive");
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema,
    }));
  });
}
async function call(context: Context, name: string, argumentsInput: Record<string, unknown>): Promise<unknown> {
  return withClient(context, async (client) => {
    const result = await client.callTool({ name, arguments: argumentsInput }, { timeout: timeoutMs });
    return { result: normalize(result) };
  });
}
async function withClient<T>(context: Context, run: (client: Client) => Promise<T>): Promise<T> {
  const headers = new Headers({ "secret-key": context.apiKey, "user-agent": providerUserAgent });
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers,
      signal: context.signal,
      mapError,
    },
    run,
  );
}
function normalize(result: ToolResult): unknown {
  const envelope = errorEnvelope(result);
  if (envelope) {
    const message = envelope.message ?? `SellerSprite MCP tool failed with ${envelope.code}`;
    if (
      ["ERROR_UNAUTHORIZED", "ERROR_SECRET_KEY", "ERROR_SECRET_KEY_INVALID", "ERROR_SECRET_KEY_OVERDUE"].includes(
        envelope.code,
      )
    )
      throw new ProviderRequestError(401, message, envelope);
    if (envelope.code === "ERROR_VISIT_MAX") throw new ProviderRequestError(429, message, envelope);
    if (envelope.code === "ERROR_AUTH_ERROR") throw new ProviderRequestError(403, message, envelope);
    if (envelope.code === "ERROR_PARAM") throw new ProviderRequestError(400, message, envelope);
    throw new ProviderRequestError(502, message, envelope);
  }
  if ("toolResult" in result) return result;
  if (result.structuredContent) return result.structuredContent;
  return result;
}
function errorEnvelope(result: ToolResult): { code: string; message?: string } | undefined {
  const candidates: unknown[] = [];
  if ("structuredContent" in result) candidates.push(result.structuredContent);
  const content = "content" in result && Array.isArray(result.content) ? result.content : [];
  for (const item of content)
    if (
      item &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      try {
        let value: unknown = JSON.parse(item.text);
        if (typeof value === "string") value = JSON.parse(value);
        candidates.push(value);
      } catch {}
    }
  for (const candidate of candidates) {
    const record = object(candidate);
    const code = typeof record.code === "string" ? record.code.trim() : "";
    if (code.startsWith("ERROR_"))
      return { code, message: typeof record.message === "string" ? record.message.trim() : undefined };
  }
  return undefined;
}
function mapError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError)
    return new ProviderRequestError(401, "SellerSprite MCP Secret Key is invalid, expired, or inactive", error);
  if (error instanceof SdkHttpError)
    return new ProviderRequestError(
      error.status === 401 || error.status === 403 ? 401 : error.status === 429 ? 429 : 502,
      `SellerSprite MCP request failed: ${error.message}`,
      error,
    );
  if (error instanceof ProtocolError)
    return new ProviderRequestError(502, `SellerSprite MCP request failed: ${error.message}`, error);
  return new ProviderRequestError(
    502,
    error instanceof Error ? `SellerSprite MCP request failed: ${error.message}` : "SellerSprite MCP request failed",
    error,
  );
}
function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${field} is required`);
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
