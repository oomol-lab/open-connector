import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRawString, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const simplesatApiBaseUrl = "https://api.simplesat.io";
export const simplesatValidationPath = "/api/v1/surveys";

const simplesatCredentialHelpUrl = "https://app.simplesat.io/settings/api-keys/";

type SimplesatRequestPhase = "validate" | "execute";
type SimplesatHttpMethod = "GET" | "POST";
type SimplesatQueryValue = string | number | boolean | undefined | null;
type SimplesatActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SimplesatRequestInput {
  apiKey: string;
  method: SimplesatHttpMethod;
  path: string;
  phase: SimplesatRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}

interface QueryFieldMapping {
  input: string;
  query: string;
}

interface BodyFieldMapping {
  input: string;
  body: string;
}

const pageQueryMappings = [
  { input: "page", query: "page" },
  { input: "pageSize", query: "page_size" },
] satisfies QueryFieldMapping[];

const customerBodyMappings = [
  { input: "externalId", body: "external_id" },
  { input: "email", body: "email" },
  { input: "name", body: "name" },
  { input: "company", body: "company" },
  { input: "language", body: "language" },
  { input: "tags", body: "tags" },
  { input: "customAttributes", body: "custom_attributes" },
] satisfies BodyFieldMapping[];

export const simplesatActionHandlers: ProviderActionHandlers<"simplesat", SimplesatActionHandler> = {
  async list_surveys(input, context) {
    const payload = await requestSimplesatJson({
      apiKey: context.apiKey,
      method: "GET",
      path: simplesatValidationPath,
      query: buildQueryParams(input, pageQueryMappings),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizePaginatedResponse(payload, "surveys", "Simplesat surveys response");
  },

  async list_questions(input, context) {
    const payload = await requestSimplesatJson({
      apiKey: context.apiKey,
      method: "GET",
      path: "/api/v1/questions",
      query: buildQueryParams(input, [
        ...pageQueryMappings,
        { input: "surveyId", query: "survey_id" },
        { input: "metric", query: "metric" },
      ]),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizePaginatedResponse(payload, "questions", "Simplesat questions response");
  },

  async search_responses(input, context) {
    const payload = await requestSimplesatJson({
      apiKey: context.apiKey,
      method: "POST",
      path: "/api/v1/responses/search",
      query: buildQueryParams(input, pageQueryMappings),
      body: buildBody(input, [
        { input: "startDate", body: "start_date" },
        { input: "endDate", body: "end_date" },
        { input: "createdStartDate", body: "created_start_date" },
        { input: "createdEndDate", body: "created_end_date" },
        { input: "modifiedStartDate", body: "modified_start_date" },
        { input: "modifiedEndDate", body: "modified_end_date" },
        { input: "operator", body: "operator" },
        { input: "filters", body: "filters" },
      ]),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizePaginatedResponse(payload, "responses", "Simplesat responses response");
  },

  get_response(input, context) {
    const responseId = requiredString(
      input.responseId,
      "responseId",
      (message) => new ProviderRequestError(400, message),
    );
    return requestSimplesatJson({
      apiKey: context.apiKey,
      method: "GET",
      path: `/api/v1/responses/${encodeURIComponent(responseId)}`,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },

  async list_customers(input, context) {
    const payload = await requestSimplesatJson({
      apiKey: context.apiKey,
      method: "GET",
      path: "/api/v1/customers",
      query: buildQueryParams(input, [
        ...pageQueryMappings,
        { input: "createdAfter", query: "created_after" },
        { input: "createdBefore", query: "created_before" },
        { input: "modifiedAfter", query: "modified_after" },
        { input: "modifiedBefore", query: "modified_before" },
        { input: "subscribed", query: "subscribed" },
      ]),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizePaginatedResponse(payload, "customers", "Simplesat customers response");
  },

  get_customer(input, context) {
    const customerId = requiredString(
      input.customerId,
      "customerId",
      (message) => new ProviderRequestError(400, message),
    );
    return requestSimplesatJson({
      apiKey: context.apiKey,
      method: "GET",
      path: `/api/v1/customers/${encodeURIComponent(customerId)}`,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },

  create_or_update_customer(input, context) {
    return requestSimplesatJson({
      apiKey: context.apiKey,
      method: "POST",
      path: "/api/v1/customers",
      body: buildBody(input, customerBodyMappings),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },

  async send_survey_email(input, context) {
    const surveyToken = requiredString(
      input.surveyToken,
      "surveyToken",
      (message) => new ProviderRequestError(400, message),
    );
    const payload = await requestSimplesatJson({
      apiKey: context.apiKey,
      method: "POST",
      path: `/api/v1/surveys/${encodeURIComponent(surveyToken)}/email`,
      body: buildSurveyEmailBody(input),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizeDetailResponse(payload, "Simplesat survey email response");
  },
};

export async function validateSimplesatCredential(
  apiKeyInput: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(apiKeyInput, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestSimplesatJson({
    apiKey,
    method: "GET",
    path: simplesatValidationPath,
    query: buildQueryParams({ pageSize: 1 }, pageQueryMappings),
    phase: "validate",
    fetcher,
    signal,
  });
  normalizePaginatedResponse(payload, "surveys", "Simplesat validation response");

  return {
    profile: {
      displayName: "Simplesat API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: simplesatApiBaseUrl,
      validationEndpoint: `${simplesatValidationPath}?page_size=1`,
      credentialHelpUrl: simplesatCredentialHelpUrl,
    },
  };
}

async function requestSimplesatJson(input: SimplesatRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);

  try {
    const response = await input.fetcher(buildSimplesatUrl(input), {
      method: input.method,
      headers: buildSimplesatHeaders(input.apiKey, input.body),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readSimplesatPayload(response);
    if (!response.ok) {
      throw createSimplesatError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Simplesat request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Simplesat request failed: ${error.message}` : "Simplesat request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSimplesatHeaders(apiKey: string, body: Record<string, unknown> | undefined): Record<string, string> {
  return {
    accept: "application/json",
    "x-simplesat-token": apiKey,
    "user-agent": providerUserAgent,
    ...(body === undefined ? {} : { "content-type": "application/json" }),
  };
}

function buildSimplesatUrl(input: { path: string; query?: URLSearchParams }): URL {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${simplesatApiBaseUrl}/`);
  if (input.query) {
    url.search = input.query.toString();
  }
  return url;
}

function buildQueryParams(
  input: Record<string, unknown>,
  mappings: readonly QueryFieldMapping[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const mapping of mappings) {
    const value = input[mapping.input] as SimplesatQueryValue;
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(mapping.query, String(value));
  }

  return query.size > 0 ? query : undefined;
}

function buildBody(input: Record<string, unknown>, mappings: readonly BodyFieldMapping[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (!(mapping.input in input)) {
      continue;
    }
    const value = input[mapping.input];
    if (value === undefined) {
      continue;
    }
    body[mapping.body] = value;
  }

  return body;
}

function buildSurveyEmailBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer: buildBody(readObject(input.customer, "customer"), [
      { input: "id", body: "id" },
      { input: "email", body: "email" },
      { input: "name", body: "name" },
      { input: "company", body: "company" },
      { input: "language", body: "language" },
      { input: "customAttributes", body: "custom_attributes" },
    ]),
  };

  const teamMember = optionalRecord(input.teamMember);
  if (teamMember) {
    body.team_member = buildBody(teamMember, [
      { input: "id", body: "id" },
      { input: "email", body: "email" },
      { input: "name", body: "name" },
      { input: "customAttributes", body: "custom_attributes" },
    ]);
  }

  const ticket = optionalRecord(input.ticket);
  if (ticket) {
    body.ticket = buildBody(ticket, [
      { input: "id", body: "id" },
      { input: "subject", body: "subject" },
      { input: "customAttributes", body: "custom_attributes" },
    ]);
  }

  return body;
}

async function readSimplesatPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Simplesat JSON response");
  }
}

function normalizePaginatedResponse(payload: unknown, itemsKey: string, label: string): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  const items = body[itemsKey];
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, `${label} ${itemsKey} is invalid`);
  }
  if (!Number.isInteger(body.count)) {
    throw new ProviderRequestError(502, `${label} count is invalid`);
  }

  return {
    next: readOptionalPageUrl(body.next, `${label} next`),
    previous: readOptionalPageUrl(body.previous, `${label} previous`),
    count: body.count,
    [itemsKey]: items.map((item) => requireProviderObject(item, `${label} item`)),
  };
}

function normalizeDetailResponse(payload: unknown, label: string): { detail: string } {
  const body = requireProviderObject(payload, label);
  const detail = optionalString(body.detail);
  if (!detail) {
    throw new ProviderRequestError(502, `${label} detail is invalid`);
  }

  return { detail };
}

function createSimplesatError(status: number, payload: unknown, phase: SimplesatRequestPhase): ProviderRequestError {
  const message = extractSimplesatErrorMessage(payload) ?? `Simplesat request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractSimplesatErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
  if (directMessage) {
    return directMessage;
  }

  for (const [field, value] of Object.entries(record)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const firstMessage = value.find((item) => typeof item === "string");
    if (typeof firstMessage === "string" && firstMessage.trim()) {
      return `${field}: ${firstMessage.trim()}`;
    }
  }

  return undefined;
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return record;
}

function readObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(400, `${label} must be an object`);
  }

  return record;
}

function readOptionalPageUrl(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const url = optionalRawString(value);
  if (url === undefined) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return url;
}
