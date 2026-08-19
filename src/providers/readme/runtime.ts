import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ReadMeActionName } from "./actions.ts";

import { compactObject, optionalRecord, requiredRecord } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const readmeApiBaseUrl = "https://dash.readme.com/api/v1";
const validationPath = "/";

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "ReadMe payload", (message) => new ProviderRequestError(502, message));
}
const asOptionalObject = optionalRecord;

type ReadMeRequestMode = "validate" | "execute";

type ReadMeActionHandler = (context: ReadMeContext) => Promise<Record<string, unknown>>;

interface ReadMeContext {
  apiKey: string;
  fetcher: typeof fetch;
  input: Record<string, unknown>;
}

interface ReadMeRequestOptions {
  apiKey: string;
  fetcher: typeof fetch;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
  mode: ReadMeRequestMode;
  query?: Record<string, string | number | undefined>;
  version?: string;
  body?: Record<string, unknown>;
  expectNoContent?: boolean;
}

export const readmeActionHandlers: ProviderActionHandlers<"readme", ReadMeActionHandler> = {
  get_project: async (context) => ({
    project: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/",
      mode: "execute",
    }),
  }),
  list_versions: async (context) => {
    const payload = await requestReadMeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/version",
      mode: "execute",
    });
    return {
      versions: normalizeArrayPayload(payload),
      raw: payload,
    };
  },
  get_version: async (context) => ({
    version: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/version/${encodeURIComponent(String(context.input.versionId))}`,
      mode: "execute",
    }),
  }),
  create_version: async (context) => ({
    version: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/version",
      mode: "execute",
      body: omitKeys(context.input),
    }),
  }),
  update_version: async (context) => ({
    version: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/version/${encodeURIComponent(String(context.input.versionId))}`,
      mode: "execute",
      body: omitKeys(context.input, "versionId"),
    }),
  }),
  delete_version: async (context) =>
    deleteReadMeResource({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/version/${encodeURIComponent(String(context.input.versionId))}`,
    }),
  list_categories: async (context) => {
    const response = await requestReadMeJsonWithResponse({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/categories",
      mode: "execute",
      query: paginationQuery(context.input),
      version: optionalNonEmptyString(context.input.version),
    });
    return compactObject({
      categories: normalizeArrayPayload(response.payload),
      ...paginationMetadata(response.response),
    });
  },
  create_category: async (context) => ({
    category: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/categories",
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
      body: omitKeys(context.input, "version"),
    }),
  }),
  get_category: async (context) => ({
    category: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/categories/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
    }),
  }),
  update_category: async (context) => ({
    category: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/categories/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
      body: omitKeys(context.input, "slug", "version"),
    }),
  }),
  delete_category: async (context) =>
    deleteReadMeResource({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/categories/${encodeURIComponent(String(context.input.slug))}`,
      version: optionalNonEmptyString(context.input.version),
    }),
  list_category_docs: async (context) => {
    const payload = await requestReadMeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/categories/${encodeURIComponent(String(context.input.slug))}/docs`,
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
    });
    return {
      docs: normalizeArrayPayload(payload),
      raw: payload,
    };
  },
  search_docs: async (context) => {
    const payload = await requestReadMeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/docs/search",
      mode: "execute",
      query: {
        search: String(context.input.search),
      },
      version: optionalNonEmptyString(context.input.version),
    });
    return {
      results: normalizeArrayPayload(payload),
      raw: payload,
    };
  },
  create_doc: async (context) => ({
    doc: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/docs",
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
      body: omitKeys(context.input, "version"),
    }),
  }),
  get_doc: async (context) => ({
    doc: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: docPath(context.input),
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
    }),
  }),
  update_doc: async (context) => ({
    doc: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/docs/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
      version: optionalNonEmptyString(context.input.version),
      body: omitKeys(context.input, "slug", "version"),
    }),
  }),
  delete_doc: async (context) =>
    deleteReadMeResource({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/docs/${encodeURIComponent(String(context.input.slug))}`,
      version: optionalNonEmptyString(context.input.version),
    }),
  list_custom_pages: async (context) => {
    const response = await requestReadMeJsonWithResponse({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/custompages",
      mode: "execute",
      query: paginationQuery(context.input),
    });
    return compactObject({
      customPages: normalizeArrayPayload(response.payload),
      ...paginationMetadata(response.response),
    });
  },
  create_custom_page: async (context) => ({
    customPage: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/custompages",
      mode: "execute",
      body: omitKeys(context.input),
    }),
  }),
  get_custom_page: async (context) => ({
    customPage: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/custompages/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
    }),
  }),
  update_custom_page: async (context) => ({
    customPage: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/custompages/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
      body: omitKeys(context.input, "slug"),
    }),
  }),
  delete_custom_page: async (context) =>
    deleteReadMeResource({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/custompages/${encodeURIComponent(String(context.input.slug))}`,
    }),
  list_changelogs: async (context) => {
    const response = await requestReadMeJsonWithResponse({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/changelogs",
      mode: "execute",
      query: paginationQuery(context.input),
    });
    return compactObject({
      changelogs: normalizeArrayPayload(response.payload),
      ...paginationMetadata(response.response),
    });
  },
  create_changelog: async (context) => ({
    changelog: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/changelogs",
      mode: "execute",
      body: omitKeys(context.input),
    }),
  }),
  get_changelog: async (context) => ({
    changelog: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/changelogs/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
    }),
  }),
  update_changelog: async (context) => ({
    changelog: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PUT",
      path: `/changelogs/${encodeURIComponent(String(context.input.slug))}`,
      mode: "execute",
      body: omitKeys(context.input, "slug"),
    }),
  }),
  delete_changelog: async (context) =>
    deleteReadMeResource({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/changelogs/${encodeURIComponent(String(context.input.slug))}`,
    }),
  list_api_specifications: async (context) => {
    const response = await requestReadMeJsonWithResponse({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/api-specification",
      mode: "execute",
      query: paginationQuery(context.input),
      version: optionalNonEmptyString(context.input.version),
    });
    return compactObject({
      apiSpecifications: normalizeArrayPayload(response.payload),
      raw: response.payload,
      ...paginationMetadata(response.response),
    });
  },
  delete_api_specification: async (context) =>
    deleteReadMeResource({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/api-specification/${encodeURIComponent(String(context.input.id))}`,
    }),
  get_api_registry: async (context) => ({
    registry: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `/api-registry/${encodeURIComponent(String(context.input.uuid))}`,
      mode: "execute",
    }),
  }),
  get_openapi_schema: async (context) => ({
    schema: await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/schema",
      mode: "execute",
    }),
  }),
  list_outbound_ips: async (context) => ({
    outboundIps: normalizeArrayPayload(
      await requestReadMeJson({
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        path: "/outbound-ips",
        mode: "execute",
      }),
    ),
  }),
  ask_owlbot: async (context) => {
    const payload = await requestReadMeObject({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      path: "/owlbot/ask",
      mode: "execute",
      body: {
        question: context.input.question,
        stream: false,
      },
    });
    return {
      answer: typeof payload.answer === "string" ? payload.answer : undefined,
      sources: Array.isArray(payload.sources) ? payload.sources : undefined,
      raw: payload,
    };
  },
};

export async function validateReadMeCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  const project = await requestReadMeObject({
    apiKey,
    fetcher,
    path: validationPath,
    mode: "validate",
  });

  const name = typeof project.name === "string" ? project.name : undefined;
  const subdomain = typeof project.subdomain === "string" ? project.subdomain : undefined;

  return {
    profile: {
      accountId: subdomain ?? "readme",
      displayName: name ?? subdomain ?? "ReadMe API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: readmeApiBaseUrl,
      projectName: name,
      subdomain,
      baseUrl: typeof project.baseUrl === "string" ? project.baseUrl : undefined,
    }),
  };
}

export async function executeReadMeAction(
  input: { apiKey: string; actionName: ReadMeActionName; input: Record<string, unknown> },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = readmeActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown readme action: ${input.actionName}`);
  }

  return handler({
    apiKey: input.apiKey,
    fetcher,
    input: input.input,
  });
}

