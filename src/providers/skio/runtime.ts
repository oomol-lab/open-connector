import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderActionSources,
  ProviderRuntimeHandler,
} from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  mapProviderActionSources,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const skioApiBaseUrl = "https://api.skio.com/public-rest-api-http";
const validationPath = "/subscriptions";

type SkioPhase = "validate" | "execute";
type SkioActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type SkioEndpoint = {
  path: string;
  queryFields: readonly string[];
  label: string;
};

const actionEndpointByName: ProviderActionSources<"skio", SkioEndpoint> = {
  list_orders: {
    path: "/orders",
    queryFields: [
      "first",
      "after",
      "id",
      "platformId",
      "createdAfter",
      "createdBefore",
      "updatedAfter",
      "updatedBefore",
      "storefrontUserId",
    ],
    label: "Skio orders response",
  },
  list_products: {
    path: "/products",
    queryFields: [
      "first",
      "after",
      "id",
      "platformId",
      "ids",
      "platformIds",
      "status",
      "tags",
      "updatedAfter",
      "updatedBefore",
    ],
    label: "Skio products response",
  },
  list_storefront_users: {
    path: "/storefront-users",
    queryFields: [
      "first",
      "after",
      "id",
      "platformId",
      "createdAfter",
      "createdBefore",
      "updatedAfter",
      "updatedBefore",
      "email",
    ],
    label: "Skio storefront users response",
  },
  list_subscriptions: {
    path: "/subscriptions",
    queryFields: [
      "first",
      "after",
      "id",
      "platformId",
      "createdAfter",
      "createdBefore",
      "updatedAfter",
      "updatedBefore",
      "storefrontUserId",
      "status",
      "nextBillingDateAfter",
      "nextBillingDateBefore",
    ],
    label: "Skio subscriptions response",
  },
};

export const skioActionHandlers: ProviderActionHandlers<"skio", SkioActionHandler> = mapProviderActionSources(
  "skio",
  actionEndpointByName,
  (_actionName, endpoint): SkioActionHandler =>
    async (input, context) => {
      const payload = await requestSkioJson({
        apiKey: context.apiKey,
        path: endpoint.path,
        query: buildQueryParams(input, endpoint.queryFields),
        phase: "execute",
        context,
      });
      return normalizePaginatedResponse(payload, endpoint.label);
    },
);

export async function validateSkioCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSkioJson({
    apiKey,
    path: validationPath,
    query: buildQueryParams({ first: 1 }, ["first"]),
    phase: "validate",
    context: { fetcher, signal },
  });
  normalizePaginatedResponse(payload, "Skio validation response");
  return {
    profile: {
      displayName: "Skio API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: skioApiBaseUrl,
      validationEndpoint: `${validationPath}?first=1`,
      credentialHelpUrl: "https://help.skio.com/docs/using-the-skio-api",
    },
  };
}

async function requestSkioJson(input: {
  apiKey: string;
  path: string;
  phase: SkioPhase;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  query?: URLSearchParams;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildSkioUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `API ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createSkioError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Skio request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Skio request failed: ${error.message}` : "Skio request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSkioUrl(path: string, query?: URLSearchParams): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, `${skioApiBaseUrl}/`);
  if (query) {
    url.search = query.toString();
  }
  return url;
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();
  for (const field of allowedFields) {
    const value = input[field];
    if (value !== undefined && value !== null && value !== "") {
      query.set(field, String(value));
    }
  }
  return query.size > 0 ? query : undefined;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Skio JSON response");
  }
}

function normalizePaginatedResponse(payload: unknown, label: string): Record<string, unknown> {
  const body = requireObject(payload, label);
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, `${label} data is invalid`);
  }
  const pageInfo = requireObject(body.pageInfo, `${label} pageInfo`);
  if (typeof pageInfo.hasNextPage !== "boolean") {
    throw new ProviderRequestError(502, `${label} pageInfo.hasNextPage is invalid`);
  }
  return {
    data: body.data.map((item) => requireObject(item, `${label} item`)),
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      startCursor: readNullableString(pageInfo.startCursor, `${label} pageInfo.startCursor`),
      endCursor: readNullableString(pageInfo.endCursor, `${label} pageInfo.endCursor`),
    },
  };
}

function createSkioError(status: number, payload: unknown, phase: SkioPhase): ProviderRequestError {
  const message = extractMessage(payload) ?? `Skio request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return record;
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  const text = optionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return text;
}
