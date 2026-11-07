import type { McpToolOptions } from "../mcp-tools.ts";
import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { MetabaseContext } from "./runtime.ts";

import { objectArray, optionalRecord, optionalStringArray, requiredRawString } from "../../core/cast.ts";
import { callMcpTool, listMcpTools, withMcpToolClient } from "../mcp-tools.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const requestTimeoutMs = 60_000;

/**
 * Metabase query handles and cursors are caller-scoped across sessions. Leave
 * sessions open; terminating one would also destroy its stored handles.
 */
function metabaseMcpConnection(context: MetabaseContext): McpToolOptions {
  return {
    endpoint: `${context.apiBaseUrl}/metabase-mcp`,
    service: "Metabase",
    fetcher: context.fetcher,
    headers: { "x-api-key": context.apiKey },
    redirect: "manual",
    requestTimeoutMs,
    toolListTimeoutMs: requestTimeoutMs,
    maxResponseBytes: 16 * 1024 * 1024,
    signal: context.signal,
  };
}

interface MetabaseToolOutput {
  result: unknown;
  notes?: string;
}

/**
 * Metabase answers in text: a JSON document, optionally followed by guidance
 * such as paging hints. Split them so agents get structured data plus the hint.
 */
function metabaseToolOutput(result: unknown): MetabaseToolOutput {
  const envelope = optionalRecord(result);
  if (!envelope || !Array.isArray(envelope.content)) return { result };
  const text = objectArray(envelope.content, "Metabase MCP content", providerResponseError)
    .filter((block) => block.type === "text")
    .map((block) => requiredRawString(block.text, "Metabase MCP text", providerResponseError))
    .join("\n");
  if (!text) return { result: null };
  const parsed = parseLeadingJson(text);
  if (!parsed) return { result: text };
  return { result: parsed.value, notes: parsed.rest || undefined };
}

interface LeadingJson {
  value: unknown;
  rest: string;
}

function parseLeadingJson(text: string): LeadingJson | undefined {
  let end = text.length;
  while (end !== -1) {
    try {
      return { value: JSON.parse(text.slice(0, end)) as unknown, rest: text.slice(end).trim() };
    } catch {
      end = text.indexOf("\n", end === text.length ? 0 : end + 1);
    }
  }
  return undefined;
}

function firstLine(text: string | undefined): string | undefined {
  return text?.trim().split("\n", 1)[0] || undefined;
}

export const metabaseMcpHandlers: ProviderActionHandlerSubset<"metabase", ProviderRuntimeHandler<MetabaseContext>> = {
  async list_tools(input, context) {
    const wanted = optionalStringArray(input.toolNames);
    const tools = await listMcpTools(metabaseMcpConnection(context), {
      includeAnnotations: true,
      includeOutputSchema: true,
    });
    if (!wanted) {
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          summary: firstLine(tool.description),
          annotations: tool.annotations,
        })),
      };
    }
    const unknown = wanted.filter((name) => !tools.some((tool) => tool.name === name));
    if (unknown.length > 0) throw providerInputError(`Unknown Metabase MCP tools: ${unknown.join(", ")}`);
    return { tools: tools.filter((tool) => wanted.includes(tool.name)) };
  },
  async call_tool(input, context) {
    const result = await callMcpTool({
      ...metabaseMcpConnection(context),
      toolName: requiredInputString(input.toolName, "toolName"),
      arguments: optionalRecord(input.arguments) ?? {},
    });
    return metabaseToolOutput(result);
  },
  async list_mcp_resources(_input, context) {
    const resources = await runProviderRequest(
      { label: "Metabase MCP", timeoutMs: requestTimeoutMs, signal: context.signal },
      (signal) =>
        withMcpToolClient({ ...metabaseMcpConnection(context), signal }, async (client) => {
          const result = await client.listResources({}, { timeout: requestTimeoutMs, signal });
          const resources = [...result.resources];
          let cursor = result.nextCursor;
          const seen = new Set<string>();
          while (cursor) {
            if (seen.has(cursor) || seen.size >= 100)
              throw providerResponseError("Metabase resource pagination did not terminate");
            seen.add(cursor);
            const page = await client.listResources({ cursor }, { timeout: requestTimeoutMs, signal });
            resources.push(...page.resources);
            cursor = page.nextCursor;
          }
          return resources;
        }),
    );
    return {
      resources: resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
      })),
    };
  },
  async read_mcp_resource(input, context) {
    const uri = requiredInputString(input.uri, "uri");
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(uri) || uri.startsWith("ui://"))
      throw providerInputError("Only listed non-Apps (ui://) MCP resources are supported");
    const { contents } = await withMcpToolClient(metabaseMcpConnection(context), (client) =>
      client.readResource({ uri }, { signal: context.signal, timeout: requestTimeoutMs }),
    );
    return {
      contents: contents.map((content) => ({
        uri: content.uri,
        mimeType: content.mimeType,
        text: requiredRawString(
          "text" in content ? content.text : undefined,
          "Metabase resource text",
          providerResponseError,
        ),
      })),
    };
  },
};
