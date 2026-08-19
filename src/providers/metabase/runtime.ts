import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const apiPathPrefix = "/api";
const validationPath = "/user/current";

interface MetabaseContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type MetabasePhase = "validate" | "execute";
type MetabaseActionHandler = ProviderRuntimeHandler<MetabaseContext>;

export const metabaseActionHandlers: ProviderActionHandlers<"metabase", MetabaseActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestMetabaseJson({ path: validationPath, context, phase: "execute" });
    return { user: requireObject(payload, "Metabase user"), raw: toRawObject(payload) };
  },
  async list_databases(input, context) {
    const payload = await requestMetabaseJson({
      path: "/database",
      context,
      phase: "execute",
      query: {
        include: optionalString(input.include),
        include_analytics: input.includeAnalytics,
        saved: input.saved,
        include_editable_data_model: input.includeEditableDataModel,
        exclude_uneditable_details: input.excludeUneditableDetails,
        include_only_uploadable: input.includeOnlyUploadable,
        router_database_id: input.routerDatabaseId,
        "can-query": input.canQuery,
        "can-write-metadata": input.canWriteMetadata,
      },
    });
    return { databases: readListItems(payload), raw: toRawObject(payload) };
  },
  async get_database(input, context) {
    const payload = await requestMetabaseJson({
      path: `/database/${toPathSegment(input.id, "id")}`,
      context,
      phase: "execute",
      query: {
        include: optionalString(input.include),
        include_editable_data_model: input.includeEditableDataModel,
        exclude_uneditable_details: input.excludeUneditableDetails,
      },
    });
    return { database: requireObject(payload, "Metabase database"), raw: toRawObject(payload) };
  },
  async list_collections(input, context) {
    const payload = await requestMetabaseJson({
      path: "/collection",
      context,
      phase: "execute",
      query: {
        archived: input.archived,
        "exclude-other-user-collections": input.excludeOtherUserCollections,
        namespace: optionalString(input.namespace),
        "personal-only": input.personalOnly,
      },
    });
    return { collections: readListItems(payload), raw: toRawObject(payload) };
  },
  async get_collection(input, context) {
    const payload = await requestMetabaseJson({
      path: `/collection/${toPathSegment(input.id, "id")}`,
      context,
      phase: "execute",
    });
    return { collection: requireObject(payload, "Metabase collection"), raw: toRawObject(payload) };
  },
  async list_cards(input, context) {
    const payload = await requestMetabaseJson({
      path: "/card",
      context,
      phase: "execute",
      query: { f: optionalString(input.filter), model_id: input.modelId },
    });
    return { cards: readListItems(payload), raw: toRawObject(payload) };
  },
  async get_card(input, context) {
    const payload = await requestMetabaseJson({
      path: `/card/${toPathSegment(input.id, "id")}`,
      context,
      phase: "execute",
      query: { "legacy-mbql": input.legacyMbql },
    });
    return { card: requireObject(payload, "Metabase card"), raw: toRawObject(payload) };
  },
  async list_dashboards(input, context) {
    const payload = await requestMetabaseJson({
      path: "/dashboard",
      context,
      phase: "execute",
      query: { f: optionalString(input.filter) },
    });
    return { dashboards: readListItems(payload), raw: toRawObject(payload) };
  },
  async get_dashboard(input, context) {
    const payload = await requestMetabaseJson({
      path: `/dashboard/${toPathSegment(input.id, "id")}`,
      context,
      phase: "execute",
    });
    return { dashboard: requireObject(payload, "Metabase dashboard"), raw: toRawObject(payload) };
  },
  async search(input, context) {
    const payload = await requestMetabaseJson({
      path: "/search",
      context,
      phase: "execute",
      query: {
        q: optionalString(input.query),
        context: optionalString(input.context),
        archived: input.archived,
        collection: input.collectionId,
        table_db_id: input.tableDatabaseId,
        models: input.models,
        include_dashboard_questions: input.includeDashboardQuestions,
        include_metadata: input.includeMetadata,
      },
    });
    return { results: readListItems(payload), raw: toRawObject(payload) };
  },
};

