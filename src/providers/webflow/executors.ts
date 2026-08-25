import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import { defineBearerProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "webflow";
const webflowApiBaseUrl = "https://api.webflow.com/v2";

type WebflowRequestPhase = "validate" | "execute";
type WebflowActionHandler = ProviderRuntimeHandler<BearerProviderContext>;

const webflowActionHandlers: ProviderActionHandlers<"webflow", WebflowActionHandler> = {
  list_sites(_input, context): Promise<unknown> {
    return executeListSites(context);
  },
  get_site(input, context): Promise<unknown> {
    return executeGetSite(input, context);
  },
  publish_site(input, context): Promise<unknown> {
    return executePublishSite(input, context);
  },
  list_collections(input, context): Promise<unknown> {
    return executeListCollections(input, context);
  },
  get_collection(input, context): Promise<unknown> {
    return executeGetCollection(input, context);
  },
  list_collection_items(input, context): Promise<unknown> {
    return executeListCollectionItems(input, context);
  },
  get_collection_item(input, context): Promise<unknown> {
    return executeGetCollectionItem(input, context);
  },
  create_collection_item(input, context): Promise<unknown> {
    return executeCreateCollectionItem(input, context);
  },
  update_collection_item(input, context): Promise<unknown> {
    return executeUpdateCollectionItem(input, context);
  },
  delete_collection_item(input, context): Promise<unknown> {
    return executeDeleteCollectionItem(input, context);
  },
  publish_collection_items(input, context): Promise<unknown> {
    return executePublishCollectionItems(input, context);
  },
};

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, webflowActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateWebflowApiKeyCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateWebflowOAuthCredential(input.accessToken, input.metadata.scope, fetcher, signal);
  },
};

async function validateWebflowApiKeyCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await webflowGetJson("/token/authorized_by", accessToken, fetcher, signal, "validate");
  const user = optionalRecord(payload);
  const userId = optionalString(user?.id);
  const userEmail = optionalString(user?.email);
  const userName = [optionalString(user?.firstName), optionalString(user?.lastName)].filter(Boolean).join(" ");

  return {
    profile: {
      accountId: userId ?? "webflow:credential",
      displayName: (userEmail ?? userName) || "Webflow credential",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: webflowApiBaseUrl,
      validationEndpoint: "/token/authorized_by",
      userId,
      userEmail,
    }),
  };
}

async function validateWebflowOAuthCredential(
  accessToken: string,
  tokenResponseScope: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await webflowGetJson("/token/introspect", accessToken, fetcher, signal, "validate");
  const root = optionalRecord(payload);
  const authorization = optionalRecord(root?.authorization);
  const authorizedTo = optionalRecord(authorization?.authorizedTo);
  const application = optionalRecord(root?.application);
  const userId = optionalStringArray(authorizedTo?.userIds)?.[0];
  const authorizationId = optionalString(authorization?.id);
  const grantedScopes = parseWebflowScopes(authorization?.scope) ?? parseWebflowScopes(tokenResponseScope);
  const result: CredentialValidationResult = {
    profile: {
      accountId: userId ?? authorizationId ?? "webflow:credential",
      displayName: optionalString(application?.displayName) ?? "Webflow OAuth credential",
    },
    metadata: compactObject({
      apiBaseUrl: webflowApiBaseUrl,
      validationEndpoint: "/token/introspect",
      authorizationId,
      applicationId: optionalString(application?.id),
      userId,
    }),
  };
  if (grantedScopes) {
    result.grantedScopes = grantedScopes;
  }
  return result;
}

async function executeListSites(context: BearerProviderContext): Promise<Record<string, unknown>> {
  const payload = await webflowGetJson("/sites", context.accessToken, context.fetcher, context.signal, "execute");
  return {
    sites: normalizeArrayPayload(payload, "sites").map(normalizeSite),
  };
}

async function executeGetSite(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const siteId = readRequiredInputString(input.siteId, "siteId");
  const payload = await webflowGetJson(
    `/sites/${encodeURIComponent(siteId)}`,
    context.accessToken,
    context.fetcher,
    context.signal,
    "execute",
  );
  return {
    site: normalizeSite(payload),
  };
}

