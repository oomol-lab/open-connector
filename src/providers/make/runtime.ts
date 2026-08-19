import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const makeDefaultZoneUrl = "https://eu1.make.com";

const makeApiVersionPath = "/api/v2";
const makeValidationPath = "/users/me";

type MakeRequestPhase = "validate" | "execute";

interface MakeActionContext {
  apiKey: string;
  zoneUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface MakeRequestOptions extends MakeActionContext {
  path: string;
  phase: MakeRequestPhase;
  method?: "GET" | "POST";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}

type MakeActionHandler = (input: Record<string, unknown>, context: MakeActionContext) => Promise<unknown>;

export const makeActionHandlers: ProviderActionHandlers<"make", MakeActionHandler> = {
  async get_current_user(input, context) {
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      path: "/users/me",
      query: buildMakeQuery(input, {
        booleanKeys: ["includeInvitedOrg"],
        arrayKeys: { cols: "cols[]" },
      }),
      phase: "execute",
    });

    return {
      user: readObject(raw.authUser, "make current user response"),
      raw,
    };
  },
  async get_current_authorization(_input, context) {
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      path: "/users/me/current-authorization",
      phase: "execute",
    });

    return {
      authorization: readObject(raw.authorization, "make authorization response"),
      raw,
    };
  },
  async list_teams(input, context) {
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      path: "/teams",
      query: buildMakeQuery(input, {
        integerKeys: ["organizationId"],
        pagination: true,
      }),
      phase: "execute",
    });

    return compactObject({
      teams: readArray(raw.teams, "make teams response"),
      pg: optionalRecord(raw.pg),
      raw,
    });
  },
  async list_scenarios(input, context) {
    validateScenarioListScope(input);
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      path: "/scenarios",
      query: buildMakeQuery(input, {
        integerKeys: ["teamId", "organizationId", "folderId"],
        booleanKeys: ["isActive", "concept"],
        stringKeys: ["type"],
        arrayKeys: {
          ids: "id[]",
          cols: "cols[]",
        },
        pagination: true,
      }),
      phase: "execute",
    });

    return compactObject({
      scenarios: readArray(raw.scenarios, "make scenarios response"),
      pg: optionalRecord(raw.pg),
      raw,
    });
  },
  async get_scenario(input, context) {
    const scenarioId = readRequiredPositiveInteger(input.scenarioId, "scenarioId");
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      path: `/scenarios/${scenarioId}`,
      query: buildMakeQuery(input, {
        arrayKeys: { cols: "cols[]" },
      }),
      phase: "execute",
    });

    return {
      scenario: readObject(raw.scenario, "make scenario response"),
      raw,
    };
  },
  async activate_scenario(input, context) {
    return makeScenarioStateRequest(input, context, "active");
  },
  async deactivate_scenario(input, context) {
    return makeScenarioStateRequest(input, context, "inactive");
  },
  async run_scenario_once(input, context) {
    const scenarioId = readRequiredPositiveInteger(input.scenarioId, "scenarioId");
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      method: "POST",
      path: `/scenarios/${scenarioId}/run`,
      body: compactObject({
        data: optionalRecord(input.data),
        responsive: input.responsive,
        callbackUrl: input.callbackUrl,
      }),
      phase: "execute",
    });

    return {
      executionId: optionalString(raw.executionId),
      status: optionalString(raw.status),
      raw,
    };
  },
  async get_scenario_usage(input, context) {
    const scenarioId = readRequiredPositiveInteger(input.scenarioId, "scenarioId");
    const raw = await requestMakeJson<Record<string, unknown>>({
      ...context,
      path: `/scenarios/${scenarioId}/usage`,
      query: buildMakeQuery(input, {
        booleanKeys: ["organizationTimezone"],
      }),
      phase: "execute",
    });

    return {
      usage: readArray(raw.data, "make scenario usage response"),
      raw,
    };
  },
};

export async function validateMakeCredential(
  input: { apiKey: string; zoneUrl?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const zoneUrl = normalizeMakeZoneUrl(input.zoneUrl);
  const raw = await requestMakeJson<Record<string, unknown>>({
    apiKey: input.apiKey,
    zoneUrl,
    path: makeValidationPath,
    fetcher,
    signal,
    phase: "validate",
  });
  const user = readObject(raw.authUser, "make current user response");
  const userId = optionalNumber(user.id);
  const email = optionalString(user.email);
  const name = optionalString(user.name);

  return {
    profile: {
      accountId: userId === undefined ? "api_key" : `make:${zoneUrl}:${userId}`,
      displayName: email ?? name ?? "Make API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      zoneUrl,
      apiBaseUrl: buildMakeApiBaseUrl(zoneUrl),
      validationEndpoint: makeValidationPath,
      userId,
      userEmail: email,
      userName: name,
    }),
  };
}

