import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const uniswapApiBaseUrl = "https://trade-api.gateway.uniswap.org/v1";
export const uniswapApiDefaultRequestTimeoutMs = 15_000;

const validationPayload = {
  type: "EXACT_INPUT",
  amount: "1000000",
  tokenInChainId: 1,
  tokenOutChainId: 1,
  tokenIn: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  tokenOut: "0x0000000000000000000000000000000000000000",
  swapper: "0x000000000000000000000000000000000000dead",
};

type UniswapActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface UniswapRequestInput {
  path: string;
  method: "POST";
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}

export const uniswapApiActionHandlers: ProviderActionHandlers<"uniswap_api", UniswapActionHandler> = {
  get_quote(input, context) {
    return executeGetQuote(input, context);
  },
  check_approval(input, context) {
    return executeCheckApproval(input, context);
  },
  create_swap(input, context) {
    return executeCreateSwap(input, context);
  },
};

export async function validateUniswapApiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await uniswapApiRequest(
    {
      path: "/quote",
      method: "POST",
      body: validationPayload,
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: "uniswap_api:api-key",
      displayName: "Uniswap API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: uniswapApiBaseUrl,
      validationEndpoint: "/quote",
      validationRequestId: readRequiredString(payload.requestId, "requestId"),
    }),
  };
}

async function executeGetQuote(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await uniswapApiRequest(
    {
      path: "/quote",
      method: "POST",
      headers: quoteHeaders(input),
      body: compactObject({
        type: readRequiredString(input.type, "type"),
        amount: readRequiredString(input.amount, "amount"),
        tokenInChainId: readRequiredNumber(input.tokenInChainId, "tokenInChainId"),
        tokenOutChainId: readRequiredNumber(input.tokenOutChainId, "tokenOutChainId"),
        tokenIn: readRequiredString(input.tokenIn, "tokenIn"),
        tokenOut: readRequiredString(input.tokenOut, "tokenOut"),
        swapper: readRequiredString(input.swapper, "swapper"),
        recipient: optionalString(input.recipient),
        slippageTolerance: optionalNumber(input.slippageTolerance),
        autoSlippage: optionalString(input.autoSlippage),
        routingPreference: optionalString(input.routingPreference),
        protocols: readOptionalProtocolList(input.protocols),
        urgency: input.urgency,
        permitAmount: optionalString(input.permitAmount),
        spreadOptimization: optionalString(input.spreadOptimization),
        generatePermitAsTransaction: optionalBoolean(input.generatePermitAsTransaction),
      }),
    },
    context,
  );

  const quote = readRequiredObject(payload.quote, "quote");
  const output = readRequiredObject(quote.output, "quote.output");
  const quoteInput = readRequiredObject(quote.input, "quote.input");

  return {
    requestId: readRequiredString(payload.requestId, "requestId"),
    routing: optionalString(payload.routing),
    quoteId: readRequiredString(quote.quoteId, "quote.quoteId"),
    chainId: readRequiredNumber(quote.chainId, "quote.chainId"),
    swapper: readRequiredString(quote.swapper, "quote.swapper"),
    tradeType: readRequiredString(quote.tradeType, "quote.tradeType"),
    inputToken: readRequiredString(quoteInput.token, "quote.input.token"),
    inputAmount: readRequiredString(quoteInput.amount, "quote.input.amount"),
    outputToken: readRequiredString(output.token, "quote.output.token"),
    outputAmount: readRequiredString(output.amount, "quote.output.amount"),
    recipient: nullableString(output.recipient),
    slippage: nullableNumber(quote.slippage),
    gasFee: nullableString(quote.gasFee),
    gasFeeUsd: nullableString(quote.gasFeeUSD),
    gasUseEstimate: nullableString(quote.gasUseEstimate),
    txFailureReasons: stringArray(quote.txFailureReasons),
    permitData: nullableObject(payload.permitData),
    route: readRoute(Array.isArray(quote.route) ? quote.route : []),
    rawQuote: quote,
  };
}

