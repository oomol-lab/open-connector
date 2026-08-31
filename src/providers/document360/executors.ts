import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { Document360ActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "document360";
const apiBaseUrl = "https://apihub.document360.io";

interface Document360Context {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: Document360Context) => Promise<unknown>;

const handlers: Record<Document360ActionName, Handler> = {
  async list_workspaces(_input, context) {
    const payload = await requestJson({ ...context, path: "/v2/ProjectVersions", query: {}, phase: "execute" });
    return {
      meta: normalizeEnvelopeMeta(payload),
      workspaces: readArray(payload.data).map(normalizeWorkspace).filter(hasId),
      raw: payload,
    };
  },
  async list_workspace_articles(input, context) {
    const projectVersionId = requiredString(input.projectVersionId, "projectVersionId", providerInputError);
    const payload = await requestJson({
      ...context,
      path: `/v2/ProjectVersions/${encodePathSegment(projectVersionId)}/articles`,
      query: compactObject({
        langCode: optionalString(input.langCode),
        page: optionalNumber(input.page),
        hitsPerPage: optionalNumber(input.hitsPerPage),
        securityVisibility: optionalNumber(input.securityVisibility),
      }),
      phase: "execute",
    });
    return {
      meta: normalizeEnvelopeMeta(payload),
      articles: readArray(payload.data).map(normalizeArticle).filter(hasId),
      pagination: optionalRecord(payload.pagination) ?? null,
      raw: payload,
    };
  },
  async get_workspace_categories(input, context) {
    const projectVersionId = requiredString(input.projectVersionId, "projectVersionId", providerInputError);
    const payload = await requestJson({
      ...context,
      path: `/v2/ProjectVersions/${encodePathSegment(projectVersionId)}/categories`,
      query: compactObject({
        excludeArticles: optionalBoolean(input.excludeArticles),
        langCode: optionalString(input.langCode),
        includeCategoryDescription: optionalBoolean(input.includeCategoryDescription),
        securityVisibility: optionalNumber(input.securityVisibility),
      }),
      phase: "execute",
    });
    return {
      meta: normalizeEnvelopeMeta(payload),
      categories: readArray(payload.data).map(normalizeCategory).filter(hasId),
      raw: payload,
    };
  },
  async search_workspace(input, context) {
    const projectVersionId = requiredString(input.projectVersionId, "projectVersionId", providerInputError);
    const langCode = requiredString(input.langCode, "langCode", providerInputError);
    const payload = await requestJson({
      ...context,
      path: `/v2/ProjectVersions/${encodePathSegment(projectVersionId)}/${encodePathSegment(langCode)}`,
      query: compactObject({
        searchQuery: requiredString(input.searchQuery, "searchQuery", providerInputError),
        page: optionalNumber(input.page),
        hitsPerPage: optionalNumber(input.hitsPerPage),
      }),
      phase: "execute",
    });
    const data = optionalRecord(payload.data) ?? {};
    return {
      meta: normalizeEnvelopeMeta(payload),
      hits: readArray(data.hits).map(normalizeSearchHit),
      totalHits: nullableInteger(data.nb_hits),
      page: nullableInteger(data.page),
      totalPages: nullableInteger(data.nb_pages),
      hitsPerPage: nullableInteger(data.hits_per_page),
      processingTimeMs: nullableInteger(data.processing_time_ms),
      query: optionalString(data.query) ?? null,
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Document360Context>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<Document360Context> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson({
      path: "/v2/ProjectVersions",
      apiKey: input.apiKey,
      query: {},
      fetcher,
      signal,
      phase: "validate",
    });
    const workspaces = readArray(payload.data).map(normalizeWorkspace).filter(hasId);
    const mainWorkspace = workspaces.find((workspace) => workspace.isMainVersion === true) ?? workspaces[0];
    return {
      profile: {
        accountId: optionalString(mainWorkspace?.id) ?? "api_key",
        displayName: optionalString(mainWorkspace?.versionCodeName) ?? "Document360 API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/v2/ProjectVersions",
        workspaceCount: workspaces.length,
        mainWorkspaceId: mainWorkspace?.id,
        mainWorkspaceName: mainWorkspace?.versionCodeName,
      }),
    };
  },
};

async function requestJson(input: {
  path: string;
  apiKey: string;
  query: Record<string, string | number | boolean | undefined>;
  fetcher: typeof fetch;
  phase: Phase;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.signal, label: "Document360" }, async (signal) => {
    const response = await input.fetcher(buildUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        api_token: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, input.phase);
    const record = optionalRecord(payload);
    if (!record) throw new ProviderRequestError(502, "Document360 returned an invalid payload", payload);
    if (record.success === false)
      throw createError(response.status >= 400 ? response.status : 400, record, input.phase);
    return record;
  });
}

function buildUrl(path: string, query: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Document360 returned invalid JSON");
  }
}