export function resolveMakeZoneUrl(credential: Extract<ResolvedCredential, { authType: "api_key" }>): string {
  return normalizeMakeZoneUrl(credential.values.zoneUrl ?? credential.metadata.zoneUrl);
}

async function makeScenarioStateRequest(
  input: Record<string, unknown>,
  context: MakeActionContext,
  state: "active" | "inactive",
): Promise<unknown> {
  const scenarioId = readRequiredPositiveInteger(input.scenarioId, "scenarioId");
  const raw = await requestMakeJson<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/scenarios/${scenarioId}/${state === "active" ? "start" : "stop"}`,
    phase: "execute",
  });

  return {
    success: true,
    raw,
  };
}

async function requestMakeJson<T>(input: MakeRequestOptions): Promise<T> {
  const url = new URL(`${makeApiVersionPath}${input.path}`, input.zoneUrl);
  if (input.query) {
    for (const [key, value] of input.query.entries()) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  const body = input.body ? JSON.stringify(input.body) : undefined;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildMakeHeaders(input.apiKey, body !== undefined),
      body,
      signal: input.signal,
    });
    payload = await readMakePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    throw new ProviderRequestError(502, `make ${input.phase} request failed: ${message}`);
  }

  if (!response.ok) {
    throw createMakeError(response, payload, input.phase);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "invalid make response body", payload);
  }

  return payload as T;
}

function buildMakeHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    authorization: `Token ${apiKey}`,
  }) as Record<string, string>;
}

async function readMakePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "make response body is not valid JSON");
  }
}

function createMakeError(response: Response, payload: unknown, phase: MakeRequestPhase): ProviderRequestError {
  const message = extractMakeErrorMessage(payload) ?? response.statusText ?? `make ${phase} request failed`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractMakeErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const value of [record.message, record.error, record.detail]) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return optionalString(firstError?.message);
}

function buildMakeQuery(
  input: Record<string, unknown>,
  options: {
    integerKeys?: string[];
    booleanKeys?: string[];
    stringKeys?: string[];
    arrayKeys?: Record<string, string>;
    pagination?: boolean;
  },
): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of options.integerKeys ?? []) {
    appendOptionalValue(query, key, input[key]);
  }
  for (const key of options.booleanKeys ?? []) {
    appendOptionalValue(query, key, input[key]);
  }
  for (const key of options.stringKeys ?? []) {
    appendOptionalValue(query, key, input[key]);
  }
  for (const [inputKey, queryKey] of Object.entries(options.arrayKeys ?? {})) {
    const value = input[inputKey];
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      appendOptionalValue(query, queryKey, item);
    }
  }
  if (options.pagination) {
    appendOptionalValue(query, "pg[offset]", input.offset);
    appendOptionalValue(query, "pg[limit]", input.limit);
    appendOptionalValue(query, "pg[sortBy]", input.sortBy);
    appendOptionalValue(query, "pg[sortDir]", input.sortDir);
  }
  return query;
}

function appendOptionalValue(query: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  query.append(key, String(value));
}

function normalizeMakeZoneUrl(value: unknown): string {
  const raw = optionalString(value) ?? makeDefaultZoneUrl;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "Make zoneUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "Make zoneUrl must use https");
  }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw new ProviderRequestError(400, "Make zoneUrl must not include credentials, port, query, or hash");
  }
  if (!isOfficialMakeHostname(parsed.hostname)) {
    throw new ProviderRequestError(400, "Make zoneUrl must use an official make.com host");
  }
  parsed.pathname = "";
  return parsed.toString().replace(/\/$/, "");
}

function buildMakeApiBaseUrl(zoneUrl: string): string {
  return `${zoneUrl}${makeApiVersionPath}`;
}

function isOfficialMakeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "make.com" || normalized.endsWith(".make.com");
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `invalid ${label}`, value);
  }
  return object;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid ${label}`, value);
  }
  return value;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function validateScenarioListScope(input: Record<string, unknown>): void {
  const hasTeamId = input.teamId !== undefined;
  const hasOrganizationId = input.organizationId !== undefined;
  if (hasTeamId === hasOrganizationId) {
    throw new ProviderRequestError(400, "provide exactly one of teamId or organizationId");
  }
}
