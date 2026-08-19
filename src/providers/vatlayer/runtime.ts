import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const vatlayerApiBaseUrl = "https://apilayer.net/api";

type VatlayerQueryValue = boolean | number | string | undefined;
type VatlayerActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const vatlayerActionHandlers: ProviderActionHandlers<"vatlayer", VatlayerActionHandler> = {
  validate_vat_number(input, context) {
    return vatlayerRequest(
      {
        path: "/validate",
        query: { vat_number: readRequiredTrimmedString(input.vatNumber, "vatNumber") },
      },
      context,
    );
  },
  get_rate(input, context) {
    return vatlayerRequest({ path: "/rate", query: buildCountrySelectorQuery(input) }, context);
  },
  list_rates(_input, context) {
    return vatlayerRequest({ path: "/rate_list" }, context);
  },
  calculate_price(input, context) {
    return vatlayerRequest(
      {
        path: "/price",
        query: {
          amount: readRequiredNumber(input.amount, "amount"),
          type: readOptionalTrimmedString(input.type),
          incl: readOptionalFlag(input.incl),
          ...buildCountrySelectorQuery(input),
        },
      },
      context,
    );
  },
  list_types(_input, context) {
    return vatlayerRequest({ path: "/types" }, context);
  },
};

export async function validateVatlayerCredential(
  apiKey: string,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  await vatlayerRequest({ path: "/types" }, { apiKey, fetcher });
  return {
    profile: {
      accountId: "vatlayer-api-key",
      displayName: "VATlayer API Access Key",
      grantedScopes: [],
    },
    metadata: {
      validationEndpoint: "/types",
      apiBaseUrl: vatlayerApiBaseUrl,
    },
  };
}

async function vatlayerRequest(
  input: { path: string; query?: Record<string, VatlayerQueryValue> },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const response = await vatlayerRawRequest(input, context);
  const payload = await readVatlayerPayload(response);
  const providerError = readVatlayerError(payload);
  if (providerError) {
    throw mapVatlayerError(providerError);
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 500,
      `vatlayer request failed with HTTP ${response.status}`,
    );
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "vatlayer returned an invalid JSON response");
  }
  return record;
}

async function vatlayerRawRequest(
  input: { path: string; query?: Record<string, VatlayerQueryValue> },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Response> {
  const url = new URL(resolveVatlayerPath(input.path), `${vatlayerApiBaseUrl}/`);
  url.searchParams.set("access_key", context.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  try {
    return await context.fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `vatlayer request failed: ${error.message}` : "vatlayer request failed",
    );
  }
}

async function readVatlayerPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `vatlayer returned invalid JSON: ${error.message}` : "vatlayer returned invalid JSON",
    );
  }
}

function readVatlayerError(payload: unknown): { code?: number; type?: string; info: string } | undefined {
  const record = optionalRecord(payload);
  if (!record || record.success !== false) return undefined;
  const error = optionalRecord(record.error);
  return {
    code: typeof error?.code === "number" ? error.code : undefined,
    type: optionalString(error?.type),
    info: optionalString(error?.info) ?? "vatlayer request failed",
  };
}

function mapVatlayerError(error: { code?: number; type?: string; info: string }): ProviderRequestError {
  if (error.code === 104 || error.type === "usage_limit_reached") return new ProviderRequestError(429, error.info);
  if (error.code === 101 || error.type === "missing_access_key" || error.type === "invalid_access_key") {
    return new ProviderRequestError(400, error.info);
  }
  if (error.code === 500 || error.type === "internal_server_error") return new ProviderRequestError(502, error.info);
  return new ProviderRequestError(400, error.info);
}

function buildCountrySelectorQuery(input: Record<string, unknown>): Record<string, VatlayerQueryValue> {
  const countryCode = readOptionalTrimmedString(input.countryCode);
  const ipAddress = readOptionalTrimmedString(input.ipAddress);
  const useClientIp = optionalBoolean(input.useClientIp);
  const selected = [countryCode, ipAddress, useClientIp === true ? "useClientIp" : undefined].filter(
    (value) => value !== undefined,
  );
  if (selected.length !== 1) {
    throw new ProviderRequestError(400, "exactly one of countryCode, ipAddress, or useClientIp must be provided");
  }
  return compactObject({
    country_code: countryCode?.toUpperCase(),
    ip_address: ipAddress,
    use_client_ip: useClientIp === true ? 1 : undefined,
  });
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const result = readOptionalTrimmedString(value);
  if (!result) throw new ProviderRequestError(400, `${fieldName} is required`);
  return result;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a finite number`);
  }
  return value;
}

function readOptionalFlag(value: unknown): number | undefined {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) return undefined;
  return parsed ? 1 : 0;
}

function resolveVatlayerPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