function docPath(input: Record<string, unknown>) {
  const base = `/docs/${encodeURIComponent(String(input.slug))}`;
  return input.production === true ? `${base}/production` : base;
}

function paginationQuery(input: Record<string, unknown>) {
  return {
    perPage: optionalNumber(input.perPage),
    page: optionalNumber(input.page),
  };
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function optionalNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function requestReadMeObject(options: ReadMeRequestOptions) {
  const payload = await requestReadMeJson(options);
  return asObject(payload);
}

async function requestReadMeJson(options: ReadMeRequestOptions) {
  return (await requestReadMeJsonWithResponse(options)).payload;
}

async function requestReadMeJsonWithResponse(options: ReadMeRequestOptions) {
  const url = new URL(`${readmeApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = compactObject<Record<string, string | undefined>>({
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${options.apiKey}:`).toString("base64")}`,
    "Content-Type": options.body ? "application/json" : undefined,
    "User-Agent": providerUserAgent,
    "x-readme-version": options.version,
  }) as Record<string, string>;

  let response: Response;
  try {
    response = await options.fetcher(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw buildReadMeTransportError(error);
  }

  if (!response.ok) {
    throw await buildReadMeError(response, options.mode);
  }

  if (options.expectNoContent || response.status === 204) {
    return { payload: { deleted: true }, response };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProviderRequestError(502, "ReadMe returned a non-JSON response");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "ReadMe returned invalid JSON response");
  }

  return { payload, response };
}

async function deleteReadMeResource(options: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  version?: string;
}) {
  const response = await requestReadMeJsonWithResponse({
    ...options,
    method: "DELETE",
    mode: "execute",
    expectNoContent: true,
  });
  return asObject(response.payload);
}

function omitKeys(input: Record<string, unknown>, ...keys: string[]) {
  const omitted = new Set(keys);
  return compactObject(Object.fromEntries(Object.entries(input).filter(([key]) => !omitted.has(key))));
}

function normalizeArrayPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const object = asOptionalObject(payload);
  const data = object?.data;
  if (Array.isArray(data)) {
    return data;
  }

  throw new ProviderRequestError(502, "ReadMe returned an unexpected list response");
}

function paginationMetadata(response: Response) {
  const totalCountHeader = response.headers.get("x-total-count");
  const totalCount = totalCountHeader ? Number(totalCountHeader) : undefined;
  return compactObject({
    link: response.headers.get("link") ?? undefined,
    totalCount: Number.isInteger(totalCount) ? totalCount : undefined,
  });
}

async function buildReadMeError(response: Response, mode: ReadMeRequestMode) {
  const status = response.status;
  const message = await readReadMeErrorMessage(response, status);

  if (status === 401 || status === 403) {
    if (mode === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(401, message);
  }

  if (status === 404) {
    return new ProviderRequestError(404, message);
  }

  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(502, message);
}

async function readReadMeErrorMessage(response: Response, status: number) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => undefined);
    const body = asOptionalObject(payload);
    const message = body?.message ?? body?.error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } else {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  }

  return `ReadMe request failed with status ${status}`;
}

function buildReadMeTransportError(error: unknown) {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "ReadMe request failed";
  return new ProviderRequestError(502, message);
}
