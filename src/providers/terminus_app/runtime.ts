import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  basicAuthorizationHeader,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const terminusAppApiBaseUrl = "https://api.terminusapp.com";
interface RequestInput {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  path: string;
  phase: "validate" | "execute";
  query?: Record<string, string | undefined>;
  body?: unknown;
}
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
export const terminusAppActionHandlers: ProviderActionHandlers<"terminus_app", Handler> = {
  async list_projects(input, context) {
    return normalizeList(
      await requestTerminusApp({
        ...context,
        path: "/v1/projects/",
        phase: "execute",
        query: buildPaginationQuery(input),
      }),
      "projects",
    );
  },
  async list_conventions(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    return normalizeList(
      await requestTerminusApp({
        ...context,
        path: `/v1/projects/${encodeURIComponent(projectId)}/conventions`,
        phase: "execute",
        query: buildPaginationQuery(input),
      }),
      "conventions",
    );
  },
  async get_convention(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    const payload = await requestTerminusApp({
      ...context,
      path: `/v1/projects/${encodeURIComponent(projectId)}/conventions/${optionalInteger(input.conventionId)}`,
      phase: "execute",
    });
    return { convention: requiredResponseRecord(payload, "Terminus convention response") };
  },
  async list_links(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    const payload = await requestTerminusApp({
      ...context,
      path: `/v1/projects/${encodeURIComponent(projectId)}/links`,
      phase: "execute",
      query: {
        ...buildPaginationQuery(input),
        "created_at[gt]": stringifyInteger(optionalInteger(input.createdAfter)),
        "updated_at[gt]": stringifyInteger(optionalInteger(input.updatedAfter)),
      },
    });
    return normalizeList(payload, "links");
  },
  async create_link(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    const payload = await requestTerminusApp({
      ...context,
      method: "POST",
      path: `/v1/projects/${encodeURIComponent(projectId)}/links`,
      phase: "execute",
      body: buildCreateLinkBody(input),
    });
    return { link: requiredResponseRecord(payload, "Terminus link response") };
  },
};
export async function validateTerminusAppCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTerminusApp({
    apiKey,
    fetcher,
    signal,
    path: "/v1/projects/",
    phase: "validate",
    query: { items: "1" },
  });
  normalizeList(payload, "projects");
  return {
    profile: { accountId: "terminus-app", displayName: "Terminus App API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: terminusAppApiBaseUrl, validationEndpoint: "/v1/projects/" },
  };
}
function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return { page: stringifyInteger(optionalInteger(input.page)), items: stringifyInteger(optionalInteger(input.items)) };
}
function stringifyInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
function buildCreateLinkBody(input: Record<string, unknown>): Record<string, unknown> {
  const convention = optionalRecord(input.convention);
  const inputFields = Array.isArray(convention?.inputFields)
    ? convention.inputFields.map((value) => {
        const field = recordOrEmpty(value);
        return { field_id: optionalInteger(field.fieldId), input_value: optionalString(field.inputValue) };
      })
    : undefined;
  const utm = optionalRecord(input.utm);
  return compactObject({
    url: requiredInputString(input.url, "url"),
    convention: convention ? { id: optionalInteger(convention.id), input_fields: inputFields } : undefined,
    utm: utm ? mapTagObject(utm) : undefined,
    custom: mapOptionalNamedTags(input.custom),
    info: mapOptionalNamedTags(input.info),
    label_names: Array.isArray(input.labelNames) ? input.labelNames : undefined,
    description: optionalString(input.description),
    skip_monitoring: optionalBoolean(input.skipMonitoring),
    short_url_key: optionalString(input.shortUrlKey),
    skip_url_validation: optionalBoolean(input.skipUrlValidation),
  });
}
function mapTagObject(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    campaign: optionalRecord(input.campaign),
    medium: optionalRecord(input.medium),
    source: optionalRecord(input.source),
    content: optionalRecord(input.content),
    term: optionalRecord(input.term),
  });
}
function mapOptionalNamedTags(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  return record ? Object.fromEntries(Object.entries(record)) : undefined;
}
async function requestTerminusApp(input: RequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Terminus App", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, terminusAppApiBaseUrl);
    for (const [name, value] of Object.entries(input.query ?? {}))
      if (value !== undefined) url.searchParams.set(name, value);
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: basicAuthorizationHeader(`${input.apiKey}:`),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, input.phase);
    return payload;
  });
}
async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Terminus App response");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Terminus App returned invalid JSON");
  }
}
function createError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Terminus App request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}
function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}
function normalizeList(payload: unknown, outputName: "projects" | "conventions" | "links"): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "Terminus list response");
  return {
    [outputName]: requireArray(record.data, "Terminus list response data"),
    meta: requiredResponseRecord(record.meta, "Terminus list response meta"),
  };
}
function requireArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new ProviderRequestError(502, `${label} must be an array`);
}
