import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "teamtailor";
const teamtailorEuApiBaseUrl = "https://api.teamtailor.com";
const teamtailorNaApiBaseUrl = "https://api.na.teamtailor.com";
const teamtailorApiVersion = "20240904";
const teamtailorDefaultRequestTimeoutMs = 30_000;

type TeamtailorStack = "eu" | "na";
type TeamtailorPhase = "validate" | "execute";
interface TeamtailorContext extends ApiKeyProviderContext {
  defaultStack: TeamtailorStack;
}

type TeamtailorActionHandler = (input: Record<string, unknown>, context: TeamtailorContext) => Promise<unknown>;

export const teamtailorActionHandlers: ProviderActionHandlers<"teamtailor", TeamtailorActionHandler> = {
  async list_jobs(input, context): Promise<unknown> {
    return listResources(input, context, "/v1/jobs", {
      "filter[department]": optionalString(input.departmentId),
      "filter[location]": optionalString(input.locationId),
      "filter[status]": optionalString(input.status),
      sort: optionalString(input.sort),
    });
  },
  async retrieve_job(input, context): Promise<unknown> {
    const jobId = requiredProviderString(input.jobId, "jobId");
    const payload = await requestTeamtailorJson({
      apiKey: context.apiKey,
      stack: resolveStack(input, context),
      path: `/v1/jobs/${encodeURIComponent(jobId)}`,
      query: compactObject({
        include: readOptionalInclude(input.include),
      }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return normalizeSingleResourceResponse(payload, "Teamtailor job response");
  },
  async list_departments(input, context): Promise<unknown> {
    return listResources(input, context, "/v1/departments", {
      sort: optionalString(input.sort),
    });
  },
  async list_locations(input, context): Promise<unknown> {
    return listResources(input, context, "/v1/locations", {
      sort: optionalString(input.sort),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<TeamtailorContext>({
  service,
  handlers: teamtailorActionHandlers,
  async createContext(context, fetcher: ProviderFetch): Promise<TeamtailorContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: TeamtailorContext = {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      defaultStack: readStack(optionalString(credential.values.stack) ?? optionalString(credential.metadata.stack)),
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return getTeamtailorBaseUrl(
      readStack(optionalString(credential.values.stack) ?? optionalString(credential.metadata.stack)),
    );
  },
  auth: { type: "api_key_authorization", prefix: "Token token=" },
  customizeRequest({ headers }) {
    headers.set("x-api-version", teamtailorApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const stack = readStack(input.values.stack);
    const payload = await requestTeamtailorJson({
      apiKey: input.apiKey,
      stack,
      path: "/v1/jobs",
      query: { "page[size]": "1" },
      context: { fetcher, signal },
      phase: "validate",
    });
    const body = requiredProviderRecord(payload, "Teamtailor jobs response");
    const jobs = readRequiredArray(body.data, "Teamtailor jobs response data");

    return {
      profile: {
        displayName: `Teamtailor ${stack.toUpperCase()} API Key`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: getTeamtailorBaseUrl(stack),
        apiVersion: teamtailorApiVersion,
        stack,
        validationEndpoint: "/v1/jobs?page[size]=1",
        sampleJobCount: jobs.length,
      },
    };
  },
};

async function listResources(
  input: Record<string, unknown>,
  context: TeamtailorContext,
  path: string,
  extraQuery: Record<string, string | undefined>,
): Promise<unknown> {
  const payload = await requestTeamtailorJson({
    apiKey: context.apiKey,
    stack: resolveStack(input, context),
    path,
    query: compactObject({
      "page[size]": readOptionalPositiveIntegerString(input.pageSize, "pageSize"),
      "page[after]": optionalString(input.pageAfter),
      "page[before]": optionalString(input.pageBefore),
      include: readOptionalInclude(input.include),
      ...extraQuery,
    }),
    context,
    phase: "execute",
  });
  return normalizeListResponse(payload, `Teamtailor ${path} response`);
}

async function requestTeamtailorJson(input: {
  apiKey: string;
  stack: TeamtailorStack;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TeamtailorPhase;
  query?: Record<string, string | undefined>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(input.path, `${getTeamtailorBaseUrl(input.stack)}/`);
  setSearchParams(url, input.query ?? {});
  const timeout = createProviderTimeout(input.context.signal, teamtailorDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/vnd.api+json",
        authorization: `Token token=${input.apiKey}`,
        "user-agent": providerUserAgent,
        "x-api-version": teamtailorApiVersion,
      },
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw mapTeamtailorError(response, payload, input.phase, input.notFoundAsInvalidInput);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `teamtailor ${input.phase} request timed out`);
    }
    throw new ProviderRequestError(502, `teamtailor ${input.phase} request failed`);
  } finally {
    timeout.cleanup();
  }
}

function getTeamtailorBaseUrl(stack: TeamtailorStack): string {
  return stack === "na" ? teamtailorNaApiBaseUrl : teamtailorEuApiBaseUrl;
}

function resolveStack(input: Record<string, unknown>, context: TeamtailorContext): TeamtailorStack {
  return readStack(optionalString(input.stack) ?? context.defaultStack);
}

function readStack(value: unknown): TeamtailorStack {
  return value === "na" ? "na" : "eu";
}

function normalizeListResponse(payload: unknown, label: string): Record<string, unknown> {
  const body = requiredProviderRecord(payload, label);
  return {
    data: readRequiredArray(body.data, `${label} data`),
    included: readArray(body.included),
    links: optionalRecord(body.links) ?? null,
    meta: optionalRecord(body.meta) ?? null,
    raw: body,
  };
}

function normalizeSingleResourceResponse(payload: unknown, label: string): Record<string, unknown> {
  const body = requiredProviderRecord(payload, label);
  return {
    data: requiredProviderRecord(body.data, `${label} data`),
    included: readArray(body.included),
    links: optionalRecord(body.links) ?? null,
    meta: optionalRecord(body.meta) ?? null,
    raw: body,
  };
}

function readOptionalInclude(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parts = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return parts.length > 0 ? parts.join(",") : undefined;
}

function readOptionalPositiveIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(parsed);
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => requiredProviderRecord(item, "Teamtailor resource")) : [];
}

function readRequiredArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} was not an array`);
  }
  return value.map((item) => requiredProviderRecord(item, "Teamtailor resource"));
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "teamtailor returned invalid JSON");
  }
}

function mapTeamtailorError(
  response: Response,
  payload: unknown,
  phase: TeamtailorPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readTeamtailorErrorMessage(payload) ?? `teamtailor request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 500, `teamtailor ${phase} request failed: ${message}`);
}

function readTeamtailorErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  const firstError = optionalRecord(errors[0]);
  return firstError
    ? (optionalString(firstError.detail) ?? optionalString(firstError.title))
    : (optionalString(body?.message) ?? optionalString(body?.error));
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredProviderRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, message));
}
