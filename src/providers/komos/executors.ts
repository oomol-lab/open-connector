import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError, providerResponseError } from "../provider-runtime.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import actions from "./actions.ts";
const baseUrl = "https://api.komos.ai/public/v1";
async function requestKomos(
  apiKey: string,
  pathname: string,
  method: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const url = new URL(`${baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ signal: parentSignal, label: "Komos" }, async (signal) => {
    const response = await fetcher(url, {
      method,
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    });
    if (!response.ok) {
      const detail = optionalRecord(payload)?.detail;
      const error = optionalRecord(detail);
      const code = optionalString(error?.error);
      const detailMessage = optionalString(error?.message);
      const message =
        optionalString(detail) ?? ([code, detailMessage].filter(Boolean).join(": ") || `HTTP ${response.status}`);
      throw new ProviderRequestError(response.status, `Komos: ${message}`, undefined, "provider_error");
    }
    return requiredResponseRecord(payload, "Komos response");
  });
}
async function execute(
  actionName: string,
  valuesInput: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const data = valuesInput;
  const { taskId, runId, ...fields } = data;
  let pathname: string;
  let method = "GET";
  let query: Record<string, unknown> = {};
  let body: Record<string, unknown> | undefined;
  let unwrapRun = false;
  switch (actionName) {
    case "list_tasks":
      pathname = "/tasks";
      query = data;
      break;
    case "get_task":
      pathname = `/tasks/${encodeURIComponent(String(taskId))}`;
      break;
    case "list_runs":
      pathname = "/task-runs";
      query = data;
      break;
    case "list_task_runs":
    case "queue_task_run":
      pathname = `/tasks/${encodeURIComponent(String(taskId))}/runs`;
      if (actionName === "queue_task_run") {
        method = "POST";
        body = fields;
        unwrapRun = true;
      }
      break;
    case "get_task_run":
      pathname = `/task-runs/${encodeURIComponent(String(runId))}`;
      unwrapRun = true;
      break;
    case "get_task_run_logs":
      pathname = `/task-runs/${encodeURIComponent(String(runId))}/logs`;
      break;
    case "cancel_task_run":
      pathname = `/task-runs/${encodeURIComponent(String(runId))}/cancel`;
      method = "POST";
      body = fields;
      unwrapRun = true;
      break;
    default:
      throw providerInputError(`Unknown Komos action: ${actionName}`);
  }
  const result = await requestKomos(context.apiKey, pathname, method, query, body, context.fetcher, context.signal);
  if (!unwrapRun) return result;
  const run = requiredResponseRecord(result.run, "Komos run");
  if (!optionalString(run.id) || !optionalString(run.status)) {
    throw providerResponseError("Komos run is missing id or status");
  }
  return run;
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "komos",
  Object.fromEntries(
    actions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ApiKeyProviderContext) => execute(action.name, values, context),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await requestKomos(input.apiKey, "/tasks", "GET", { limit: 1 }, undefined, fetcher);
    return { profile: { displayName: "Komos API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "komos",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
