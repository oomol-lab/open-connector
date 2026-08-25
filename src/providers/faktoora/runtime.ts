import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { FaktooraActionName } from "./actions.ts";

import { requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface FaktooraCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

export const faktooraApiBaseUrl = "https://api.faktoora.com/api/v1";
const faktooraValidationPath = "/projects";

interface FaktooraContext {
  apiKey: string;
  fetcher: typeof fetch;
}

interface FaktooraRequestInput extends FaktooraContext {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: ReadonlyArray<readonly [string, string | number | undefined]>;
  body?: unknown;
  phase: "validate" | "execute";
}

interface FaktooraActionHandler {
  (input: Record<string, unknown>, context: FaktooraContext): Promise<unknown>;
}

export const faktooraActionHandlers: ProviderActionHandlers<"faktoora", FaktooraActionHandler> = {
  async list_projects(input, context) {
    return requestFaktooraJson({
      ...context,
      path: "/projects",
      query: [
        ["page", readOptionalNumber(input, "page")],
        ["perPage", readOptionalNumber(input, "perPage")],
        ["keyword", readOptionalString(input, "keyword")],
        ...repeatedQuery(input, "status"),
        ...repeatedQuery(input, "customerId"),
        ["sort", readOptionalString(input, "sort")],
        ["order", readOptionalString(input, "order")],
      ],
      phase: "execute",
    });
  },
  async create_project(input, context) {
    return requestFaktooraJson({
      ...context,
      path: "/project",
      method: "POST",
      body: projectBody(input),
      phase: "execute",
    });
  },
  async get_project(input, context) {
    return requestFaktooraJson({
      ...context,
      path: `/project/${encodeURIComponent(readRequiredString(input, "projectId"))}`,
      phase: "execute",
    });
  },
  async update_project(input, context) {
    return requestFaktooraJson({
      ...context,
      path: `/project/${encodeURIComponent(readRequiredString(input, "projectId"))}`,
      method: "PATCH",
      body: projectBody(input),
      phase: "execute",
    });
  },
  async delete_project(input, context) {
    return requestFaktooraJson({
      ...context,
      path: `/project/${encodeURIComponent(readRequiredString(input, "projectId"))}`,
      method: "DELETE",
      phase: "execute",
    });
  },
  async attach_project_document(input, context) {
    return requestFaktooraJson({
      ...context,
      path: `/project/${encodeURIComponent(readRequiredString(input, "projectId"))}/document`,
      method: "POST",
      body: documentBody(input),
      phase: "execute",
    });
  },
  async detach_project_document(input, context) {
    return requestFaktooraJson({
      ...context,
      path: `/project/${encodeURIComponent(readRequiredString(input, "projectId"))}/document`,
      method: "DELETE",
      body: documentBody(input),
      phase: "execute",
    });
  },
};

export async function validateFaktooraCredential(
  input: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<FaktooraCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  await requestFaktooraJson({
    apiKey,
    fetcher,
    path: faktooraValidationPath,
    query: [
      ["page", 1],
      ["perPage", 1],
    ],
    phase: "validate",
  });

  return {
    accountLabel: "Faktoora API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: faktooraApiBaseUrl,
      validationEndpoint: faktooraValidationPath,
    },
  };
}

export async function executeFaktooraAction(
  actionName: FaktooraActionName,
  input: Record<string, unknown>,
  providerInput: ApiKeyProviderActionInput,
  fetcher: typeof fetch,
): Promise<unknown> {
  return faktooraActionHandlers[actionName](input, {
    apiKey: providerInput.apiKey,
    fetcher,
  });
}

async function requestFaktooraJson(input: FaktooraRequestInput): Promise<unknown> {
  const url = new URL(`${faktooraApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined) url.searchParams.append(key, String(value));
  }

  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": input.apiKey,
  });
  if (input.body !== undefined) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Faktoora request failed: ${error.message}` : "Faktoora request failed",
    );
  }

  const payload = await readFaktooraPayload(response);
  if (!response.ok) throw createFaktooraError(response.status, payload, input.phase);
  return payload;
}

async function readFaktooraPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (!response.ok) return text;
    const reason = error instanceof Error ? error.message : "unknown parse error";
    throw new ProviderRequestError(502, `Faktoora returned invalid JSON: ${reason}`);
  }
}

function createFaktooraError(status: number, payload: unknown, phase: FaktooraRequestInput["phase"]) {
  const message = extractMessage(payload) ?? `Faktoora request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function extractMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return null;
}

function projectBody(input: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const key of ["name", "description", "place", "eta", "estMinutes", "currency", "status", "customerId"]) {
    if (input[key] !== undefined) body[key] = input[key];
  }
  return body;
}

function documentBody(input: Record<string, unknown>) {
  return {
    documentId: readRequiredString(input, "documentId"),
    documentType: readRequiredString(input, "documentType"),
  };
}

function readRequiredString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(400, `${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "string" ? input[key] : undefined;
}

function readOptionalNumber(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "number" ? input[key] : undefined;
}

function repeatedQuery(input: Record<string, unknown>, key: "status" | "customerId"): Array<readonly [string, string]> {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => [key, String(item)] as const);
}
