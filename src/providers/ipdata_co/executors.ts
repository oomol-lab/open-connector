import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "ipdata_co";
const ipdataMainApiBaseUrl = "https://api.ipdata.co";
const ipdataEuApiBaseUrl = "https://eu-api.ipdata.co";
const ipdataLookupPath = "/v1/";
const ipdataBulkLookupPath = "/v1/bulk";
type IpdataRequestPhase = "validate" | "execute";
type IpdataScalarFieldName =
  | "ip"
  | "is_eu"
  | "city"
  | "region"
  | "region_code"
  | "country_name"
  | "country_code"
  | "continent_name"
  | "continent_code"
  | "latitude"
  | "longitude"
  | "postal"
  | "calling_code"
  | "flag"
  | "emoji_flag"
  | "emoji_unicode"
  | "count";
type IpdataActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IpdataActionHandler = (input: Record<string, unknown>, context: IpdataActionContext) => Promise<unknown>;

export const ipdataCoActionHandlers: ProviderActionHandlers<"ipdata_co", IpdataActionHandler> = {
  lookup_current_ip(_input, context) {
    return ipdataGetJson(ipdataMainApiBaseUrl, context);
  },
  lookup_ip(input, context) {
    return ipdataGetJson(ipdataMainApiBaseUrl, context, readRequiredString(input.ip, "ip"));
  },
  lookup_current_ip_eu(_input, context) {
    return ipdataGetJson(ipdataEuApiBaseUrl, context);
  },
  lookup_ip_eu(input, context) {
    return ipdataGetJson(ipdataEuApiBaseUrl, context, readRequiredString(input.ip, "ip"));
  },
  bulk_lookup(input, context) {
    return ipdataPostJson(context, readRequiredStringArray(input.ips, "ips"));
  },
  async lookup_basic_asn_by_ip(input, context) {
    const payload = await ipdataGetJson(ipdataMainApiBaseUrl, context, readRequiredString(input.ip, "ip"));
    const asn = optionalRecord(payload.asn);
    if (!asn) {
      throw new ProviderRequestError(502, "ipdata lookup did not include ASN data", payload);
    }
    return asn;
  },
  lookup_advanced_asn(input, context) {
    return ipdataGetJson(ipdataMainApiBaseUrl, context, `AS${readRequiredInteger(input.asn, "asn")}`);
  },
  get_company_by_ip(input, context) {
    return ipdataGetField(context, "company", optionalString(input.ip));
  },
  get_threat_by_ip(input, context) {
    return ipdataGetField(context, "threat", optionalString(input.ip));
  },
  get_carrier_by_ip(input, context) {
    return ipdataGetField(context, "carrier", optionalString(input.ip));
  },
  get_currency_by_ip(input, context) {
    return ipdataGetField(context, "currency", optionalString(input.ip));
  },
  get_time_zone_by_ip(input, context) {
    return ipdataGetField(context, "time_zone", optionalString(input.ip));
  },
  get_languages_by_ip(input, context) {
    return ipdataGetField(context, "languages", optionalString(input.ip));
  },
  get_ip: ipdataScalarHandler("ip"),
  get_is_eu: ipdataScalarHandler("is_eu"),
  get_city: ipdataScalarHandler("city"),
  get_region: ipdataScalarHandler("region"),
  get_region_code: ipdataScalarHandler("region_code"),
  get_country_name: ipdataScalarHandler("country_name"),
  get_country_code: ipdataScalarHandler("country_code"),
  get_continent_name: ipdataScalarHandler("continent_name"),
  get_continent_code: ipdataScalarHandler("continent_code"),
  get_latitude: ipdataScalarHandler("latitude"),
  get_longitude: ipdataScalarHandler("longitude"),
  get_postal: ipdataScalarHandler("postal"),
  get_calling_code: ipdataScalarHandler("calling_code"),
  get_flag: ipdataScalarHandler("flag"),
  get_emoji_flag: ipdataScalarHandler("emoji_flag"),
  get_emoji_unicode: ipdataScalarHandler("emoji_unicode"),
  get_count: ipdataScalarHandler("count"),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ipdataCoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await ipdataGetJson(
      ipdataMainApiBaseUrl,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      undefined,
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "ipdata API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: ipdataLookupPath,
        apiBaseUrl: ipdataMainApiBaseUrl,
        euApiBaseUrl: ipdataEuApiBaseUrl,
        count: optionalInteger(payload.count),
      }),
    };
  },
};

function ipdataScalarHandler(fieldName: IpdataScalarFieldName): IpdataActionHandler {
  return async (input, context) => {
    const payload = await ipdataGetField(context, fieldName, optionalString(input.ip));
    return normalizeScalarFieldResponse(fieldName, payload);
  };
}

