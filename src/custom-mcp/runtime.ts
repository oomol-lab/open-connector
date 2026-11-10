import type { ActionDefinition, ActionExecutor, ResolvedCredential } from "../core/types.ts";
import type { McpToolOptions, McpToolSummary } from "../providers/mcp-tools.ts";
import type { CustomMcpRecord } from "./definition.ts";

import { Validator } from "@cfworker/json-schema";
import { recordOrEmpty } from "../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../core/request.ts";
import { callMcpTool, listMcpTools } from "../providers/mcp-tools.ts";
import { requiredInputString } from "../providers/provider-runtime.ts";
import { createProviderFetch, ProviderRequestError, toProviderExecutionError } from "../providers/provider-runtime.ts";

/** The snapshot fits in one D1 row as well as the Node SQL stores. */
const customMcpToolBytes: number = 512 * 1024;

function mcpConnectionOptions(
  record: CustomMcpRecord,
  credential?: ResolvedCredential,
  signal?: AbortSignal,
): McpToolOptions {
  const headers = new Headers();
  if (record.auth.type === "headers") {
    if (credential?.authType !== "custom_credential")
      throw new ProviderRequestError(401, "Connect this MCP service first.");
    for (const header of record.auth.headers) {
      headers.set(header.name, header.prefix + requiredInputString(credential.values[header.name], header.name));
    }
  } else if (record.auth.type === "oauth2") {
    if (credential?.authType !== "oauth2")
      throw new ProviderRequestError(401, "Connect this MCP service with OAuth first.");
    headers.set("authorization", `Bearer ${credential.accessToken}`);
  }
  return {
    service: record.service,
    endpoint: record.endpoint,
    transport: record.transport,
    headers: Object.fromEntries(headers),
    signal,
    redirect: "manual",
    fetcher: createProviderFetch({
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
      additionalSensitiveHeaders:
        record.auth.type === "headers" ? record.auth.headers.map((header) => header.name) : undefined,
    }),
    toolListMaxBytes: customMcpToolBytes,
    maxResponseBytes: 16 * 1024 * 1024,
  };
}

function mcpToolActions(service: string, tools: McpToolSummary[]): ActionDefinition[] {
  const names = new Set<string>();
  return tools.map((tool) => {
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(tool.name) || names.has(tool.name)) {
      throw new ProviderRequestError(502, "MCP returned an invalid or duplicate tool name.");
    }
    names.add(tool.name);
    new Validator(tool.inputSchema);
    if (tool.outputSchema) new Validator(tool.outputSchema);
    const annotations = tool.annotations;
    return {
      id: `${service}.${tool.name}`,
      service,
      name: tool.name,
      description: tool.description ?? tool.name,
      operationType:
        annotations?.readOnlyHint === true ? "read" : annotations?.destructiveHint === false ? "write" : "destructive",
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema ?? {},
    };
  });
}

/** Read and validate the complete snapshot before publishing any tool. */
export async function discoverMcpActions(
  record: CustomMcpRecord,
  credential?: ResolvedCredential,
  signal?: AbortSignal,
): Promise<ActionDefinition[]> {
  const tools = await listMcpTools(mcpConnectionOptions(record, credential, signal), {
    includeAnnotations: true,
    includeOutputSchema: true,
  });
  const actions = mcpToolActions(record.service, tools);
  if (new TextEncoder().encode(JSON.stringify(actions)).byteLength > customMcpToolBytes)
    throw new ProviderRequestError(502, "MCP tool definitions exceed 512 KiB.");
  return actions;
}

export function createMcpActionExecutor(record: CustomMcpRecord, action: ActionDefinition): ActionExecutor {
  return async (input, context) => {
    try {
      const credential = await context.getCredential(record.service);
      return {
        ok: true,
        output: await callMcpTool({
          ...mcpConnectionOptions(record, credential, context.signal),
          toolName: action.name,
          arguments: recordOrEmpty(input),
        }),
      };
    } catch (error) {
      return toProviderExecutionError(error, `${record.displayName} request failed`);
    }
  };
}
