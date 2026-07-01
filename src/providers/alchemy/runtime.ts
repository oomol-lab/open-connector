import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { AlchemyActionName } from "./actions.ts";

import { compactObject } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type AlchemyPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type AlchemyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const alchemyRpcBaseUrl = "https://eth-mainnet.g.alchemy.com/v2";
export const alchemyNftBaseUrl = "https://eth-mainnet.g.alchemy.com/nft/v3";

export const alchemyActionHandlers: Record<AlchemyActionName, AlchemyActionHandler> = {
  get_token_balances(input, context) {
    return executeGetTokenBalances(input, context);
  },
  get_token_metadata(input, context) {
    return executeGetTokenMetadata(input, context);
  },
  get_asset_transfers(input, context) {
    return executeGetAssetTransfers(input, context);
  },
  get_nfts_for_owner(input, context) {
    return executeGetNftsForOwner(input, context);
  },
  get_nft_metadata(input, context) {
    return executeGetNftMetadata(input, context);
  },
};

export async function validateAlchemyCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await alchemyRpcRequest(
    {
      method: "eth_gasPrice",
      params: [],
      phase: "validate",
    },
    apiKey,
    fetcher,
    signal,
  );

  const result = readRequiredString(payload.result, "result");
  return {
    profile: {
      displayName: "Alchemy API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: alchemyRpcBaseUrl,
      nftApiBaseUrl: alchemyNftBaseUrl,
      validationEndpoint: "/v2",
      validationMethod: "eth_gasPrice",
      latestGasPriceHex: result,
    },
  };
}

