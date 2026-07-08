import type { CredentialValidationResult } from "../../core/types.ts";
import type { McdonaldsCnActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { integer, optionalIntegerLike, optionalScalarString, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson, encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError, readProviderJson } from "../provider-runtime.ts";

const prodBaseUrl = "https://api.open.mcd.cn";
const uatBaseUrl = "https://api-uat.open.mcdchina.net";
const apiVersion = "1.0";

export interface McdonaldsCnContext {
  appId: string;
  merchantId: string;
  signingKey: string;
  environment: McdonaldsCnEnvironment;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type McdonaldsCnEnvironment = "prod" | "uat";
type McdonaldsCnActionHandler = (input: Record<string, unknown>, context: McdonaldsCnContext) => Promise<unknown>;
type QueryValue = string | number | boolean | null | undefined;
type QueryEntry = readonly [string, QueryValue];

interface McdonaldsCnRequestInput {
  method: "GET" | "POST";
  path: string;
  query?: QueryEntry[];
  body?: Record<string, unknown>;
}

interface McdonaldsCnEnvelope {
  code?: unknown;
  message?: unknown;
  msg?: unknown;
  success?: unknown;
}

export const mcdonaldsCnActionHandlers: Record<McdonaldsCnActionName, McdonaldsCnActionHandler> = {
  get_cities(input, context) {
    return requestMcdonaldsCnJson(context, {
      method: "GET",
      path: "/cities/all",
      query: [["getCurrent", optionalScalarString(input.getCurrent)]],
    });
  },
  search_stores(input, context) {
    return requestMcdonaldsCnJson(context, {
      method: "GET",
      path: "/stores/vicinity",
      query: [
        ["addressId", optionalScalarString(input.addressId)],
        ["beType", optionalScalarString(input.beType)],
        ["cityCode", optionalScalarString(input.cityCode)],
        ["date", optionalScalarString(input.date)],
        ["distance", optionalScalarString(input.distance)],
        ["hotTagCode", optionalScalarString(input.hotTagCode)],
        ["isCityCenter", optionalScalarString(input.isCityCenter)],
        ["keyword", optionalScalarString(input.keyword)],
        ["latitude", optionalScalarString(input.latitude)],
        ["longitude", optionalScalarString(input.longitude)],
        ["orderType", optionalScalarString(input.orderType)],
        ["showType", optionalScalarString(input.showType)],
        ["time", optionalScalarString(input.time)],
      ],
    });
  },
  get_store(input, context) {
    const storeCode = requiredProviderString(input.storeCode, "storeCode");
    return requestMcdonaldsCnJson(context, {
      method: "GET",
      path: `/stores/${encodePathSegment(storeCode)}`,
    });
  },
  get_store_business(input, context) {
    const beCode = requiredProviderString(input.beCode, "beCode");
    return requestMcdonaldsCnJson(context, {
      method: "GET",
      path: `/stores/be/${encodePathSegment(beCode)}`,
      query: [
        ["date", optionalScalarString(input.date)],
        ["isGroupMeal", optionalScalarString(input.isGroupMeal)],
        ["time", optionalScalarString(input.time)],
      ],
    });
  },
  get_menu(input, context) {
    return requestMcdonaldsCnJson(context, {
      method: "POST",
      path: "/products/menu",
      body: {
        date: optionalScalarString(input.date),
        orderType: integer(input.orderType, "orderType", providerInputError),
        beCode: optionalScalarString(input.beCode),
        dayPartCode: integer(input.dayPartCode, "dayPartCode", providerInputError),
        time: optionalScalarString(input.time),
        isGroupMeal: optionalIntegerLike(input.isGroupMeal, "isGroupMeal", providerInputError),
        channelCode: requiredProviderString(input.channelCode, "channelCode"),
        storeCode: requiredProviderString(input.storeCode, "storeCode"),
      },
    });
  },
  get_product_detail(input, context) {
    const code = requiredProviderString(input.code, "code");
    return requestMcdonaldsCnJson(context, {
      method: "GET",
      path: `/products/detail/${encodePathSegment(code)}`,
      query: [
        ["beCode", optionalScalarString(input.beCode)],
        ["cardId", optionalScalarString(input.cardId)],
        ["channelCode", requiredProviderString(input.channelCode, "channelCode")],
        ["date", optionalScalarString(input.date)],
        ["daypartCode", requiredProviderString(input.daypartCode, "daypartCode")],
        ["isGroupMeal", optionalScalarString(input.isGroupMeal)],
        ["orderType", requiredProviderString(input.orderType, "orderType")],
        ["storeCode", requiredProviderString(input.storeCode, "storeCode")],
        ["time", optionalScalarString(input.time)],
      ],
    });
  },
  search_products(input, context) {
    return requestMcdonaldsCnJson(context, {
      method: "GET",
      path: "/products/search",
      query: [
        ["beCode", optionalScalarString(input.beCode)],
        ["date", optionalScalarString(input.date)],
        ["daypartCode", requiredProviderString(input.daypartCode, "daypartCode")],
        ["isGroupMeal", optionalScalarString(input.isGroupMeal)],
        ["keyword", requiredProviderString(input.keyword, "keyword")],
        ["orderType", requiredProviderString(input.orderType, "orderType")],
        ["storeCode", requiredProviderString(input.storeCode, "storeCode")],
        ["time", optionalScalarString(input.time)],
      ],
    });
  },
};

export function createMcdonaldsCnContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): McdonaldsCnContext {
  const environment = readEnvironment(values.environment);
  return {
    appId: requiredCredentialString(values.appId, "appId"),
    merchantId: requiredCredentialString(values.merchantId, "merchantId"),
    signingKey: requiredCredentialString(values.signingKey, "signingKey"),
    environment,
    baseUrl: environment === "uat" ? uatBaseUrl : prodBaseUrl,
    fetcher,
    signal,
  };
}

export async function validateMcdonaldsCnCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createMcdonaldsCnContext(values, fetcher, signal);
  await requestMcdonaldsCnJson(context, {
    method: "GET",
    path: "/cities/all",
    query: [["getCurrent", "0"]],
  });
  return {
    profile: {
      accountId: `${context.environment}:${context.merchantId}:${context.appId}`,
      displayName: `McDonald's China ${context.environment.toUpperCase()} merchant ${context.merchantId}`,
    },
    metadata: {
      environment: context.environment,
    },
  };
}