function createError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Document360 request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (status === 401 || status === 403)) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload.trim();
  const record = optionalRecord(payload);
  if (!record) return undefined;
  for (const error of Array.isArray(record.errors) ? record.errors : []) {
    const description = optionalString(optionalRecord(error)?.description);
    if (description) return description;
  }
  return optionalString(record.message) ?? optionalString(record.error);
}

function normalizeEnvelopeMeta(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    success: payload.success !== false,
    errors: normalizeNotifications(payload.errors),
    warnings: normalizeNotifications(payload.warnings),
    information: normalizeNotifications(payload.information),
  };
}

function normalizeNotifications(value: unknown): Array<Record<string, unknown>> {
  return readArray(value).map((item) => {
    const record = optionalRecord(item) ?? {};
    return {
      description: optionalString(record.description) ?? null,
      errorCode: optionalString(record.error_code) ?? optionalString(record.errorCode) ?? null,
      raw: record,
    };
  });
}

function normalizeWorkspace(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalString(record.id) ?? "",
    versionNumber: nullableNumber(record.version_number),
    baseVersionNumber: nullableNumber(record.base_version_number),
    versionCodeName: optionalString(record.version_code_name) ?? null,
    isMainVersion: nullableBoolean(record.is_main_version),
    isBeta: nullableBoolean(record.is_beta),
    isPublic: nullableBoolean(record.is_public),
    isDeprecated: nullableBoolean(record.is_deprecated),
    slug: optionalString(record.slug) ?? null,
    order: nullableInteger(record.order),
    versionType: record.version_type ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    modifiedAt: optionalString(record.modified_at) ?? null,
    languages: readArray(record.language_versions).map(normalizeLanguage),
    raw: record,
  };
}

function normalizeLanguage(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalString(record.id) ?? null,
    code: optionalString(record.code) ?? null,
    name: optionalString(record.name) ?? null,
    displayName: optionalString(record.display_name) ?? null,
    setAsDefault: nullableBoolean(record.set_as_default),
    hidden: nullableBoolean(record.hidden),
    raw: record,
  };
}

function normalizeArticle(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalString(record.id) ?? "",
    title: optionalString(record.title) ?? null,
    url: optionalString(record.url) ?? null,
    slug: optionalString(record.slug) ?? null,
    languageCode: optionalString(record.language_code) ?? null,
    publicVersion: nullableNumber(record.public_version),
    latestVersion: nullableNumber(record.latest_version),
    hidden: nullableBoolean(record.hidden),
    status: record.status ?? null,
    order: nullableInteger(record.order),
    contentType: record.content_type ?? null,
    translationOption: record.translation_option ?? null,
    isSharedArticle: nullableBoolean(record.is_shared_article),
    excludeFromExternalSearch: nullableBoolean(record.exclude_from_external_search),
    securityVisibility: record.security_visibility ?? null,
    currentWorkflowStatusId: optionalString(record.current_workflow_status_id) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    modifiedAt: optionalString(record.modified_at) ?? null,
    raw: record,
  };
}

function normalizeCategory(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalString(record.id) ?? "",
    name: optionalString(record.name) ?? null,
    description: optionalString(record.description) ?? null,
    slug: optionalString(record.slug) ?? null,
    languageCode: optionalString(record.language_code) ?? null,
    categoryType: record.category_type ?? null,
    hidden: nullableBoolean(record.hidden),
    order: nullableInteger(record.order),
    icon: optionalString(record.icon) ?? null,
    status: record.status ?? null,
    excludeFromExternalSearch: nullableBoolean(record.exclude_from_external_search),
    securityVisibility: record.security_visibility ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    modifiedAt: optionalString(record.modified_at) ?? null,
    articles: readArray(record.articles).map(normalizeArticle).filter(hasId),
    childCategories: readArray(record.child_categories).map(normalizeCategory).filter(hasId),
    raw: record,
  };
}

function normalizeSearchHit(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const snippetContent = optionalRecord(optionalRecord(record._snippet_result)?.content);
  return {
    articleId: optionalString(record.article_id) ?? null,
    categoryId: optionalString(record.category_id) ?? null,
    title: optionalString(record.title) ?? null,
    content: optionalString(record.content) ?? null,
    snippet: snippetContent
      ? {
          value: optionalString(snippetContent.value) ?? null,
          matchLevel: optionalString(snippetContent.match_level) ?? null,
        }
      : null,
    slug: optionalString(record.slug) ?? null,
    version: nullableNumber(record.version),
    order: nullableInteger(record.order),
    isHidden: nullableBoolean(record.is_hidden),
    isDraft: nullableBoolean(record.is_draft),
    isPrivate: nullableBoolean(record.is_private),
    langCode: optionalString(record.lang_code) ?? null,
    objectId: optionalString(record.object_id) ?? null,
    raw: record,
  };
}

function hasId(value: { id?: unknown }): boolean {
  return value.id !== "";
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function nullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
