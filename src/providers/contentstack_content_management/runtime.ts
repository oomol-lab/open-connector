import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const contentstackContentManagementApiBaseUrl = "https://api.contentstack.io/v3";
const contentstackContentManagementRequestBaseUrl = `${contentstackContentManagementApiBaseUrl}/`;

type ContentstackPhase = "validate" | "execute";

interface ContentstackContentManagementContext {
  managementToken: string;
  stackApiKey?: unknown;
  branch?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ContentstackActionHandler = (
  input: Record<string, unknown>,
  context: ContentstackContentManagementContext,
) => Promise<unknown>;

export const contentstackContentManagementActionHandlers: ProviderActionHandlers<
  "contentstack_content_management",
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
  create_entry(input, context) {
    return executeCreateEntry(input, context);
  },
  update_entry(input, context) {
    return executeUpdateEntry(input, context);
  },
};

export async function validateContentstackContentManagementCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const managementToken = requiredString(input.apiKey, "apiKey", providerInputError);
  const stackApiKey = requireStackApiKey(input);
  const branch = optionalString(input.branch);
  const payload = await requestContentstackJson({
    path: "/content_types",
    managementToken,
    stackApiKey,
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
        "Contentstack Management Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: contentstackContentManagementApiBaseUrl,
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
  context: ContentstackContentManagementContext,
): Promise<Record<string, unknown>> {
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    method: "GET",
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
  context: ContentstackContentManagementContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requireProviderString(input.contentTypeUid, "contentTypeUid");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    method: "GET",
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
  context: ContentstackContentManagementContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requireProviderString(input.contentTypeUid, "contentTypeUid");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    method: "GET",
    path: `/content_types/${encodeURIComponent(contentTypeUid)}/entries`,
    query: buildQuery(input, [
      ["locale", "locale"],
      ["query", "query"],
      ["limit", "limit"],
      ["skip", "skip"],
      ["include_count", "includeCount"],
      ["include_branch", "includeBranch"],
    ]),
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
  context: ContentstackContentManagementContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requireProviderString(input.contentTypeUid, "contentTypeUid");
  const entryUid = requireProviderString(input.entryUid, "entryUid");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    method: "GET",
    path: `/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`,
    query: buildQuery(input, [
      ["locale", "locale"],
      ["include_branch", "includeBranch"],
    ]),
  });
  const record = requireRecord(payload, "Contentstack entry response");
  return {
    entry: requireRecord(record.entry, "Contentstack entry"),
    raw: record,
  };
}

async function executeCreateEntry(
  input: Record<string, unknown>,
  context: ContentstackContentManagementContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requireProviderString(input.contentTypeUid, "contentTypeUid");
  const entry = requireRecord(input.entry, "Contentstack entry input");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    method: "POST",
    path: `/content_types/${encodeURIComponent(contentTypeUid)}/entries`,
    query: buildQuery(input, [["locale", "locale"]]),
    body: { entry },
  });
  const record = requireRecord(payload, "Contentstack entry response");
  return {
    entry: requireRecord(record.entry, "Contentstack entry"),
    raw: record,
  };
}

async function executeUpdateEntry(
  input: Record<string, unknown>,
  context: ContentstackContentManagementContext,
): Promise<Record<string, unknown>> {
  const contentTypeUid = requireProviderString(input.contentTypeUid, "contentTypeUid");
  const entryUid = requireProviderString(input.entryUid, "entryUid");
  const entry = requireRecord(input.entry, "Contentstack entry input");
  const payload = await requestContentstackJsonForAction({
    input,
    context,
    method: "PUT",
    path: `/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`,
    query: buildQuery(input, [["locale", "locale"]]),
    body: { entry },
  });
  const record = requireRecord(payload, "Contentstack entry response");
  return {
    entry: requireRecord(record.entry, "Contentstack entry"),
    raw: record,
  };
}

async function requestContentstackJsonForAction(input: {
  input: Record<string, unknown>;
  context: ContentstackContentManagementContext;
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return requestContentstackJson({
    path: input.path,
    method: input.method,
    managementToken: input.context.managementToken,
    stackApiKey: requireStoredStackApiKey(input.context),
    branch: optionalString(input.input.branch) ?? optionalString(input.context.branch),
    query: input.query,
    body: input.body,
    phase: "execute",
    fetcher: input.context.fetcher,
    signal: input.context.signal,
  });
}

async function requestContentstackJson(input: {
  path: string;
  method?: string;
  managementToken: string;
  stackApiKey: string;
  branch?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: ContentstackPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(buildContentstackUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildContentstackHeaders(input.managementToken, input.stackApiKey, input.branch),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readContentstackPayload(response);
    if (!response.ok) {
      throw createContentstackError(response.status, payload, input.phase);
    }
    return requireRecord(payload, "Contentstack response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Contentstack Content Management request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Contentstack Content Management request failed: ${error.message}`
        : "Contentstack Content Management request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildContentstackUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, contentstackContentManagementRequestBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildContentstackHeaders(
  managementToken: string,
  stackApiKey: string,
  branch?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: managementToken,
    api_key: stackApiKey,
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
    throw new ProviderRequestError(502, "Contentstack Content Management returned invalid JSON");
  }
}

function createContentstackError(status: number, payload: unknown, phase: ContentstackPhase): ProviderRequestError {
  const message =
    extractContentstackErrorMessage(payload) ?? `Contentstack Content Management request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractContentstackErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error_message) ?? optionalString(record.message) ?? optionalString(record.error);
}

function requireStoredStackApiKey(input: ContentstackContentManagementContext): string {
  const stackApiKey = optionalString(input.stackApiKey);
  if (!stackApiKey) {
    throw new ProviderRequestError(400, "Contentstack Stack API Key is required");
  }
  return stackApiKey;
}

function requireStackApiKey(input: Record<string, string>): string {
  const stackApiKey = optionalString(input.stackApiKey);
  if (!stackApiKey) {
    throw new ProviderRequestError(400, "Contentstack Stack API Key is required");
  }
  return stackApiKey;
}

function requireProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return record;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
