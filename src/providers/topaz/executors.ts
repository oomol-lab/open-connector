import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { topazActions } from "./actions.ts";
import { additionalEndpointByName } from "./additional-actions.ts";
import { imageOperationByName } from "./image-operations.ts";
const baseUrl = "https://api.topazlabs.com";
const imageFields: Record<string, string> = {
  imageUrl: "source_url",
  sourceId: "source_id",
  model: "model",
  outputWidth: "output_width",
  outputHeight: "output_height",
  outputFormat: "output_format",
  cropToFill: "crop_to_fill",
  webhookUrl: "webhook_url",
};
async function request(
  apiKey: string,
  path: string,
  method: string,
  body: BodyInit | undefined,
  fetcher: typeof fetch,
  allowEmpty = false,
  arrayField?: "data" | "results",
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Topaz" }, async (signal) => {
    const headers = new Headers({ "X-API-Key": apiKey, accept: "application/json" });
    if (typeof body === "string") headers.set("content-type", "application/json");
    const response = await fetcher(new URL(path, baseUrl), { method, headers, body, signal });
    if (response.status === 204 && allowEmpty) return {};
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message = optionalString(record?.message);
      const code = optionalString(record?.errorCode);
      throw new ProviderRequestError(
        response.status,
        `Topaz request failed (${response.status})${code ? `: ${code}` : ""}${message ? `: ${message}` : ""}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (arrayField && Array.isArray(payload)) return { [arrayField]: payload };
    if (arrayField === "results") throw providerResponseError("Topaz bulk estimate response must be an array");
    return requiredResponseRecord(payload, "Topaz response");
  });
}
function imageForm(input: Record<string, unknown>) {
  const form = new FormData();
  const settings = optionalRecord(input.modelSettings) ?? {};
  const reserved = new Set(["image", ...Object.values(imageFields)]);
  for (const [key, value] of Object.entries(settings)) {
    if (reserved.has(key)) throw providerInputError(`modelSettings cannot override ${key}`);
    form.set(key, String(value));
  }
  for (const [key, field] of Object.entries(imageFields)) {
    if (input[key] !== undefined) form.set(field, String(input[key]));
  }
  return form;
}
function requireResultString(result: Record<string, unknown>, field: string) {
  if (!optionalString(result[field])?.trim()) {
    throw providerResponseError(`Topaz response is missing ${field}`);
  }
  return result;
}
function estimateBody(input: Record<string, unknown>) {
  const { modelSettings, ...parameters } = input;
  const settings = optionalRecord(modelSettings) ?? {};
  const reserved = new Set([
    "category",
    "model",
    "input_height",
    "input_width",
    "output_height",
    "output_width",
    "crop_to_fill",
    "output_format",
  ]);
  for (const field of Object.keys(settings)) {
    if (reserved.has(field)) throw providerInputError(`modelSettings cannot override ${field}`);
  }
  return { ...settings, ...parameters };
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const data = { ...values };
  const source = optionalRecord(data.source),
    output = optionalRecord(data.output);
  if (source && typeof source.container === "string")
    data.source = { ...source, container: source.container.toLowerCase() };
  if (output && typeof output.videoEncoder === "string")
    data.output = {
      ...output,
      videoEncoder:
        ["AV1", "H264", "H265", "ProRes", "VP9"].find(
          (value) => value.toLowerCase() === String(output.videoEncoder).toLowerCase(),
        ) ?? output.videoEncoder,
    };
  const key = context.apiKey;
  const fetcher = context.fetcher;
  const imageOperation = imageOperationByName.get(actionName);
  if (imageOperation) {
    return requireResultString(
      await request(
        key,
        `/image/v1/${imageOperation.path}/async`,
        "POST",
        imageForm(data),
        fetcher,
        undefined,
        undefined,
        context.signal,
      ),
      "process_id",
    );
  }
  const endpoint = additionalEndpointByName.get(actionName);
  if (endpoint) {
    const parameters = { ...data };
    let path = endpoint.path;
    for (const field of ["processId", "requestId"]) {
      if (path.includes(`{${field}}`)) {
        path = path.replace(`{${field}}`, encodeURIComponent(String(parameters[field])));
        delete parameters[field];
      }
    }
    if (
      actionName === "get_credit_usage" &&
      typeof parameters.start_date === "string" &&
      typeof parameters.end_date === "string" &&
      parameters.end_date < parameters.start_date
    ) {
      throw providerInputError("end_date must be on or after start_date");
    }
    if (endpoint.mode === "imageList") parameters.paginated ??= true;
    if (endpoint.mode === "query" || endpoint.mode === "imageList") {
      const url = new URL(path, baseUrl);
      for (const [name, value] of Object.entries(parameters)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(name, String(item));
      }
      path = url.pathname + url.search;
    }
    const payload =
      endpoint.mode === "estimate"
        ? estimateBody(parameters)
        : endpoint.mode === "bulk"
          ? (parameters.requests as Record<string, unknown>[]).map(estimateBody)
          : parameters;
    const body =
      endpoint.method === "POST" || (endpoint.method === "PATCH" && actionName === "complete_video_upload")
        ? JSON.stringify(payload)
        : undefined;
    const result = await request(
      key,
      path,
      endpoint.method,
      body,
      fetcher,
      endpoint.mode === "ack",
      endpoint.mode === "bulk" ? "results" : endpoint.mode === "imageList" ? "data" : undefined,
      context.signal,
    );
    if (endpoint.mode === "imageList" && !Array.isArray(result.data))
      throw providerResponseError("Topaz image list response is missing data");
    if (actionName === "get_image_input_download") return requireResultString(result, "download_url");
    if (endpoint.mode === "ack") return { ...result, accepted: true };
    if (actionName === "create_video_request") return requireResultString(result, "requestId");
    return result;
  }
  switch (actionName) {
    case "get_credit_balance":
      return request(
        key,
        "/account/v1/credits/balance",
        "GET",
        undefined,
        fetcher,
        undefined,
        undefined,
        context.signal,
      );
    case "get_image_job":
      return requireResultString(
        await request(
          key,
          `/image/v1/status/${encodeURIComponent(String(data.processId))}`,
          "GET",
          undefined,
          fetcher,
          undefined,
          undefined,
          context.signal,
        ),
        "status",
      );
    case "get_image_download":
      return requireResultString(
        await request(
          key,
          `/image/v1/download/${encodeURIComponent(String(data.processId))}`,
          "GET",
          undefined,
          fetcher,
          undefined,
          undefined,
          context.signal,
        ),
        "download_url",
      );
    case "cancel_image_job":
      await request(
        key,
        `/image/v1/cancel/${encodeURIComponent(String(data.processId))}`,
        "DELETE",
        undefined,
        fetcher,
        true,
        undefined,
        context.signal,
      );
      return { accepted: true };
    case "submit_video_enhancement":
      return requireResultString(
        await request(
          key,
          "/video/express",
          "POST",
          JSON.stringify(data),
          fetcher,
          undefined,
          undefined,
          context.signal,
        ),
        "requestId",
      );
    case "get_video_job":
      return requireResultString(
        await request(
          key,
          `/video/${encodeURIComponent(String(data.requestId))}/status`,
          "GET",
          undefined,
          fetcher,
          undefined,
          undefined,
          context.signal,
        ),
        "status",
      );
    case "cancel_video_job":
      return {
        ...(await request(
          key,
          `/video/${encodeURIComponent(String(data.requestId))}`,
          "DELETE",
          undefined,
          fetcher,
          true,
          undefined,
          context.signal,
        )),
        accepted: true,
      };
    default:
      throw providerInputError("Unknown Topaz action");
  }
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "topaz",
  Object.fromEntries(
    topazActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(input.apiKey, "/account/v1/credits/balance", "GET", undefined, fetcher, undefined, undefined, signal);
    return { profile: { displayName: "Topaz API Account" }, grantedScopes: [], metadata: {} };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "topaz",
  baseUrl: baseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries({ accept: "application/json" }))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
