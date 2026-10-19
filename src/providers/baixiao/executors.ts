import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { baixiaoActions } from "./actions.ts";

const service = "baixiao";
const origin = "https://mcp.know-pa.cn";
const endpoint = `${origin}/mcp`;
const timeoutMs = 60_000;
type Context = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type Result = Awaited<ReturnType<Client["callTool"]>>;

const toolNames: Record<string, string> = {
  corpus_search: "baixiao_corpus_search",
  get_pdf: "baixiao_get_pdf",
  external_search: "baixiao_external_search",
  citation_graph: "baixiao_citation_graph",
  verify_reference: "baixiao_verify_reference",
  fetch_metadata: "baixiao_fetch_metadata",
  journal_fit: "baixiao_journal_fit",
  find_reviewers: "baixiao_find_reviewers",
  advanced_search: "baixiao_advanced_search",
  verify_references: "baixiao_verify_references",
  fetch_metadata_batch: "baixiao_fetch_metadata_batch",
  my_kb_search: "baixiao_my_kb_search",
  list_my_kbs: "baixiao_list_my_kbs",
  policy_search: "baixiao_policy_search",
  xi_thought_search: "baixiao_xi_thought_search",
  hk_grants_search: "baixiao_hk_grants_search",
  grants_cfp_search: "baixiao_grants_cfp_search",
  grants_award_search: "baixiao_grants_award_search",
};

const handlers = mapProviderActionHandlers(service, baixiaoActions, (action) => {
  if (action.name === "list_tools") {
    return async (_input: Record<string, unknown>, context: Context): Promise<unknown> => ({
      tools: (await withClient(context, (client) => client.listTools({}, { timeout: timeoutMs }))).tools,
    });
  }
  if (action.name === "call_tool") {
    return async (input: Record<string, unknown>, context: Context): Promise<unknown> => ({
      result: await callTool(context, String(input.toolName), recordOrEmpty(input.arguments)),
    });
  }
  return (input: Record<string, unknown>, context: Context): Promise<unknown> =>
    callTool(context, toolNames[action.name]!, input);
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: origin,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint: (value) => value === "/mcp",
  timeoutMs,
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    const context = { apiKey: input.apiKey.trim(), fetcher: options.fetcher, signal: options.signal };
    await callTool(context, "baixiao_list_my_kbs", {});
    const hash = createHash("sha256").update(context.apiKey).digest("hex").slice(0, 16);
    return {
      profile: { accountId: `baixiao:${hash}`, displayName: `Baixiao · ${hash.slice(-6)}` },
      grantedScopes: [],
      metadata: { mcpEndpoint: endpoint },
    };
  },
};

async function callTool(context: Context, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await withClient(context, (client) =>
    client.callTool({ name, arguments: args }, { timeout: timeoutMs }),
  );
  const error = findError(result);
  if (error)
    throw new ProviderRequestError(
      error.code === "unauthorized" ? 401 : 502,
      error.message ?? `Baixiao MCP returned ${error.code}`,
      error.raw,
    );
  return result;
}
function withClient<T>(context: Context, run: (client: Client) => Promise<T>): Promise<T> {
  const headers = new Headers({ authorization: `Bearer ${context.apiKey}`, "user-agent": providerUserAgent });
  return withMcpClient(
    {
      endpoint: new URL(endpoint),
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers,
      signal: context.signal,
    },
    run,
  );
}
function findError(result: Result): { code: string; message?: string; raw: Record<string, unknown> } | undefined {
  const candidates: unknown[] = [];
  if (result.structuredContent) candidates.push(result.structuredContent);
  for (const item of result.content)
    if (item.type === "text") {
      try {
        candidates.push(JSON.parse(item.text));
      } catch {}
    }
  for (const candidate of candidates) {
    const raw = optionalRecord(candidate);
    const code = optionalString(raw?.error)?.trim();
    if (raw && code) return { code, message: optionalString(raw.message)?.trim(), raw };
  }
}
