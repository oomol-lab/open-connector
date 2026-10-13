import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { normalizeShopDomain } from "./shop-domain.ts";

const shopifyApiVersion = "2026-10";

export function buildShopifyApiBaseUrl(shopDomain: string): string {
  return `https://${normalizeShopDomain(shopDomain)}/admin/api/${shopifyApiVersion}`;
}

export async function requestShopifyJson(
  shopDomain: string,
  accessToken: string,
  url: URL | string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<{ response: Response; payload: unknown }> {
  const target = new URL(url);
  if (target.origin !== `https://${normalizeShopDomain(shopDomain)}`) {
    throw new ProviderRequestError(400, "Shopify request must target the connected shop");
  }
  return runProviderRequest({ label: "Shopify", signal: init.signal ?? undefined }, async (signal) => {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
    if (accessToken) headers.set("x-shopify-access-token", accessToken);
    const response = await fetcher(target, { ...init, headers, signal, redirect: "manual" });
    const body = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      if (response.ok) {
        throw new ProviderRequestError(502, "Shopify returned invalid JSON");
      }
      payload = null;
    }
    if (!response.ok) {
      const detail = shopifyErrorMessage(payload);
      throw new ProviderRequestError(
        response.status,
        `Shopify request failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return { response, payload };
  });
}

export async function requestShopifyGraphQL(
  context: { accessToken: string; shopDomain: string; signal?: AbortSignal },
  fetcher: typeof fetch,
  request: { query: string; variables?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const shopDomain = normalizeShopDomain(context.shopDomain);
  const { payload } = await requestShopifyJson(
    shopDomain,
    context.accessToken,
    `${buildShopifyApiBaseUrl(shopDomain)}/graphql.json`,
    { method: "POST", body: JSON.stringify(request), signal: context.signal },
    fetcher,
  );
  const result = requiredResponseRecord(payload, "Shopify GraphQL response");
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    throw new ProviderRequestError(502, `Shopify GraphQL error: ${shopifyErrorMessage(result)}`);
  }
  return result;
}

function shopifyErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error_description) ?? optionalString(record?.error) ?? optionalString(record?.message);
  if (message) return message;
  const errors = record?.errors;
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) {
    return errors
      .map(
        (error) => optionalString(optionalRecord(error)?.message) ?? optionalString(error) ?? "Unknown Shopify error",
      )
      .join("; ");
  }
  if (optionalRecord(errors)) {
    return Object.entries(errors as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("; ");
  }
  return undefined;
}
