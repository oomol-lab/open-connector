import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  mapProviderActionSources,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const quadernoAuthorizationBaseUrl = "https://quadernoapp.com/api";

interface QuadernoRuntimeContext {
  apiKey: string;
  fetcher: typeof fetch;
  providerMetadata: Record<string, unknown>;
}

type QuadernoExecuteInput = {
  apiKey: string;
  providerMetadata?: Record<string, unknown>;
  input: Record<string, unknown>;
};

type QuadernoHandler = (input: QuadernoExecuteInput, fetcher: typeof fetch) => Promise<Record<string, unknown>>;

interface QuadernoAccountInfo {
  id: string | null;
  name: string | null;
  email: string | null;
  publishableKey: string | null;
  accountUrl: string;
  accountSubdomain: string;
  raw: Record<string, unknown>;
}

export const quadernoActionHandlers: ProviderActionHandlers<"quaderno", QuadernoHandler> = {
  get_account: async (input, fetcher) => ({
    account: await fetchQuadernoAccount(input.apiKey, fetcher),
  }),
  list_contacts: async (input, fetcher) => {
    const response = await requestQuaderno(input, fetcher, "GET", "/contacts", input.input);
    return {
      contacts: ensureArray(response.body).map(normalizeContact),
      pagination: readPagination(response.headers),
    };
  },
  get_contact: async (input, fetcher) => ({
    contact: normalizeContact(
      (await requestQuaderno(input, fetcher, "GET", `/contacts/${encodePathId(input.input.id)}`)).body,
    ),
  }),
  create_contact: async (input, fetcher) => ({
    contact: normalizeContact(
      (await requestQuaderno(input, fetcher, "POST", "/contacts", undefined, input.input.contact)).body,
    ),
  }),
  update_contact: async (input, fetcher) => ({
    contact: normalizeContact(
      (
        await requestQuaderno(
          input,
          fetcher,
          "PUT",
          `/contacts/${encodePathId(input.input.id)}`,
          undefined,
          input.input.contact,
        )
      ).body,
    ),
  }),
  delete_contact: async (input, fetcher) => {
    await requestQuaderno(input, fetcher, "DELETE", `/contacts/${encodePathId(input.input.id)}`);
    return { deleted: true };
  },
  list_products: async (input, fetcher) => {
    const response = await requestQuaderno(input, fetcher, "GET", "/items", input.input);
    return {
      products: ensureArray(response.body).map(normalizeProduct),
      pagination: readPagination(response.headers),
    };
  },
  get_product: async (input, fetcher) => ({
    product: normalizeProduct(
      (await requestQuaderno(input, fetcher, "GET", `/items/${encodePathId(input.input.id)}`)).body,
    ),
  }),
  create_product: async (input, fetcher) => ({
    product: normalizeProduct(
      (await requestQuaderno(input, fetcher, "POST", "/items", undefined, input.input.product)).body,
    ),
  }),
  update_product: async (input, fetcher) => ({
    product: normalizeProduct(
      (
        await requestQuaderno(
          input,
          fetcher,
          "PUT",
          `/items/${encodePathId(input.input.id)}`,
          undefined,
          input.input.product,
        )
      ).body,
    ),
  }),
  delete_product: async (input, fetcher) => {
    await requestQuaderno(input, fetcher, "DELETE", `/items/${encodePathId(input.input.id)}`);
    return { deleted: true };
  },
  calculate_tax_rate: async (input, fetcher) => ({
    taxRate: normalizeTaxRate((await requestQuaderno(input, fetcher, "GET", "/tax_rates/calculate", input.input)).body),
  }),
};

export async function validateQuadernoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const account = await fetchQuadernoAccount(
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    fetcher,
  );
  return {
    profile: {
      accountId: `quaderno:${account.accountSubdomain}`,
      displayName: account.email ?? account.name ?? account.accountSubdomain,
      grantedScopes: [],
    },
    metadata: {
      accountUrl: account.accountUrl,
      accountSubdomain: account.accountSubdomain,
      email: account.email,
      name: account.name,
      validationEndpoint: "/authorization",
    },
  };
}

const quadernoRuntimeHandlers: ProviderActionHandlers<
  "quaderno",
  ProviderRuntimeHandler<QuadernoRuntimeContext>
> = mapProviderActionSources<"quaderno", typeof quadernoActionHandlers, ProviderRuntimeHandler<QuadernoRuntimeContext>>(
  "quaderno",
  quadernoActionHandlers,
  (_name, handler) => (input, context) =>
    handler({ apiKey: context.apiKey, providerMetadata: context.providerMetadata, input }, context.fetcher),
);

export const executors: ProviderExecutors = defineProviderExecutors<QuadernoRuntimeContext>({
  service: "quaderno",
  handlers: quadernoRuntimeHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<QuadernoRuntimeContext> {
    const credential = await requireApiKeyCredential(context, "quaderno");
    return {
      apiKey: credential.apiKey,
      fetcher,
      providerMetadata: credential.metadata,
    };
  },
});

export function buildQuadernoAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`, "utf8").toString("base64")}`;
}

export function resolveQuadernoApiBaseUrl(providerMetadata: Record<string, unknown>): string {
  const stored = providerMetadata.accountUrl;
  if (typeof stored !== "string" || stored.trim().length === 0) {
    throw new ProviderRequestError(400, "quaderno connection is missing accountUrl metadata");
  }
  return normalizeQuadernoApiBaseUrl(stored);
}

