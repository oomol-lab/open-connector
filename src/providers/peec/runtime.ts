import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

export const peecApiBaseUrl = "https://api.peec.ai/customer/v1";
interface RequestInput {
  method: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
export const peecActionHandlers: ProviderActionHandlers<"peec", Handler> = {
  async list_projects(input, context) {
    const payload = await requestJson(
      "/projects",
      {
        method: "GET",
        query: compactObject({
          limit: input.limit,
          offset: input.offset,
          external_id: input.externalId,
          start_date: input.startDate,
          end_date: input.endDate,
        }),
      },
      context,
    );
    return { projects: normalizeProjects(payload) };
  },
  get_brands_report(input, context) {
    return getReport("/reports/brands", input, context);
  },
  get_domains_report(input, context) {
    return getReport("/reports/domains", input, context);
  },
  get_urls_report(input, context) {
    return getReport("/reports/urls", input, context);
  },
};
export async function validatePeecCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey, fetcher, signal };
  let accountLabel: string | undefined;
  let validationEndpoint = "/projects";
  try {
    const projects = normalizeProjects(await requestJson("/projects", { method: "GET", query: { limit: 1 } }, context));
    accountLabel = optionalString(optionalRecord(projects[0])?.name);
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || (error.status !== 401 && error.status !== 403)) throw error;
    await requestJson("/brands", { method: "GET", query: { limit: 1 } }, context);
    validationEndpoint = "/brands";
  }
  return {
    profile: { accountId: "api_key", displayName: accountLabel ?? "Peec AI API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: peecApiBaseUrl, validationEndpoint },
  };
}
async function getReport(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(
    path,
    {
      method: "POST",
      body: compactObject({
        project_id: input.projectId,
        limit: input.limit,
        offset: input.offset,
        start_date: input.startDate,
        end_date: input.endDate,
        previous_start_date: input.previousStartDate,
        previous_end_date: input.previousEndDate,
        include_previous_period: input.includePreviousPeriod,
        dimensions: input.dimensions,
        filters: input.filters,
        having: input.having,
        order_by: input.orderBy,
      }),
    },
    context,
  );
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.data))
    throw new ProviderRequestError(502, "Peec AI report response did not include data");
  return { rows: record.data };
}
async function requestJson(path: string, request: RequestInput, context: ApiKeyProviderContext): Promise<unknown> {
  return runProviderRequest({ label: "Peec AI", signal: context.signal }, async (signal) => {
    const url = new URL(`${peecApiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(request.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": context.apiKey,
    });
    if (request.body) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload);
    return payload;
  });
}
async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Peec response");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Peec AI returned invalid JSON");
  }
}
function createError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.error) ??
    `Peec AI request failed with status ${status}`;
  return new ProviderRequestError(status || 502, message, payload);
}
function normalizeProjects(payload: unknown): Record<string, unknown>[] {
  const record = optionalRecord(payload);
  return looseArray(record?.data).map((value) => {
    const project = optionalRecord(value) ?? {};
    return {
      ...project,
      countryCode: project.country_code,
      languageCode: project.language_code,
      externalId: project.external_id,
      createdAt: project.created_at,
    };
  });
}
