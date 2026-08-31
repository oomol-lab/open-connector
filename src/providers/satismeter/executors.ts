import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "satismeter";
const satismeterApiBaseUrl = "https://app.satismeter.com/api/v3";
const satismeterValidationProbeProjectId = "000000000000000000000000";
const satismeterValidationPath = `/projects/${satismeterValidationProbeProjectId}`;

type SatismeterMode = "validate" | "execute";
type SatismeterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const satismeterActionHandlers: ProviderActionHandlers<"satismeter", SatismeterActionHandler> = {
  get_project(input, context) {
    return getProject(input, context);
  },
  list_surveys(input, context) {
    return listSurveys(input, context);
  },
  get_survey(input, context) {
    return getSurvey(input, context);
  },
  list_project_responses(input, context) {
    return listProjectResponses(input, context);
  },
  list_survey_responses(input, context) {
    return listSurveyResponses(input, context);
  },
  get_survey_statistics(input, context) {
    return getSurveyStatistics(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, satismeterActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const response = await requestSatismeterResponse({
      apiKey,
      fetcher,
      signal,
      path: satismeterValidationPath,
      mode: "validate",
    });
    if (!response.httpResponse.ok && response.httpResponse.status !== 404) {
      throw createSatismeterError(response.httpResponse, response.payload, "validate");
    }
    return {
      profile: {
        accountId: "satismeter-api-key",
        displayName: "SatisMeter API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: satismeterApiBaseUrl,
        validationEndpoint: satismeterValidationPath,
        validationMode: "missing_project_probe",
        probeProjectId: satismeterValidationProbeProjectId,
      },
    };
  },
};

async function getProject(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const body = await requestSatismeterObject({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/projects/${encodeURIComponent(requiredInputString(input.projectId, "projectId"))}`,
    mode: "execute",
  });
  return { project: requireResponseObject(body.data, "data") };
}

async function listSurveys(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const body = await requestSatismeterObject({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/projects/${encodeURIComponent(requiredInputString(input.projectId, "projectId"))}/campaigns`,
    mode: "execute",
  });
  return { surveys: requireResponseArray(body.data, "data") };
}

async function getSurvey(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredInputString(input.projectId, "projectId");
  const campaignId = requiredInputString(input.campaignId, "campaignId");
  const body = await requestSatismeterObject({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/projects/${encodeURIComponent(projectId)}/campaigns/${encodeURIComponent(campaignId)}`,
    mode: "execute",
  });
  return { survey: requireResponseObject(body.data, "data") };
}

async function listProjectResponses(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const body = await requestSatismeterObject({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/projects/${encodeURIComponent(requiredInputString(input.projectId, "projectId"))}/responses`,
    query: buildQueryParams({
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
      pageCursor: optionalString(input.pageCursor),
      pageSize: readOptionalPageSize(input.pageSize),
    }),
    mode: "execute",
  });
  return { responses: requireResponseArray(body.data, "data"), page: requireResponseObject(body.page, "page") };
}

async function listSurveyResponses(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredInputString(input.projectId, "projectId");
  const campaignId = requiredInputString(input.campaignId, "campaignId");
  const body = await requestSatismeterObject({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/projects/${encodeURIComponent(projectId)}/campaigns/${encodeURIComponent(campaignId)}/responses`,
    query: buildQueryParams({
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
      pageCursor: optionalString(input.pageCursor),
      pageSize: readOptionalPageSize(input.pageSize),
    }),
    mode: "execute",
  });
  return { responses: requireResponseArray(body.data, "data"), page: requireResponseObject(body.page, "page") };
}

async function getSurveyStatistics(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredInputString(input.projectId, "projectId");
  const campaignId = requiredInputString(input.campaignId, "campaignId");
  const body = await requestSatismeterObject({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/projects/${encodeURIComponent(projectId)}/campaigns/${encodeURIComponent(campaignId)}/statistics`,
    query: buildQueryParams({
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
    }),
    mode: "execute",
  });
  return { statistics: requireResponseObject(body.data, "data") };
}

async function requestSatismeterObject(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  query?: URLSearchParams;
  mode: SatismeterMode;
}): Promise<Record<string, unknown>> {
  const payload = await requestSatismeterJson(input);
  const object = optionalRecord(payload);
  if (!object) throw new ProviderRequestError(502, "satismeter response must be an object");
  return object;
}

async function requestSatismeterJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  query?: URLSearchParams;
  mode: SatismeterMode;
}): Promise<unknown> {
  const response = await requestSatismeterResponse(input);
  if (!response.httpResponse.ok) throw createSatismeterError(response.httpResponse, response.payload, input.mode);
  return response.payload;
}

async function requestSatismeterResponse(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  query?: URLSearchParams;
  mode: SatismeterMode;
}): Promise<{ httpResponse: Response; payload: unknown }> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const httpResponse = await satismeterFetch({
      apiKey: input.apiKey,
      fetcher: input.fetcher,
      path: input.path,
      query: input.query,
      signal: timeout.signal,
    });
    const payload = await readSatismeterPayload(httpResponse);
    return { httpResponse, payload };
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error))
      throw new ProviderRequestError(504, "satismeter request timed out");
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function satismeterFetch(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  query?: URLSearchParams;
  signal: AbortSignal;
}): Promise<Response> {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${satismeterApiBaseUrl}/`);
  if (input.query) url.search = input.query.toString();
  return input.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    },
    signal: input.signal,
  });
}

async function readSatismeterPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return null;
    throw new ProviderRequestError(502, "invalid satismeter JSON response");
  }
}

function createSatismeterError(response: Response, payload: unknown, mode: SatismeterMode): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    readErrorTitle(body?.errors) ??
    optionalString(response.statusText) ??
    `satismeter request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404) return new ProviderRequestError(400, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status >= 500) return new ProviderRequestError(502, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}

function buildQueryParams(input: Record<string, string | number | undefined>): URLSearchParams | undefined {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.size > 0 ? query : undefined;
}

function readOptionalPageSize(value: unknown): number | undefined {
  return optionalInteger(value);
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `satismeter response field ${fieldName} must be an object`);
  return object;
}

function requireResponseArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `satismeter response field ${fieldName} must be an array`);
  }
  return value.map((item) => requireResponseObject(item, `${fieldName}[]`));
}

function readErrorTitle(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const first = optionalRecord(value[0]);
  return first ? optionalString(first.title) : undefined;
}
