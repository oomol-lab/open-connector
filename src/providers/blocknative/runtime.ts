import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const blocknativeApiBaseUrl = "https://api.blocknative.com";

type BlocknativeRequestPhase = "validate" | "execute";
type BlocknativeQueryValue = number | string | readonly number[] | readonly string[] | undefined;
type BlocknativeActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const blocknativeActionHandlers: ProviderActionHandlers<"blocknative", BlocknativeActionHandler> = {
  list_supported_chains(_input, context) {
    return listSupportedChains(context);
  },
  list_gas_oracles(_input, context) {
    return listGasOracles(context);
  },
  get_gas_prices(input, context) {
    return getGasPrices(input, context);
  },
  get_gas_price_distribution(input, context) {
    return getGasPriceDistribution(input, context);
  },
};

export async function validateBlocknativeCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await blocknativeGet("/chains", {}, { apiKey, fetcher, signal }, "validate");
  const chains = normalizeSupportedChains(payload);

  return {
    profile: {
      accountId: "blocknative",
      displayName: "Blocknative API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: blocknativeApiBaseUrl,
      validationEndpoint: "/chains",
      chainsCount: chains.length,
      firstSupportedChain: chains[0]?.label,
    }),
  };
}

async function listSupportedChains(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await blocknativeGet("/chains", {}, context, "execute");
  return {
    chains: normalizeSupportedChains(payload),
  };
}

async function listGasOracles(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await blocknativeGet("/oracles", {}, context, "execute");
  return {
    oracles: normalizeGasOracles(payload),
  };
}

async function getGasPrices(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await blocknativeGet("/gasprices/blockprices", buildGasPricesQuery(input), context, "execute");
  return normalizeGasPrices(readRequiredObject(payload, "payload"));
}

async function getGasPriceDistribution(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const chainId = readOptionalInteger(input.chainId);
  if (chainId !== undefined && chainId !== 1) {
    throw new ProviderRequestError(400, "chainId must be 1");
  }

  const payload = await blocknativeGet(
    "/gasprices/distribution",
    compactObject({
      chainid: chainId,
    }),
    context,
    "execute",
  );

  return normalizeGasPriceDistribution(readRequiredObject(payload, "payload"));
}

async function blocknativeGet(
  path: string,
  query: Record<string, BlocknativeQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: BlocknativeRequestPhase,
): Promise<unknown> {
  const response = await blocknativeFetch(path, query, context);
  if (!response.ok) {
    const payload = await readBlocknativeErrorPayload(response);
    throw buildBlocknativeError(response.status, payload, phase);
  }

  return readBlocknativePayload(response);
}