async function fetchQuadernoAccount(apiKey: string, fetcher: typeof fetch) {
  const response = await fetcher(`${quadernoAuthorizationBaseUrl}/authorization`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw mapQuadernoError(response.status, body);
  }

  const payload = requireRecord(body, "authorization response");
  const identity = requireRecord(payload.identity, "authorization identity");
  const href = readRequiredString(identity.href, "authorization identity href");
  const accountUrl = normalizeQuadernoApiBaseUrl(href);
  const accountSubdomain = extractAccountSubdomain(accountUrl);
  return {
    id: readOptionalString(identity.id),
    name: readOptionalString(identity.name),
    email: readOptionalString(identity.email),
    publishableKey: readOptionalString(identity.publishable_key),
    accountUrl,
    accountSubdomain,
    raw: identity,
  } satisfies QuadernoAccountInfo;
}

async function requestQuaderno(
  input: QuadernoExecuteInput,
  fetcher: typeof fetch,
  method: string,
  path: string,
  query?: Record<string, unknown>,
  body?: unknown,
) {
  const url = new URL(`${resolveQuadernoApiBaseUrl(input.providerMetadata ?? {})}${path}`);
  appendQuery(url, query);
  const response = await fetcher(url, {
    method,
    headers: buildHeaders(input.apiKey, body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await readJsonBody(response);
  if (!response.ok) {
    throw mapQuadernoError(response.status, responseBody);
  }
  return { body: responseBody, headers: response.headers };
}

function buildHeaders(apiKey: string, hasBody = false) {
  return {
    accept: "application/json",
    authorization: buildQuadernoAuthorizationHeader(apiKey),
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined) {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
}

function encodePathId(value: unknown) {
  return encodeURIComponent(String(value));
}

async function readJsonBody(response: Response) {
  if (response.status === 204) {
    return {};
  }
  const text = await response.text();
  if (text.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "quaderno returned invalid JSON");
  }
}

function mapQuadernoError(status: number, body: unknown) {
  const message =
    readOptionalString(requireLooseRecord(body).message) ??
    readOptionalString(requireLooseRecord(body).error) ??
    readOptionalString(requireLooseRecord(body).errors) ??
    `quaderno request failed with status ${status}`;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function normalizeQuadernoApiBaseUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/api/") && !url.pathname.endsWith("/api")) {
    throw new ProviderRequestError(502, "quaderno authorization href is not an API URL");
  }
  url.pathname = "/api";
  return url.toString().replace(/\/$/, "");
}

function extractAccountSubdomain(accountUrl: string) {
  const host = new URL(accountUrl).hostname;
  const suffixes = [".sandbox-quadernoapp.com", ".quadernoapp.com"];
  for (const suffix of suffixes) {
    if (host.endsWith(suffix) && host.length > suffix.length) {
      return host.slice(0, -suffix.length);
    }
  }
  throw new ProviderRequestError(502, "quaderno authorization href has an unknown host");
}

function normalizeContact(value: unknown) {
  const item = requireRecord(value, "contact");
  return {
    id: readOptionalInteger(item.id),
    firstName: readOptionalString(item.first_name),
    lastName: readOptionalString(item.last_name),
    email: readOptionalString(item.email),
    kind: readOptionalString(item.kind),
    country: readOptionalString(item.country),
    processorId: readOptionalString(item.processor_id),
    taxStatus: readOptionalString(item.tax_status),
    raw: item,
  };
}

function normalizeProduct(value: unknown) {
  const item = requireRecord(value, "product");
  return {
    id: readOptionalInteger(item.id),
    name: readOptionalString(item.name),
    code: readOptionalString(item.code),
    unitCost: readOptionalString(item.unit_cost),
    currency: readOptionalString(item.currency),
    productType: readOptionalString(item.product_type),
    taxClass: readOptionalString(item.tax_class),
    raw: item,
  };
}

function normalizeTaxRate(value: unknown) {
  const item = requireRecord(value, "tax rate");
  return {
    name: readOptionalString(item.name),
    rate: readOptionalNumber(item.rate),
    taxablePart: readOptionalNumber(item.taxable_part),
    country: readOptionalString(item.country),
    region: readOptionalString(item.region),
    taxCode: readOptionalString(item.tax_code),
    taxBehavior: readOptionalString(item.tax_behavior),
    taxAmount: readOptionalNumber(item.tax_amount),
    subtotal: readOptionalNumber(item.subtotal),
    totalAmount: readOptionalNumber(item.total_amount),
    status: readOptionalString(item.status),
    raw: item,
  };
}

function readPagination(headers: Headers) {
  return {
    next: readLinkHeader(headers.get("link"), "next"),
    previous: readLinkHeader(headers.get("link"), "prev"),
    first: readLinkHeader(headers.get("link"), "first"),
    last: readLinkHeader(headers.get("link"), "last"),
    rateLimitLimit: readOptionalInteger(headers.get("x-ratelimit-limit")),
    rateLimitRemaining: readOptionalInteger(headers.get("x-ratelimit-remaining")),
    rateLimitReset: readOptionalInteger(headers.get("x-ratelimit-reset")),
  };
}

function readLinkHeader(value: string | null, relation: string) {
  if (!value) {
    return null;
  }
  for (const part of value.split(",")) {
    const [urlPart, ...parameterParts] = part.trim().split(";");
    const rel = parameterParts.find((parameter) => parameter.trim() === `rel="${relation}"`);
    if (!rel) {
      continue;
    }
    if (!urlPart) {
      continue;
    }
    const trimmed = urlPart.trim();
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      return trimmed.slice(1, -1);
    }
  }
  return null;
}

function ensureArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(502, "quaderno returned a non-array list response");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProviderRequestError(502, `quaderno returned invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireLooseRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRequiredString(value: unknown, label: string) {
  const output = readOptionalString(value);
  if (output === null) {
    throw new ProviderRequestError(502, `quaderno returned missing ${label}`);
  }
  return output;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
