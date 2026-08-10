import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { DocusealActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "docuseal";
const defaultBaseUrl = "https://api.docuseal.com";
const euBaseUrl = "https://api.docuseal.eu";

interface DocusealContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: DocusealContext) => Promise<unknown>;

const handlers: Record<DocusealActionName, Handler> = {
  list_templates(input, context) {
    return listTemplates(input, context);
  },
  get_template(input, context) {
    return getTemplate(input, context);
  },
  create_submission(input, context) {
    return createSubmission(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DocusealContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DocusealContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveApiBaseUrl(credential.values.region ?? credential.metadata.region),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = resolveApiBaseUrl(input.values.region);
    await requestJson({
      path: "/templates",
      query: { limit: "1" },
      apiKey: input.apiKey,
      apiBaseUrl,
      fetcher,
      signal,
      phase: "validate",
    });
    return {
      profile: {
        accountId: "api_key",
        displayName: "DocuSeal API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        region: apiBaseUrl === euBaseUrl ? "eu" : "com",
        validationEndpoint: "/templates",
      },
    };
  },
};

async function listTemplates(input: Record<string, unknown>, context: DocusealContext): Promise<unknown> {
  const payload = await requestJson({
    ...context,
    path: "/templates",
    query: buildTemplateListQuery(input),
    phase: "execute",
  });
  return normalizeTemplateListPayload(payload);
}

async function getTemplate(input: Record<string, unknown>, context: DocusealContext): Promise<unknown> {
  const id = optionalInteger(input.id);
  if (id === undefined) throw new ProviderRequestError(400, "id is required");
  const payload = await requestJson({
    ...context,
    path: `/templates/${encodePathSegment(id)}`,
    phase: "execute",
  });
  return normalizeTemplatePayload(payload);
}

async function createSubmission(input: Record<string, unknown>, context: DocusealContext): Promise<unknown> {
  const payload = await requestJson({
    ...context,
    path: "/submissions",
    method: "POST",
    body: input,
    phase: "execute",
  });
  return normalizeCreateSubmissionPayload(payload);
}

function resolveApiBaseUrl(value: unknown): string {
  const region = optionalString(value)?.toLowerCase();
  if (!region || region === "com" || region === "us") return defaultBaseUrl;
  if (region === "eu") return euBaseUrl;
  throw new ProviderRequestError(400, "DocuSeal region must be com or eu");
}

function buildTemplateListQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of ["q", "slug", "external_id", "folder"] as const) {
    const value = optionalString(input[key]);
    if (value !== undefined) query[key] = value;
  }
  for (const key of ["limit", "after", "before"] as const) {
    const value = optionalInteger(input[key]);
    if (value !== undefined) query[key] = String(value);
  }
  if (typeof input.archived === "boolean") query.archived = String(input.archived);
  return query;
}

async function requestJson(input: {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  phase: Phase;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(input.path, input.apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.set(key, value);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: compactObject({
        accept: "application/json",
        "content-type": input.method === "POST" ? "application/json" : undefined,
        "user-agent": providerUserAgent,
        "X-Auth-Token": input.apiKey,
      }) as Record<string, string>,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DocuSeal request failed: ${error.message}` : "DocuSeal request failed",
    );
  }
  if (!response.ok) throw createError(response, payload, input.phase);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeTemplateListPayload(payload: unknown): Record<string, unknown> {
  const object = readObject(payload, "template list response");
  const data = Array.isArray(object.data) ? object.data : [];
  const pagination = optionalRecord(object.pagination) ?? {};
  return {
    data: data.map((item) => normalizeTemplatePayload(item)),
    pagination: {
      count: optionalInteger(pagination.count) ?? data.length,
      next: optionalInteger(pagination.next) ?? null,
      prev: optionalInteger(pagination.prev) ?? null,
    },
    raw: object,
  };
}

function normalizeTemplatePayload(payload: unknown): Record<string, unknown> {
  const object = readObject(payload, "template response");
  return {
    id: readInteger(object, "id"),
    slug: readString(object, "slug"),
    name: readString(object, "name"),
    source: optionalString(object.source) ?? null,
    externalId: optionalString(object.external_id) ?? null,
    folderName: optionalString(object.folder_name) ?? null,
    archivedAt: optionalString(object.archived_at) ?? null,
    createdAt: readString(object, "created_at"),
    updatedAt: readString(object, "updated_at"),
    raw: object,
  };
}

function normalizeCreateSubmissionPayload(payload: unknown): Record<string, unknown> {
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, "invalid DocuSeal submission response", payload);
  return {
    submitters: payload.map((item) => normalizeSubmitterPayload(item)),
    raw: payload,
  };
}

function normalizeSubmitterPayload(payload: unknown): Record<string, unknown> {
  const object = readObject(payload, "submitter response");
  return {
    id: readInteger(object, "id"),
    submissionId: readInteger(object, "submission_id"),
    uuid: readString(object, "uuid"),
    email: optionalString(object.email) ?? null,
    phone: optionalString(object.phone) ?? null,
    name: optionalString(object.name) ?? null,
    role: optionalString(object.role) ?? null,
    status: optionalString(object.status) ?? null,
    slug: optionalString(object.slug) ?? null,
    externalId: optionalString(object.external_id) ?? null,
    embedSrc: optionalString(object.embed_src) ?? null,
    sentAt: optionalString(object.sent_at) ?? null,
    openedAt: optionalString(object.opened_at) ?? null,
    completedAt: optionalString(object.completed_at) ?? null,
    declinedAt: optionalString(object.declined_at) ?? null,
    createdAt: optionalString(object.created_at) ?? null,
    updatedAt: optionalString(object.updated_at) ?? null,
    raw: object,
  };
}

function readObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) throw new ProviderRequestError(502, `invalid DocuSeal ${label}`, payload);
  return object;
}

function readString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (value === undefined) throw new ProviderRequestError(502, `invalid DocuSeal ${fieldName} response`);
  return value;
}

function readInteger(input: Record<string, unknown>, fieldName: string): number {
  const value = optionalInteger(input[fieldName]);
  if (value === undefined) throw new ProviderRequestError(502, `invalid DocuSeal ${fieldName} response`);
  return value;
}

function createError(response: Response, payload: unknown, phase: Phase): ProviderRequestError {
  const message = extractMessage(payload) ?? `DocuSeal request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const object = optionalRecord(payload);
  if (!object) return undefined;
  const baseMessage =
    optionalString(object.error) ??
    optionalString(object.message) ??
    optionalString(object.error_message) ??
    optionalString(object.title);
  const details = extractDetails(object.errors);
  if (baseMessage && details && !baseMessage.includes(details)) return `${baseMessage}: ${details}`;
  return baseMessage ?? details;
}

function extractDetails(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first : undefined;
  }
  const object = optionalRecord(value);
  if (!object) return undefined;
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === "string" && entry.trim()) return `${key} ${entry}`.trim();
    if (Array.isArray(entry) && typeof entry[0] === "string" && entry[0].trim()) return `${key} ${entry[0]}`.trim();
  }
  return undefined;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.docuseal.com",
  auth: { type: "api_key_header", name: "x-auth-token" },
});
