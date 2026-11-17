import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { Client } from "@modelcontextprotocol/client";

import { SdkHttpError } from "@modelcontextprotocol/client";
import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalNumber, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";
import { wpsMcpActions } from "./actions.ts";

const wpsMcpEndpoint = "https://mcp-center.wps.cn/skill_hub/mcp";
const requestTimeoutMs = 55_000;

const handlers: ProviderActionHandlers<
  "wps_mcp",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionHandlers(
  "wps_mcp",
  wpsMcpActions,
  (_action, name) => (input, context) => executeWpsAction(name, input, context),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("wps_mcp", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "wps_mcp",
  baseUrl: wpsMcpEndpoint,
  auth: { type: "bearer" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "wps_mcp proxy request failed"),
      undefined,
      "provider_error",
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await executeWpsAction("list_my_files", { page_size: 1 }, { apiKey: input.apiKey.trim(), fetcher, signal });
    const tokenHash = sha256Hex(input.apiKey.trim()).slice(0, 16);

    return {
      profile: { accountId: `wps-mcp:${tokenHash}`, displayName: `WPS MCP ${tokenHash.slice(-6)}` },
      metadata: { mcpEndpoint: wpsMcpEndpoint, validationTool: "list_my_files" },
    };
  },
};

async function executeWpsAction(
  actionName: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  if (actionName === "list_tools") {
    return { tools: await listTools(context.apiKey, context.fetcher, context.signal) };
  }

  if (
    ["get_file_info", "read_file", "get_file_link", "download_file"].includes(actionName) &&
    ![input.file_id, input.link_id, input.url].some((value) => typeof value === "string" && value.trim())
  ) {
    throw new ProviderRequestError(400, "Provide at least one of file_id, link_id, or url.");
  }

  if (actionName === "list_files" && input.parent_id === "0" && !input.drive_id) {
    throw new ProviderRequestError(400, "Provide drive_id when parent_id is 0.");
  }

  const toolName = actionName === "call_tool" ? requiredInputString(input.toolName, "toolName") : actionName;
  const args = actionName === "call_tool" ? recordOrEmpty(input.arguments) : input;
  const output = await withWpsClient(context.apiKey, context.fetcher, context.signal, async (client) => {
    const result = await client.callTool(
      { name: toolName, arguments: args },
      { timeout: requestTimeoutMs, signal: context.signal },
    );
    const candidates: unknown[] = [result.structuredContent];
    for (const item of result.content) {
      if (item.type !== "text") {
        continue;
      }

      try {
        candidates.push(JSON.parse(item.text));
      } catch {
        /* Preserve ordinary text. */
      }
    }

    for (const candidate of candidates) {
      const envelope = optionalRecord(candidate);
      const code = optionalNumber(envelope?.code);
      const message = optionalString(envelope?.message);
      if (code === undefined || code === 0 || !message) {
        continue;
      }

      const authorizationFailed = code === 400006;
      const rateLimited = code === 429001 || code === 429002;

      throw new ProviderRequestError(
        authorizationFailed ? 401 : rateLimited ? 429 : 502,
        `WPS MCP error ${code}: ${message}`,
        undefined,
        authorizationFailed ? "authorization_failed" : rateLimited ? "rate_limited" : "provider_error",
      );
    }

    if (result.isError) {
      throw new ProviderRequestError(502, `WPS MCP tool ${toolName} returned an error`, result);
    }

    if (result.structuredContent !== undefined) {
      return result.structuredContent;
    }

    if (result.content.length === 1) {
      const object = optionalRecord(candidates[1]);
      if (object) {
        return object;
      }
    }

    return result;
  });

  return actionName === "call_tool" ? { result: output } : output;
}

async function listTools(apiKey: string, fetcher: typeof fetch, signal?: AbortSignal) {
  return withWpsClient(apiKey, fetcher, signal, async (client) => {
    const result = await client.listTools({}, { timeout: requestTimeoutMs, signal });

    return result.tools;
  });
}

function withWpsClient<T>(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(wpsMcpEndpoint),
      transport: "streamable_http",
      fetcher,
      headers: { authorization: `Bearer ${apiKey.trim()}`, "user-agent": providerUserAgent },
      signal,
      protocolVersion: "legacy",
      mapError(error) {
        return error instanceof SdkHttpError
          ? new ProviderRequestError(error.status, error.message, undefined, "provider_error")
          : error;
      },
    },
    run,
  );
}