async function executePublishSite(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const siteId = readRequiredInputString(input.siteId, "siteId");
  const body = compactObject({
    customDomains: input.customDomains,
    publishToWebflowSubdomain: input.publishToWebflowSubdomain,
  });
  const payload = await webflowPostJson(
    `/sites/${encodeURIComponent(siteId)}/publish`,
    body,
    context.accessToken,
    context.fetcher,
    context.signal,
  );

  return {
    result: optionalRecord(payload) ?? {},
  };
}

async function executeListCollections(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const siteId = readRequiredInputString(input.siteId, "siteId");
  const payload = await webflowGetJson(
    `/sites/${encodeURIComponent(siteId)}/collections`,
    context.accessToken,
    context.fetcher,
    context.signal,
    "execute",
  );
  return {
    collections: normalizeArrayPayload(payload, "collections").map(normalizeCollection),
  };
}

async function executeGetCollection(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const payload = await webflowGetJson(
    `/collections/${encodeURIComponent(collectionId)}`,
    context.accessToken,
    context.fetcher,
    context.signal,
    "execute",
  );
  const collection = optionalRecord(payload) ?? {};
  return {
    collection: normalizeCollection(collection),
    fields: normalizeArrayPayload(collection, "fields").map(normalizeCollectionField),
  };
}

async function executeListCollectionItems(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const url = new URL(`/v2/collections/${encodeURIComponent(collectionId)}/items`, webflowApiBaseUrl);
  setOptionalSearchParam(url, "limit", input.limit);
  setOptionalSearchParam(url, "offset", input.offset);
  const payload = await webflowFetchJson(url, context.accessToken, context.fetcher, context.signal, "execute", {
    method: "GET",
  });
  const record = optionalRecord(payload) ?? {};

  return {
    items: normalizeArrayPayload(payload, "items").map(normalizeCollectionItem),
    pagination: {
      limit: optionalNumber(record.limit) ?? null,
      offset: optionalNumber(record.offset) ?? null,
      total: optionalNumber(record.total) ?? null,
    },
  };
}

async function executeGetCollectionItem(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const itemId = readRequiredInputString(input.itemId, "itemId");
  const url = new URL(
    `/v2/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`,
    webflowApiBaseUrl,
  );
  setOptionalSearchParam(url, "cmsLocaleId", input.cmsLocaleId);
  const payload = await webflowFetchJson(url, context.accessToken, context.fetcher, context.signal, "execute", {
    method: "GET",
  });
  return {
    item: normalizeCollectionItem(payload),
  };
}

async function executeCreateCollectionItem(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const live = optionalBoolean(input.live) === true;
  const payload = await webflowPostJson(
    `/collections/${encodeURIComponent(collectionId)}/items${live ? "/live" : ""}`,
    buildCollectionItemBody(input),
    context.accessToken,
    context.fetcher,
    context.signal,
  );
  return {
    item: normalizeCollectionItem(payload),
  };
}

async function executeUpdateCollectionItem(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const itemId = readRequiredInputString(input.itemId, "itemId");
  const live = optionalBoolean(input.live) === true;
  const payload = await webflowPatchJson(
    `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}${live ? "/live" : ""}`,
    buildCollectionItemBody(input),
    context.accessToken,
    context.fetcher,
    context.signal,
  );
  return {
    item: normalizeCollectionItem(payload),
  };
}

async function executeDeleteCollectionItem(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const itemId = readRequiredInputString(input.itemId, "itemId");
  await webflowFetchJson(
    `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`,
    context.accessToken,
    context.fetcher,
    context.signal,
    "execute",
    { method: "DELETE" },
  );
  return {
    itemId,
    deleted: true,
  };
}

async function executePublishCollectionItems(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const collectionId = readRequiredInputString(input.collectionId, "collectionId");
  const payload = await webflowPostJson(
    `/collections/${encodeURIComponent(collectionId)}/items/publish`,
    {
      itemIds: input.itemIds,
    },
    context.accessToken,
    context.fetcher,
    context.signal,
  );

  return {
    result: {
      ...(optionalRecord(payload) ?? {}),
      publishedItemIds: normalizeArrayPayload(payload, "publishedItemIds").filter(
        (item): item is string => typeof item === "string",
      ),
      errors: normalizeArrayPayload(payload, "errors").map((error) => optionalRecord(error) ?? {}),
    },
  };
}

