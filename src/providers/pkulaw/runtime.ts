import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { PkulawMcpServerId } from "./actions.ts";
import type { Client } from "@modelcontextprotocol/client";

import { withMcpClient } from "../mcp-client.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const pkulawMcpGateway = "https://apim-gateway.pkulaw.com";
const timeoutMs = 60_000;

const servers: Record<PkulawMcpServerId, { displayName: string; invokePath: string }> = {
  "law-aggregate": { displayName: "法律智能检索", invokePath: "/mcp-law-agg/1.0.0/mcp" },
  "law-keyword": { displayName: "检索法律法规-关键词", invokePath: "/mcp-law/mcp" },
  "law-semantic": { displayName: "检索法律法规-语义", invokePath: "/mcp-law-search-service/mcp" },
  "case-keyword": { displayName: "检索司法案例-关键词", invokePath: "/mcp-case/mcp" },
  "case-semantic": { displayName: "检索司法案例-语义", invokePath: "/mcp-case-search-service/mcp" },
  "case-number": { displayName: "案号识别与溯源", invokePath: "/case_number_recognition/mcp" },
  "law-recognition": { displayName: "法条识别与溯源", invokePath: "/law_recognition/mcp" },
  fatiao: { displayName: "精准查找法条-关键词", invokePath: "/mcp-fatiao/mcp" },
  "doc-link": { displayName: "法宝超链", invokePath: "/add-doc-link/mcp" },
  "citation-validator": { displayName: "修正生成幻觉-法条", invokePath: "/pku_citation_validator/mcp" },
};

export interface PkulawContext extends ApiKeyProviderContext {
  metadata?: Record<string, unknown>;
}

export async function discoverTools(
  serverId: PkulawMcpServerId,
  context: PkulawContext,
): Promise<Awaited<ReturnType<Client["listTools"]>>> {
  return withClient(serverId, context, "execute", (client) => client.listTools({}, { timeout: timeoutMs }));
}

export async function callTool(
  serverId: PkulawMcpServerId,
  toolName: string,
  arguments_: Record<string, unknown>,
  context: PkulawContext,
): Promise<unknown> {
  const result = await withClient(serverId, context, "execute", (client) =>
    client.callTool({ name: toolName, arguments: arguments_ }, { timeout: timeoutMs }),
  );
  if (result.isError) throw new ProviderRequestError(502, `PKULaw MCP tool ${toolName} returned an error`, result);
  return result.structuredContent ?? result;
}

export async function validateServer(
  serverId: PkulawMcpServerId,
  context: PkulawContext,
): Promise<Awaited<ReturnType<Client["listTools"]>>> {
  return withClient(serverId, context, "validate", (client) => client.listTools({}, { timeout: timeoutMs }));
}

export function serverDisplayName(serverId: PkulawMcpServerId): string {
  return servers[serverId].displayName;
}

export function hasAggregate(metadata: Record<string, unknown> | undefined): boolean {
  return Array.isArray(metadata?.availableServers) && metadata.availableServers.includes("law-aggregate");
}

async function withClient<T>(
  serverId: PkulawMcpServerId,
  context: PkulawContext,
  phase: "validate" | "execute",
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const endpoint = new URL(servers[serverId].invokePath, pkulawMcpGateway);
  const headers = new Headers({
    authorization: `Bearer ${context.apiKey.trim()}`,
    "user-agent": providerUserAgent,
  });
  return withMcpClient(
    {
      endpoint,
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers,
      signal: context.signal,
      mapError: (error) => mapPkulawMcpError(error, phase),
    },
    run,
  );
}

function mapPkulawMcpError(error: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const status = readStatus(error);
  if (status === 401 || status === 403)
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      "PKULaw Access Token is invalid, expired, or the selected MCP service is not enabled",
      error,
    );
  if (status === 429) return new ProviderRequestError(429, "PKULaw MCP request was rate limited", error);
  return new ProviderRequestError(
    status && status >= 400 && status < 500 ? 400 : 502,
    error instanceof Error ? `PKULaw MCP request failed: ${error.message}` : "PKULaw MCP request failed",
    error,
  );
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = "code" in error ? error.code : "status" in error ? error.status : undefined;
  return typeof value === "number" ? value : undefined;
}

export function normalizeCollection(result: unknown, preferredKey: string): unknown[] {
  const payload = parseTextContent(result);
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of [preferredKey, "data", "Data", "results", "items", "result"])
    if (Array.isArray(record?.[key])) return record[key];
  if (record && !("Message" in record) && !("message" in record) && !Array.isArray(record.content)) return [record];
  throw new ProviderRequestError(502, "PKULaw MCP returned an invalid result list");
}

export function normalizeRecord(result: unknown, preferredKey: string): Record<string, unknown> {
  const record = asRecord(parseTextContent(result));
  if (!record) throw new ProviderRequestError(502, "PKULaw MCP returned an invalid result record");
  for (const key of [preferredKey, "data", "result"]) {
    const nested = asRecord(record[key]);
    if (nested) return nested;
  }
  if (Array.isArray(record.content))
    throw new ProviderRequestError(502, "PKULaw MCP returned an invalid result record");
  return record;
}

function parseTextContent(result: unknown): unknown {
  const content = asRecord(result)?.content;
  if (!Array.isArray(content)) return result;
  const text = content.map(asRecord).find((item) => item?.type === "text" && typeof item.text === "string")?.text;
  if (typeof text !== "string") return result;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return result;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
