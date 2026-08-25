import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "dns_filter";
const dnsFilterApiBaseUrl = "https://api.dnsfilter.com";
const dnsFilterRequestTimeoutMs = 30_000;

type DnsFilterRequestPhase = "validate" | "execute";
type DnsFilterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dnsFilterActionHandlers: ProviderActionHandlers<"dns_filter", DnsFilterActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_categories(input, context) {
    return listJsonApiResources(input, context, "/v1/categories");
  },
  get_category(input, context) {
    return getJsonApiResource(input, context, "/v1/categories");
  },
  list_application_categories(input, context) {
    return listJsonApiResources(input, context, "/v1/application_categories");
  },
  list_applications(input, context) {
    return listJsonApiResources(input, context, "/v1/applications", {
      category_ids: readIntegerArray(input.category_ids),
    });
  },
  list_policies(input, context) {
    return listJsonApiResources(input, context, "/v1/policies", {
      include_global_policies: optionalBoolean(input.include_global_policies),
      organization_id: optionalInteger(input.organization_id),
    });
  },
  list_networks(input, context) {
    return listNetworks(input, context);
  },
  list_ip_addresses(input, context) {
    return listJsonApiResources(input, context, "/v1/ip_addresses", {
      search: optionalString(input.search),
    });
  },
  get_my_ip(_input, context) {
    return getMyIp(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dnsFilterActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestDnsFilterJson({
      apiKey: input.apiKey,
      path: "/v1/current_user",
      fetcher,
      signal,
      phase: "validate",
    });
    const user = requireDataObject(payload, "dns_filter current user response");
    const attributes = optionalRecord(user.attributes);

    return {
      profile: {
        accountId: optionalString(user.id) ?? "dns_filter:api-key",
        displayName: optionalString(attributes?.email) ?? optionalString(attributes?.name) ?? "DNSFilter API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: dnsFilterApiBaseUrl,
        validationEndpoint: "/v1/current_user",
        userId: optionalString(user.id),
        userEmail: optionalString(attributes?.email),
      },
    };
  },
};

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestDnsFilterJson({
    apiKey: context.apiKey,
    path: "/v1/current_user",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    user: requireDataObject(payload, "dns_filter current user response"),
  };
}

async function listJsonApiResources(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  extraQuery: Record<string, unknown> = {},
): Promise<unknown> {
  const payload = await requestDnsFilterJson({
    apiKey: context.apiKey,
    path,
    query: buildQueryParams(input, extraQuery),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeJsonApiList(payload, `dns_filter ${path} response`);
}

async function getJsonApiResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  collectionPath: string,
): Promise<unknown> {
  const id = requiredString(input.id, "id", (message) => new ProviderRequestError(400, message));
  const payload = await requestDnsFilterJson({
    apiKey: context.apiKey,
    path: `${collectionPath}/${encodePathSegment(id)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    item: requireDataObject(payload, `dns_filter ${collectionPath} response`),
  };
}

async function listNetworks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestDnsFilterJson({
    apiKey: context.apiKey,
    path: "/v1/networks",
    query: buildQueryParams(input, {
      basic_info: optionalBoolean(input.basic_info),
      count_network_ips: optionalBoolean(input.count_network_ips),
      force_truncate_ips: optionalBoolean(input.force_truncate_ips),
      protected: optionalBoolean(input.protected),
      search: optionalString(input.search),
      unprotected: optionalBoolean(input.unprotected),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const output = normalizeJsonApiList(payload, "dns_filter networks response");
  const included = optionalObjectArray(optionalRecord(payload)?.included);

  return {
    ...output,
    ...(included.length > 0 ? { included } : {}),
  };
}

async function getMyIp(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestDnsFilterJson({
    apiKey: context.apiKey,
    path: "/v1/ip_addresses/myip",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const ip = optionalString(optionalRecord(payload)?.myip);
  if (!ip) {
    throw new ProviderRequestError(502, "dns_filter myip response is missing myip", payload);
  }

  return { ip };
}

async function requestDnsFilterJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: DnsFilterRequestPhase;
  query?: URLSearchParams;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const response = await dnsFilterFetch(input);
  const payload = await readDnsFilterPayload(response);

  if (!response.ok) {
    throw createDnsFilterError(response, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "dns_filter returned a non-object JSON response", payload);
  }
  return record;
}

async function dnsFilterFetch(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  query?: URLSearchParams;
  signal?: AbortSignal;
}): Promise<Response> {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${dnsFilterApiBaseUrl}/`);
  if (input.query) {
    url.search = input.query.toString();
  }

  const timeout = createProviderTimeout(input.signal, dnsFilterRequestTimeoutMs);
  try {
    return await input.fetcher(url, {
      method: "GET",
      headers: buildDnsFilterHeaders(input.apiKey),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "dns_filter request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `dns_filter request failed: ${error.message}` : "dns_filter request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildDnsFilterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: apiKey,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  };
}

async function readDnsFilterPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "dns_filter returned invalid JSON");
  }
}

function createDnsFilterError(
  response: Response,
  payload: unknown,
  phase: DnsFilterRequestPhase,
): ProviderRequestError {
  const message = readDnsFilterErrorMessage(payload) ?? `dns_filter request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  if (phase === "validate" || (response.status >= 400 && response.status < 500)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function readDnsFilterErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const nestedError = optionalRecord(object.error);
  return optionalString(object.error) ?? optionalString(nestedError?.message);
}

function normalizeJsonApiList(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `${label} data is not an array`, payload);
  }

  const links = optionalRecord(payload.links);
  return {
    items: payload.data,
    ...(links ? { links } : {}),
  };
}

function requireDataObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  const data = optionalRecord(object?.data);
  if (!data) {
    throw new ProviderRequestError(502, `${label} data is not an object`, payload);
  }
  return data;
}

function buildQueryParams(input: Record<string, unknown>, extraQuery: Record<string, unknown> = {}): URLSearchParams {
  const query = new URLSearchParams();
  appendQueryValue(query, "page[number]", optionalInteger(input.page_number));
  appendQueryValue(query, "page[size]", optionalInteger(input.page_size));

  for (const [key, value] of Object.entries(extraQuery)) {
    appendQueryValue(query, key, value);
  }

  return query;
}

function appendQueryValue(query: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      query.append(key, String(item));
    }
    return;
  }

  query.append(key, String(value));
}

function readIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is number => typeof item === "number" && Number.isInteger(item));
}
