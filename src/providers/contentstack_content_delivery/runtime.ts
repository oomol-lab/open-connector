import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const contentstackContentDeliveryApiBaseUrl = "https://cdn.contentstack.io/v3";
const contentstackContentDeliveryRequestBaseUrl = `${contentstackContentDeliveryApiBaseUrl}/`;

type ContentstackPhase = "validate" | "execute";

interface ContentstackContentDeliveryContext {
  stackApiKey: string;
  deliveryToken?: unknown;
  branch?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ContentstackActionHandler = (
  input: Record<string, unknown>,
  context: ContentstackContentDeliveryContext,
) => Promise<unknown>;

export const contentstackContentDeliveryActionHandlers: ProviderActionHandlers<
  "contentstack_content_delivery",
  ContentstackActionHandler
> = {
  list_content_types(input, context) {
    return executeListContentTypes(input, context);
  },
  get_content_type(input, context) {
    return executeGetContentType(input, context);
  },
  list_entries(input, context) {
    return executeListEntries(input, context);
  },
  get_entry(input, context) {
    return executeGetEntry(input, context);
  },
  list_assets(input, context) {
    return executeListAssets(input, context);
  },
};

export async function validateContentstackContentDeliveryCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const stackApiKey = requiredString(input.apiKey, "apiKey", providerInputError);
  const deliveryToken = requireDeliveryToken(input);
  const branch = optionalString(input.branch);
  const payload = await requestContentstackJson({
    path: "/content_types",
    stackApiKey,
    deliveryToken,
    branch,
    query: {
      limit: "1",
      include_count: "true",
    },
    phase: "validate",
    fetcher,
    signal,
  });
  const record = requireRecord(payload, "Contentstack content types response");
  const firstContentType = optionalRecord(readArray(record.content_types)[0]);

  return {
    profile: {
      accountId: stackApiKey,
      displayName:
        optionalString(firstContentType?.title) ??
        optionalString(firstContentType?.uid) ??
        "Contentstack Delivery Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: contentstackContentDeliveryApiBaseUrl,
      validationEndpoint: "/content_types",
      branch,
      contentTypeCount: optionalInteger(record.count),
      firstContentTypeUid: optionalString(firstContentType?.uid),
      firstContentTypeTitle: optionalString(firstContentType?.title),
    }),
  };
}

async function executeListContentTypes(
  input: Record<string, unknown>,
  context: ContentstackContentDeliveryContext,
): Promise<Record<string, unknown>> {
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    path: "/content_types",
    query: buildQuery(input, [
      ["query", "query"],
      ["limit", "limit"],
      ["skip", "skip"],
      ["include_count", "includeCount"],
      ["include_branch", "includeBranch"],
      ["include_global_field_schema", "includeGlobalFieldSchema"],
    ]),
  });
  const record = requireRecord(payload, "Contentstack content types response");
  return {
    contentTypes: readArray(record.content_types).map((value) => requireRecord(value, "Contentstack content type")),
    count: optionalInteger(record.count) ?? null,
    raw: record,
  };
}

async function executeGetContentType(
  input: Record<string, unknown>,
  context: ContentstackContentDeliveryContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requiredInputString(input.contentTypeUid, "contentTypeUid");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    path: `/content_types/${encodeURIComponent(contentTypeUid)}`,
    query: buildQuery(input, [
      ["include_branch", "includeBranch"],
      ["include_global_field_schema", "includeGlobalFieldSchema"],
    ]),
  });
  const record = requireRecord(payload, "Contentstack content type response");
  return {
    contentType: requireRecord(record.content_type, "Contentstack content type"),
    raw: record,
  };
}

async function executeListEntries(
  input: Record<string, unknown>,
  context: ContentstackContentDeliveryContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requiredInputString(input.contentTypeUid, "contentTypeUid");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    path: `/content_types/${encodeURIComponent(contentTypeUid)}/entries`,
    query: buildQuery(input, [
      ["environment", "environment"],
      ["locale", "locale"],
      ["query", "query"],
      ["limit", "limit"],
      ["skip", "skip"],
      ["include_count", "includeCount"],
      ["include_metadata", "includeMetadata"],
      ["include_publish_details", "includePublishDetails"],
      ["include_fallback", "includeFallback"],
      ["include_branch", "includeBranch"],
      ["asc", "asc"],
      ["desc", "desc"],
    ]),
    arrayQuery: [
      ["only[BASE][]", readStringArray(input.includeFields)],
      ["except[BASE][]", readStringArray(input.excludeFields)],
    ],
  });
  const record = requireRecord(payload, "Contentstack entries response");
  return {
    entries: readArray(record.entries).map((value) => requireRecord(value, "Contentstack entry")),
    count: optionalInteger(record.count) ?? null,
    raw: record,
  };
}

