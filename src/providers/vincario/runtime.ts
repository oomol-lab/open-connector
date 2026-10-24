import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const vincarioApiBaseUrl = "https://api.vincario.com/3.2";
export interface VincarioContext {
  apiKey: string;
  secretKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
interface Definition {
  id: string;
  path: string;
  vin?: string;
  query?: Record<string, string | number | undefined>;
}
type Handler = (input: Record<string, unknown>, context: VincarioContext) => Promise<unknown>;

export const handlers: ProviderActionHandlers<"vincario", Handler> = {
  get_balance(_input, context) {
    return request({ id: "balance", path: "balance.json" }, context, "execute");
  },
  get_vin_decode_info(input, context) {
    const vin = vinFrom(input);
    return request({ id: "info", path: `decode/info/${encodeURIComponent(vin)}.json`, vin }, context, "execute");
  },
  decode_vin(input, context) {
    const vin = vinFrom(input);
    return request({ id: "decode", path: `decode/${encodeURIComponent(vin)}.json`, vin }, context, "execute");
  },
  check_stolen(input, context) {
    const vin = vinFrom(input);
    return request(
      { id: "stolen-check", path: `stolen-check/${encodeURIComponent(vin)}.json`, vin },
      context,
      "execute",
    );
  },
  get_vehicle_market_value(input, context) {
    const vin = vinFrom(input);
    return request(
      {
        id: "vehicle-market-value",
        path: `vehicle-market-value/${encodeURIComponent(vin)}.json`,
        vin,
        query: {
          odometer: typeof input.odometer == "number" ? input.odometer : undefined,
          odometer_unit: optionalString(input.odometerUnit),
        },
      },
      context,
      "execute",
    );
  },
};

export async function validateCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = readContext(values, fetcher, signal);
  const balance = await request({ id: "balance", path: "balance.json" }, context, "validate");
  return {
    profile: { displayName: "Vincario API Credential" },
    grantedScopes: [],
    metadata: { apiBaseUrl: vincarioApiBaseUrl, balance },
  };
}
export function readContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): VincarioContext {
  return {
    apiKey: requiredInputString(values.apiKey, "apiKey"),
    secretKey: requiredInputString(values.secretKey, "secretKey"),
    fetcher,
    signal,
  };
}
function vinFrom(input: Record<string, unknown>): string {
  return requiredInputString(optionalString(input.vin)?.trim().toUpperCase(), "vin");
}

async function request(definition: Definition, context: VincarioContext, phase: "validate" | "execute") {
  return runProviderRequest({ label: "Vincario", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(buildUrl(definition, context.apiKey, context.secretKey), {
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal,
    });
    const text = await response.text();
    if (!response.ok) throw requestError(response.status, errorPayload(text), phase);
    const object = requiredResponseRecord(payload(text), "Vincario response");
    if (object.error === true) throw requestError(response.status, object, phase);
    return object;
  });
}
function buildUrl(definition: Definition, apiKey: string, secretKey: string): URL {
  const signed = definition.vin
    ? `${definition.vin}|${definition.id}|${apiKey}|${secretKey}`
    : `${definition.id}|${apiKey}|${secretKey}`;
  const checksum = createHash("sha1").update(signed).digest("hex").slice(0, 10);
  const url = new URL(`${encodeURIComponent(apiKey)}/${checksum}/${definition.path}`, `${vincarioApiBaseUrl}/`);
  for (const [key, value] of Object.entries(definition.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  return url;
}
function payload(text: string): unknown {
  if (!text.trim()) throw providerResponseError("Vincario returned an empty response");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerResponseError("Vincario returned invalid JSON");
  }
}
function errorPayload(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.trim();
  }
}
function requestError(status: number, value: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(value);
  const message =
    optionalString(record?.message) ?? optionalString(value) ?? `Vincario request failed with status ${status}`;
  const normalized = message.toLowerCase();
  if (normalized == "unknown api key" || normalized == "invalid control sum")
    return phase == "validate" ? providerInputError(message) : new ProviderRequestError(401, message);
  if (normalized == "not recognized" || normalized == "invalid") return providerInputError(message);
  if (normalized == "not enough lookups")
    return new ProviderRequestError(402, message, undefined, "insufficient_credit");
  if (normalized.includes("limit of") && normalized.includes("requests per minute"))
    return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}
