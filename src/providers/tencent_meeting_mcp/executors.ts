import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { recordOrEmpty, optionalRecord, optionalRawString, optionalNumber } from "../../core/cast.ts";
import { listMcpTools, withMcpToolClient } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import { requiredInputString, ProviderRequestError, withRetryAfterSeconds } from "../provider-runtime.ts";
import { tencentMeetingMcpActions } from "./actions.ts";
const origin = "https://mcp.meeting.tencent.com";
const endpoint = `${origin}/mcp/wemeet-open/v1`;
const version = "1.0.12";
function connection(context: ApiKeyProviderContext) {
  return {
    service: "Tencent Meeting",
    endpoint,
    headers: { "X-Tencent-Meeting-Token": requiredInputString(context.apiKey, "Token"), "X-Skill-Version": version },
    fetcher: context.fetcher,
    signal: context.signal,
    // Cloudflare Workers rejects `redirect: "error"`; a 3xx under "manual" still fails the MCP request.
    redirect: "manual" as const,
    maxResponseBytes: 16 * 1024 * 1024,
    terminateSession: true,
  };
}
function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
async function callTool(context: ApiKeyProviderContext, toolName: string, args: Record<string, unknown>) {
  return withMcpToolClient(connection(context), async (client) => {
    const result = await client.callTool(
      {
        name: toolName,
        arguments: {
          ...args,
          _client_info: args._client_info ?? {
            os: typeof process === "undefined" ? "unknown" : process.platform,
            agent: "Oomol Connect",
          },
        },
      },
      { signal: context.signal },
    );
    if ("content" in result) {
      for (const item of result.content) {
        if (item.type !== "text") continue;
        const data = optionalRecord(optionalRecord(parseJsonText(item.text))?.data);
        const status = optionalNumber(data?.status_code);
        if (status !== undefined && status >= 400) {
          const body = optionalRecord(parseJsonText(data?.body));
          const message =
            optionalRawString(body?.error) ??
            optionalRawString(body?.message) ??
            optionalRawString(data?.body) ??
            `Upstream status ${status}`;
          throw new ProviderRequestError(
            status === 401 || status === 403 ? status : 502,
            `Tencent Meeting ${toolName}: ${message}`,
            { upstreamStatus: status, result },
            "provider_error",
          );
        }
      }
      if (result.isError) {
        const message = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("; ");
        throw new ProviderRequestError(
          502,
          `Tencent Meeting ${toolName}: ${message || "MCP tool failed"}`,
          { result },
          "provider_error",
        );
      }
    }
    return result;
  });
}
const handlers = mapProviderActionHandlers(
  "tencent_meeting_mcp",
  tencentMeetingMcpActions,
  (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    if (action.name === "list_tools")
      return {
        tools: await listMcpTools(connection(context), {
          includeAnnotations: true,
          includeOutputSchema: true,
          includeMetadata: true,
        }),
      };
    return {
      result: await callTool(
        context,
        action.name === "call_tool" ? requiredInputString(input.toolName, "toolName") : action.name,
        action.name === "call_tool" ? recordOrEmpty(input.arguments) : input,
      ),
    };
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("tencent_meeting_mcp", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const token = requiredInputString(input.apiKey, "Token");
    await callTool({ apiKey: token, fetcher, signal }, "get_user_meetings", { page_size: 1 });
    return {
      profile: { accountId: `tencent-meeting-mcp:${sha256Hex(token)}`, displayName: "Tencent Meeting Account" },
      metadata: { mcpEndpoint: endpoint },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "tencent_meeting_mcp",
  baseUrl: origin,
  auth: { type: "api_key_header", name: "X-Tencent-Meeting-Token" },
  sensitiveHeaders: ["X-Tencent-Meeting-Token"],
  skipDnsValidation: true,
  redirect: "manual",
  customizeRequest({ url, headers }) {
    if (url.href !== endpoint)
      throw new ProviderRequestError(400, "Use the official Tencent Meeting MCP endpoint without a query string");
    for (const [name, value] of Object.entries({
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "X-Skill-Version": version,
    }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "MCP proxy request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
