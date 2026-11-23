import type { McpClientToolResult, McpToolOptions, McpToolSummary } from "../mcp-tools.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { providerInputError, providerResponseError, ProviderRequestError } from "../provider-runtime.ts";

export const endpoint = "https://mcp.sellersprite.com/v2/mcp";
export const extendedTimeoutMs = 150_000;
const requestTimeoutMs = 60_000;
const maxResponseBytes = 16 * 1024 * 1024;

function mcpOptions(context: ApiKeyProviderContext, validating = false): McpToolOptions {
  return {
    endpoint,
    service: "SellerSprite",
    headers: { "secret-key": context.apiKey },
    signal: context.signal,
    redirect: "error",
    requestTimeoutMs,
    maxResponseBytes,
    fetcher: async (url, init) => {
      const response = await context.fetcher(url, init);
      if (response.status === 401) {
        const bytes = await readBoundedResponseBytes(response, {
          maxBytes: maxResponseBytes,
          fieldName: "SellerSprite MCP response",
          createError: providerResponseError,
          signal: init?.signal ?? undefined,
        });
        const authResponse = new Response(bytes, { status: response.status, headers: response.headers });
        const body = optionalRecord(
          await authResponse
            .clone()
            .json()
            .catch(() => undefined),
        );
        const error = optionalRecord(body?.error);
        if (optionalRecord(error?.data)?.code === "INVALID_SECRET") {
          throw new ProviderRequestError(
            validating ? 400 : 401,
            optionalString(error?.message) ?? "SellerSprite MCP Secret Key is invalid",
            { providerCode: "INVALID_SECRET" },
            validating ? "invalid_input" : "authorization_failed",
          );
        }
        return authResponse;
      }
      return response;
    },
  };
}

export async function discover(context: ApiKeyProviderContext, validating = false): Promise<McpToolSummary[]> {
  const tools = await listMcpTools(mcpOptions(context, validating), { includeAnnotations: true });
  if (tools.length === 0) {
    throw new ProviderRequestError(
      validating ? 400 : 502,
      "SellerSprite MCP did not expose any tools for this Secret Key",
      undefined,
      validating ? "invalid_input" : "provider_error",
    );
  }
  return tools;
}

export async function call(
  context: ApiKeyProviderContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "asin.related.list") {
    const page = optionalRecord(args.page);
    const cursor = page?.cursor ?? 0;
    const size = page?.size ?? 100;
    if (typeof cursor === "number" && typeof size === "number" && cursor + size > 3000) {
      throw providerInputError("page.cursor + page.size must not exceed 3000");
    }
  }
  return {
    result: await callMcpTool({
      ...mcpOptions(context),
      requestTimeoutMs: name === "asin.review.list.extended" ? extendedTimeoutMs : requestTimeoutMs,
      toolName: name,
      arguments: args,
      transformToolResult: normalize,
    }),
  };
}

function normalize(result: McpClientToolResult): McpClientToolResult {
  const candidates: unknown[] = [];
  if ("structuredContent" in result) candidates.push(result.structuredContent);
  if ("content" in result && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === "text") {
        try {
          candidates.push(JSON.parse(item.text));
        } catch {}
      }
    }
  }
  for (const candidate of candidates) {
    const envelope = optionalRecord(candidate);
    const error = optionalRecord(envelope?.error);
    const code = optionalString(error?.code)?.trim();
    if (code) {
      throw new ProviderRequestError(
        code === "INVALID_ARGUMENT" ? 400 : 502,
        optionalString(error?.message)?.trim() || `SellerSprite MCP tool failed with ${code}`,
        { providerCode: code, providerResponse: envelope },
        code === "INVALID_ARGUMENT" ? "invalid_input" : "provider_error",
      );
    }
  }
  return result;
}
