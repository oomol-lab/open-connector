import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString, requiredResponseRecord, providerUserAgent } from "../provider-runtime.ts";
import { clayActions } from "./actions.ts";
import { runClayBatch } from "./batch-runtime.ts";
import { baseUrl, encodeSegment, requestClay } from "./request.ts";
const readPaths = {
  get_me: "/me",
  get_credit_balance: "/credits/balance",
  get_search_query_reference: "/search/query-mode/reference",
  get_workflow_run_query_reference: "/workflows/runs/query/reference",
};
const handlers = mapProviderActionHandlers(
  "clay",
  clayActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const body = values;
    switch (action.name) {
      case "get_me":
      case "get_credit_balance":
      case "get_search_query_reference":
      case "get_workflow_run_query_reference":
        return requestClay(context, readPaths[action.name]);
      case "create_search":
        return requestClay(context, "/search/query-mode", body);
      case "get_search_results": {
        const { search_id, ...page } = body;
        return requestClay(context, `/search/query-mode/${encodeSegment(search_id)}/run`, page);
      }
      case "run_routine": {
        const { routine_id, ...run } = body;
        return requestClay(context, `/routines/${encodeSegment(routine_id)}/run`, run);
      }
      case "get_routine_results": {
        const { routine_run_id, cursor, limit } = body;
        const query = new URLSearchParams();
        if (cursor !== undefined) query.set("cursor", String(cursor));
        if (limit !== undefined) query.set("limit", String(limit));
        return requestClay(context, `/routines/run/${encodeSegment(routine_run_id)}/results?${query}`);
      }
      case "run_routine_batch":
        return runClayBatch(context, body);
      case "get_routine_batch_results":
        return requestClay(context, `/routines/run-batch/${encodeSegment(body.routine_run_id)}/results`);
      case "query_tables":
        return requestClay(context, "/tables/query", body);
      case "query_workflow_runs":
        return requestClay(context, "/workflows/runs/query", body);
    }
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("clay", handlers, {
  skipDnsValidation: false,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestClay({ apiKey: requiredInputString(input.apiKey, "API Key"), fetcher, signal }, "/me");
    const workspace = requiredResponseRecord(payload.workspace, "Clay workspace");
    const user = requiredResponseRecord(payload.user, "Clay user");
    return {
      profile: { displayName: optionalRawString(workspace.name) ?? optionalRawString(user.name) ?? "Clay API Key" },
      grantedScopes: [],
      metadata: { workspaceId: optionalRawString(workspace.id), apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "clay",
  baseUrl,
  auth: { type: "api_key_header", name: "clay-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