async function executeGetEntry(
  input: Record<string, unknown>,
  context: ContentstackContentDeliveryContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requiredInputString(input.contentTypeUid, "contentTypeUid");
  const entryUid = requiredInputString(input.entryUid, "entryUid");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    path: `/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`,
    query: buildQuery(input, [
      ["environment", "environment"],
      ["locale", "locale"],
      ["query", "query"],
      ["include_metadata", "includeMetadata"],
      ["include_publish_details", "includePublishDetails"],
      ["include_fallback", "includeFallback"],
      ["include_branch", "includeBranch"],
    ]),
    arrayQuery: [
      ["only[BASE][]", readStringArray(input.includeFields)],
      ["except[BASE][]", readStringArray(input.excludeFields)],
    ],
  });
  const record = requireRecord(payload, "Contentstack entry response");
  return {
    entry: requireRecord(record.entry, "Contentstack entry"),
    raw: record,
  };
}

async function executeListAssets(
  input: Record<string, unknown>,
  context: ContentstackContentDeliveryContext,
): Promise<Record<string, unknown>> {
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    path: "/assets",
    query: buildQuery(input, [
      ["environment", "environment"],
      ["locale", "locale"],
      ["query", "query"],
      ["limit", "limit"],
      ["skip", "skip"],
      ["include_count", "includeCount"],
      ["include_metadata", "includeMetadata"],
      ["include_fallback", "includeFallback"],
      ["include_branch", "includeBranch"],
      ["include_dimension", "includeDimension"],
      ["asc", "asc"],
      ["desc", "desc"],
    ]),
  });
  const record = requireRecord(payload, "Contentstack assets response");
  return {
    assets: readArray(record.assets).map((value) => requireRecord(value, "Contentstack asset")),
    count: optionalInteger(record.count) ?? null,
    raw: record,
  };
}

async function requestContentstackJsonForAction(input: {
  input: Record<string, unknown>;
  context: ContentstackContentDeliveryContext;
  path: string;
  query?: Record<string, string | undefined>;
  arrayQuery?: ReadonlyArray<readonly [string, readonly string[] | undefined]>;
}): Promise<Record<string, unknown>> {
  return requestContentstackJson({
    path: input.path,
    stackApiKey: input.context.stackApiKey,
    deliveryToken: requireStoredDeliveryToken(input.context),
    branch: optionalString(input.input.branch) ?? optionalString(input.context.branch),
    query: input.query,
    arrayQuery: input.arrayQuery,
    phase: "execute",
    fetcher: input.context.fetcher,
    signal: input.context.signal,
  });
}

async function requestContentstackJson(input: {
  path: string;
  stackApiKey: string;
  deliveryToken: string;
  branch?: string;
  query?: Record<string, string | undefined>;
  arrayQuery?: ReadonlyArray<readonly [string, readonly string[] | undefined]>;
  phase: ContentstackPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.signal, label: "Contentstack Content Delivery" }, async (signal) => {
    const response = await input.fetcher(buildContentstackUrl(input.path, input.query, input.arrayQuery), {
      method: "GET",
      headers: buildContentstackHeaders(input.stackApiKey, input.deliveryToken, input.branch),
      signal,
    });
    const payload = await readContentstackPayload(response);
    if (!response.ok) {
      throw createContentstackError(response.status, payload, input.phase);
    }
    return requireRecord(payload, "Contentstack response");
  });
}

function buildContentstackUrl(
  path: string,
  query?: Record<string, string | undefined>,
  arrayQuery?: ReadonlyArray<readonly [string, readonly string[] | undefined]>,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, contentstackContentDeliveryRequestBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  for (const [key, values] of arrayQuery ?? []) {
    for (const value of values ?? []) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

function buildContentstackHeaders(stackApiKey: string, deliveryToken: string, branch?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    api_key: stackApiKey,
    access_token: deliveryToken,
    "user-agent": providerUserAgent,
  };
  if (branch) {
    headers.branch = branch;
  }
  return headers;
}

function buildQuery(
  input: Record<string, unknown>,
  pairs: ReadonlyArray<readonly [string, string]>,
): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {};
  for (const [queryName, inputName] of pairs) {
    const value = input[inputName];
    if (value !== undefined) {
      query[queryName] = serializeQueryValue(value);
    }
  }
  return query;
}

function serializeQueryValue(value: unknown): string | undefined {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (optionalRecord(value)) {
    return JSON.stringify(value);
  }
  return undefined;
}

async function readContentstackPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Contentstack Content Delivery returned invalid JSON");
  }
}

function createContentstackError(status: number, payload: unknown, phase: ContentstackPhase): ProviderRequestError {
  const message =
    extractContentstackErrorMessage(payload) ?? `Contentstack Content Delivery request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractContentstackErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.error_message) ??
    optionalString(record.error_code) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function requireDeliveryToken(input: Record<string, string>): string {
  const deliveryToken = optionalString(input.deliveryToken);
  if (!deliveryToken) {
    throw new ProviderRequestError(400, "Contentstack Delivery Token is required");
  }
  return deliveryToken;
}

function requireStoredDeliveryToken(input: ContentstackContentDeliveryContext): string {
  const deliveryToken = optionalString(input.deliveryToken);
  if (deliveryToken) {
    return deliveryToken;
  }
  throw new ProviderRequestError(400, "Contentstack Content Delivery credential is missing deliveryToken");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not a JSON object`);
  }
  return record;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}
