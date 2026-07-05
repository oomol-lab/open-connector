import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DeskTimeActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const desktimeApiBaseUrl = "https://desktime.com/api/v2/json";
const desktimeDefaultRequestTimeoutMs = 30_000;

type DeskTimePhase = "validate" | "execute";
type DeskTimeHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface NormalizedProjectTask {
  id: number | null;
  name: string | null;
  raw: Record<string, unknown>;
}

interface NormalizedProject {
  id: number | null;
  name: string | null;
  createdAt: string | null;
  tasks: NormalizedProjectTask[];
  raw: Record<string, unknown>;
}

export const desktimeActionHandlers: Record<DeskTimeActionName, DeskTimeHandler> = {
  async get_company(_input, context) {
    const payload = await requestDeskTimeJson({
      path: "/company",
      apiKey: context.apiKey,
      params: {},
      method: "GET",
      context,
      phase: "execute",
    });
    return { data: payload };
  },
  async list_employees(input, context) {
    const payload = await requestDeskTimeJson({
      path: "/employees",
      apiKey: context.apiKey,
      params: compactObject({
        date: optionalString(input.date),
        period: optionalString(input.period),
      }),
      method: "GET",
      context,
      phase: "execute",
    });
    return { data: payload };
  },
  async get_employee(input, context) {
    const payload = await requestDeskTimeJson({
      path: "/employee",
      apiKey: context.apiKey,
      params: compactObject({
        id: readOptionalIntegerString(input.employeeId),
        date: optionalString(input.date),
      }),
      method: "GET",
      context,
      phase: "execute",
    });
    return { data: payload };
  },
  async list_projects(_input, context) {
    const payload = await requestDeskTimeJson({
      path: "/projects",
      apiKey: context.apiKey,
      params: {},
      method: "GET",
      context,
      phase: "execute",
    });
    return {
      data: payload,
      projects: normalizeProjectList(payload.projects),
    };
  },
  async create_project(input, context) {
    const payload = await requestDeskTimeJson({
      path: "/create-project",
      apiKey: context.apiKey,
      params: compactObject({
        project: requiredString(input.project, "project", badInput),
        task: optionalString(input.task),
      }),
      method: "POST",
      context,
      phase: "execute",
    });
    return {
      data: payload,
      project: normalizeProject(readProjectPayload(payload)),
    };
  },
};

export async function validateDeskTimeCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const payload = await requestDeskTimeJson({
    path: "/company",
    apiKey,
    params: {},
    method: "GET",
    context,
    phase: "validate",
  });
  const companyName = readCompanyName(payload);

  return {
    profile: {
      accountId: companyName ?? "api_key",
      displayName: companyName ?? "DeskTime API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: desktimeApiBaseUrl,
      validationEndpoint: "/company",
      companyName,
    }),
  };
}

async function requestDeskTimeJson(input: {
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  method: "GET" | "POST";
  context: ApiKeyProviderContext;
  phase: DeskTimePhase;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, desktimeDefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.context.fetcher(buildDeskTimeUrl(input.path, input.apiKey, input.params), {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DeskTime request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DeskTime request failed: ${error.message}` : "DeskTime request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readDeskTimePayload(response);
  if (!response.ok) {
    throw createDeskTimeError(response.status, payload, input.phase);
  }

  const payloadRecord = optionalRecord(payload);
  if (!payloadRecord) {
    throw new ProviderRequestError(502, "DeskTime returned an invalid payload");
  }
  return payloadRecord;
}

function buildDeskTimeUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${desktimeApiBaseUrl}/`);
  url.searchParams.set("apiKey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readDeskTimePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DeskTime returned invalid JSON");
  }
}

function createDeskTimeError(status: number, payload: unknown, phase: DeskTimePhase): ProviderRequestError {
  const message = extractDeskTimeErrorMessage(payload) ?? `DeskTime request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 401 || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(
    status >= 500 ? 502 : 500,
    phase === "validate" ? `DeskTime credential validation failed: ${message}` : message,
    payload,
  );
}

function extractDeskTimeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["error", "message", "msg"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    const nestedMessage = optionalString(optionalRecord(value)?.message);
    if (nestedMessage) {
      return nestedMessage;
    }
  }
  return undefined;
}

function readProjectPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(payload.project) ?? payload;
}

function normalizeProjectList(value: unknown): NormalizedProject[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "DeskTime returned an invalid projects payload");
  }
  return value.map((item) => normalizeProject(item));
}

function normalizeProject(value: unknown): NormalizedProject {
  const project = optionalRecord(value);
  if (!project) {
    throw new ProviderRequestError(502, "DeskTime returned an invalid project payload");
  }
  return {
    id: readOptionalInteger(project.id),
    name: readNullableString(project.name),
    createdAt: readNullableString(project.created ?? project.created_at ?? project.createdAt),
    tasks: normalizeTaskList(project.tasks),
    raw: project,
  };
}

function normalizeTaskList(value: unknown): NormalizedProjectTask[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "DeskTime returned an invalid project task payload");
  }
  return value.map((item) => {
    const task = optionalRecord(item);
    if (!task) {
      throw new ProviderRequestError(502, "DeskTime returned an invalid project task payload");
    }
    return {
      id: readOptionalInteger(task.id),
      name: readNullableString(task.name),
      raw: task,
    };
  });
}

function readCompanyName(payload: Record<string, unknown>): string | null {
  const company = optionalRecord(payload.company) ?? payload;
  return readNullableString(company.name) ?? readNullableString(company.company_name);
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const integer = readOptionalInteger(value);
  return integer === null ? undefined : String(integer);
}

function readOptionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
