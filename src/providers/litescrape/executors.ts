import type { TransitFileWriter } from "../../core/types.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { litescrapeActions } from "./actions.ts";
import { litescrapeEndpointByName, litescrapeToolByName } from "./actions.ts";
const baseUrl = "https://api.litescrape.com";
async function request(
  apiKey: string,
  name: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  const endpoint = litescrapeEndpointByName.get(name)!;
  const body = { ...input };
  let path = endpoint.path;
  const headers = new Headers({ accept: "application/json" });
  if (name !== "submit_feedback") headers.set("authorization", `Bearer ${apiKey}`);
  for (const key of ["job_id", "token"]) {
    if (!path.includes(`{${key}}`)) continue;
    const value = String(input[key]);
    if (value === "." || value === "..") throw providerInputError("Invalid path identifier");
    path = path.replace(`{${key}}`, encodeURIComponent(value));
    delete body[key];
  }
  let payload = body;
  if (endpoint.path.endsWith("/async")) {
    payload = optionalRecord(input.body)!;
    headers.set("Idempotency-Key", optionalString(input.idempotencyKey) ?? randomUUIDv7());
    if (input.batchId !== undefined) headers.set("X-Litescrape-Batch-Id", String(input.batchId));
    if (input.batchSize !== undefined) headers.set("X-Litescrape-Batch-Size", String(input.batchSize));
  }
  if (name === "disable_auto_top_up") payload = { enabled: false };
  const url = new URL(path, baseUrl);
  if (endpoint.method === "GET") {
    for (const [key, value] of Object.entries(body)) if (value !== undefined) url.searchParams.set(key, String(value));
  } else if (!endpoint.path.endsWith("/async") && body.timeout !== undefined) {
    url.searchParams.set("timeout", String(body.timeout));
    delete body.timeout;
  }
  const timeoutMs = litescrapeToolByName.has(name) ? 100000 : undefined;
  return runProviderRequest({ label: "Litescrape", timeoutMs, signal: parentSignal }, async (signal) => {
    if (endpoint.method !== "GET") headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method: endpoint.method,
      headers,
      body: endpoint.method === "GET" ? undefined : JSON.stringify(payload),
      signal,
    });
    const result: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const object = optionalRecord(result);
      const detail = [
        optionalString(object?.error_code),
        optionalString(object?.error),
        optionalString(object?.message),
      ]
        .filter(Boolean)
        .join(": ");
      const credentialFailure = ["invalid_key", "invalid_api_key", "api_key_disabled"].includes(
        optionalString(object?.error_code) ?? "",
      );
      throw new ProviderRequestError(
        credentialFailure && validating ? 400 : response.status,
        `Litescrape request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        undefined,
        credentialFailure ? (validating ? "invalid_input" : "authorization_failed") : "provider_error",
      );
    }
    const object = requiredResponseRecord(result, "Litescrape response");
    if (endpoint.path.endsWith("/async") && !optionalString(object.job_id))
      throw providerResponseError("Litescrape asynchronous response is missing job_id");
    if (name === "get_job" && !optionalString(object.state))
      throw providerResponseError("Litescrape job response is missing state");
    return object;
  });
}
async function normalizeScreenshot(value: Record<string, unknown>, transitFiles?: TransitFileWriter) {
  const encoded = optionalString(value.screenshot_base64);
  if (encoded === undefined) return value;
  if (!transitFiles)
    throw new ProviderRequestError(
      500,
      "Litescrape screenshots require file transit and execution context",
      undefined,
      "provider_error",
    );
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw providerResponseError("Litescrape returned an invalid PNG screenshot");
  const file = await transitFiles.create(new File([bytes], "litescrape-screenshot.png", { type: "image/png" }));
  const { screenshot_base64: _, ...rest } = value;
  return { ...rest, screenshot: { url: file.downloadUrl, mimeType: "image/png" } };
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const endpoint = litescrapeEndpointByName.get(actionName);
  if (!endpoint) throw providerInputError(`Unknown Litescrape action: ${actionName}`);
  const data = values;
  if (actionName === "google_search" || actionName === "submit_google_search") {
    const search = actionName === "google_search" ? data : optionalRecord(data.body)!;
    if (!["q", "ludocid", "kgmid", "page_token"].some((key) => optionalString(search[key])?.trim()))
      throw providerInputError("Provide q, ludocid, kgmid or page_token");
    if (
      search.page_token &&
      Object.entries(search).some(([key, value]) => key !== "page_token" && key !== "timeout" && value != null)
    )
      throw providerInputError("Send page_token without other search parameters");
  }
  if (actionName === "setup_auto_top_up" && Number(data.monthly_limit_cents) < Number(data.top_up_cents))
    throw providerInputError("monthly_limit_cents must cover one top-up");
  const isScreenshot = actionName === "web_screenshot" || actionName === "submit_web_screenshot";
  if (isScreenshot && !context.transitFiles)
    throw new ProviderRequestError(
      500,
      "Litescrape screenshots require file transit and execution context",
      undefined,
      "provider_error",
    );
  const result = await request(apiKey, actionName, data, fetcher, undefined, context.signal);
  if (actionName === "get_job" || actionName === "submit_web_screenshot") {
    const response = optionalRecord(result.response);
    if (response && result.state === "succeeded")
      return {
        ...result,
        response: await normalizeScreenshot(response, context.transitFiles),
      };
  }
  if (actionName === "web_screenshot" && !optionalString(result.screenshot_base64))
    throw providerResponseError("Litescrape screenshot response is missing screenshot_base64");
  return actionName === "web_screenshot" ? normalizeScreenshot(result, context.transitFiles) : result;
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(input.apiKey, "get_key_status", {}, fetcher, true, signal);
    return { profile: { displayName: "Litescrape API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "litescrape",
  Object.fromEntries(
    litescrapeActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "litescrape",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
