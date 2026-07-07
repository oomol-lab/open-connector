import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GhostActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ghost";
const ghostContentPathPrefix = "/ghost/api/content";
const ghostApiVersion = "v5.0";
const ghostValidationPath = `${ghostContentPathPrefix}/${ghostApiVersion}/settings/`;

type GhostRequestPhase = "validate" | "execute";
type GhostCollection = "posts" | "pages" | "tags" | "authors";

interface GhostActionContext {
  apiKey: string;
  contentBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type GhostActionHandler = (input: Record<string, unknown>, context: GhostActionContext) => Promise<unknown>;

export const ghostActionHandlers: Record<GhostActionName, GhostActionHandler> = {
  list_posts(input, context) {
    return browseGhostCollection(input, context, "posts");
  },
  get_post(input, context) {
    return readGhostResource(input, context, "posts");
  },
  list_pages(input, context) {
    return browseGhostCollection(input, context, "pages");
  },
  get_page(input, context) {
    return readGhostResource(input, context, "pages");
  },
  list_tags(input, context) {
    return browseGhostCollection(input, context, "tags");
  },
  get_tag(input, context) {
    return readGhostResource(input, context, "tags");
  },
  list_authors(input, context) {
    return browseGhostCollection(input, context, "authors");
  },
  get_author(input, context) {
    return readGhostResource(input, context, "authors");
  },
  async read_settings(_input, context) {
    const payload = await requestGhostJson({
      apiKey: context.apiKey,
      baseUrl: context.contentBaseUrl,
      path: "/settings/",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      settings: optionalRecord(optionalRecord(payload)?.settings) ?? null,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GhostActionContext>({
  service,
  handlers: ghostActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GhostActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      contentBaseUrl: requireGhostContentBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return requireGhostContentBaseUrl(credential.values, credential.metadata);
  },
  auth: {
    type: "api_key_query",
    name: "key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGhostCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateGhostCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const siteUrl = normalizeGhostSiteUrl(values.siteUrl);
  const contentBaseUrl = ghostContentBaseUrl(siteUrl);
  const payload = await requestGhostJson({
    apiKey,
    baseUrl: contentBaseUrl,
    path: "/settings/",
    fetcher,
    signal,
    phase: "validate",
  });
  const settings = optionalRecord(optionalRecord(payload)?.settings);
  const title = optionalString(settings?.title);
  const url = optionalString(settings?.url);

  return {
    profile: {
      accountId: url ?? siteUrl,
      displayName: title ?? new URL(siteUrl).hostname,
    },
    grantedScopes: [],
    metadata: compactObject({
      siteUrl,
      contentBaseUrl,
      validationEndpoint: ghostValidationPath,
      title,
      url,
      description: optionalString(settings?.description),
    }),
  };
}

async function browseGhostCollection(
  input: Record<string, unknown>,
  context: GhostActionContext,
  collection: GhostCollection,
): Promise<unknown> {
  const payload = await requestGhostJson({
    apiKey: context.apiKey,
    baseUrl: context.contentBaseUrl,
    path: `/${collection}/`,
    query: browseQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = optionalRecord(payload) ?? {};
  return {
    [collection]: Array.isArray(record[collection]) ? record[collection].map((item) => optionalRecord(item) ?? {}) : [],
    meta: optionalRecord(record.meta) ?? null,
  };
}

async function readGhostResource(
  input: Record<string, unknown>,
  context: GhostActionContext,
  collection: GhostCollection,
): Promise<unknown> {
  const id = optionalString(input.id);
  const slug = optionalString(input.slug);
  if (!id && !slug) {
    throw new ProviderRequestError(400, "id or slug is required");
  }

  const path = id ? `/${collection}/${encodeURIComponent(id)}/` : `/${collection}/slug/${encodeURIComponent(slug!)}/`;
  const payload = await requestGhostJson({
    apiKey: context.apiKey,
    baseUrl: context.contentBaseUrl,
    path,
    query: readQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const record = optionalRecord(payload) ?? {};
  const items = record[collection];
  const resource = Array.isArray(items) ? optionalRecord(items[0]) : undefined;
  return {
    [collection.slice(0, -1)]: resource ?? null,
  };
}

async function requestGhostJson(input: {
  apiKey: string;
  baseUrl: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: GhostRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(input.path.replace(/^\/+/u, ""), `${input.baseUrl}/`);
  url.searchParams.set("key", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Ghost request failed: ${error.message}` : "Ghost request failed",
      error,
    );
  }

  const payload = await readGhostPayload(response);
  if (!response.ok) {
    throw createGhostError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

function browseQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    limit: optionalInteger(input.limit),
    page: optionalInteger(input.page),
    include: optionalString(input.include),
    fields: optionalString(input.fields),
    formats: optionalString(input.formats),
    filter: optionalString(input.filter),
    order: optionalString(input.order),
  });
}

function readQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    include: optionalString(input.include),
    fields: optionalString(input.fields),
    formats: optionalString(input.formats),
  });
}

function normalizeGhostSiteUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "siteUrl is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "siteUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ProviderRequestError(400, "siteUrl must use http or https");
  }

  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString().replace(/\/$/u, "");
}

function ghostContentBaseUrl(siteUrl: string): string {
  return `${siteUrl}${ghostContentPathPrefix}/${ghostApiVersion}`;
}

function requireGhostContentBaseUrl(
  values: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
): string {
  const siteUrl = optionalString(values.siteUrl) ?? optionalString(metadata?.siteUrl);
  const baseUrl = optionalString(metadata?.contentBaseUrl);
  if (!siteUrl) {
    throw new ProviderRequestError(401, "Configure ghost siteUrl credentials first.");
  }

  const normalizedSiteUrl = normalizeGhostSiteUrl(siteUrl);
  const normalizedBaseUrl = ghostContentBaseUrl(normalizedSiteUrl);
  if (baseUrl && baseUrl !== normalizedBaseUrl) {
    throw new ProviderRequestError(400, "ghost contentBaseUrl metadata is invalid");
  }
  return normalizedBaseUrl;
}

async function readGhostPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new ProviderRequestError(502, "Ghost response was not valid JSON", error);
    }
    return {
      message: text,
    };
  }
}

function createGhostError(
  status: number,
  payload: unknown,
  phase: GhostRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  if (status === 401 || status === 403 || phase === "validate") {
    return new ProviderRequestError(400, ghostErrorMessage(status, payload), payload);
  }
  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, ghostErrorMessage(status, payload), payload);
  }
  return new ProviderRequestError(502, ghostErrorMessage(status, payload), payload);
}

function ghostErrorMessage(status: number, payload: unknown): string {
  const record = optionalRecord(payload);
  const errors = record?.errors;
  if (Array.isArray(errors)) {
    const first = optionalRecord(errors[0]);
    const message = optionalString(first?.message);
    if (message) {
      return message;
    }
  }

  return optionalString(record?.message) ?? `Ghost request failed with ${status}`;
}