async function blocknativeFetch(
  path: string,
  query: Record<string, BlocknativeQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${blocknativeApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(url, key, value);
  }

  try {
    return await context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isBlocknativeAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Blocknative request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Blocknative request failed: ${error.message}` : "Blocknative request failed",
      error,
    );
  }
}

function appendQueryValue(url: URL, key: string, value: BlocknativeQueryValue): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, String(item));
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

async function readBlocknativePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    throw new ProviderRequestError(502, "Blocknative returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Blocknative returned invalid JSON", text);
  }
}

async function readBlocknativeErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildBlocknativeError(
  httpStatus: number,
  payload: unknown,
  phase: BlocknativeRequestPhase,
): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    readOptionalText(payload) ??
    readOptionalText(body?.msg) ??
    readOptionalText(body?.message) ??
    `Blocknative request failed with ${httpStatus || 500}`;

  if (httpStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (httpStatus === 400 || httpStatus === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(httpStatus >= 400 ? httpStatus : 502, message, payload);
}

function normalizeSupportedChains(payload: unknown): Array<Record<string, unknown>> {
  return readRequiredArray(payload, "payload").map((item, index) => {
    const chain = readRequiredObject(item, `payload[${index}]`);
    return {
      arch: readRequiredString(chain.arch, `payload[${index}].arch`),
      chainId: readRequiredInteger(chain.chainId, `payload[${index}].chainId`),
      label: readRequiredString(chain.label, `payload[${index}].label`),
      features: readRequiredStringArray(chain.features, `payload[${index}].features`),
      icon: readOptionalText(chain.icon),
      system: readRequiredString(chain.system, `payload[${index}].system`),
      network: readRequiredString(chain.network, `payload[${index}].network`),
    };
  });
}

function normalizeGasOracles(payload: unknown): Array<Record<string, unknown>> {
  return readRequiredArray(payload, "payload").map((item, index) => {
    const oracle = readRequiredObject(item, `payload[${index}]`);
    return {
      arch: readRequiredString(oracle.arch, `payload[${index}].arch`),
      chainId: readRequiredInteger(oracle.chainId, `payload[${index}].chainId`),
      label: readRequiredString(oracle.label, `payload[${index}].label`),
      name: readRequiredString(oracle.name, `payload[${index}].name`),
      network: readRequiredString(oracle.network, `payload[${index}].network`),
      system: readOptionalText(oracle.system),
      addressByVersion: readStringRecord(oracle.addressByVersion, `payload[${index}].addressByVersion`),
      rpcUrl: readRequiredString(oracle.rpcUrl, `payload[${index}].rpcUrl`),
      blockExplorerUrl: readRequiredString(oracle.blockExplorerUrl, `payload[${index}].blockExplorerUrl`),
      icon: readOptionalText(oracle.icon),
      testnet: readRequiredBoolean(oracle.testnet, `payload[${index}].testnet`),
    };
  });
}

function normalizeGasPrices(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    system: readRequiredString(payload.system, "payload.system"),
    network: readRequiredString(payload.network, "payload.network"),
    unit: readRequiredString(payload.unit, "payload.unit"),
    maxPrice: readRequiredNumber(payload.maxPrice, "payload.maxPrice"),
    currentBlockNumber: readRequiredInteger(payload.currentBlockNumber, "payload.currentBlockNumber"),
    msSinceLastBlock: readRequiredInteger(payload.msSinceLastBlock, "payload.msSinceLastBlock"),
    blockPrices: readRequiredArray(payload.blockPrices, "payload.blockPrices").map((item, index) =>
      normalizeBlockPrice(item, `payload.blockPrices[${index}]`),
    ),
  };
}

function normalizeBlockPrice(value: unknown, path: string): Record<string, unknown> {
  const blockPrice = readRequiredObject(value, path);
  return {
    blockNumber: readRequiredInteger(blockPrice.blockNumber, `${path}.blockNumber`),
    estimatedTransactionCount: readRequiredInteger(
      blockPrice.estimatedTransactionCount,
      `${path}.estimatedTransactionCount`,
    ),
    baseFeePerGas: readRequiredNumber(blockPrice.baseFeePerGas, `${path}.baseFeePerGas`),
    blobBaseFeePerGas: readOptionalNumber(blockPrice.blobBaseFeePerGas),
    estimatedPrices: readRequiredArray(blockPrice.estimatedPrices, `${path}.estimatedPrices`).map((item, index) =>
      normalizeEstimatedPrice(item, `${path}.estimatedPrices[${index}]`),
    ),
  };
}

function normalizeEstimatedPrice(value: unknown, path: string): Record<string, unknown> {
  const estimatedPrice = readRequiredObject(value, path);
  return {
    confidence: readRequiredInteger(estimatedPrice.confidence, `${path}.confidence`),
    price: readRequiredNumber(estimatedPrice.price, `${path}.price`),
    maxPriorityFeePerGas: readOptionalNumber(estimatedPrice.maxPriorityFeePerGas),
    maxFeePerGas: readOptionalNumber(estimatedPrice.maxFeePerGas),
  };
}

function normalizeGasPriceDistribution(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    system: readRequiredString(payload.system, "payload.system"),
    network: readRequiredString(payload.network, "payload.network"),
    unit: readRequiredString(payload.unit, "payload.unit"),
    maxPrice: readRequiredNumber(payload.maxPrice, "payload.maxPrice"),
    currentBlockNumber: readRequiredInteger(payload.currentBlockNumber, "payload.currentBlockNumber"),
    msSinceLastBlock: readRequiredInteger(payload.msSinceLastBlock, "payload.msSinceLastBlock"),
    topNDistribution: normalizeTopNDistribution(payload.topNDistribution, "payload.topNDistribution"),
  };
}

function normalizeTopNDistribution(value: unknown, path: string): Record<string, unknown> {
  const distribution = readRequiredObject(value, path);
  return {
    distribution: readRequiredDistributionPairs(distribution.distribution, `${path}.distribution`),
    n: readRequiredInteger(distribution.n, `${path}.n`),
  };
}

function readRequiredDistributionPairs(value: unknown, path: string): number[][] {
  return readRequiredArray(value, path).map((item, index) => {
    if (!Array.isArray(item) || item.length !== 2) {
      throw new ProviderRequestError(502, `Blocknative response is missing ${path}[${index}]`, item);
    }

    return [readRequiredNumber(item[0], `${path}[${index}][0]`), readRequiredInteger(item[1], `${path}[${index}][1]`)];
  });
}

function buildGasPricesQuery(input: Record<string, unknown>): Record<string, BlocknativeQueryValue> {
  const chainId = readOptionalInteger(input.chainId);
  const system = optionalString(input.system);
  const network = optionalString(input.network);

  if ((system === undefined) !== (network === undefined)) {
    throw new ProviderRequestError(400, "system and network must be provided together");
  }
  if (chainId !== undefined && (system !== undefined || network !== undefined)) {
    throw new ProviderRequestError(400, "chainId cannot be combined with system or network");
  }

  return compactObject({
    chainid: chainId,
    system,
    network,
    confidenceLevels: readOptionalIntegerArray(input.confidenceLevels),
  });
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Blocknative response is missing ${fieldName}`, value);
  }
  return record;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Blocknative response is missing ${fieldName}`, value);
  }
  return value;
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  return readRequiredArray(value, fieldName).map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
}

function readStringRecord(value: unknown, fieldName: string): Record<string, string> {
  const record = readRequiredObject(value, fieldName);
  return Object.fromEntries(
    Object.entries(record).map(([key, itemValue]) => [key, readRequiredString(itemValue, `${fieldName}.${key}`)]),
  );
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(502, `Blocknative response is missing ${fieldName}`, value);
  }
  return value;
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(502, `Blocknative response is missing ${fieldName}`, value);
  }
  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Blocknative response is missing ${fieldName}`, value);
  }
  return value;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Blocknative response is missing ${fieldName}`, value);
  }
  return value;
}

function readOptionalIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const numbers = value.filter((item): item is number => typeof item === "number");
  return numbers.length === value.length ? numbers : undefined;
}

function isBlocknativeAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
