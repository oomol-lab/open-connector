import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { ProtocolError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const sifMcpOrigin: string = "https://mcp.sif.com";
export const sifMcpEndpoint: string = `${sifMcpOrigin}/mcp`;
const requestTimeoutMs = 60_000;
const controlTools = new Set(["ping", "sif_catalog"]);
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const sifActionHandlers: ProviderActionHandlers<"sif", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_tools(_input, context) {
    return { tools: await listBusinessTools(context) };
  },
  async call_tool(input, context) {
    const toolName = requiredString(input.toolName, "toolName", badRequest);
    const args = input.arguments === undefined ? {} : optionalRecord(input.arguments);
    if (!args) throw new ProviderRequestError(400, "arguments must be a JSON object");
    return { result: normalizeResult(await callTool(context, toolName, args)) };
  },
  market_get_keyword_history: businessHandler("market_get_keyword_history"),
  market_get_keyword_demand: businessHandler("market_get_keyword_demand"),
  market_get_keyword_root_trend: businessHandler("market_get_keyword_root_trend"),
  market_get_keyword_competition: businessHandler("market_get_keyword_competition"),
  market_get_keyword_root_competitors: businessHandler("market_get_keyword_root_competitors"),
  market_screen_keyword_opportunities: businessHandler("market_screen_keyword_opportunities"),
  market_discover_competitors: businessHandler("market_discover_competitors"),
  market_get_asin_profile: businessHandler("market_get_asin_profile"),
  market_get_asin_keyword_signals: businessHandler("market_get_asin_keyword_signals"),
  market_get_asin_aba_footprint: businessHandler("market_get_asin_aba_footprint"),
};

function businessHandler(actionName: string): ProviderRuntimeHandler<ApiKeyProviderContext> {
  return async (input, context) => ({
    result: normalizeResult(await callTool(context, actionName, input)),
  });
}

export async function validateSifCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const tools = await listBusinessTools({ apiKey, fetcher, signal });
  if (tools.length === 0)
    throw new ProviderRequestError(502, "Sif MCP did not expose any business tools for this account");
  const hash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return {
    profile: { accountId: `sif:mcp:${hash}`, displayName: `Sif MCP · ${hash.slice(-6)}` },
    grantedScopes: [],
    metadata: { mcpEndpoint: sifMcpEndpoint, discoveredToolCount: tools.length },
  };
}

async function listBusinessTools(context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">) {
  const result = await withClient(context, (client) =>
    client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal }),
  );
  return result.tools
    .filter((tool) => !controlTools.has(tool.name))
    .map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema }));
}

async function callTool(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  toolName: string,
  args: Record<string, unknown>,
) {
  return withClient(context, (client) =>
    client.callTool(
      { name: toolName, arguments: args },
      {
        timeout: requestTimeoutMs,
        signal: context.signal,
      },
    ),
  );
}

async function withClient<T>(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(sifMcpEndpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { "secret-key": context.apiKey, "user-agent": providerUserAgent },
      signal: context.signal,
      mapError: mapSifMcpError,
    },
    run,
  );
}

function mapSifMcpError(error: unknown): unknown {
  if (error instanceof UnauthorizedError) return new ProviderRequestError(401, "Sif MCP key is invalid or expired");
  if (error instanceof SdkHttpError)
    return new ProviderRequestError(
      error.status === 429 ? 429 : error.status === 401 || error.status === 403 ? 401 : 502,
      `Sif MCP request failed: ${error.message}`,
    );
  if (error instanceof ProtocolError) return new ProviderRequestError(502, `Sif MCP request failed: ${error.message}`);
  return error;
}

function normalizeResult(result: ToolResult): unknown {
  if ("toolResult" in result) return result;
  if (result.isError) throw new ProviderRequestError(502, "Sif MCP tool returned an error", result);
  if (result.structuredContent) return result.structuredContent;
  const text = result.content.find((item) => item.type === "text");
  if (!text || text.type !== "text") return result;
  try {
    return JSON.parse(text.text) as unknown;
  } catch {
    return text.text;
  }
}

function badRequest(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
