import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { AgentMailActionName, AgentMailOperationDefinition } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { agentMailOperationByActionName } from "./actions.ts";

export const agentMailApiBaseUrl = "https://api.agentmail.to";

type AgentMailRequestPhase = "execute" | "validate";
type AgentMailRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type AgentMailActionHandler = (input: Record<string, unknown>, context: AgentMailActionContext) => Promise<unknown>;

interface AgentMailActionContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const agentMailActionHandlers = Object.fromEntries(
  Object.keys(agentMailOperationByActionName).map((actionName) => [
    actionName,
    (input: Record<string, unknown>, context: AgentMailActionContext) =>
      executeAgentMailOperation(input, context, agentMailOperationByActionName[actionName as AgentMailActionName]),
  ]),
) as Record<AgentMailActionName, AgentMailActionHandler>;

export async function validateAgentMailCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "agent_mail api_key is required");
  }

  const payload = await requestAgentMailJson<Record<string, unknown>>({
    apiKey: trimmedApiKey,
    path: "/v0/inboxes",
    query: {
      limit: "1",
    },
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "AgentMail API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v0/inboxes?limit=1",
      inboxCount: optionalInteger(payload.count),
      apiBaseUrl: agentMailApiBaseUrl,
    }),
  };
}

async function executeAgentMailOperation(
  input: Record<string, unknown>,
  context: AgentMailActionContext,
  operation: AgentMailOperationDefinition,
) {
  const pathParamValues = collectPathParams(input, operation.pathParams ?? []);
  const payload = await requestAgentMailJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: buildOperationPath(operation.path, pathParamValues),
    method: operation.method,
    query: collectFields(input, operation.queryParams ?? []),
    body:
      shouldSendBody(operation.method) && operation.bodyFields
        ? collectFields(input, operation.bodyFields ?? [])
        : undefined,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: operation.notFoundAsInvalidInput,
  });

  if (operation.method === "DELETE") {
    return {
      ...collectFields(input, operation.deleteIdFields ?? operation.pathParams ?? []),
      deleted: true,
    };
  }

  return payload;
}

async function requestAgentMailJson<T>(input: {
  apiKey: string;
  path: string;
  method?: AgentMailRequestMethod;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: AgentMailRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  let response: Response;
  let payload: unknown;

  try {
    const hasJsonBody = input.body !== undefined;
    response = await input.fetcher(buildAgentMailUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: agentMailHeaders(input.apiKey, hasJsonBody),
      ...(hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
      signal: input.signal,
    });
    payload = await readAgentMailPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `AgentMail ${input.phase} request failed: ${error.message}`
        : `AgentMail ${input.phase} request failed`,
    );
  }

  if (!response.ok) {
    throw createAgentMailError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    throw new ProviderRequestError(502, "AgentMail returned a non-object response");
  }

  return objectPayload as T;
}

function collectPathParams(input: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.map((field) => [field, requireFieldString(input, field)]));
}

function collectFields(input: Record<string, unknown>, fields: readonly string[]) {
  return compactObject(Object.fromEntries(fields.map((field) => [field, input[field]])) as Record<string, unknown>);
}

function shouldSendBody(method: AgentMailRequestMethod) {
  return method === "POST" || method === "PATCH";
}

function buildOperationPath(path: string, params: Record<string, string>) {
  let resolvedPath = path;
  for (const [key, value] of Object.entries(params)) {
    resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
  }
  return resolvedPath;
}

function buildAgentMailUrl(path: string, query?: Record<string, unknown>) {
  const url = new URL(path, agentMailApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item) {
          url.searchParams.append(key, item);
        }
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function agentMailHeaders(apiKey: string, hasJsonBody: boolean) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
    "User-Agent": providerUserAgent,
  };
}

async function readAgentMailPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "AgentMail returned invalid JSON");
  }
}

function createAgentMailError(
  response: Response,
  payload: unknown,
  phase: AgentMailRequestPhase,
  notFoundAsInvalidInput = false,
) {
  const payloadObject = optionalRecord(payload);
  const message =
    optionalString(payloadObject?.message) ??
    optionalString(payloadObject?.error) ??
    `AgentMail request failed with status ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function requireFieldString(input: Record<string, unknown>, fieldName: string) {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}
