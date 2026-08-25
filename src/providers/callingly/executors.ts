import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "callingly";
const callinglyApiBaseUrl = "https://api.callingly.com";

type CallinglyPhase = "validate" | "execute";
type QueryValue = string | number | undefined;
type CallinglyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const callinglyActionHandlers: ProviderActionHandlers<"callingly", CallinglyActionHandler> = {
  get_call(input, context) {
    return executeGetCall(input, context);
  },
  list_calls(input, context) {
    return executeListCalls(input, context);
  },
  create_call(input, context) {
    return executeCreateCall(input, context);
  },
  list_leads(input, context) {
    return executeListLeads(input, context);
  },
  get_lead(input, context) {
    return executeGetLead(input, context);
  },
  update_lead(input, context) {
    return executeUpdateLead(input, context);
  },
  delete_lead(input, context) {
    return executeDeleteLead(input, context);
  },
  list_teams(input, context) {
    return executeListTeams(input, context);
  },
  get_team(input, context) {
    return executeGetTeam(input, context);
  },
  list_team_agents(input, context) {
    return executeListTeamAgents(input, context);
  },
  list_agents(input, context) {
    return executeListAgents(input, context);
  },
  get_agent_schedule(input, context) {
    return executeGetAgentSchedule(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, callinglyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await callinglyRequestJson(
      {
        method: "GET",
        path: "/v1/teams",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    const teams = requireArray(payload, "Callingly teams validation payload");
    const firstTeam = optionalRecord(teams[0]);
    const accountId = optionalInteger(firstTeam?.account_id);

    return {
      profile: {
        accountId: String(accountId ?? "callingly"),
        displayName: "Callingly API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: callinglyApiBaseUrl,
        validationEndpoint: "/v1/teams",
        teamCount: teams.length,
        firstTeamId: optionalInteger(firstTeam?.id),
        firstTeamName: readOptionalTrimmedString(firstTeam?.name),
      }),
    };
  },
};

async function executeGetCall(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const callId = readRequiredInteger(input.callId, "callId");
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: `/v1/calls/${callId}`,
    },
    context,
    "execute",
  );
  return { call: requireObject(payload, "call") };
}

async function executeListCalls(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: "/v1/calls",
      query: compactObject({
        start: readOptionalTrimmedString(input.start),
        end: readOptionalTrimmedString(input.end),
        team_id: optionalInteger(input.teamId),
        account_id: optionalInteger(input.accountId),
        limit: optionalInteger(input.limit),
        page: optionalInteger(input.page),
      }),
    },
    context,
    "execute",
  );

  return { data: requireDataArray(payload, "calls") };
}

async function executeCreateCall(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await callinglyRequestJson(
    {
      method: "POST",
      path: "/v1/calls",
      body: compactObject({
        account_id: optionalInteger(input.account_id),
        team_id: readRequiredInteger(input.team_id, "team_id"),
        first_name: readRequiredTrimmedString(input.first_name, "first_name"),
        last_name: readRequiredTrimmedString(input.last_name, "last_name"),
        phone_number: readRequiredTrimmedString(input.phone_number, "phone_number"),
        email: readOptionalTrimmedString(input.email),
        company: readOptionalTrimmedString(input.company),
        category: readOptionalTrimmedString(input.category),
        source: readOptionalTrimmedString(input.source),
        crm_id: optionalInteger(input.crm_id),
        scheduled_at: readOptionalTrimmedString(input.scheduled_at),
      }),
    },
    context,
    "execute",
  );

  return { call: requireObject(payload, "created call") };
}

async function executeListLeads(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: "/v1/leads",
      query: compactObject({
        start: readOptionalTrimmedString(input.start),
        end: readOptionalTrimmedString(input.end),
        phone_number: readOptionalTrimmedString(input.phone_number),
        account_id: optionalInteger(input.accountId),
      }),
    },
    context,
    "execute",
  );

  return { data: requireArray(payload, "leads") };
}