async function ipdataGetJson(
  baseUrl: string,
  context: IpdataActionContext,
  ip?: string,
  phase: IpdataRequestPhase = "execute",
): Promise<Record<string, unknown>> {
  const payload = await requestIpdataJson(
    buildLookupUrl(baseUrl, context.apiKey, ip),
    {
      method: "GET",
      headers: ipdataHeaders(),
      signal: context.signal,
    },
    phase,
    context.fetcher,
  );
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "ipdata lookup did not return an object", payload);
  }
  return record;
}

async function ipdataPostJson(context: IpdataActionContext, ips: string[]): Promise<unknown[]> {
  const payload = await requestIpdataJson(
    buildBulkLookupUrl(context.apiKey),
    {
      method: "POST",
      headers: {
        ...ipdataHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify(ips),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "ipdata bulk lookup did not return an array", payload);
  }
  return payload;
}

async function ipdataGetField(
  context: IpdataActionContext,
  fieldName: IpdataScalarFieldName | string,
  ip?: string,
): Promise<unknown> {
  return requestIpdataJson(
    buildFieldLookupUrl(context.apiKey, fieldName, ip),
    {
      method: "GET",
      headers: ipdataHeaders(),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
}

async function requestIpdataJson(
  url: URL,
  init: RequestInit,
  phase: IpdataRequestPhase,
  fetcher: typeof fetch,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, init);
    payload = await readIpdataPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "ipdata request failed", error);
  }

  if (!response.ok) {
    throw createIpdataError(response, payload, phase);
  }
  return payload;
}

function buildLookupUrl(baseUrl: string, apiKey: string, ip?: string): URL {
  const lookupPath = ip ? `${ipdataLookupPath}${encodeURIComponent(ip)}/` : ipdataLookupPath;
  const url = new URL(lookupPath, baseUrl);
  url.searchParams.set("api-key", apiKey);
  return url;
}

function buildBulkLookupUrl(apiKey: string): URL {
  const url = new URL(ipdataBulkLookupPath, ipdataMainApiBaseUrl);
  url.searchParams.set("api-key", apiKey);
  return url;
}

function buildFieldLookupUrl(apiKey: string, fieldName: string, ip?: string): URL {
  const lookupPath = ip ? `/${encodeURIComponent(ip)}/${fieldName}` : `/${fieldName}`;
  const url = new URL(lookupPath, ipdataMainApiBaseUrl);
  url.searchParams.set("api-key", apiKey);
  return url;
}

function ipdataHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readIpdataPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createIpdataError(response: Response, payload: unknown, phase: IpdataRequestPhase): ProviderRequestError {
  const message = readIpdataErrorMessage(payload) ?? `ipdata request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 404) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 400, message, payload);
}

function readIpdataErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function normalizeScalarFieldResponse(
  fieldName: IpdataScalarFieldName,
  payload: unknown,
): Record<string, string | number | boolean> {
  const parser = ipdataScalarFieldParsers[fieldName];
  const value = parser(readScalarFieldValue(fieldName, payload));

  return {
    [fieldName]: value,
  };
}

function readScalarFieldValue(fieldName: IpdataScalarFieldName, payload: unknown): unknown {
  const record = optionalRecord(payload);
  if (record && fieldName in record) {
    return record[fieldName];
  }

  return payload;
}

const ipdataScalarFieldParsers: Record<IpdataScalarFieldName, (value: unknown) => string | number | boolean> = {
  ip: parseStringField,
  is_eu: parseBooleanField,
  city: parseStringField,
  region: parseStringField,
  region_code: parseStringField,
  country_name: parseStringField,
  country_code: parseStringField,
  continent_name: parseStringField,
  continent_code: parseStringField,
  latitude: parseNumberField,
  longitude: parseNumberField,
  postal: parseStringField,
  calling_code: parseStringField,
  flag: parseStringField,
  emoji_flag: parseStringField,
  emoji_unicode: parseStringField,
  count: parseNumberField,
};

function parseStringField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  throw new ProviderRequestError(502, "ipdata scalar field did not return a string value", value);
}

function parseBooleanField(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }

  throw new ProviderRequestError(502, "ipdata scalar field did not return a boolean value", value);
}

function parseNumberField(value: unknown): number {
  const numberValue = optionalNumber(value) ?? (typeof value === "string" ? Number(value) : undefined);
  if (typeof numberValue === "number" && Number.isFinite(numberValue)) {
    return numberValue;
  }

  throw new ProviderRequestError(502, "ipdata scalar field did not return a numeric value", value);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  const values = value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
  if (values.length === 0 || values.length > 100) {
    throw new ProviderRequestError(400, `${fieldName} must contain between 1 and 100 IP addresses`);
  }
  return values;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.ipdata.co",
  auth: { type: "api_key_query", name: "api-key" },
});
