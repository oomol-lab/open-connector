import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LogoDevActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalString, requiredString, optionalBoolean } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "logo_dev";
const logoDevApiBaseUrl = "https://api.logo.dev";
const logoDevImageBaseUrl = "https://img.logo.dev";

interface LogoDevImageRequest {
  token: string;
  size?: number;
  format?: string;
  theme?: string;
  greyscale?: boolean;
  retina?: boolean;
  fallback?: string;
}

type LogoDevActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const logoDevActionHandlers: ProviderActionHandlers<"logo_dev", LogoDevActionHandler> = {
  get_logo_by_domain(input) {
    return Promise.resolve(buildLogoImageLookup("get_logo_by_domain", input));
  },
  get_logo_by_name(input) {
    return Promise.resolve(buildLogoImageLookup("get_logo_by_name", input));
  },
  get_logo_by_ticker(input) {
    return Promise.resolve(buildLogoImageLookup("get_logo_by_ticker", input));
  },
  get_logo_by_crypto(input) {
    return Promise.resolve(buildLogoImageLookup("get_logo_by_crypto", input));
  },
  get_logo_by_isin(input) {
    return Promise.resolve(buildLogoImageLookup("get_logo_by_isin", input));
  },
  search_brands(input, context) {
    return searchLogoDevBrands(input, context);
  },
  describe_brand(input, context) {
    return describeLogoDevBrand(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, logoDevActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const response = await fetcher(`${logoDevApiBaseUrl}/search?q=openai&strategy=match`, {
      headers: logoDevApiHeaders(input.apiKey),
      signal,
    });
    await assertLogoDevResponse(response, "validate");
    return {
      profile: {
        accountId: "logo_dev-api-key",
        displayName: "Logo.dev API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: logoDevApiBaseUrl,
        validationEndpoint: "/search",
      },
    };
  },
};

function buildLogoImageLookup(actionName: LogoDevActionName, input: Record<string, unknown>): Record<string, unknown> {
  const requested = buildImageRequest(input);

  if (actionName === "get_logo_by_domain") {
    const domain = requiredString(input.domain, "domain", invalidInputError);
    return {
      lookupType: "domain",
      lookupValue: domain,
      logoUrl: buildLogoDevImageUrl(encodeURIComponent(domain), requested),
      requested,
    };
  }
  if (actionName === "get_logo_by_name") {
    const brandName = requiredString(input.brandName, "brandName", invalidInputError);
    return {
      lookupType: "name",
      lookupValue: brandName,
      logoUrl: buildLogoDevImageUrl(`name/${encodeURIComponent(brandName)}`, requested),
      requested,
    };
  }
  if (actionName === "get_logo_by_ticker") {
    const ticker = requiredString(input.ticker, "ticker", invalidInputError);
    return {
      lookupType: "ticker",
      lookupValue: ticker,
      logoUrl: buildLogoDevImageUrl(`ticker/${encodeURIComponent(ticker)}`, requested),
      requested,
    };
  }
  if (actionName === "get_logo_by_crypto") {
    const symbol = requiredString(input.symbol, "symbol", invalidInputError);
    return {
      lookupType: "crypto",
      lookupValue: symbol,
      logoUrl: buildLogoDevImageUrl(`crypto/${encodeURIComponent(symbol)}`, requested),
      requested,
    };
  }

  const isin = requiredString(input.isin, "isin", invalidInputError);
  return {
    lookupType: "isin",
    lookupValue: isin,
    logoUrl: buildLogoDevImageUrl(`isin/${encodeURIComponent(isin)}`, requested),
    requested,
  };
}

function buildImageRequest(input: Record<string, unknown>): LogoDevImageRequest {
  return compactObject({
    token: requiredString(input.token, "token", invalidInputError),
    size: optionalInteger(input.size),
    format: optionalString(input.format),
    theme: optionalString(input.theme),
    greyscale: optionalBoolean(input.greyscale),
    retina: optionalBoolean(input.retina),
    fallback: optionalString(input.fallback),
  }) as LogoDevImageRequest;
}

function buildLogoDevImageUrl(path: string, requested: LogoDevImageRequest): string {
  const query = new URLSearchParams();
  query.append("token", requested.token);
  if (requested.size !== undefined) {
    query.append("size", String(requested.size));
  }
  if (requested.format) {
    query.append("format", requested.format);
  }
  if (requested.theme) {
    query.append("theme", requested.theme);
  }
  if (requested.greyscale !== undefined) {
    query.append("greyscale", String(requested.greyscale));
  }
  if (requested.retina !== undefined) {
    query.append("retina", String(requested.retina));
  }
  if (requested.fallback) {
    query.append("fallback", requested.fallback);
  }

  return `${logoDevImageBaseUrl}/${path}?${query.toString()}`;
}

async function searchLogoDevBrands(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const url = new URL("/search", logoDevApiBaseUrl);
  url.search = new URLSearchParams(
    queryParams({
      q: requiredString(input.query, "query", invalidInputError),
      strategy: optionalString(input.strategy),
    }),
  ).toString();

  const response = await context.fetcher(url, {
    headers: logoDevApiHeaders(context.apiKey),
    signal: context.signal,
  });
  await assertLogoDevResponse(response, "execute");

  const payload = await readLogoDevJson<
    | Array<{ name?: unknown; domain?: unknown; logo_url?: unknown; logoUrl?: unknown }>
    | {
        brands?: Array<{ name?: unknown; domain?: unknown; logo_url?: unknown; logoUrl?: unknown }>;
      }
  >(response);
  const brands = Array.isArray(payload) ? payload : Array.isArray(payload.brands) ? payload.brands : [];

  return {
    brands: brands
      .filter((item) => typeof item?.name === "string" && typeof item?.domain === "string")
      .map((item) =>
        compactObject({
          name: item.name,
          domain: item.domain,
          logoUrl: readLogoDevRemoteLogoUrl(item),
        }),
      ),
  };
}

async function describeLogoDevBrand(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const domain = requiredString(input.domain, "domain", invalidInputError);
  const response = await context.fetcher(`${logoDevApiBaseUrl}/describe/${encodeURIComponent(domain)}`, {
    headers: logoDevApiHeaders(context.apiKey),
    signal: context.signal,
  });
  await assertLogoDevResponse(response, "execute");

  const payload = await readLogoDevJson<{
    name?: unknown;
    description?: unknown;
    socials?: unknown;
    blurhash?: unknown;
    colors?: unknown;
    logo?: unknown;
    logoUrl?: unknown;
    logo_url?: unknown;
  }>(response);

  return compactObject({
    name: optionalString(payload.name),
    domain,
    description: optionalString(payload.description),
    socials: payload.socials,
    blurhash: optionalString(payload.blurhash),
    colors: payload.colors,
    logoUrl: readLogoDevRemoteLogoUrl(payload),
  });
}

function logoDevApiHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function assertLogoDevResponse(response: Response, phase: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const message = await readLogoDevError(response);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  throw new ProviderRequestError(response.status || 502, message);
}

async function readLogoDevError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: unknown;
      message?: unknown;
    };
    return (
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error === "string" && payload.error) ||
      `logo_dev request failed with ${response.status}`
    );
  } catch {
    return `logo_dev request failed with ${response.status}`;
  }
}

async function readLogoDevJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "logo_dev returned an invalid JSON response");
  }
}

function readLogoDevRemoteLogoUrl(payload: Record<string, unknown>): string | undefined {
  return optionalString(payload.logo_url) ?? optionalString(payload.logoUrl) ?? optionalString(payload.logo);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.logo.dev",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
