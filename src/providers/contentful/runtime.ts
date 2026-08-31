import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const contentfulApiBaseUrl = "https://api.contentful.com";
const contentfulJsonContentType = "application/vnd.contentful.management.v1+json";

interface ContentfulRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  notFoundMessage?: string;
  invalidInputMessage?: string;
}

interface ContentfulCollectionShape {
  items: unknown[];
  total: number;
  skip: number;
  limit: number;
  includes?: Record<string, unknown>;
}

type ContentfulActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const contentfulActionHandlers: ProviderActionHandlers<"contentful", ContentfulActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_spaces(input, context) {
    return listSpaces(input, context);
  },
  list_environments(input, context) {
    return listEnvironments(input, context);
  },
  list_content_types(input, context) {
    return listContentTypes(input, context);
  },
  list_entries(input, context) {
    return listEntries(input, context);
  },
  get_entry(input, context) {
    return getEntry(input, context);
  },
  create_entry(input, context) {
    return createEntry(input, context);
  },
  update_entry(input, context) {
    return updateEntry(input, context);
  },
};

export async function validateContentfulCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestContentfulJson({
    path: "/users/me",
    apiKey,
    fetcher,
    signal,
    invalidInputMessage: "invalid Contentful personal access token",
  });

  const user = requiredResponseRecord(payload, "Contentful user profile");
  const sys = requiredResponseRecord(user.sys, "Contentful user sys");
  const userId = optionalString(sys.id);
  if (!userId) {
    throw new ProviderRequestError(502, "Contentful user profile must include sys.id");
  }

  const email = optionalString(user.email);
  const firstName = optionalString(user.firstName);
  const lastName = optionalString(user.lastName);
  const accountLabel =
    email ??
    [firstName, lastName]
      .filter((value) => value !== undefined)
      .join(" ")
      .trim() ??
    userId;

  return {
    profile: {
      accountId: userId,
      displayName: accountLabel || userId,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      userId,
      email,
      firstName,
      lastName,
      activated: optionalBoolean(user.activated),
      confirmed: optionalBoolean(user.confirmed),
      signInCount: optionalInteger(user.signInCount),
      avatarUrl: optionalString(user.avatarUrl),
      apiBaseUrl: contentfulApiBaseUrl,
      validationEndpoint: "/users/me",
    }),
  };
}

async function getCurrentUser(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const user = await requestContentfulJson({
    path: "/users/me",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { user };
}

async function listSpaces(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestContentfulJson({
    path: "/spaces",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      skip: optionalInteger(input.skip),
      limit: optionalInteger(input.limit),
      order: optionalString(input.order),
    }),
  });

  const collection = parseCollectionPayload(payload, "Contentful spaces");
  return {
    spaces: collection.items,
    total: collection.total,
    skip: collection.skip,
    limit: collection.limit,
  };
}

async function listEnvironments(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const spaceId = requiredInputString(input.spaceId, "spaceId");
  const payload = await requestContentfulJson({
    path: `/spaces/${encodeURIComponent(spaceId)}/environments`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  const collection = parseCollectionPayload(payload, "Contentful environments");
  return {
    environments: collection.items,
    total: collection.total,
    skip: collection.skip,
    limit: collection.limit,
  };
}

async function listContentTypes(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const spaceId = requiredInputString(input.spaceId, "spaceId");
  const environmentId = requiredInputString(input.environmentId, "environmentId");
  const payload = await requestContentfulJson({
    path: `/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environmentId)}/content_types`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      skip: optionalInteger(input.skip),
      limit: optionalInteger(input.limit),
      order: optionalString(input.order),
    }),
  });

  const collection = parseCollectionPayload(payload, "Contentful content types");
  return {
    contentTypes: collection.items,
    total: collection.total,
    skip: collection.skip,
    limit: collection.limit,
  };
}