async function executeGetLead(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const leadId = readRequiredInteger(input.leadId, "leadId");
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: `/v1/leads/${leadId}`,
    },
    context,
    "execute",
  );

  return { lead: requireObject(payload, "lead") };
}

async function executeUpdateLead(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const leadId = readRequiredInteger(input.leadId, "leadId");
  const payload = await callinglyRequestJson(
    {
      method: "PUT",
      path: `/v1/leads/${leadId}`,
      body: compactObject({
        id: optionalInteger(input.id),
        fname: readOptionalTrimmedString(input.fname),
        lname: readOptionalTrimmedString(input.lname),
        email: readOptionalTrimmedString(input.email),
        phone_number: readOptionalTrimmedString(input.phone_number),
        source: readOptionalTrimmedString(input.source),
        company: readOptionalTrimmedString(input.company),
        status: readOptionalTrimmedString(input.status),
        result: readNullableString(input.result),
        stage: readNullableString(input.stage),
        is_stopped: optionalInteger(input.is_stopped),
        is_blocked: optionalInteger(input.is_blocked),
      }),
    },
    context,
    "execute",
  );

  return { lead: requireObject(payload, "updated lead") };
}

async function executeDeleteLead(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const leadId = readRequiredInteger(input.leadId, "leadId");
  const payload = await callinglyRequestJson(
    {
      method: "DELETE",
      path: `/v1/leads/${leadId}`,
    },
    context,
    "execute",
  );

  return {
    success: readRequiredBoolean(requireObject(payload, "delete lead response").success, "success"),
  };
}

async function executeListTeams(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: "/v1/teams",
      query: compactObject({
        account_id: optionalInteger(input.accountId),
      }),
    },
    context,
    "execute",
  );

  return { data: requireArray(payload, "teams") };
}

async function executeGetTeam(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const teamId = readRequiredInteger(input.teamId, "teamId");
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: `/v1/teams/${teamId}`,
    },
    context,
    "execute",
  );

  return { team: requireObject(payload, "team") };
}

async function executeListTeamAgents(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const teamId = readRequiredInteger(input.teamId, "teamId");
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: `/v1/teams/${teamId}/agents`,
    },
    context,
    "execute",
  );

  const record = requireObject(payload, "team agents payload");
  return {
    agents: requireArray(record.agents, "team agents"),
  };
}

async function executeListAgents(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: "/v1/agents",
      query: compactObject({
        account_id: optionalInteger(input.account_id),
      }),
    },
    context,
    "execute",
  );

  return { data: requireArray(payload, "agents") };
}

async function executeGetAgentSchedule(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const agentId = readRequiredInteger(input.agentId, "agentId");
  const payload = await callinglyRequestJson(
    {
      method: "GET",
      path: `/v1/agents/${agentId}/schedule`,
    },
    context,
    "execute",
  );

  return { schedule: requireArray(payload, "agent schedule") };
}

interface CallinglyRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}

async function callinglyRequestJson(
  input: CallinglyRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: CallinglyPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildCallinglyUrl(input.path, input.query), {
      method: input.method,
      headers: buildCallinglyHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Callingly request failed: ${error.message}` : "Callingly request failed",
    );
  }

  if (!response.ok) {
    throw createCallinglyError(response.status, payload, phase);
  }

  return payload;
}

function buildCallinglyUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path, callinglyApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildCallinglyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Callingly returned invalid JSON");
  }
}

function createCallinglyError(status: number, payload: unknown, phase: CallinglyPhase): ProviderRequestError {
  const message = readCallinglyErrorMessage(payload) ?? `Callingly request failed with ${status || 500}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (status === 422 || status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readCallinglyErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_message);
}

function requireDataArray(payload: unknown, label: string): unknown[] {
  const record = requireObject(payload, `${label} payload`);
  return requireArray(record.data, `${label} data`);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return record;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalTrimmedString(value);
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}