async function executeCheckApproval(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await uniswapApiRequest(
    {
      path: "/check_approval",
      method: "POST",
      headers: permit2Header(input),
      body: compactObject({
        walletAddress: readRequiredString(input.walletAddress, "walletAddress"),
        token: readRequiredString(input.token, "token"),
        amount: readRequiredString(input.amount, "amount"),
        chainId: readRequiredNumber(input.chainId, "chainId"),
        urgency: input.urgency,
        includeGasInfo: optionalBoolean(input.includeGasInfo),
        tokenOut: optionalString(input.tokenOut),
        tokenOutChainId: optionalNumber(input.tokenOutChainId),
      }),
    },
    context,
  );

  return {
    requestId: readRequiredString(payload.requestId, "requestId"),
    approval: normalizeTransactionRequest(payload.approval, "approval"),
    cancel: normalizeTransactionRequest(payload.cancel, "cancel"),
    gasFee: nullableString(payload.gasFee),
    cancelGasFee: nullableString(payload.cancelGasFee),
  };
}

async function executeCreateSwap(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await uniswapApiRequest(
    {
      path: "/swap",
      method: "POST",
      headers: {
        ...permit2Header(input),
        ...universalRouterHeader(input),
      },
      body: compactObject({
        quote: readRequiredObject(input.quote, "quote"),
        signature: optionalString(input.signature),
        permitData: optionalRecord(input.permitData),
        refreshGasPrice: optionalBoolean(input.refreshGasPrice),
        simulateTransaction: optionalBoolean(input.simulateTransaction),
        safetyMode: optionalString(input.safetyMode),
        deadline: optionalString(input.deadline),
        urgency: input.urgency,
      }),
    },
    context,
  );

  return {
    requestId: readRequiredString(payload.requestId, "requestId"),
    swap: normalizeRequiredTransactionRequest(payload.swap, "swap"),
    gasFee: nullableString(payload.gasFee),
  };
}

async function uniswapApiRequest(
  input: UniswapRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, uniswapApiDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildUniswapApiUrl(input.path), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        ...input.headers,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw createUniswapApiError(response.status, payload);
    }

    return readRequiredObject(payload, "payload");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "uniswap_api request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `uniswap_api request failed: ${error.message}` : "uniswap_api request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildUniswapApiUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(`${uniswapApiBaseUrl}/${normalizedPath}`);
}

function createUniswapApiError(status: number, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `uniswap_api request failed with ${status || 500}`;
  if (status === 400 || status === 401 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function quoteHeaders(input: Record<string, unknown>): Record<string, string> {
  return {
    ...universalRouterHeader(input),
    ...permit2Header(input),
  };
}

function universalRouterHeader(input: Record<string, unknown>): Record<string, string> {
  return optionalBoolean(input.enableUniversalRouter) ? { "x-universal-router-version": "2.0" } : {};
}

function permit2Header(input: Record<string, unknown>): Record<string, string> {
  return optionalBoolean(input.enablePermit2) === false ? { "x-permit2-disabled": "true" } : {};
}

function normalizeRequiredTransactionRequest(value: unknown, fieldName: string): Record<string, unknown> {
  const transaction = normalizeTransactionRequest(value, fieldName);
  if (!transaction) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return transaction;
}

function normalizeTransactionRequest(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  const record = readRequiredObject(value, fieldName);
  return {
    to: readRequiredString(record.to, `${fieldName}.to`),
    from: readRequiredString(record.from, `${fieldName}.from`),
    data: readRequiredString(record.data, `${fieldName}.data`),
    value: readRequiredString(record.value, `${fieldName}.value`),
    chainId: readRequiredNumber(record.chainId, `${fieldName}.chainId`),
    gasLimit: nullableString(record.gasLimit),
    maxFeePerGas: nullableString(record.maxFeePerGas),
    maxPriorityFeePerGas: nullableString(record.maxPriorityFeePerGas),
    gasPrice: nullableString(record.gasPrice),
  };
}

function readOptionalProtocolList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item, index) => readRequiredString(item, `protocols[${index}]`));
}

function readRoute(value: unknown[]): Array<Array<Record<string, unknown>>> {
  return value.map((group, groupIndex) => {
    if (!Array.isArray(group)) {
      throw new ProviderRequestError(502, `route[${groupIndex}] must be an array`, group);
    }
    return group.map((segment, segmentIndex) => readRequiredObject(segment, `route[${groupIndex}][${segmentIndex}]`));
  });
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return typeof payload === "string" && payload.trim() ? payload : undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["detail", "message", "error", "title"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return record;
}

function nullableObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readRequiredObject(value, "object");
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} must be a string`, value);
  }
  return text;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readRequiredString(value, "string");
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be a number`, value);
  }
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readRequiredNumber(value, "number");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => readRequiredString(item, `array[${index}]`));
}
