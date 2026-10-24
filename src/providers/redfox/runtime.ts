import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { RedfoxRoute } from "./routes.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";
import { redfoxRoutes } from "./routes.ts";
export const redfoxApiBaseUrl = "https://redfox.hk";
const validationEndpoint = "/story/web/points/api-key/balance";

export async function validateRedfoxCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const endpoint = redfoxRoutes.get_account_balance!;
  await requestRedfox({
    endpoint,
    input: {},
    apiKey: requiredInputString(input.apiKey, "API Key"),
    fetcher,
    parentSignal: signal,
  });
  return {
    profile: { displayName: "RedFoxHub API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: redfoxApiBaseUrl,
      validationEndpoint,
    },
  };
}

export async function executeRedfoxAction(
  endpoint: RedfoxRoute,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  if (endpoint.validateImageRoles) validateImageRoles(input);
  return requestRedfox({
    endpoint,
    input,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    parentSignal: context.signal,
  });
}

interface RedfoxRequest {
  endpoint: RedfoxRoute;
  input: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}

async function requestRedfox({ endpoint, input, apiKey, fetcher, parentSignal }: RedfoxRequest) {
  try {
    return await runProviderRequest({ label: "RedFoxHub", signal: parentSignal }, async (signal) => {
      const url = new URL(endpoint.path, redfoxApiBaseUrl);
      const method = endpoint.method ?? "POST";
      if (method === "GET") {
        for (const [key, value] of Object.entries(input)) {
          if (value !== undefined) url.searchParams.set(key, String(value));
        }
      }
      if (endpoint.credentialQuery) url.searchParams.set("apiKey", apiKey);
      const response = await fetcher(url, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          REDFOX_API_KEY: apiKey,
          "user-agent": providerUserAgent,
        },
        body: method === "POST" ? JSON.stringify(input) : undefined,
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw redfoxError(response.status, `RedFoxHub request failed with ${response.status}`, response.status);
        }
        throw new ProviderRequestError(502, "RedFoxHub returned invalid JSON", undefined, "provider_error");
      }
      const record = optionalRecord(payload);
      const message =
        optionalRawString(record?.msg) ?? optionalRawString(record?.message) ?? optionalRawString(record?.error);
      if (!response.ok) {
        throw redfoxError(response.status, message, response.status);
      }
      let normalizedPayload = payload;
      if (endpoint.directResponse && record?.code === undefined) {
        if (payload === null || (record === undefined && !Array.isArray(payload))) {
          throw new ProviderRequestError(502, "RedFoxHub returned an invalid response", undefined, "provider_error");
        }
        normalizedPayload = { code: 2000, msg: "成功", data: payload };
      }
      const wrapper = requiredResponseRecord(normalizedPayload, "RedFoxHub response");
      const code =
        typeof wrapper.code === "number" ? wrapper.code : Number(optionalRawString(wrapper.code) ?? Number.NaN);
      if (!Number.isInteger(code)) {
        throw new ProviderRequestError(502, "RedFoxHub response did not include code", undefined, "provider_error");
      }
      if (!(endpoint.successCodes ?? [2000]).includes(code)) {
        throw redfoxError(code, message);
      }
      let data = wrapper.data;
      if (endpoint.taskRole) {
        const taskData = requiredResponseRecord(data, "RedFoxHub task data");
        if (endpoint.taskRole === "submit" && !optionalRawString(taskData.taskId)?.trim()) {
          throw new ProviderRequestError(502, "RedFoxHub did not return a taskId", undefined, "provider_error");
        }
        if (endpoint.taskRole === "result" && !optionalRawString(taskData.status)?.trim()) {
          throw new ProviderRequestError(502, "RedFoxHub did not return a task status", undefined, "provider_error");
        }
        if (endpoint.parseImageUrls && typeof taskData.imageUrls === "string") {
          let imageUrls: unknown;
          try {
            imageUrls = JSON.parse(taskData.imageUrls);
          } catch {
            throw new ProviderRequestError(
              502,
              "RedFoxHub returned invalid imageUrls JSON",
              undefined,
              "provider_error",
            );
          }
          if (!Array.isArray(imageUrls) || imageUrls.some((item) => typeof item !== "string")) {
            throw new ProviderRequestError(502, "RedFoxHub returned invalid imageUrls", undefined, "provider_error");
          }
          data = { ...taskData, imageUrls };
        }
      }
      return { ...wrapper, code, msg: optionalRawString(wrapper.msg) ?? message ?? "", data };
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      const message = error.message
        .replaceAll(apiKey, "[REDACTED]")
        .replaceAll(encodeURIComponent(apiKey), "[REDACTED]");
      if (message !== error.message) {
        throw new ProviderRequestError(error.status, message, error.details, error.code);
      }
    }
    throw error;
  }
}

function redfoxError(code: number, message?: string, httpStatus?: number) {
  const text = message || `RedFoxHub returned code ${code}`;
  if (code === 429) return new ProviderRequestError(429, text, undefined, "rate_limited");
  if ([400, 404, 422].includes(code)) return new ProviderRequestError(400, text, undefined, "invalid_input");
  return new ProviderRequestError(
    httpStatus ?? 502,
    text,
    {
      upstreamCode: code,
    },
    "provider_error",
  );
}

function validateImageRoles(input: Record<string, unknown>) {
  const images = input.imageWithRoles;
  if (!Array.isArray(images)) return;
  for (const [role, maximum] of [
    ["first_frame", 1],
    ["last_frame", 1],
    ["reference_image", 9],
  ] as const) {
    if (images.filter((image) => optionalRecord(image)?.role === role).length > maximum) {
      throw new ProviderRequestError(400, `${role} allows at most ${maximum} images`, undefined, "invalid_input");
    }
  }
}
