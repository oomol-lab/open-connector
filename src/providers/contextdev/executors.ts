import type { TransitFileWriter } from "../../core/types.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { ContextdevEndpoint } from "./actions.ts";

import { optionalRecord, optionalString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  requiredInputString,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
} from "../provider-runtime.ts";
import { contextdevActions } from "./actions.ts";
import { contextdevEndpointByName } from "./actions.ts";
import { downloadParseFile, storeScrapeFiles } from "./files.ts";
const baseUrl = "https://api.context.dev/v1";
function requestTimeout(endpoint: ContextdevEndpoint, input: Record<string, unknown>) {
  const timeout = optionalNumber(optionalRecord(input.timeoutOpts)?.milliseconds);
  if (timeout !== undefined) return timeout + 10000;
  if (
    endpoint.path.startsWith("/web/") ||
    endpoint.path === "/parse" ||
    endpoint.path === "/brand/retrieve" ||
    endpoint.path === "/people/enrich" ||
    endpoint.path === "/company/search" ||
    endpoint.path === "/utility/prefetch"
  ) {
    return 310000;
  }
  return undefined;
}
async function request(
  endpoint: ContextdevEndpoint,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  validating = false,
  transitFiles?: TransitFileWriter,
  parentSignal?: AbortSignal,
) {
  const body = { ...input };
  let path = endpoint.path;
  for (const key of endpoint.pathKeys) {
    const value = requiredInputString(body[key], key);
    if (value === "." || value === "..") throw providerInputError(`Invalid ${key}`);
    path = path.replace(`{${key}}`, encodeURIComponent(value));
    delete body[key];
  }
  const url = new URL(`${baseUrl}${path}`);
  for (const key of endpoint.queryKeys) {
    const value = body[key];
    if (value !== undefined && value !== null)
      url.searchParams.set(
        key,
        Array.isArray(value) ? value.join(",") : typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    delete body[key];
  }
  const headers = new Headers({ authorization: `Bearer ${apiKey}`, accept: "application/json" });
  for (const [key, header] of Object.entries(endpoint.headerKeys)) {
    if (body[key] !== undefined) headers.set(header, String(body[key]));
    delete body[key];
  }
  const hasBody = endpoint.method === "POST" || endpoint.method === "PATCH";
  if (hasBody) headers.set("content-type", "application/json");
  if (
    endpoint.name === "scrape_web" &&
    (optionalRecord(body.formats)?.screenshot || optionalRecord(body.formats)?.bytes) &&
    !transitFiles
  )
    throw new ProviderRequestError(
      500,
      "Context.dev binary outputs require file transit and execution context",
      undefined,
      "provider_error",
    );
  return runProviderRequest(
    { label: "Context.dev", timeoutMs: requestTimeout(endpoint, input), signal: parentSignal },
    async (signal) => {
      let requestBody: BodyInit | undefined = hasBody ? JSON.stringify(body) : undefined;
      if (endpoint.name === "parse_file") {
        requestBody = new Uint8Array(
          await downloadParseFile(requiredInputString(body.fileUrl, "fileUrl"), fetcher, signal),
        );
        headers.set("content-type", "application/octet-stream");
      }
      const response = await fetcher(url, {
        method: endpoint.method,
        headers,
        body: requestBody,
        signal,
      });
      const payload: unknown = await response.json().catch((error: unknown) => {
        if (isAbortLikeError(error)) throw error;
        return undefined;
      });
      if (!response.ok) {
        const error = optionalRecord(payload);
        const code = optionalString(error?.error_code);
        const invalidKey = response.status === 401 && (code === "NOT_FOUND" || code === "DISABLED");
        const detail = code ? `: ${code.replaceAll(apiKey, "[REDACTED]")}` : "";
        throw new ProviderRequestError(
          invalidKey && validating ? 400 : response.status,
          `Context.dev request failed (${response.status})${detail}`,
          undefined,
          invalidKey ? (validating ? "invalid_input" : "authorization_failed") : "provider_error",
        );
      }
      const result = requiredResponseRecord(payload, "Context.dev response");
      if (endpoint.name === "scrape_web") return storeScrapeFiles(result, transitFiles);
      if (endpoint.name === "get_batch_results" && Array.isArray(result.data)) {
        for (const item of result.data) {
          const scrape = optionalRecord(optionalRecord(item)?.result);
          if (scrape) await storeScrapeFiles(scrape, transitFiles);
        }
      }
      return result;
    },
  );
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const endpoint = contextdevEndpointByName.get(actionName);
  if (!endpoint) throw providerInputError(`Unknown Context.dev action: ${actionName}`);
  return request(endpoint, values, apiKey, fetcher, false, context.transitFiles, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(contextdevEndpointByName.get("get_usage")!, {}, input.apiKey, fetcher, true, undefined, signal);
    return { profile: { displayName: "Context.dev API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "contextdev",
  Object.fromEntries(
    contextdevActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "contextdev",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