async function webflowGetJson(
  path: string,
  accessToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: WebflowRequestPhase,
): Promise<unknown> {
  return webflowFetchJson(path, accessToken, fetcher, signal, phase, { method: "GET" });
}

async function webflowPostJson(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  return webflowFetchJson(path, accessToken, fetcher, signal, "execute", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function webflowPatchJson(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  return webflowFetchJson(path, accessToken, fetcher, signal, "execute", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function webflowFetchJson(
  pathOrUrl: string | URL,
  accessToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: WebflowRequestPhase,
  init: RequestInit,
): Promise<unknown> {
  const url = typeof pathOrUrl === "string" ? buildWebflowUrl(pathOrUrl) : pathOrUrl;

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, {
      ...init,
      headers: webflowHeaders(accessToken, init.body === undefined ? undefined : "application/json"),
      signal,
    });
    payload = await readWebflowPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `webflow request failed: ${error.message}` : "webflow request failed",
    );
  }

  if (!response.ok) {
    throw createWebflowError(response, payload, phase);
  }

  return payload;
}

function webflowHeaders(accessToken: string, contentType?: string): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "content-type": contentType,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

function parseWebflowScopes(value: unknown): string[] | undefined {
  return optionalString(value)
    ?.split(/[,\s]+/u)
    .filter(Boolean);
}

async function readWebflowPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "webflow returned malformed JSON");
    }
    return text;
  }
}

function createWebflowError(response: Response, payload: unknown, phase: WebflowRequestPhase): ProviderRequestError {
  const message = extractWebflowErrorMessage(payload) ?? response.statusText ?? "webflow request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractWebflowErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const details = Array.isArray(record.details) ? record.details : undefined;
  const firstDetail = optionalRecord(details?.[0]);
  return (
    optionalString(record.message) ??
    optionalString(record.msg) ??
    optionalString(record.error) ??
    optionalString(record.error_description) ??
    optionalString(firstDetail?.message) ??
    optionalString(record.detail)
  );
}

function buildCollectionItemBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    fieldData: optionalRecord(input.fieldData) ?? {},
    isArchived: input.isArchived,
    isDraft: input.isDraft,
    cmsLocaleId: input.cmsLocaleId,
  });
}

function normalizeArrayPayload(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = optionalRecord(payload);
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function normalizeSite(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    ...record,
    id: readRecordId(record),
    displayName: optionalString(record.displayName) ?? null,
    shortName: optionalString(record.shortName) ?? null,
    previewUrl: optionalString(record.previewUrl) ?? null,
    workspaceId: optionalString(record.workspaceId) ?? null,
    lastPublished: optionalString(record.lastPublished) ?? null,
    lastUpdated: optionalString(record.lastUpdated) ?? null,
  };
}

function normalizeCollection(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    ...record,
    id: readRecordId(record),
    displayName: optionalString(record.displayName) ?? null,
    singularName: optionalString(record.singularName) ?? null,
    slug: optionalString(record.slug) ?? null,
    lastUpdated: optionalString(record.lastUpdated) ?? null,
  };
}

function normalizeCollectionField(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    ...record,
    id: readRecordId(record),
    displayName: optionalString(record.displayName) ?? null,
    slug: optionalString(record.slug) ?? null,
    type: optionalString(record.type) ?? null,
    required: optionalBoolean(record.required) ?? null,
  };
}

function normalizeCollectionItem(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    ...record,
    id: readRecordId(record),
    cmsLocaleId: optionalString(record.cmsLocaleId) ?? null,
    lastPublished: optionalString(record.lastPublished) ?? null,
    lastUpdated: optionalString(record.lastUpdated) ?? null,
    createdOn: optionalString(record.createdOn) ?? null,
    isArchived: optionalBoolean(record.isArchived) ?? null,
    isDraft: optionalBoolean(record.isDraft) ?? null,
    fieldData: optionalRecord(record.fieldData) ?? {},
  };
}

function readRecordId(record: Record<string, unknown>): string {
  return optionalString(record.id) ?? optionalString(record._id) ?? "";
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function setOptionalSearchParam(url: URL, name: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }

  url.searchParams.set(name, String(value));
}

function buildWebflowUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(`v2/${normalizedPath}`, "https://api.webflow.com");
}
