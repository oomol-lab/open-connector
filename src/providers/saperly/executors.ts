import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { SaperlyEndpoint } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { downloadUploadSource } from "../provider-files.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  requiredInputString,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { saperlyActions } from "./actions.ts";
import { saperlyEndpointByName } from "./actions.ts";
const baseUrl = "https://api.saperly.com";
async function request(
  endpoint: SaperlyEndpoint,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  let pathname = endpoint.path;
  for (const key of endpoint.pathKeys) {
    const value = requiredInputString(input[key], key);
    if (value === "." || value === "..") {
      throw providerInputError(`${key} cannot be a dot path segment`);
    }
    pathname = pathname.replace(`{${key}}`, encodeURIComponent(value));
  }
  const url = new URL(pathname, baseUrl);
  for (const key of endpoint.queryKeys) {
    if (input[key] != null) url.searchParams.set(key, String(input[key]));
  }
  const headers = new Headers({ authorization: `Bearer ${apiKey}`, accept: "application/json" });
  const idempotencyKey = optionalString(input.idempotencyKey);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  let body: string | FormData | undefined;
  if (endpoint.name === "create_custom_voice") {
    const audioUrl = requiredInputString(input.audioUrl, "audioUrl");
    const source = await downloadUploadSource({ url: audioUrl, fetcher, fieldName: "audioUrl", signal: parentSignal });
    const form = new FormData();
    for (const key of ["name", "language", "gender"]) {
      form.set(key, requiredInputString(input[key], key));
    }
    const fileName = optionalString(input.fileName) ?? new URL(audioUrl).pathname.split("/").pop() ?? "sample";
    form.set(
      "audio",
      new Blob([new Uint8Array(source.bytes)], {
        type: source.contentType ?? "application/octet-stream",
      }),
      fileName || "sample",
    );
    body = form;
  } else if (endpoint.method !== "GET") {
    const payload = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          key !== "idempotencyKey" &&
          !endpoint.pathKeys.includes(key) &&
          !endpoint.queryKeys.includes(key) &&
          value !== undefined,
      ),
    );
    headers.set("content-type", "application/json");
    body = JSON.stringify(payload);
  }
  return runProviderRequest({ label: "Saperly", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      method: endpoint.method,
      headers,
      body,
      signal,
      redirect: endpoint.outputKind === "recording" ? "manual" : undefined,
    });
    if (endpoint.outputKind === "recording" && response.status === 302) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw providerResponseError("Saperly recording URL is missing");
      const downloadUrl = new URL(location, url);
      if (!["https:", "http:"].includes(downloadUrl.protocol)) {
        throw providerResponseError("Saperly recording URL is invalid");
      }
      return { downloadUrl: downloadUrl.href };
    }
    const data: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const error = optionalRecord(data);
      const detail = [optionalString(error?._tag), optionalString(error?.message) ?? optionalString(error?.reason)]
        .filter(Boolean)
        .join(": ");
      throw new ProviderRequestError(
        response.status,
        `Saperly request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    if (data === undefined) throw providerResponseError("Saperly returned invalid JSON");
    if (endpoint.outputKind === "transcript") return { transcript: data };
    if (endpoint.outputKind === "recording") {
      throw providerResponseError("Saperly did not return a recording redirect");
    }
    if (endpoint.outputKind === "list") {
      if (!Array.isArray(data)) throw providerResponseError("Saperly response must be an array");
      return { items: data };
    }
    return requiredResponseRecord(data, "Saperly response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const endpoint = saperlyEndpointByName.get(actionName);
  if (!endpoint) throw providerInputError("Unknown Saperly action");
  return request(endpoint, values, apiKey, fetcher, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(saperlyEndpointByName.get("get_usage")!, {}, input.apiKey, fetcher, signal);
    return { profile: { displayName: "Saperly API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "saperly",
  Object.fromEntries(
    saperlyActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "saperly",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
