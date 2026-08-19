import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "crypto_apis";
const cryptoApisApiBaseUrl = "https://rest.cryptoapis.io";
const cryptoApisApiVersion = "2024-12-12";

type CryptoApisPhase = "validate" | "execute";

export const cryptoApisActionHandlers: ProviderActionHandlers<
  "crypto_apis",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_supported_assets(input, context) {
    return listSupportedAssets(input, context, "execute");
  },
  get_exchange_rate_by_symbols(input, context) {
    const fromAssetSymbol = requiredString(input.fromAssetSymbol, "fromAssetSymbol");
    const toAssetSymbol = requiredString(input.toAssetSymbol, "toAssetSymbol");
    return getItemResponse(
      `/market-data/exchange-rates/by-symbol/${encodePathSegment(fromAssetSymbol)}/${encodePathSegment(toAssetSymbol)}`,
      input,
      context,
      normalizeExchangeRate,
    );
  },
  get_exchange_rate_by_asset_ids(input, context) {
    const fromAssetId = requiredString(input.fromAssetId, "fromAssetId");
    const toAssetId = requiredString(input.toAssetId, "toAssetId");
    return getItemResponse(
      `/market-data/exchange-rates/by-id/${encodePathSegment(fromAssetId)}/${encodePathSegment(toAssetId)}`,
      input,
      context,
      normalizeExchangeRate,
    );
  },
  get_asset_details_by_symbol(input, context) {
    const assetSymbol = requiredString(input.assetSymbol, "assetSymbol");
    return getItemResponse(
      `/market-data/assets/by-symbol/${encodePathSegment(assetSymbol)}`,
      input,
      context,
      normalizeAssetDetails,
    );
  },
  get_asset_details_by_id(input, context) {
    const assetId = requiredString(input.assetId, "assetId");
    return getItemResponse(
      `/market-data/assets/by-id/${encodePathSegment(assetId)}`,
      input,
      context,
      normalizeAssetDetails,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cryptoApisActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cryptoApisApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    headers.set("x-api-version", cryptoApisApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    await listSupportedAssets({ limit: 1, type: "crypto" }, { apiKey: input.apiKey, fetcher, signal }, "validate");
    return {
      profile: {
        displayName: "Crypto APIs API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: cryptoApisApiBaseUrl,
        validationEndpoint: "/market-data/metadata/assets",
      },
    };
  },
};

async function listSupportedAssets(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: CryptoApisPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestCryptoApis(
    "/market-data/metadata/assets",
    queryParams({
      context: optionalString(input.context),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      type: optionalString(input.type),
    }),
    context,
    phase,
  );
  const data = requireResponseRecord(payload.data, "data");
  const items = requireResponseArray(data.items, "data.items");
  return {
    ...readResponseMetadata(payload),
    limit: requireResponseInteger(data.limit, "data.limit"),
    offset: requireResponseInteger(data.offset, "data.offset"),
    total: requireResponseInteger(data.total, "data.total"),
    items: items.map((item, index) => normalizeSupportedAsset(item, `data.items[${index}]`)),
  };
}

async function getItemResponse(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  normalizeItem: (value: unknown, fieldName: string) => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = await requestCryptoApis(
    path,
    queryParams({
      context: optionalString(input.context),
      calculationTimestamp: optionalInteger(input.calculationTimestamp),
    }),
    context,
    "execute",
  );
  const data = requireResponseRecord(payload.data, "data");
  return {
    ...readResponseMetadata(payload),
    item: normalizeItem(data.item, "data.item"),
  };
}

async function requestCryptoApis(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: CryptoApisPhase,
): Promise<Record<string, unknown>> {
  const url = new URL(path.replace(/^\/+/, ""), `${cryptoApisApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        "x-api-version": cryptoApisApiVersion,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Crypto APIs request failed: ${error.message}` : "Crypto APIs request failed",
    );
  }

  const payload = await readCryptoApisPayload(response);
  if (!response.ok || payload.error !== undefined) {
    throw createCryptoApisError(phase, response.status, payload);
  }
  return payload;
}

async function readCryptoApisPayload(response: Response): Promise<Record<string, unknown>> {
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Crypto APIs returned invalid JSON",
  });
  if (payload === null) {
    throw new ProviderRequestError(502, "Crypto APIs returned an empty response");
  }
  return requireResponseRecord(payload, "payload");
}