async function executeGetTokenBalances(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const tokenSpec = readTokenSpec(input.tokenSpec);
  const options = compactObject({
    pageKey: readOptionalTrimmedString(input.pageKey),
    maxCount: readOptionalInteger(input.maxCount),
  });
  const params: unknown[] = [readRequiredTrimmedString(input.address, "address")];

  if (tokenSpec !== undefined || Object.keys(options).length > 0) {
    params.push(tokenSpec ?? "erc20");
  }
  if (Object.keys(options).length > 0) {
    params.push(options);
  }

  const payload = await alchemyRpcRequest(
    {
      method: "alchemy_getTokenBalances",
      params,
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );
  const result = readRequiredObject(payload.result, "result");

  return {
    address: readRequiredString(result.address, "result.address"),
    pageKey: readNullableString(result.pageKey),
    tokenBalances: readRequiredArray(result.tokenBalances, "result.tokenBalances").map((entry, index) => {
      const item = readRequiredObject(entry, `result.tokenBalances.${index}`);
      return {
        contractAddress: readRequiredString(item.contractAddress, `result.tokenBalances.${index}.contractAddress`),
        tokenBalance: item.tokenBalance === undefined ? null : readNullableString(item.tokenBalance),
        error: item.error === undefined ? null : readNullableString(item.error),
      };
    }),
  };
}

async function executeGetTokenMetadata(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await alchemyRpcRequest(
    {
      method: "alchemy_getTokenMetadata",
      params: [readRequiredTrimmedString(input.contractAddress, "contractAddress")],
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );
  const result = readRequiredObject(payload.result, "result");

  return {
    name: readNullableString(result.name),
    symbol: readNullableString(result.symbol),
    decimals: readNullableNumber(result.decimals),
    logo: readNullableString(result.logo),
  };
}

async function executeGetAssetTransfers(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await alchemyRpcRequest(
    {
      method: "alchemy_getAssetTransfers",
      params: [
        compactObject({
          fromBlock: readOptionalTrimmedString(input.fromBlock),
          toBlock: readOptionalTrimmedString(input.toBlock),
          fromAddress: readOptionalTrimmedString(input.fromAddress),
          toAddress: readOptionalTrimmedString(input.toAddress),
          excludeZeroValue: readOptionalBoolean(input.excludeZeroValue),
          category: readOptionalStringArray(input.category),
          contractAddresses: readOptionalStringArray(input.contractAddresses),
          order: readOptionalTrimmedString(input.order),
          withMetadata: readOptionalBoolean(input.withMetadata),
          maxCount: readOptionalTrimmedString(input.maxCount),
          pageKey: readOptionalTrimmedString(input.pageKey),
        }),
      ],
      phase: "execute",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  if (typeof payload.result === "string") {
    return {
      message: payload.result,
      pageKey: null,
      transfers: [],
    };
  }

  const result = readRequiredObject(payload.result, "result");
  return {
    message: null,
    pageKey: readNullableString(result.pageKey),
    transfers: readRequiredArray(result.transfers, "result.transfers").map((entry, index) =>
      readRequiredObject(entry, `result.transfers.${index}`),
    ),
  };
}

async function executeGetNftsForOwner(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await alchemyNftRequest(
    "/getNFTsForOwner",
    {
      owner: readRequiredTrimmedString(input.owner, "owner"),
      withMetadata: readOptionalBoolean(input.withMetadata),
      orderBy: readOptionalTrimmedString(input.orderBy),
      tokenUriTimeoutInMs: readOptionalInteger(input.tokenUriTimeoutInMs),
      pageKey: readOptionalTrimmedString(input.pageKey),
      pageSize: readOptionalInteger(input.pageSize),
    },
    {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      arrayQuery: {
        "contractAddresses[]": readOptionalStringArray(input.contractAddresses),
      },
    },
  );

  const body = readRequiredObject(payload, "payload");
  return {
    ownedNfts: readRequiredArray(body.ownedNfts, "ownedNfts").map((entry, index) =>
      readRequiredObject(entry, `ownedNfts.${index}`),
    ),
    totalCount: readRequiredInteger(body.totalCount, "totalCount"),
    pageKey: readNullableString(body.pageKey),
    validAt: readNullableObject(body.validAt),
  };
}

async function executeGetNftMetadata(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await alchemyNftRequest(
    "/getNFTMetadata",
    compactObject({
      contractAddress: readRequiredTrimmedString(input.contractAddress, "contractAddress"),
      tokenId: readRequiredTrimmedString(input.tokenId, "tokenId"),
      tokenType: readOptionalTrimmedString(input.tokenType),
      tokenUriTimeoutInMs: readOptionalInteger(input.tokenUriTimeoutInMs),
    }),
    {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    },
  );

  return {
    nft: readRequiredObject(payload, "payload"),
  };
}

async function alchemyRpcRequest(
  input: {
    method: string;
    params: unknown[];
    phase: AlchemyPhase;
  },
  apiKey: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
): Promise<Record<string, unknown>> {
  const payload = await alchemyRequestJson(
    alchemyRpcBaseUrl,
    {
      method: "POST",
      headers: buildAlchemyHeaders(apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: input.method,
        params: input.params,
      }),
      signal,
    },
    input.phase,
    fetcher,
  );

  if ("error" in payload && payload.error != null) {
    throw createAlchemyRpcError(payload.error);
  }

  return payload;
}

async function alchemyNftRequest(
  path: string,
  query: Record<string, QueryValue>,
  input: {
    apiKey: string;
    fetcher: ProviderFetch;
    signal?: AbortSignal;
    phase: AlchemyPhase;
    arrayQuery?: Record<string, string[] | undefined>;
  },
): Promise<unknown> {
  const url = new URL(`${alchemyNftBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
  }

  for (const [key, values] of Object.entries(input.arrayQuery ?? {})) {
    for (const value of values ?? []) {
      url.searchParams.append(key, value);
    }
  }

  return alchemyRequestJson(
    url,
    {
      method: "GET",
      headers: buildAlchemyHeaders(input.apiKey, {
        accept: "application/json",
      }),
      signal: input.signal,
    },
    input.phase,
    input.fetcher,
  );
}

async function alchemyRequestJson(
  url: string | URL,
  init: RequestInit,
  phase: AlchemyPhase,
  fetcher: ProviderFetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await fetcher(url, init);
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `alchemy request failed: ${error.message}` : "alchemy request failed",
    );
  }

  if (!response.ok) {
    throw createAlchemyHttpError(response.status, payload, phase);
  }

  return readRequiredObject(payload, "payload");
}

function buildAlchemyHeaders(apiKey: string, extra: Record<string, string>): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extra,
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Alchemy returned invalid JSON");
  }
}

function createAlchemyHttpError(status: number, payload: unknown, phase: AlchemyPhase): ProviderRequestError {
  const message = extractAlchemyErrorMessage(payload) ?? `Alchemy request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }

  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function createAlchemyRpcError(value: unknown): ProviderRequestError {
  const error = readRequiredObject(value, "error");
  return new ProviderRequestError(400, readRequiredString(error.message, "error.message"));
}

function extractAlchemyErrorMessage(payload: unknown): string | undefined {
  const record = readOptionalObject(payload);
  return (
    readOptionalTrimmedString(record?.message) ??
    readOptionalTrimmedString(readOptionalObject(record?.error)?.message) ??
    readOptionalTrimmedString(record?.detail)
  );
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Alchemy response field ${fieldName} is invalid`);
  }
  return value as Record<string, unknown>;
}

function readOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readNullableObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalObject(value);
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Alchemy response field ${fieldName} is invalid`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Alchemy response field ${fieldName} is invalid`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Alchemy response field ${fieldName} is invalid`);
  }
  return value;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalTrimmedString(value);
}

function readNullableNumber(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  return typeof value === "number" ? value : null;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => readOptionalTrimmedString(entry))
    .filter((entry): entry is string => entry !== undefined);
}

function readTokenSpec(value: unknown): string | string[] | undefined {
  if (typeof value === "string") {
    return readRequiredTrimmedString(value, "tokenSpec");
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((entry) => readRequiredTrimmedString(entry, "tokenSpec")).filter((entry) => entry.length > 0);
}
