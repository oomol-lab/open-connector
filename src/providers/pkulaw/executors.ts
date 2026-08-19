import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { PkulawMcpServerId } from "./actions.ts";
import type { PkulawContext } from "./runtime.ts";

import { createHash } from "node:crypto";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { pkulawMcpServerIds } from "./actions.ts";
import {
  callTool,
  discoverTools,
  hasAggregate,
  normalizeCollection,
  normalizeRecord,
  pkulawMcpGateway,
  serverDisplayName,
  validateServer,
} from "./runtime.ts";

const handlers: ProviderActionHandlers<"pkulaw", ProviderRuntimeHandler<PkulawContext>> = {
  async list_tools(input, context) {
    const serverId = input.serverId as PkulawMcpServerId;
    const result = await discoverTools(serverId, context);
    return { serverId, displayName: serverDisplayName(serverId), tools: result.tools };
  },
  async call_tool(input, context) {
    return {
      result: await callTool(
        input.serverId as PkulawMcpServerId,
        String(input.toolName),
        (input.arguments as Record<string, unknown> | undefined) ?? {},
        context,
      ),
    };
  },
  async search_law_articles(input, context) {
    const aggregate = hasAggregate(context.metadata);
    const result = await callTool(
      aggregate ? "law-aggregate" : "law-semantic",
      "search_article",
      aggregate ? { query: trimmed(input.query) } : { text: trimmed(input.query) },
      context,
    );
    return { articles: normalizeCollection(result, "articles") };
  },
  async get_law_article(input, context) {
    const result = await callTool(
      hasAggregate(context.metadata) ? "law-aggregate" : "law-semantic",
      "get_article",
      { title: trimmed(input.title), number: trimmed(input.number) },
      context,
    );
    return { article: normalizeRecord(result, "article") };
  },
  async search_laws(input, context) {
    const fields = searchFields(input);
    const aggregate = hasAggregate(context.metadata);
    const result = await callTool(
      aggregate ? "law-aggregate" : "law-keyword",
      "get_law_list",
      aggregate ? fields : { lawInput: { Title: fields.title, Fulltext: fields.fulltext } },
      context,
    );
    return { laws: normalizeCollection(result, "laws") };
  },
  async search_cases(input, context) {
    const result = await callTool(
      hasAggregate(context.metadata) ? "law-aggregate" : "case-semantic",
      "search_case",
      { text: trimmed(input.text) },
      context,
    );
    return { cases: normalizeCollection(result, "cases") };
  },
  async search_case_documents(input, context) {
    const fields = searchFields(input);
    const aggregate = hasAggregate(context.metadata);
    const result = await callTool(
      aggregate ? "law-aggregate" : "case-keyword",
      "get_case_list",
      aggregate ? fields : { caseInput: { Title: fields.title, Fulltext: fields.fulltext } },
      context,
    );
    return { cases: normalizeCollection(result, "cases") };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "pkulaw",
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await requireApiKeyCredential(context, "pkulaw");
    return {
      apiKey: credential.apiKey,
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const discoveries = await Promise.allSettled(
      pkulawMcpServerIds.map(async (serverId) => ({ serverId, result: await validateServer(serverId, context) })),
    );
    const available = discoveries.flatMap((item) =>
      item.status === "fulfilled" && item.value.result.tools.length > 0 ? [item.value] : [],
    );
    if (available.length === 0) {
      const upstream = discoveries.find(
        (item) =>
          item.status === "rejected" && item.reason instanceof ProviderRequestError && item.reason.status >= 500,
      );
      if (upstream?.status === "rejected") throw upstream.reason;
      throw new ProviderRequestError(
        400,
        "PKULaw Access Token is invalid, expired, or has no supported MCP service enabled",
      );
    }
    const hash = createHash("sha256").update(input.apiKey.trim()).digest("hex").slice(0, 16);
    return {
      profile: { accountId: `pkulaw:mcp:${hash}`, displayName: `PKULaw MCP · ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: {
        mcpGateway: pkulawMcpGateway,
        availableServers: available.map((item) => item.serverId),
        discoveredToolCount: available.reduce((count, item) => count + item.result.tools.length, 0),
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pkulaw",
  baseUrl: pkulawMcpGateway,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

function trimmed(value: unknown): string {
  return String(value).trim();
}

function searchFields(input: Record<string, unknown>): { title?: string; fulltext?: string } {
  const title = typeof input.title === "string" ? input.title.trim() : undefined;
  const fulltext = typeof input.fulltext === "string" ? input.fulltext.trim() : undefined;
  if (!title && !fulltext) throw new ProviderRequestError(400, "title or fulltext is required");
  return { ...(title ? { title } : {}), ...(fulltext ? { fulltext } : {}) };
}
