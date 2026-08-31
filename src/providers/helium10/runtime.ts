import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";
import type { JsonSchemaType } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { ProtocolError } from "@modelcontextprotocol/client";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/client/validators/cf-worker";
import { createHash } from "node:crypto";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const helium10McpEndpoint = "https://mcp.helium10.com/mcp";
const requestTimeoutMs = 30_000;
const validator = new CfWorkerJsonSchemaValidator();
const readOnlyTools = new Set([
  "get_keywords_by_keyword",
  "get_keywords_by_asin",
  "compare_asin_keywords",
  "analyze_keywords",
  "list_my_products",
  "search_inactive_products",
  "get_listing_details",
  "get_listing_score",
  "compare_listings",
  "get_keywords_rank_history",
  "get_keywords_new_suggestion",
  "list_tracked_keywords",
  "list_tracked_competitor_keywords",
  "get_account_profit_and_loss_summary",
  "get_account_profit_and_loss_summary_series",
  "get_account_profit_and_loss_breakdown",
  "get_account_profit_and_loss_breakdown_series",
  "get_product_profit_and_loss_summary",
  "get_product_profit_and_loss_summary_series",
  "get_product_profit_and_loss_breakdown",
  "get_product_profit_and_loss_breakdown_series",
  "get_sales_velocity",
  "get_inventory_values",
  "get_fba_inventory_health_status",
  "get_search_query_performance",
  "get_brand_seller_profiles",
  "get_ads_query_platforms",
  "get_ads_query_list",
  "get_ads_query_schema",
  "get_ads_query_materials",
  "execute_ads_query",
  "get_top_keywords",
  "search_amazon_keywords",
  "get_competitor_overview",
]);

type Tool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const helium10ActionHandlers: ProviderActionHandlers<
  "helium10",
  ProviderRuntimeHandler<OAuthProviderContext>
> = {
  async list_tools(_input, context) {
    const tools = await listTools(context);
    return {
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    };
  },
  async call_tool(input, context) {
    const toolName = requiredString(input.toolName, "toolName", providerInputError);
    const args = input.arguments === undefined ? {} : optionalRecord(input.arguments);
    if (!args) throw new ProviderRequestError(400, "arguments must be a JSON object");
    if (!readOnlyTools.has(toolName)) {
      throw new ProviderRequestError(400, `Helium 10 MCP tool is not approved for read-only access: ${toolName}`);
    }
    const tool = (await listTools(context)).find((candidate) => candidate.name === toolName);
    if (!tool) throw new ProviderRequestError(400, `Helium 10 MCP tool is not available for this account: ${toolName}`);
    validateArguments(tool, args);
    const result = await withClient(context, (client) =>
      client.callTool(
        { name: toolName, arguments: args },
        {
          timeout: requestTimeoutMs,
          signal: context.signal,
        },
      ),
    );
    return { result: normalizeResult(result) };
  },
};

export async function validateHelium10Credential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await withClient({ accessToken, fetcher, signal }, (client) =>
    client.listTools({}, { timeout: requestTimeoutMs, signal }),
  );
  if (!result.tools.some((tool) => readOnlyTools.has(tool.name))) {
    throw new ProviderRequestError(502, "Helium 10 MCP did not expose any approved read-only tools");
  }
  const tokenHash = createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
  return {
    profile: { accountId: `helium10:mcp:${tokenHash}`, displayName: `Helium 10 MCP · ${tokenHash.slice(-6)}` },
    grantedScopes: ["mcp:tools"],
    metadata: { mcpEndpoint: helium10McpEndpoint },
  };
}

async function listTools(context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">): Promise<Tool[]> {
  const result = await withClient(context, (client) =>
    client.listTools({}, { timeout: requestTimeoutMs, signal: context.signal }),
  );
  return result.tools.filter((tool) => readOnlyTools.has(tool.name));
}

async function withClient<T>(
  context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(helium10McpEndpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { authorization: `Bearer ${context.accessToken}`, "user-agent": providerUserAgent },
      signal: context.signal,
      mapError: mapHelium10McpError,
    },
    run,
  );
}

function mapHelium10McpError(error: unknown): unknown {
  if (error instanceof UnauthorizedError)
    return new ProviderRequestError(401, "Helium 10 authorization is invalid or expired");
  if (error instanceof SdkHttpError)
    return new ProviderRequestError(
      error.status === 429 ? 429 : error.status === 401 || error.status === 403 ? 401 : 502,
      `Helium 10 MCP request failed: ${error.message}`,
    );
  if (error instanceof ProtocolError)
    return new ProviderRequestError(502, `Helium 10 MCP request failed: ${error.message}`);
  return error;
}

function validateArguments(tool: Tool, args: Record<string, unknown>): void {
  const result = validator.getValidator<Record<string, unknown>>(tool.inputSchema as JsonSchemaType)(args);
  if (!result.valid)
    throw new ProviderRequestError(
      400,
      `Invalid arguments for Helium 10 MCP tool ${tool.name}: ${result.errorMessage}`,
    );
}

function normalizeResult(result: ToolResult): unknown {
  if ("toolResult" in result) return result;
  if (result.isError) throw new ProviderRequestError(502, "Helium 10 MCP tool returned an error", result);
  if (result.structuredContent) return result.structuredContent;
  const text = result.content.find((item) => item.type === "text");
  if (!text || text.type !== "text") return result;
  try {
    return JSON.parse(text.text) as unknown;
  } catch {
    return text.text;
  }
}
