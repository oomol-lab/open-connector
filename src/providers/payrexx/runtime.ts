import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";
import type { PayrexxActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface PayrexxCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const payrexxApiBaseUrl = "https://api.payrexx.com/v1.16";

const requestTimeoutMs = 30_000;

type QueryValue = string | number | boolean | undefined;
type PayrexxPhase = "validate" | "execute";
type PayrexxHandler = (
  input: ApiKeyActionRequest & {
    actionName: PayrexxActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
) => Promise<unknown>;

interface PayrexxResponse {
  status?: unknown;
  data?: unknown;
  message?: unknown;
}

export const payrexxActionHandlers: ProviderActionHandlers<"payrexx", PayrexxHandler> = {
  async list_payment_providers(input, fetcher) {
    const payload = await requestPayrexxJson({
      path: "/PaymentProvider/",
      method: "GET",
      query: {},
      apiKey: input.apiKey,
      instance: readInstance(input.providerMetadata),
      fetcher,
      phase: "execute",
    });
    return { paymentProviders: readResourceList(payload, "payment provider") };
  },
  async list_transactions(input, fetcher) {
    const payload = await requestPayrexxJson({
      path: "/Transaction/",
      method: "GET",
      query: {},
      form: compactObject({
        filterDatetimeUtcGreaterThan: optionalString(input.input.filterDatetimeUtcGreaterThan),
        filterDatetimeUtcLessThan: optionalString(input.input.filterDatetimeUtcLessThan),
        filterMyTransactionsOnly: booleanAsInteger(input.input.filterMyTransactionsOnly),
        orderByTime: optionalString(input.input.orderByTime),
        offset: optionalInteger(input.input.offset),
        limit: optionalInteger(input.input.limit),
      }),
      apiKey: input.apiKey,
      instance: readInstance(input.providerMetadata),
      fetcher,
      phase: "execute",
    });
    return { transactions: readResourceList(payload, "transaction") };
  },
  async get_transaction(input, fetcher) {
    const id = requirePositiveInteger(input.input.id, "id");
    const payload = await requestPayrexxJson({
      path: `/Transaction/${id}/`,
      method: "GET",
      query: {},
      apiKey: input.apiKey,
      instance: readInstance(input.providerMetadata),
      fetcher,
      phase: "execute",
    });
    return { transaction: readSingleResource(payload, "transaction") };
  },
  async get_gateway(input, fetcher) {
    const id = requirePositiveInteger(input.input.id, "id");
    const payload = await requestPayrexxJson({
      path: `/Gateway/${id}/`,
      method: "GET",
      query: {},
      apiKey: input.apiKey,
      instance: readInstance(input.providerMetadata),
      fetcher,
      phase: "execute",
    });
    return { gateway: readSingleResource(payload, "gateway") };
  },
  async create_gateway(input, fetcher) {
    const payload = await requestPayrexxJson({
      path: "/Gateway/",
      method: "POST",
      query: {},
      form: compactObject({
        amount: requirePositiveInteger(input.input.amount, "amount"),
        currency: requireInputString(input.input.currency, "currency").toUpperCase(),
        purpose: optionalString(input.input.purpose),
        referenceId: optionalString(input.input.referenceId),
        sku: optionalString(input.input.sku),
        vatRate: optionalNumber(input.input.vatRate),
        successRedirectUrl: optionalString(input.input.successRedirectUrl),
        failedRedirectUrl: optionalString(input.input.failedRedirectUrl),
        cancelRedirectUrl: optionalString(input.input.cancelRedirectUrl),
        preAuthorization: booleanAsInteger(input.input.preAuthorization),
        reservation: booleanAsInteger(input.input.reservation),
      }),
      apiKey: input.apiKey,
      instance: readInstance(input.providerMetadata),
      fetcher,
      phase: "execute",
    });
    return { gateway: readCreatedGateway(payload) };
  },
};

export async function validatePayrexxCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<PayrexxCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const instance = requireInputString(input.instance, "instance");
  const payload = await requestPayrexxJson({
    path: "/PaymentProvider/",
    method: "GET",
    query: {},
    apiKey,
    instance,
    fetcher,
    phase: "validate",
  });
  readResourceList(payload, "payment provider");

  return {
    accountLabel: `${instance}.payrexx.com`,
    providerScopes: [],
    providerMetadata: {
      instance,
      apiVersion: "v1.16",
      validationEndpoint: "/PaymentProvider/",
    },
  };
}

export async function executePayrexxAction(
  input: ApiKeyActionRequest & {
    actionName: PayrexxActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  return payrexxActionHandlers[input.actionName](input, fetcher);
}

async function requestPayrexxJson(input: {
  path: string;
  method: "GET" | "POST";
  query: Record<string, QueryValue>;
  form?: Record<string, QueryValue>;
  apiKey: string;
  instance: string;
  fetcher: typeof fetch;
  phase: PayrexxPhase;
}) {
  const url = new URL(`${payrexxApiBaseUrl}${input.path}`);
  url.searchParams.set("instance", input.instance);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": providerUserAgent,
    "X-API-KEY": input.apiKey,
  });
  let body: URLSearchParams | undefined;
  if (input.form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(input.form)) {
      if (value !== undefined) body.set(key, String(value));
    }
    headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  const timeout = createProviderTimeout(undefined, requestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      body,
      signal: timeout.signal,
    });
    const payload = await readResponseBody(response);
    if (!response.ok || payload.status === "error") {
      throw normalizePayrexxError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() && isAbortError(error)) {
      throw new ProviderRequestError(
        502,
        `payrexx request timed out after ${Math.ceil(requestTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(502, readErrorMessage(error));
  } finally {
    timeout.cleanup();
  }
}

async function readResponseBody(response: Response): Promise<PayrexxResponse> {
  try {
    const payload = await response.json();
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      return payload;
    }
  } catch {
    // Use the normalized provider error below.
  }
  return { message: response.statusText || "Payrexx returned an invalid response" };
}

function normalizePayrexxError(response: Response, payload: PayrexxResponse, phase: PayrexxPhase) {
  const message =
    optionalString(payload.message)?.trim() ||
    optionalString(response.statusText)?.trim() ||
    `Payrexx request failed with HTTP ${response.status}`;
  if (response.status === 405 || response.status === 429 || (response.status === 403 && isRateLimitMessage(message))) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (
    response.status === 401 ||
    response.status === 403 ||
    (response.status === 200 && isCredentialErrorMessage(message))
  ) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 404) return new ProviderRequestError(404, message);
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message);
}

function isCredentialErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("api key") || normalized.includes("authentication");
}

function isRateLimitMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("throttl");
}

function readResourceList(payload: PayrexxResponse, resourceName: string) {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `payrexx ${resourceName} response did not include a data array`);
  }
  return payload.data;
}

function readSingleResource(payload: PayrexxResponse, resourceName: string) {
  const resources = readResourceList(payload, resourceName);
  const resource = resources[0];
  if (typeof resource !== "object" || resource === null || Array.isArray(resource)) {
    throw new ProviderRequestError(404, `payrexx ${resourceName} was not found`);
  }
  return resource;
}

function readCreatedGateway(payload: PayrexxResponse) {
  const gateway = readSingleResource(payload, "gateway");
  const link = optionalString(gateway.link);
  if (!link || !URL.canParse(link)) {
    throw new ProviderRequestError(502, "payrexx gateway response did not include a valid checkout link");
  }
  return gateway;
}

function readInstance(providerMetadata: Record<string, unknown> | undefined) {
  return requireInputString(providerMetadata?.instance, "providerMetadata.instance");
}

function requireInputString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `payrexx requires ${fieldName}`);
  }
  return text;
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  const number = optionalInteger(value);
  if (number == null || number <= 0) {
    throw new ProviderRequestError(400, `payrexx requires a positive ${fieldName}`);
  }
  return number;
}

function booleanAsInteger(value: unknown) {
  const boolean = optionalBoolean(value);
  return boolean === undefined ? undefined : boolean ? 1 : 0;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Payrexx request failed";
}
