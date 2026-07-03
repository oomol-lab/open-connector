import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BlazeMeterServiceVirtualizationActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalScalarString, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const blazeMeterServiceVirtualizationApiBaseUrl = "https://a.blazemeter.com/api/v4";
const blazeMeterServiceVirtualizationRequestBaseUrl = "https://a.blazemeter.com/api/v4/";
const blazeMeterServiceVirtualizationValidationPath = "/user";
const blazeMeterServiceVirtualizationDefaultTimeoutMs = 30_000;

type BlazeMeterServiceVirtualizationPhase = "validate" | "execute";
type BlazeMeterServiceVirtualizationMethod = "GET" | "PUT";
type BlazeMeterServiceVirtualizationActionHandler = ProviderRuntimeHandler<BlazeMeterServiceVirtualizationContext>;

interface BlazeMeterServiceVirtualizationContext {
  apiKeyId: string;
  apiSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BlazeMeterServiceVirtualizationRequestInput {
  path: string;
  phase: BlazeMeterServiceVirtualizationPhase;
  method?: BlazeMeterServiceVirtualizationMethod;
  body?: Record<string, unknown>;
}

export const blazeMeterServiceVirtualizationActionHandlers: Record<
  BlazeMeterServiceVirtualizationActionName,
  BlazeMeterServiceVirtualizationActionHandler
> = {
  list_service_mock_templates(input, context) {
    return requestBlazeMeterServiceVirtualizationJson(context, {
      path: `/workspaces/${input.workspaceId}/service-mock-templates`,
      phase: "execute",
    });
  },
  get_service_mock_template(input, context) {
    return requestBlazeMeterServiceVirtualizationJson(context, {
      path: `/workspaces/${input.workspaceId}/service-mock-templates/${input.templateId}`,
      phase: "execute",
    });
  },
  update_service_mock_template(input, context) {
    return requestBlazeMeterServiceVirtualizationJson(context, {
      path: `/workspaces/${input.workspaceId}/service-mock-templates/${input.templateId}`,
      method: "PUT",
      body: buildUpdateServiceMockTemplateBody(input),
      phase: "execute",
    });
  },
};

export type { BlazeMeterServiceVirtualizationContext };

export async function validateBlazeMeterServiceVirtualizationCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKeyId = requireApiKeyId(input.values.apiKeyId);
  const payload = await requestBlazeMeterServiceVirtualizationJson(
    {
      apiKeyId,
      apiSecret: input.apiKey,
      fetcher,
      signal,
    },
    {
      path: blazeMeterServiceVirtualizationValidationPath,
      phase: "validate",
    },
  );
  const envelope = optionalRecord(payload);
  const user = optionalRecord(envelope?.result);
  const userId = readOptionalString(user?.id);
  const email = readOptionalString(user?.email);
  const displayName = readOptionalString(user?.displayName);
  const name = readOptionalString(user?.name);

  return {
    profile: {
      accountId: userId,
      displayName: email ?? displayName ?? name ?? "BlazeMeter API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: blazeMeterServiceVirtualizationApiBaseUrl,
      validationEndpoint: blazeMeterServiceVirtualizationValidationPath,
      apiKeyId,
      userId,
      email,
      displayName,
    }),
  };
}

async function requestBlazeMeterServiceVirtualizationJson(
  context: BlazeMeterServiceVirtualizationContext,
  input: BlazeMeterServiceVirtualizationRequestInput,
): Promise<Record<string, unknown>> {
  const url = new URL(
    input.path.startsWith("/") ? input.path.slice(1) : input.path,
    blazeMeterServiceVirtualizationRequestBaseUrl,
  );

  const timeout = createProviderTimeout(context.signal, blazeMeterServiceVirtualizationDefaultTimeoutMs);
  try {
    const response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: blazeMeterServiceVirtualizationHeaders(context),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readBlazeMeterServiceVirtualizationPayload(response);
    if (!response.ok) {
      throw createBlazeMeterServiceVirtualizationError(response, payload, input.phase);
    }
    return normalizeBlazeMeterServiceVirtualizationEnvelope(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "BlazeMeter request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BlazeMeter request failed: ${error.message}` : "BlazeMeter request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function blazeMeterServiceVirtualizationHeaders(
  context: Pick<BlazeMeterServiceVirtualizationContext, "apiKeyId" | "apiSecret">,
): Record<string, string> {
  return {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(context.apiKeyId, context.apiSecret),
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readBlazeMeterServiceVirtualizationPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "BlazeMeter returned malformed JSON", text);
    }
    return text;
  }
}

function createBlazeMeterServiceVirtualizationError(
  response: Response,
  payload: unknown,
  phase: BlazeMeterServiceVirtualizationPhase,
): ProviderRequestError {
  const message =
    extractBlazeMeterServiceVirtualizationErrorMessage(payload) ?? response.statusText ?? "BlazeMeter request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractBlazeMeterServiceVirtualizationErrorMessage(payload: unknown): string | undefined {
  const envelope = optionalRecord(payload);
  const error = optionalRecord(envelope?.error);
  return (
    readOptionalString(error?.message) ?? readOptionalString(envelope?.message) ?? readOptionalString(envelope?.error)
  );
}

function normalizeBlazeMeterServiceVirtualizationEnvelope(payload: unknown): Record<string, unknown> {
  const envelope = optionalRecord(payload);
  if (!envelope) {
    return {
      apiVersion: null,
      requestId: null,
      error: null,
      result: payload,
      total: null,
      limit: null,
      skip: null,
      hidden: null,
      raw: {},
    };
  }

  return {
    apiVersion: readNullableInteger(envelope.api_version),
    requestId: readNullableString(envelope.request_id),
    error: normalizeBlazeMeterServiceVirtualizationError(envelope.error),
    result: envelope.result,
    total: readNullableInteger(envelope.total),
    limit: readNullableInteger(envelope.limit),
    skip: readNullableInteger(envelope.skip),
    hidden: readNullableInteger(envelope.hidden),
    raw: envelope,
  };
}

function normalizeBlazeMeterServiceVirtualizationError(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  const error = optionalRecord(value);
  if (!error) {
    return {
      code: null,
      message: readNullableString(value),
    };
  }

  return {
    code: readNullableInteger(error.code),
    message: readNullableString(error.message),
  };
}

function buildUpdateServiceMockTemplateBody(input: Record<string, unknown>): Record<string, unknown> {
  const liveSystemHost = optionalString(input.liveSystemHost);
  if (liveSystemHost && !liveSystemHost.startsWith("http://") && !liveSystemHost.startsWith("https://")) {
    throw new ProviderRequestError(400, "liveSystemHost must start with http:// or https://.");
  }

  const body = compactObject({
    name: optionalString(input.name),
    description: optionalString(input.description),
    thinkTime: input.thinkTime,
    liveSystemHost,
    liveSystemPort: input.liveSystemPort,
    endpointPreference: input.endpointPreference,
    noMatchingRequestPreference: input.noMatchingRequestPreference,
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "At least one service mock template field is required.");
  }

  return body;
}

function requireApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(400, "apiKeyId is required");
  }
  return apiKeyId;
}

function readOptionalString(value: unknown): string | undefined {
  return value == null ? undefined : optionalScalarString(value);
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function readNullableInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

export function requireBlazeMeterServiceVirtualizationApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(500, "BlazeMeter apiKeyId is missing");
  }
  return apiKeyId;
}

function buildBasicAuthorizationHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
