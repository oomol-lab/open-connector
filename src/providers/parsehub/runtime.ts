import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const parsehubApiBaseUrl = "https://www.parsehub.com/api/v2";
const parsehubProjectsPath = "/projects";
const parsehubValidationLimit = 1;

type ParsehubRequestPhase = "validate" | "execute";
type ParsehubActionContext = ApiKeyProviderContext;
type ParsehubActionHandler = (input: Record<string, unknown>, context: ParsehubActionContext) => Promise<unknown>;

export const parsehubActionHandlers: ProviderActionHandlers<"parsehub", ParsehubActionHandler> = {
  list_projects(input, context) {
    return listParsehubProjects(input, context);
  },
  get_project(input, context) {
    return getParsehubProject(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("parsehub", parsehubActionHandlers);

export async function validateParsehubCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestParsehubJson({
    path: parsehubProjectsPath,
    apiKey,
    fetcher,
    phase: "validate",
    query: {
      limit: parsehubValidationLimit,
      offset: 0,
    },
  });
  const totalProjects = readTotalProjects(payload);

  return {
    profile: {
      accountId: "parsehub-api-key",
      displayName: "ParseHub API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: parsehubApiBaseUrl,
      validationEndpoint: parsehubProjectsPath,
      totalProjects,
    }),
  };
}

async function listParsehubProjects(input: Record<string, unknown>, context: ParsehubActionContext) {
  const payload = await requestParsehubJson({
    path: parsehubProjectsPath,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    query: compactObject({
      limit: input.limit,
      offset: input.offset,
    }),
  });

  return normalizeProjectList(payload);
}

async function getParsehubProject(input: Record<string, unknown>, context: ParsehubActionContext) {
  const projectToken = requiredString(input.projectToken, "projectToken", providerOutputError);
  const payload = await requestParsehubJson({
    path: `${parsehubProjectsPath}/${encodeURIComponent(projectToken)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    project: normalizeProjectDetail(payload),
  };
}

async function requestParsehubJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: ParsehubRequestPhase;
  query?: Record<string, unknown>;
}) {
  const url = new URL(`${parsehubApiBaseUrl}${input.path}`);
  url.searchParams.set("api_key", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ParseHub request failed: ${error.message}` : "ParseHub request failed",
    );
  }

  const payload = await readParsehubPayload(response);
  if (!response.ok) {
    throw mapParsehubError(response.status, payload, input.phase);
  }

  return payload;
}

async function readParsehubPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapParsehubError(status: number, payload: unknown, phase: ParsehubRequestPhase) {
  const message = extractParsehubErrorMessage(payload) ?? `ParseHub request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractParsehubErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 300);
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function normalizeProjectList(payload: unknown) {
  const record = requireObjectPayload(payload, "ParseHub project list");
  return {
    projects: readProjects(record),
    totalProjects: readTotalProjects(record),
    limit: optionalNumber(record.limit) ?? null,
    offset: optionalNumber(record.offset) ?? null,
  };
}

function readProjects(payload: unknown) {
  const projects = requireObjectPayload(payload, "ParseHub project list").projects;
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects.map(normalizeProjectSummary);
}

function readTotalProjects(payload: unknown) {
  return optionalNumber(optionalRecord(payload)?.total_projects) ?? readProjects(payload).length;
}

function normalizeProjectSummary(value: unknown) {
  const record = optionalRecord(value) ?? {};
  return {
    token: requiredString(record.token, "project token", providerOutputError),
    name: requiredString(record.name, "project name", providerOutputError),
    lastRun: normalizeLastRun(record.last_run),
    templates: normalizeTemplates(record.templates),
    raw: record,
  };
}

function normalizeProjectDetail(payload: unknown) {
  const record = requireObjectPayload(payload, "ParseHub project detail");
  return {
    token: requiredString(record.token, "project token", providerOutputError),
    name: optionalString(record.name) ?? optionalString(record.title) ?? null,
    title: optionalString(record.title) ?? optionalString(record.name) ?? null,
    lastRunToken: optionalString(record.last_run) ?? null,
    lastReadyRunToken: optionalString(record.last_ready_run) ?? null,
    optionsJson: optionalString(record.options_json) ?? null,
    mainTemplate: optionalString(record.main_template) ?? null,
    mainSite: optionalString(record.main_site) ?? null,
    raw: record,
  };
}

function normalizeLastRun(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    token: optionalString(record.token) ?? null,
    status: optionalString(record.status) ?? null,
    data: optionalString(record.data) ?? null,
    dateCreated: optionalString(record.date_created) ?? null,
    dateUpdated: optionalString(record.date_updated) ?? null,
    raw: record,
  };
}

function normalizeTemplates(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = optionalRecord(item) ?? {};
    return {
      name: requiredString(record.name, "template name", providerOutputError),
      templateToken: requiredString(record.template_token, "template token", providerOutputError),
      raw: record,
    };
  });
}

function providerOutputError(message: string) {
  return new ProviderRequestError(502, `ParseHub response is missing ${message.replace(" is required.", "")}`);
}

function requireObjectPayload(payload: unknown, label: string) {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be a JSON object`);
  }

  return record;
}
