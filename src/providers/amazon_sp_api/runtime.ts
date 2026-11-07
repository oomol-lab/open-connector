import { requiredRawString, looseArray, recordOrEmpty, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  isAbortLikeError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
interface AmazonActionContext {
  accessToken: string;
  actionName: string;
  providerMetadata?: Record<string, unknown>;
}
const amazonApiOrigins = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
};

export const amazonUserAgent = "oomol-connector/1.0 (Language=TypeScript)";

export function amazonRequestDate(): string {
  return new Date().toISOString().replaceAll("-", "").replaceAll(":", "").slice(0, 15) + "Z";
}

export function amazonApiOrigin(region: unknown): string {
  if (region === "na" || region === "eu" || region === "fe") return amazonApiOrigins[region];
  throw new ProviderRequestError(400, "Amazon SP-API connection region is invalid", undefined, "invalid_input");
}

interface AmazonRequestContext {
  accessToken: string;
  region: unknown;
  fetcher: typeof fetch;
}

interface AmazonRequestOptions {
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export async function amazonRequest(
  path: string,
  context: AmazonRequestContext,
  options: AmazonRequestOptions = {},
): Promise<Record<string, unknown>> {
  const url = new URL(path, amazonApiOrigin(context.region));
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
  }
  return runProviderRequest({ label: "Amazon SP-API" }, async (signal) => {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": amazonUserAgent,
        "x-amz-access-token": context.accessToken,
        "x-amz-date": amazonRequestDate(),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    return readAmazonResponse(response);
  });
}

export async function readAmazonResponse(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch((error: unknown) => {
    if (isAbortLikeError(error)) throw error;
    return undefined;
  });
  if (!response.ok) {
    const root = recordOrEmpty(payload);
    const messages = looseArray(root.errors)
      .map((entry) => {
        const error = recordOrEmpty(entry);
        return [optionalString(error.code), optionalString(error.message)].filter(Boolean).join(": ");
      })
      .filter(Boolean);
    const tokenError = [optionalString(root.error), optionalString(root.error_description)].filter(Boolean).join(": ");
    throw new ProviderRequestError(
      response.status,
      `Amazon SP-API: ${messages.join("; ") || tokenError || `HTTP ${response.status}`}`,
      undefined,
      "provider_error",
    );
  }
  return requiredResponseRecord(payload, "Amazon SP-API response");
}

export function executeAmazonAction(
  context: AmazonActionContext,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const requestContext = {
    accessToken: context.accessToken,
    region: context.providerMetadata?.region,
    fetcher,
  };
  const { actionName } = context;
  if (actionName === "list_marketplace_participations") {
    return amazonRequest("/sellers/v1/marketplaceParticipations", requestContext);
  }
  if (actionName === "search_catalog_items") {
    return amazonRequest("/catalog/2022-04-01/items", requestContext, {
      query: {
        ...input,
        sellerId: input.sellerId ?? (input.identifiersType === "SKU" ? context.providerMetadata?.sellerId : undefined),
      },
    });
  }
  if (actionName === "get_catalog_item") {
    const { asin, ...query } = input;
    return amazonRequest(`/catalog/2022-04-01/items/${encodePathSegment(asin, "asin")}`, requestContext, { query });
  }
  if (actionName === "get_inventory_summaries") {
    const marketplaceIds = input.marketplaceIds as string[];
    return amazonRequest("/fba/inventory/v1/summaries", requestContext, {
      query: { ...input, granularityType: "Marketplace", granularityId: marketplaceIds[0] },
    });
  }
  const { sellerId, sku, productType, attributes, requirements, patches, ...query } = input;
  const seller = encodePathSegment(sellerId ?? context.providerMetadata?.sellerId, "sellerId");
  const basePath = `/listings/2021-08-01/items/${seller}`;
  if (actionName === "search_listings_items") {
    return amazonRequest(basePath, requestContext, { query });
  }
  const path = `${basePath}/${encodePathSegment(sku, "sku")}`;
  switch (actionName) {
    case "get_listings_item":
      return amazonRequest(path, requestContext, { query });
    case "put_listings_item":
      return amazonRequest(path, requestContext, {
        method: "PUT",
        query,
        body: { productType, attributes, requirements },
      });
    case "patch_listings_item":
      return amazonRequest(path, requestContext, {
        method: "PATCH",
        query,
        body: { productType, patches },
      });
    case "delete_listings_item":
      return amazonRequest(path, requestContext, { method: "DELETE", query });
    default:
      throw new ProviderRequestError(400, `Unknown Amazon SP-API action: ${actionName}`, undefined, "invalid_input");
  }
}

function encodePathSegment(value: unknown, name: string) {
  const segment = requiredRawString(value, name, providerInputError);
  // Reject dot segments so URL normalization cannot rewrite the listing path.
  if (segment === "." || segment === "..") {
    throw new ProviderRequestError(400, `${name} must not be a dot path segment`, undefined, "invalid_input");
  }
  return encodeURIComponent(segment);
}