async function requestMcdonaldsCnJson<T = unknown>(
  context: McdonaldsCnContext,
  input: McdonaldsCnRequestInput,
): Promise<T> {
  const query = definedQueryEntries(input.query ?? []);
  const url = new URL(input.path, context.baseUrl);
  for (const [key, value] of query) {
    url.searchParams.set(key, value);
  }

  const body = input.method === "POST" ? JSON.stringify(compactJson(input.body ?? {})) : undefined;
  const signBody = input.method === "POST" ? (body ?? "{}") : buildGetSignBody(input.path, query);
  const timestamp = String(Date.now());
  const headers = new Headers({
    accept: "application/json",
    AppId: context.appId,
    MerchantId: context.merchantId,
    Timestamp: timestamp,
    Sign: createMcdonaldsCnSign(context, signBody, timestamp),
    Version: apiVersion,
    "user-agent": providerUserAgent,
  });
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers,
      body,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `McDonald's China request failed: ${error.message}` : "McDonald's China request failed",
    );
  }

  const payload = await readProviderJson<T>(response, "McDonald's China");
  throwIfMcdonaldsCnError(payload);
  return payload;
}

function createMcdonaldsCnSign(context: McdonaldsCnContext, body: string, timestamp: string): string {
  const signInput = `AppId=${context.appId}&Body=${body}&MerchantId=${context.merchantId}&Timestamp=${timestamp}&key=${context.signingKey}`;
  return createHash("md5").update(signInput, "utf8").digest("hex").toUpperCase();
}

function buildGetSignBody(path: string, query: Array<readonly [string, string]>): string {
  if (query.length === 0) {
    return path;
  }
  return `${path}?${query.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

function definedQueryEntries(query: QueryEntry[]): Array<readonly [string, string]> {
  const entries: Array<readonly [string, string]> = [];
  for (const [key, value] of query) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    entries.push([key, String(value)]);
  }
  return entries;
}

function throwIfMcdonaldsCnError(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const envelope = payload as McdonaldsCnEnvelope;
  if (envelope.success !== false) {
    return;
  }
  throw new ProviderRequestError(400, readMcdonaldsCnErrorMessage(envelope), payload);
}

function readMcdonaldsCnErrorMessage(envelope: McdonaldsCnEnvelope): string {
  return (
    optionalString(envelope.message) ??
    optionalString(envelope.msg) ??
    (envelope.code === undefined ? undefined : `McDonald's China returned code ${String(envelope.code)}`) ??
    "McDonald's China request failed"
  );
}

function readEnvironment(value: unknown): McdonaldsCnEnvironment {
  const environment = optionalString(value)?.toLowerCase() ?? "prod";
  if (environment === "prod" || environment === "uat") {
    return environment;
  }
  throw new ProviderRequestError(400, "environment must be prod or uat");
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function requiredCredentialString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(401, message));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
