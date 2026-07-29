import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, readProviderJsonBody } from "../provider-runtime.ts";

export const podAiApiBaseUrl = "https://api.callpod.ai";

interface PodAiRequestOptions {
  apiKey: string;
  path: string;
  context: ApiKeyProviderContext;
  method?: string;
  body?: unknown;
}

export const podAiActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async create_outbound_call(input, context) {
    const call = await requestPodAiJson({
      apiKey: normalizePodAiApiKey(context.apiKey),
      path: "/v1/outbound/calls",
      method: "POST",
      body: compactObject({
        target_phone_number: optionalString(input.target_phone_number),
        from_phone_number: optionalString(input.from_phone_number),
        agent_id: optionalString(input.agent_id),
        metadata: optionalRecord(input.metadata),
      }),
      context,
    });

    return { call };
  },
};

export async function validatePodAiCredential(apiKey: string): Promise<CredentialValidationResult> {
  normalizePodAiApiKey(apiKey);

  return {
    profile: {
      displayName: "Pod AI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: podAiApiBaseUrl,
      validationMode: "format_only",
    },
  };
}

async function requestPodAiJson(input: PodAiRequestOptions): Promise<Record<string, unknown>> {
  const url = new URL(input.path, podAiApiBaseUrl);
  const method = input.method ?? "GET";
  let response: Response;

  try {
    response = await input.context.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        "x-api-key": input.apiKey,
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Pod AI request failed for ${method} ${url.toString()}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Pod AI returned invalid JSON",
  });
  const record = optionalRecord(payload);
  if (payload !== null && !record) {
    throw new ProviderRequestError(502, "Pod AI returned a non-object JSON payload");
  }
  if (!response.ok) {
    throw createPodAiError(response.status, record);
  }
  if (!record) {
    throw new ProviderRequestError(502, "Pod AI returned an empty response body");
  }

  return record;
}

function normalizePodAiApiKey(apiKey: string): string {
  return requiredString(apiKey, "pod_ai apiKey", () => new ProviderRequestError(400, "pod_ai apiKey is required"));
}

function createPodAiError(status: number, payload: Record<string, unknown> | undefined): ProviderRequestError {
  const message = extractPodAiErrorMessage(payload) ?? `Pod AI request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : 500, message, payload);
}

function extractPodAiErrorMessage(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) {
    return undefined;
  }

  const error = optionalRecord(payload.error);
  return (
    optionalString(error?.message) ??
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    optionalString(payload.detail)
  );
}
