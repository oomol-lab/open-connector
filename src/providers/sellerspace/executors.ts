import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { createHash } from "node:crypto";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineApiKeyProviderExecutors,
  getProviderActionHandler,
  mapProviderActionHandlers,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { sellerspaceActions, sellerspaceToolNameByAction } from "./actions.ts";

const service = "sellerspace";
const endpoint = "https://www.sellerspace.com/mcp/";
const timeoutMs = 60_000;
const approved = new Set([...Object.values(sellerspaceToolNameByAction), "discover_capabilities"]);
type McpResult = Awaited<ReturnType<Client["callTool"]>>;

async function withClient<T>(context: ApiKeyProviderContext, run: (client: Client) => Promise<T>): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { "x-api-key": context.apiKey, "user-agent": providerUserAgent },
      signal: context.signal,
      mapError,
    },
    run,
  );
}

function normalize(result: McpResult): unknown {
  if (result.isError) throw new ProviderRequestError(502, "SellerSpace MCP tool returned an error", result);
  if (result.structuredContent) return result.structuredContent;
  const content =
    "content" in result && Array.isArray(result.content) ? (result.content as Array<Record<string, unknown>>) : [];
  const text = content.filter((item) => item.type === "text" && typeof item.text === "string");
  if (text.length === 1) {
    const value = String(text[0]!.text);
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return result;
}

async function listTools(context: ApiKeyProviderContext) {
  return withClient(context, (client) => listAllTools(client, context.signal));
}

async function listAllTools(client: Client, signal?: AbortSignal) {
  const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : {}, { timeout: timeoutMs, signal });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

async function call(
  context: ApiKeyProviderContext,
  toolName: string,
  args: Record<string, unknown>,
  authorize = false,
): Promise<unknown> {
  return withClient(context, async (client) => {
    if (authorize) {
      const tools = await listAllTools(client, context.signal);
      const tool = tools.find((item) => item.name === toolName);
      if (!tool || tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint === true)
        throw new ProviderRequestError(400, `SellerSpace MCP tool ${toolName} is not currently marked read-only`);
    }
    return normalize(
      await client.callTool(
        { name: toolName, arguments: args },
        {
          timeout: timeoutMs,
          signal: context.signal,
        },
      ),
    );
  });
}

type SellerspaceHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"sellerspace", SellerspaceHandler> = mapProviderActionHandlers(
  service,
  sellerspaceActions,
  (_action, name): SellerspaceHandler => {
    if (name === "list_tools") {
      return async (_input, context) => ({
        tools: (await listTools(context)).filter(
          (tool) =>
            approved.has(tool.name) &&
            tool.annotations?.readOnlyHint === true &&
            tool.annotations.destructiveHint !== true,
        ),
      });
    }
    if (name === "call_tool") {
      return async (input, context) => {
        const toolName = typeof input.toolName === "string" ? input.toolName.trim() : "";
        if (!approved.has(toolName)) {
          throw new ProviderRequestError(
            400,
            `SellerSpace MCP tool ${toolName} is not approved for read-only dynamic calls`,
          );
        }
        const args =
          input.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)
            ? (input.arguments as Record<string, unknown>)
            : {};
        return { result: await call(context, toolName, args, true) };
      };
    }

    const toolName = getProviderActionHandler(sellerspaceToolNameByAction, name);
    return async (input, context) => ({ result: await call(context, toolName!, input) });
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    await call(context, "get_stores", {});
    const hash = createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16);
    return {
      profile: { accountId: `sellerspace:mcp:${hash}`, displayName: `SellerSpace MCP · ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint },
    };
  },
};

function mapError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  const message = error instanceof Error ? error.message : "SellerSpace MCP request failed";
  if (message.includes("Invalid or expired API Key") || message.includes("MCP.Auth.Invalid"))
    return new ProviderRequestError(401, "SellerSpace MCP key is invalid or expired");
  return new ProviderRequestError(502, `SellerSpace MCP request failed: ${message}`, error);
}
