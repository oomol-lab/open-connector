import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString, looseArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { downloadUploadSource } from "../provider-files.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { orbitActions } from "./actions.ts";
import { orbitRoutes } from "./routes.ts";
const baseUrl = "https://api.orbitsearch.com";
async function request(
  apiKey: string,
  name: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const route = orbitRoutes[name]!;
  let path = route.path;
  const data = { ...input };
  for (const field of route.pathFields) {
    path = path.replace(`{${field}}`, encodeURIComponent(String(data[field])));
    delete data[field];
  }
  const url = new URL(path, baseUrl);
  for (const field of route.queryFields) {
    if (data[field] !== undefined) url.searchParams.set(field, String(data[field]));
    delete data[field];
  }
  const idempotencyKey = optionalString(data.idempotencyKey);
  delete data.idempotencyKey;
  let body: BodyInit | undefined = route.body ? JSON.stringify(data) : undefined;
  if (name === "detect_faces") {
    const file = await downloadUploadSource({
      url: String(data.imageUrl),
      fieldName: "imageUrl",
      fetcher,
      maximumBytes: 25 * 1024 * 1024,
      signal: parentSignal,
    });
    const mime = file.contentType?.split(";")[0]?.trim().toLowerCase();
    if (!mime || !["image/jpeg", "image/png", "image/webp"].includes(mime))
      throw providerInputError("imageUrl must return a JPG, PNG or WebP image");
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(file.bytes)], { type: mime }),
      `image.${mime === "image/jpeg" ? "jpg" : mime.split("/")[1]}`,
    );
    body = form;
  }
  return runProviderRequest({ label: "Orbit", signal: parentSignal }, async (signal) => {
    const headers = new Headers({ authorization: `Bearer ${apiKey}`, accept: "application/json" });
    if (body !== undefined && !(body instanceof FormData)) headers.set("content-type", "application/json");
    if (idempotencyKey !== undefined) headers.set("Idempotency-Key", idempotencyKey);
    const response = await fetcher(url, { method: route.method, headers, body, signal });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const error = optionalRecord(optionalRecord(payload)?.error);
      const code = optionalString(error?.code);
      const message = optionalString(error?.message);
      const detail = [code, message].filter(Boolean).join(": ");
      throw new ProviderRequestError(
        response.status,
        `Orbit request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        undefined,
        code === "invalid_api_key"
          ? "authorization_failed"
          : code === "missing_api_key_scope"
            ? "authorization_failed"
            : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Orbit response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const data = values;
  if (actionName === "get_batch_enrichment") {
    const results: Record<string, unknown>[] = [];
    for (const requestId of data.request_ids as string[]) {
      results.push(await request(apiKey, "get_enrichment", { request_id: requestId }, fetcher, context.signal));
    }
    const status = results.some((result) => result.status !== "completed" && result.status !== "failed")
      ? "running"
      : results.some((result) => result.status === "failed")
        ? "completed_with_errors"
        : "completed";
    return { status, results };
  }
  const result = await request(apiKey, actionName, data, fetcher, context.signal);
  if (actionName === "batch_enrich") {
    const children = looseArray(result.results);
    const requestIds = children.map((child) => optionalString(optionalRecord(child)?.request_id));
    if (!children.length || requestIds.some((id) => !id))
      throw providerResponseError("Orbit batch response is missing child request IDs");
    return { ...result, request_ids: requestIds };
  }
  return result;
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(
      input.apiKey,
      "quote_population",
      {
        population: { kind: "company", id: "1441", name: "Google" },
        profile_depth: "partial",
      },
      fetcher,
      signal,
    );
    return { profile: { displayName: "Orbit API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "orbit",
  Object.fromEntries(
    orbitActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "orbit",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