export async function validateMetabaseCredential(
  input: { apiKey: string; instanceUrl: unknown },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const urls = normalizeMetabaseUrls(input.instanceUrl);
  const context = { apiKey: input.apiKey, apiBaseUrl: urls.apiBaseUrl, fetcher, signal };
  const payload = await requestMetabaseJson({ path: validationPath, context, phase: "validate" });
  const user = requireObject(payload, "Metabase user");
  const profileId = readOptionalId(user.id) ?? urls.instanceUrl;
  return {
    profile: {
      accountId: profileId,
      displayName: buildAccountLabel(user, urls.instanceUrl),
    },
    grantedScopes: [],
    metadata: {
      instanceUrl: urls.instanceUrl,
      apiBaseUrl: urls.apiBaseUrl,
      validationEndpoint: validationPath,
      userId: user.id,
      email: optionalString(user.email),
      commonName: optionalString(user.common_name),
      username: optionalString(user.username),
    },
  };
}

export function normalizeMetabaseUrls(input: unknown): { instanceUrl: string; apiBaseUrl: string } {
  const raw = optionalString(input);
  if (!raw) {
    throw new ProviderRequestError(400, "instanceUrl is required");
  }
  const url = assertPublicHttpUrl(hasUrlScheme(raw) ? raw : `https://${raw}`, {
    fieldName: "instanceUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "instanceUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "instanceUrl must not include credentials");
  }
  url.search = "";
  url.hash = "";
  url.pathname = trimTrailingSlashes(url.pathname === "/" ? "" : url.pathname);
  if (url.pathname.endsWith(apiPathPrefix)) {
    url.pathname = url.pathname.slice(0, -apiPathPrefix.length);
  }
  const serialized = url.toString();
  const instanceUrl = serialized.endsWith("/") ? serialized.slice(0, -1) : serialized;
  return { instanceUrl, apiBaseUrl: `${instanceUrl}${apiPathPrefix}` };
}

async function requestMetabaseJson(options: {
  path: string;
  context: MetabaseContext;
  phase: MetabasePhase;
  query?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${options.context.apiBaseUrl}${options.path}`);
  appendQuery(url, options.query);

  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": options.context.apiKey,
      },
      signal: options.context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Metabase request failed: ${error.message}` : "Metabase request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createMetabaseError(response.status, payload, options.phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Metabase returned malformed JSON");
    }
    return { message: text };
  }
}

function createMetabaseError(status: number, payload: unknown, phase: MetabasePhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Metabase request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function toPathSegment(value: unknown, fieldName: string): string {
  const segment = String(value);
  if (!segment || segment.includes("/") || segment.includes("?") || segment.includes("#")) {
    throw new ProviderRequestError(400, `${fieldName} must be a Metabase path segment`);
  }
  return encodeURIComponent(segment);
}

function requireObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} response was not an object`);
  }
  return object;
}

function readListItems(payload: unknown): Array<Record<string, unknown>> {
  const body = optionalRecord(payload);
  const candidate = Array.isArray(payload) ? payload : Array.isArray(body?.data) ? body.data : [];
  return candidate.map((item) => optionalRecord(item) ?? { value: item });
}

function toRawObject(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? { data: payload };
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }
  const errors = body.errors;
  return (
    optionalString(body.message) ??
    optionalString(body.error) ??
    optionalString(body.cause) ??
    (errors && typeof errors === "object" ? JSON.stringify(errors) : undefined)
  );
}

function buildAccountLabel(user: Record<string, unknown>, instanceUrl: string): string {
  const commonName = optionalString(user.common_name);
  if (commonName) {
    return commonName;
  }
  const fullName = [optionalString(user.first_name), optionalString(user.last_name)].filter(Boolean).join(" ");
  return (
    fullName || optionalString(user.email) || optionalString(user.username) || `Metabase ${new URL(instanceUrl).host}`
  );
}

function readOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return optionalString(value);
}

function hasUrlScheme(value: string): boolean {
  return value.includes("://");
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}
