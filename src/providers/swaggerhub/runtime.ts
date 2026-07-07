import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { SwaggerHubActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const swaggerhubApiOrigin: string = "https://api.swaggerhub.com";
const swaggerhubValidationPath = "/apis";

type SwaggerhubPhase = "validate" | "execute";
type SwaggerhubResponseType = "json" | "text";
type SwaggerhubActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const swaggerhubActionHandlers: Record<SwaggerHubActionName, SwaggerhubActionHandler> = {
  search_registry_specs(input, context) {
    return getRegistryListing(context, "/specs", buildSearchQuery(input));
  },
  search_apis(input, context) {
    return getRegistryListing(context, "/apis", buildSearchQuery(input));
  },
  list_owner_apis(input, context) {
    return getRegistryListing(
      context,
      `/apis/${encodeURIComponent(requireInputString(input.owner, "owner"))}`,
      buildOwnerListingQuery(input),
    );
  },
  list_api_versions(input, context) {
    return getRegistryListing(
      context,
      `/apis/${encodeURIComponent(requireInputString(input.owner, "owner"))}/${encodeURIComponent(
        requireInputString(input.apiName, "apiName"),
      )}`,
    );
  },
  get_api_definition(input, context) {
    const owner = encodeURIComponent(requireInputString(input.owner, "owner"));
    const apiName = encodeURIComponent(requireInputString(input.apiName, "apiName"));
    const version = encodeURIComponent(requireInputString(input.version, "version"));
    const format = readDefinitionFormat(input.format);
    return getDefinition(context, {
      path:
        format === "yaml"
          ? `/apis/${owner}/${apiName}/${version}/swagger.yaml`
          : `/apis/${owner}/${apiName}/${version}/swagger.json`,
      query: compactObject({
        resolved: optionalBoolean(input.resolved),
        flatten: optionalBoolean(input.flatten),
      }),
      format,
    });
  },
  search_domains(input, context) {
    return getRegistryListing(context, "/domains", buildSearchQuery(input));
  },
  list_owner_domains(input, context) {
    return getRegistryListing(
      context,
      `/domains/${encodeURIComponent(requireInputString(input.owner, "owner"))}`,
      buildOwnerListingQuery(input),
    );
  },
  list_domain_versions(input, context) {
    return getRegistryListing(
      context,
      `/domains/${encodeURIComponent(requireInputString(input.owner, "owner"))}/${encodeURIComponent(
        requireInputString(input.domainName, "domainName"),
      )}`,
    );
  },
  get_domain_definition(input, context) {
    const owner = encodeURIComponent(requireInputString(input.owner, "owner"));
    const domainName = encodeURIComponent(requireInputString(input.domainName, "domainName"));
    const version = encodeURIComponent(requireInputString(input.version, "version"));
    const format = readDefinitionFormat(input.format);
    return getDefinition(context, {
      path:
        format === "yaml"
          ? `/domains/${owner}/${domainName}/${version}/domain.yaml`
          : `/domains/${owner}/${domainName}/${version}/domain.json`,
      format,
    });
  },
  async list_templates(input, context) {
    const { payload } = await requestSwaggerhubPayload<unknown>({
      ...context,
      path: "/templates",
      query: compactObject({ owner: optionalString(input.owner) }),
      phase: "execute",
      responseType: "json",
    });
    return { templates: extractTemplateSummaries(payload), raw: payload };
  },
  list_template_versions(input, context) {
    return getRegistryListing(
      context,
      `/templates/${encodeURIComponent(requireInputString(input.owner, "owner"))}/${encodeURIComponent(
        requireInputString(input.templateId, "templateId"),
      )}`,
    );
  },
  get_template_definition(input, context) {
    const owner = encodeURIComponent(requireInputString(input.owner, "owner"));
    const templateId = encodeURIComponent(requireInputString(input.templateId, "templateId"));
    const version = encodeURIComponent(requireInputString(input.version, "version"));
    const format = readDefinitionFormat(input.format);
    return getDefinition(context, {
      path: `/templates/${owner}/${templateId}/${version}`,
      query: compactObject({ flatten: optionalBoolean(input.flatten) }),
      format,
      accept: format === "yaml" ? "application/yaml" : "application/json",
    });
  },
  async list_projects(input, context) {
    const owner = encodeURIComponent(requireInputString(input.owner, "owner"));
    const { payload } = await requestSwaggerhubPayload<unknown>({
      ...context,
      path: `/projects/${owner}`,
      query: compactObject({
        nameOnly: optionalBoolean(input.nameOnly),
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        order: optionalString(input.order),
      }),
      phase: "execute",
      responseType: "json",
    });
    const listing = requireObjectPayload(payload, "SwaggerHub project listing response");
    return { listing, projects: extractObjectArray(listing.projects) };
  },
  async get_project(input, context) {
    const owner = encodeURIComponent(requireInputString(input.owner, "owner"));
    const projectId = encodeURIComponent(requireInputString(input.projectId, "projectId"));
    const { payload } = await requestSwaggerhubPayload<unknown>({
      ...context,
      path: `/projects/${owner}/${projectId}`,
      phase: "execute",
      responseType: "json",
    });
    return { project: requireObjectPayload(payload, "SwaggerHub project response") };
  },
};

export async function validateSwaggerhubCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { payload } = await requestSwaggerhubPayload<unknown>({
    apiKey: input.apiKey,
    fetcher,
    signal,
    path: swaggerhubValidationPath,
    query: { limit: 1 },
    phase: "validate",
    responseType: "json",
  });
  const listing = requireObjectPayload(payload, "SwaggerHub validation response");
  return {
    profile: {
      accountId: "swaggerhub",
      displayName: "SwaggerHub API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: swaggerhubApiOrigin,
      validationEndpoint: "/apis?limit=1",
      listingName: optionalString(listing.name),
      totalCount: optionalInteger(listing.totalCount),
    },
  };
}

