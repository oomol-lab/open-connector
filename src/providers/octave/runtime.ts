import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  booleanString,
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const octaveApiBaseUrl = "https://app.octavehq.com";
export const octaveValidationPath = "/api/v2/api-key/validate";

type OctaveActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OctaveRequestOptions {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const octaveActionHandlers: ProviderActionHandlers<"octave", OctaveActionHandler> = {
  validate_api_key(_input, context) {
    return validateApiKeyAction(context);
  },
  list_agents(input, context) {
    return listAgents(input, context);
  },
  get_agent(input, context) {
    return getAgent(input, context);
  },
  list_agent_types(_input, context) {
    return listAgentTypes(context);
  },
  list_languages(_input, context) {
    return listLanguages(context);
  },
  run_enrich_company_agent(input, context) {
    return runAgent("/api/v2/agents/enrich-company/run", input, context);
  },
  run_enrich_person_agent(input, context) {
    return runAgent("/api/v2/agents/enrich-person/run", input, context);
  },
  run_qualify_company_agent(input, context) {
    return runAgent("/api/v2/agents/qualify-company/run", input, context);
  },
  run_qualify_person_agent(input, context) {
    return runAgent("/api/v2/agents/qualify-person/run", input, context);
  },
  run_call_prep_agent(input, context) {
    return runAgent("/api/v2/agents/call-prep/run", input, context);
  },
  run_context_agent(input, context) {
    return runAgent("/api/v2/agents/context/run", input, context);
  },
};

export async function validateOctaveCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const output = await validateApiKeyAction({ apiKey, fetcher, signal });
  if (output.valid !== true) {
    throw new ProviderRequestError(400, "invalid Octave API key", output.raw);
  }

  const workspaceOId = optionalString(output.workspaceOId);
  const organizationOId = optionalString(output.organizationOId);
  const organizationSlug = optionalString(output.organizationSlug);
  if (!workspaceOId || !organizationOId || !organizationSlug) {
    throw new ProviderRequestError(502, "Octave returned an invalid API key validation payload", output.raw);
  }

  const workspaceName = optionalString(output.workspaceName);
  const organizationName = optionalString(output.organizationName);

  return {
    profile: {
      accountId: workspaceOId,
      displayName: workspaceName ?? organizationName ?? "Octave API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: octaveApiBaseUrl,
      validationEndpoint: octaveValidationPath,
      workspaceOId,
      workspaceName,
      organizationOId,
      organizationName,
      organizationSlug,
    }),
  };
}

async function validateApiKeyAction(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const payload = await requestOctaveJson({
    context,
    path: octaveValidationPath,
    mode: "validate",
  });
  const body = requireObject(payload, "Octave returned an invalid API key validation payload");

  return {
    metadata: readMetadata(body),
    status: body.status,
    valid: body.valid,
    workspaceOId: body.workspaceOId,
    workspaceName: body.workspaceName,
    workspaceDomain: body.workspaceDomain ?? null,
    organizationOId: body.organizationOId,
    organizationName: body.organizationName,
    organizationDomain: body.organizationDomain ?? null,
    organizationSlug: body.organizationSlug,
    mcpUrl: body.mcpUrl ?? null,
    credits: optionalRecord(body.credits) ?? {},
    raw: body,
  };
}

async function listAgents(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestOctaveJson({
    context,
    path: "/api/v2/agents/list",
    mode: "execute",
    query: compactObject({
      type: optionalString(input.type),
      query: optionalString(input.query),
      offset: numberQuery(input.offset),
      limit: numberQuery(input.limit),
      orderField: optionalString(input.orderField),
      orderDirection: optionalString(input.orderDirection),
      includeExperiments: booleanString(input.includeExperiments),
    }),
  });
  const body = requireObject(payload, "Octave returned an invalid agent list payload");

  return {
    metadata: readMetadata(body),
    hasNext: optionalBoolean(body.hasNext) ?? false,
    total: optionalNumber(body.total) ?? 0,
    agents: Array.isArray(body.data) ? body.data : [],
    raw: body,
  };
}

async function getAgent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestOctaveJson({
    context,
    path: "/api/v2/agents/get",
    mode: "execute",
    query: {
      oId: requiredInputString(input.oId, "oId"),
    },
  });
  const body = requireObject(payload, "Octave returned an invalid agent payload");

  return {
    metadata: readMetadata(body),
    agent: optionalRecord(body.data) ?? {},
    raw: body,
  };
}

async function listAgentTypes(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestOctaveJson({
    context,
    path: "/api/v2/agents/types",
    mode: "execute",
  });
  const body = requireObject(payload, "Octave returned an invalid agent type list payload");

  return {
    metadata: readMetadata(body),
    total: optionalNumber(body.total) ?? 0,
    agentTypes: Array.isArray(body.data) ? body.data : [],
    raw: body,
  };
}

async function listLanguages(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestOctaveJson({
    context,
    path: "/api/v2/agents/languages",
    mode: "execute",
  });
  const body = requireObject(payload, "Octave returned an invalid language list payload");

  return {
    metadata: readMetadata(body),
    languages: Array.isArray(body.data) ? body.data : [],
    raw: body,
  };
}

async function runAgent(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestOctaveJson({
    context,
    path,
    method: "POST",
    mode: "execute",
    body: compactObject(input),
  });
  const body = requireObject(payload, "Octave returned an invalid agent run payload");

  return {
    metadata: readMetadata(body),
    found: optionalBoolean(body.found) ?? false,
    message: optionalString(body.message) ?? null,
    data: body.data ?? null,
    raw: body,
  };
}

async function requestOctaveJson(options: OctaveRequestOptions): Promise<unknown> {
  const url = new URL(`${octaveApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    api_key: options.context.apiKey,
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await options.context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.context.signal,
    });
    payload = await readResponsePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Octave request failed: ${error.message}` : "Octave request failed",
    );
  }

  if (!response.ok) {
    throw mapOctaveError(response.status, payload, options.mode);
  }

  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Octave returned malformed JSON");
  }
}

function mapOctaveError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Octave API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const metadata = optionalRecord(body._metadata);
  return optionalString(body.message) ?? optionalString(metadata?.message);
}

function readMetadata(body: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(body._metadata) ?? {};
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, message);
}

function numberQuery(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}