function createCryptoApisError(
  phase: CryptoApisPhase,
  status: number,
  payload: Record<string, unknown>,
): ProviderRequestError {
  const error = optionalRecord(payload.error);
  const code = optionalString(error?.code);
  const message =
    optionalString(error?.message) ??
    optionalString(error?.details) ??
    code ??
    `Crypto APIs request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || code === "missing_api_key" || code === "invalid_api_key") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status >= 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, { upstreamStatus: status, payload });
}

function readResponseMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    apiVersion: requireResponseString(payload.apiVersion, "apiVersion"),
    requestId: requireResponseString(payload.requestId, "requestId"),
    context: optionalString(payload.context),
  });
}

function normalizeSupportedAsset(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requireResponseRecord(value, fieldName);
  return compactObject({
    ...record,
    latestRate: normalizeLatestRate(record.latestRate, `${fieldName}.latestRate`),
    logo: normalizeLogo(record.logo, `${fieldName}.logo`),
    name: requireResponseString(record.name, `${fieldName}.name`),
    originalSymbol: requireResponseString(record.originalSymbol, `${fieldName}.originalSymbol`),
    referenceId: requireResponseString(record.referenceId, `${fieldName}.referenceId`),
    slug: optionalString(record.slug),
    specificData: requireResponseRecord(record.specificData, `${fieldName}.specificData`),
    symbol: requireResponseString(record.symbol, `${fieldName}.symbol`),
    type: requireResponseString(record.type, `${fieldName}.type`),
  });
}

function normalizeAssetDetails(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requireResponseRecord(value, fieldName);
  return compactObject({
    ...record,
    latestRate:
      record.latestRate === undefined ? undefined : normalizeLatestRate(record.latestRate, `${fieldName}.latestRate`),
    logo: record.logo === undefined ? undefined : normalizeLogo(record.logo, `${fieldName}.logo`),
    name: requireResponseString(record.name, `${fieldName}.name`),
    originalSymbol: requireResponseString(record.originalSymbol, `${fieldName}.originalSymbol`),
    referenceId: requireResponseString(record.referenceId, `${fieldName}.referenceId`),
    slug: optionalString(record.slug),
    specificData:
      record.specificData === undefined
        ? undefined
        : requireResponseRecord(record.specificData, `${fieldName}.specificData`),
    symbol: requireResponseString(record.symbol, `${fieldName}.symbol`),
    type: requireResponseString(record.type, `${fieldName}.type`),
  });
}

function normalizeLatestRate(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requireResponseRecord(value, fieldName);
  return compactObject({
    ...record,
    amount: requireResponseString(record.amount, `${fieldName}.amount`),
    calculationTimestamp:
      record.calculationTimestamp === undefined
        ? undefined
        : requireResponseInteger(record.calculationTimestamp, `${fieldName}.calculationTimestamp`),
    unit: requireResponseString(record.unit, `${fieldName}.unit`),
  });
}

function normalizeLogo(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requireResponseRecord(value, fieldName);
  return {
    ...record,
    encoding: requireResponseString(record.encoding, `${fieldName}.encoding`),
    imageData: requireResponseString(record.imageData, `${fieldName}.imageData`),
    mimeType: requireResponseString(record.mimeType, `${fieldName}.mimeType`),
  };
}

function normalizeExchangeRate(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requireResponseRecord(value, fieldName);
  return {
    calculationTimestamp: requireResponseInteger(record.calculationTimestamp, `${fieldName}.calculationTimestamp`),
    fromAssetId: requireResponseString(record.fromAssetId, `${fieldName}.fromAssetId`),
    fromAssetSymbol: requireResponseString(record.fromAssetSymbol, `${fieldName}.fromAssetSymbol`),
    rate: requireResponseString(record.rate, `${fieldName}.rate`),
    toAssetId: requireResponseString(record.toAssetId, `${fieldName}.toAssetId`),
    toAssetSymbol: requireResponseString(record.toAssetSymbol, `${fieldName}.toAssetSymbol`),
  };
}

function requireResponseRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Crypto APIs returned invalid ${fieldName}`),
  );
}

function requireResponseArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Crypto APIs returned invalid ${fieldName}`);
  }
  return value;
}

function requireResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Crypto APIs returned invalid ${fieldName}`),
  );
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Crypto APIs returned invalid ${fieldName}`);
  }
  return value;
}