async function getRegistryListing(
  context: ApiKeyProviderContext,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  const { payload } = await requestSwaggerhubPayload<unknown>({
    ...context,
    path,
    query,
    phase: "execute",
    responseType: "json",
  });
  const listing = requireObjectPayload(payload, "SwaggerHub registry listing response");
  return { listing, items: extractObjectArray(listing.apis) };
}

async function getDefinition(
  context: ApiKeyProviderContext,
  input: {
    path: string;
    format: "json" | "yaml";
    query?: Record<string, string | number | boolean | undefined>;
    accept?: string;
  },
) {
  const { payload, contentType } = await requestSwaggerhubPayload<unknown>({
    ...context,
    path: input.path,
    query: input.query,
    phase: "execute",
    responseType: input.format === "yaml" ? "text" : "json",
    accept: input.accept,
  });
  return {
    format: input.format,
    contentType,
    definition:
      input.format === "yaml"
        ? typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2)
        : requireObjectPayload(payload, "SwaggerHub definition response"),
  };
}

async function requestSwaggerhubPayload<T>(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: SwaggerhubPhase;
  responseType: SwaggerhubResponseType;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
  accept?: string;
}): Promise<{ payload: T; contentType: string | null }> {
  const url = new URL(input.path, swaggerhubApiOrigin);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      headers: swaggerhubHeaders(input.apiKey, input.accept),
      signal: input.signal,
    });
  } catch (error) {
    throw wrapSwaggerhubTransportError(error, input.phase, "request");
  }

  let payload: unknown;
  try {
    payload = await readSwaggerhubPayload(response, input.responseType);
  } catch (error) {
    throw wrapSwaggerhubTransportError(error, input.phase, "response parsing");
  }

  if (!response.ok) throw createSwaggerhubError(response, payload);
  return { payload: payload as T, contentType: response.headers.get("content-type") };
}

function swaggerhubHeaders(apiKey: string, accept?: string): Record<string, string> {
  return {
    accept: accept ?? "application/json",
    authorization: apiKey,
    "user-agent": providerUserAgent,
  };
}

async function readSwaggerhubPayload(response: Response, responseType: SwaggerhubResponseType): Promise<unknown> {
  const text = await response.text();
  if (!text) return responseType === "text" ? "" : null;
  if (responseType === "text") return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSwaggerhubError(response: Response, payload: unknown): ProviderRequestError {
  const message = readSwaggerhubErrorMessage(payload) ?? `swaggerhub request failed with status ${response.status}`;
  if ([400, 401, 403, 404].includes(response.status))
    return new ProviderRequestError(response.status, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function wrapSwaggerhubTransportError(error: unknown, phase: SwaggerhubPhase, step: "request" | "response parsing") {
  const action = phase === "validate" ? "validate the SwaggerHub API key" : "execute the SwaggerHub request";
  return new ProviderRequestError(
    502,
    `Failed to ${action} during ${step}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function readSwaggerhubErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const direct =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.description) ??
    optionalString(record.detail);
  if (direct) return direct;
  if (!Array.isArray(record.errors)) return undefined;
  const messages = record.errors
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const child = optionalRecord(item);
      return child
        ? (optionalString(child.message) ?? optionalString(child.error) ?? optionalString(child.description))
        : undefined;
    })
    .filter((value): value is string => Boolean(value));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}

function extractObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function extractTemplateSummaries(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return extractObjectArray(payload);
  const record = optionalRecord(payload);
  if (!record) return [];
  for (const key of ["templates", "items", "data", "results"]) {
    if (Array.isArray(record[key])) return extractObjectArray(record[key]);
  }
  if (
    optionalString(record.id) ||
    optionalString(record.title) ||
    optionalString(record.specification) ||
    optionalString(record.defaultVersion)
  ) {
    return [record];
  }
  return [];
}

function buildSearchQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    query: optionalString(input.query),
    state: optionalString(input.state),
    page: optionalInteger(input.page),
    limit: optionalInteger(input.limit),
    sort: optionalString(input.sort),
    order: optionalString(input.order),
  });
}

function buildOwnerListingQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    page: optionalInteger(input.page),
    limit: optionalInteger(input.limit),
    sort: optionalString(input.sort),
    order: optionalString(input.order),
  });
}

function requireInputString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function readDefinitionFormat(value: unknown): "json" | "yaml" {
  return value === "yaml" ? "yaml" : "json";
}