async function listEntries(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const spaceId = requiredInputString(input.spaceId, "spaceId");
  const environmentId = requiredInputString(input.environmentId, "environmentId");
  const payload = await requestContentfulJson({
    path: `/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environmentId)}/entries`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      content_type: optionalString(input.contentType),
      query: optionalString(input.query),
      locale: optionalString(input.locale),
      select: optionalString(input.select),
      include: optionalInteger(input.include),
      skip: optionalInteger(input.skip),
      limit: optionalInteger(input.limit),
      order: optionalString(input.order),
    }),
  });

  const collection = parseCollectionPayload(payload, "Contentful entries");
  return compactObject({
    entries: collection.items,
    total: collection.total,
    skip: collection.skip,
    limit: collection.limit,
    includes: collection.includes,
  });
}

async function getEntry(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const spaceId = requiredInputString(input.spaceId, "spaceId");
  const environmentId = requiredInputString(input.environmentId, "environmentId");
  const entryId = requiredInputString(input.entryId, "entryId");
  const entry = await requestContentfulJson({
    path: `/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environmentId)}/entries/${encodeURIComponent(entryId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    notFoundMessage: `Contentful entry not found: ${entryId}`,
  });
  return { entry };
}

async function createEntry(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const spaceId = requiredInputString(input.spaceId, "spaceId");
  const environmentId = requiredInputString(input.environmentId, "environmentId");
  const contentType = requiredInputString(input.contentType, "contentType");
  const entry = await requestContentfulJson({
    path: `/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environmentId)}/entries`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "POST",
    extraHeaders: {
      "x-contentful-content-type": contentType,
    },
    body: compactObject({
      fields: requiredResponseRecord(input.fields, "Contentful entry fields"),
      metadata: optionalRecord(input.metadata),
    }),
  });
  return { entry };
}

async function updateEntry(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const spaceId = requiredInputString(input.spaceId, "spaceId");
  const environmentId = requiredInputString(input.environmentId, "environmentId");
  const entryId = requiredInputString(input.entryId, "entryId");
  const contentType = requiredInputString(input.contentType, "contentType");
  const version = optionalInteger(input.version);
  if (version === undefined || version <= 0) {
    throw new ProviderRequestError(400, "version must be a positive integer");
  }
  const entry = await requestContentfulJson({
    path: `/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environmentId)}/entries/${encodeURIComponent(entryId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "PUT",
    extraHeaders: {
      "x-contentful-content-type": contentType,
      "x-contentful-version": String(version),
    },
    body: compactObject({
      fields: requiredResponseRecord(input.fields, "Contentful entry fields"),
      metadata: optionalRecord(input.metadata),
    }),
  });
  return { entry };
}

async function requestContentfulJson(input: ContentfulRequestInput): Promise<unknown> {
  const url = new URL(input.path, contentfulApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: buildContentfulHeaders(input.apiKey, input.extraHeaders, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Contentful request failed: ${error.message}` : "Contentful request failed",
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw createContentfulError(response, payload, input.notFoundMessage, input.invalidInputMessage);
  }
  return payload;
}

function buildContentfulHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
  includeJsonContentType = false,
): Record<string, string> {
  return compactObject({
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    accept: contentfulJsonContentType,
    "content-type": includeJsonContentType ? contentfulJsonContentType : undefined,
    ...extraHeaders,
  }) as Record<string, string>;
}

function createContentfulError(
  response: Response,
  payload: unknown,
  notFoundMessage?: string,
  invalidInputMessage?: string,
): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.message);
  if (response.status === 404 && notFoundMessage) {
    return new ProviderRequestError(400, notFoundMessage);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message ?? "invalid Contentful request");
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(400, invalidInputMessage ?? message ?? "invalid Contentful credential");
  }
  return new ProviderRequestError(
    response.status,
    message ?? `Contentful request failed with status ${response.status}`,
    payload,
  );
}

function parseCollectionPayload(payload: unknown, label: string): ContentfulCollectionShape {
  const record = requiredResponseRecord(payload, label);
  if (!Array.isArray(record.items)) {
    throw new ProviderRequestError(502, `${label} response must include an items array`);
  }
  return {
    items: record.items,
    total: optionalInteger(record.total) ?? record.items.length,
    skip: optionalInteger(record.skip) ?? 0,
    limit: optionalInteger(record.limit) ?? record.items.length,
    includes: optionalRecord(record.includes),
  };
}
