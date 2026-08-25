import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "realphonevalidation";
const realPhoneValidationApiBaseUrl = "https://api.realvalidation.com";
const turboStandardPath = "/rpvWebService/Turbo.php";
const turboV3Path = "/rpvWebService/TurboV3.php";
const validationPhoneNumber = "7275555555";

interface RealPhoneValidationResponse {
  status: string;
  error_text: string | null;
  phone_type: string | null;
  caller_name?: string | null;
  carrier?: string | null;
  caller_type?: string | null;
}

type RealPhoneValidationActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const realPhoneValidationActionHandlers: ProviderActionHandlers<
  "realphonevalidation",
  RealPhoneValidationActionHandler
> = {
  validate_phone_standard(input, context) {
    return requestRealPhoneValidation({
      path: turboStandardPath,
      phone: optionalString(input.phone) ?? "",
      context,
      mode: "execute",
      includeEnrichment: false,
    });
  },
  validate_phone_v3(input, context) {
    return requestRealPhoneValidation({
      path: turboV3Path,
      phone: optionalString(input.phone) ?? "",
      context,
      mode: "execute",
      includeEnrichment: true,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, realPhoneValidationActionHandlers);

export async function validateRealPhoneValidationCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestRealPhoneValidation({
    path: turboStandardPath,
    phone: validationPhoneNumber,
    context: { apiKey, fetcher, signal },
    mode: "validate",
    includeEnrichment: false,
  });
  return {
    profile: {
      accountId: createHash("sha256").update(apiKey).digest("hex"),
      displayName: "RealPhoneValidation API Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: realPhoneValidationApiBaseUrl,
      validationEndpoint: turboStandardPath,
      validatedPhone: validationPhoneNumber,
      validationStatus: payload.status,
      phoneType: payload.phone_type,
    },
  };
}

export const credentialValidators = {
  apiKey(
    input: { apiKey: string },
    { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    return validateRealPhoneValidationCredential(input, fetcher, signal);
  },
};

async function requestRealPhoneValidation(input: {
  path: string;
  phone: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  includeEnrichment: boolean;
}): Promise<RealPhoneValidationResponse> {
  const url = new URL(input.path, realPhoneValidationApiBaseUrl);
  url.searchParams.set("output", "json");
  url.searchParams.set("phone", input.phone);
  url.searchParams.set("token", input.context.apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readRealPhoneValidationPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `RealPhoneValidation request failed: ${error.message}`
        : "RealPhoneValidation request failed",
    );
  }

  if (response.status === 403) {
    throw new ProviderRequestError(
      429,
      "RealPhoneValidation temporarily throttled the request after exceeding the recommended rate limit.",
    );
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : 400,
      extractRealPhoneValidationMessage(payload) ?? `RealPhoneValidation request failed with HTTP ${response.status}`,
      payload,
    );
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `RealPhoneValidation ${input.path} returned a non-object response`);
  }
  return normalizeRealPhoneValidationResponse(record, input.mode, input.includeEnrichment);
}

async function readRealPhoneValidationPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeRealPhoneValidationResponse(
  record: Record<string, unknown>,
  mode: "validate" | "execute",
  includeEnrichment: boolean,
): RealPhoneValidationResponse {
  const status = optionalString(record.status);
  const errorText = readErrorText(record.error_text);
  if (!status) {
    throw new ProviderRequestError(502, "RealPhoneValidation response did not include a status field");
  }

  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus === "unauthorized" || errorText === "token is not valid") {
    throw new ProviderRequestError(mode === "validate" ? 401 : 403, errorText ?? "token is not valid");
  }
  if (
    normalizedStatus === "invalid-format" ||
    normalizedStatus === "invalid-phone" ||
    (normalizedStatus === "error" && (errorText === "bad phone number" || errorText === "missing token"))
  ) {
    throw new ProviderRequestError(400, errorText ?? status);
  }
  if (normalizedStatus === "server-unavailable") {
    throw new ProviderRequestError(503, errorText ?? status);
  }

  const output: RealPhoneValidationResponse = {
    status,
    error_text: errorText,
    phone_type: optionalString(record.phone_type) ?? null,
  };
  if (includeEnrichment) {
    output.caller_name = optionalString(record.caller_name) ?? null;
    output.carrier = optionalString(record.carrier) ?? null;
    output.caller_type = optionalString(record.caller_type) ?? null;
  }
  return output;
}

function readErrorText(value: unknown): string | null {
  const text = optionalString(value);
  if (text) return text;
  const record = optionalRecord(value);
  return record && Object.keys(record).length === 0 ? null : null;
}

function extractRealPhoneValidationMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload);
  return readErrorText(record?.error_text) ?? optionalString(record?.status);
}
