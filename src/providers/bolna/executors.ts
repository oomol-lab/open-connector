import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "bolna";
const bolnaApiBaseUrl = "https://api.bolna.ai";

type BolnaPhase = "validate" | "execute";
type BolnaQueryValue = boolean | number | string | undefined;
type BolnaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface BolnaRequestOptions {
  path: string;
  query?: Record<string, BolnaQueryValue>;
  phase: BolnaPhase;
  notFoundAsInvalidInput?: boolean;
}

export const bolnaActionHandlers: ProviderActionHandlers<"bolna", BolnaActionHandler> = {
  get_user_info(_input, context) {
    return getBolnaUserInfo(context, "execute");
  },
  list_agents(_input, context) {
    return listBolnaAgents(context);
  },
  get_agent(input, context) {
    return getBolnaAgent(input, context);
  },
  list_agent_executions(input, context) {
    return listBolnaAgentExecutions(input, context);
  },
  get_execution(input, context) {
    return getBolnaExecution(input, context);
  },
  get_execution_raw_logs(input, context) {
    return getBolnaExecutionRawLogs(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bolnaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await getBolnaUserInfo(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: user.id,
        displayName: user.email ?? user.name ?? "Bolna API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: bolnaApiBaseUrl,
        validationEndpoint: "/user/me",
        email: user.email,
        wallet: user.wallet,
        concurrency: user.concurrency,
      }),
    };
  },
};

async function getBolnaUserInfo(context: ApiKeyProviderContext, phase: BolnaPhase): Promise<BolnaUser> {
  const payload = await bolnaJsonRequest(
    {
      path: "/user/me",
      phase,
    },
    context,
  );

  return normalizeBolnaUser(payload);
}

async function listBolnaAgents(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await bolnaJsonRequest(
    {
      path: "/v2/agent/all",
      phase: "execute",
    },
    context,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Bolna agents response must be an array");
  }

  return {
    agents: payload.map((item, index) => normalizeBolnaAgent(item, `agents[${index}]`)),
  };
}

async function getBolnaAgent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const agentId = requiredString(input.agent_id, "agent_id", invalidInputError);
  const payload = await bolnaJsonRequest(
    {
      path: `/v2/agent/${encodeURIComponent(agentId)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    },
    context,
  );

  return {
    agent: normalizeBolnaAgent(payload, "agent"),
  };
}

async function listBolnaAgentExecutions(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const agentId = requiredString(input.agent_id, "agent_id", invalidInputError);
  const payload = await bolnaJsonRequest(
    {
      path: `/v2/agent/${encodeURIComponent(agentId)}/executions`,
      query: compactObject({
        page_number: optionalInteger(input.page_number),
        page_size: optionalInteger(input.page_size),
        status: optionalString(input.status),
        call_type: optionalString(input.call_type),
        provider: optionalString(input.provider),
        answered_by_voice_mail: optionalBoolean(input.answered_by_voice_mail),
        batch_id: optionalString(input.batch_id),
        from: optionalString(input.from),
        to: optionalString(input.to),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    },
    context,
  );

  const record = requiredRecord(payload, "Bolna execution list response", providerDataError);
  const data = record.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Bolna execution list did not include data");
  }

  return {
    page_number: readRequiredInteger(record.page_number, "page_number"),
    page_size: readRequiredInteger(record.page_size, "page_size"),
    total: readRequiredInteger(record.total, "total"),
    has_more: readRequiredBoolean(record.has_more, "has_more"),
    executions: data.map((item, index) => normalizeBolnaExecution(item, `executions[${index}]`)),
  };
}

async function getBolnaExecution(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const executionId = requiredString(input.execution_id, "execution_id", invalidInputError);
  const payload = await bolnaJsonRequest(
    {
      path: `/executions/${encodeURIComponent(executionId)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    },
    context,
  );

  return {
    execution: normalizeBolnaExecution(payload, "execution"),
  };
}

async function getBolnaExecutionRawLogs(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const executionId = requiredString(input.execution_id, "execution_id", invalidInputError);
  const payload = await bolnaJsonRequest(
    {
      path: `/executions/${encodeURIComponent(executionId)}/log`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    },
    context,
  );

  const record = requiredRecord(payload, "Bolna execution log response", providerDataError);
  const data = record.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Bolna execution log response did not include data");
  }

  return {
    status: readRequiredString(record.status, "status"),
    logs: data.map((item, index) => normalizeBolnaExecutionLog(item, `logs[${index}]`)),
  };
}

async function bolnaJsonRequest(options: BolnaRequestOptions, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL(options.path, bolnaApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readBolnaPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Bolna request failed: ${error.message}` : "Bolna request failed",
    );
  }

  if (!response.ok) {
    throw buildBolnaError(response.status, payload, options.phase, options.notFoundAsInvalidInput);
  }

  return payload;
}

async function readBolnaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Bolna returned invalid JSON");
  }
}

function buildBolnaError(
  status: number,
  payload: unknown,
  phase: BolnaPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const normalizedStatus = status >= 400 ? status : 502;
  const message = extractBolnaMessage(payload) ?? `Bolna request failed with ${normalizedStatus}`;

  if (normalizedStatus === 401 || normalizedStatus === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : normalizedStatus, message, payload);
  }

  if (normalizedStatus === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(normalizedStatus, message, payload);
}

function extractBolnaMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

interface BolnaUser extends Record<string, unknown> {
  id: string;
  name?: string;
  email?: string;
  wallet?: number;
  concurrency?: Record<string, unknown>;
}

function normalizeBolnaUser(payload: unknown): BolnaUser {
  const record = requiredRecord(payload, "Bolna user response", providerDataError);
  return compactObject({
    id: readRequiredString(record.id, "id"),
    name: optionalString(record.name),
    email: optionalString(record.email),
    wallet: optionalNumber(record.wallet),
    concurrency: normalizeBolnaConcurrency(record.concurrency),
  }) as BolnaUser;
}

function normalizeBolnaConcurrency(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    max: readRequiredInteger(record.max, "concurrency.max"),
    current: readRequiredInteger(record.current, "concurrency.current"),
  };
}

function normalizeBolnaAgent(payload: unknown, context: string): Record<string, unknown> {
  const record = requiredRecord(payload, `${context} response`, providerDataError);
  return compactObject({
    id: readRequiredString(record.id, `${context}.id`),
    agent_name: readRequiredString(record.agent_name, `${context}.agent_name`),
    agent_type: optionalString(record.agent_type),
    agent_status: optionalString(record.agent_status),
    created_at: readRequiredString(record.created_at, `${context}.created_at`),
    updated_at: optionalString(record.updated_at),
    tasks: normalizeLooseObjectArray(record.tasks, `${context}.tasks`),
    ingest_source_config: normalizeNullableLooseObject(record.ingest_source_config, `${context}.ingest_source_config`),
    agent_prompts: normalizeLooseObject(record.agent_prompts, `${context}.agent_prompts`),
  });
}

function normalizeBolnaExecution(payload: unknown, context: string): Record<string, unknown> {
  const record = requiredRecord(payload, `${context} response`, providerDataError);
  return compactObject({
    id: readRequiredString(record.id, `${context}.id`),
    agent_id: readRequiredString(record.agent_id, `${context}.agent_id`),
    batch_id: optionalString(record.batch_id),
    conversation_duration: optionalNumber(record.conversation_duration),
    total_cost: optionalNumber(record.total_cost),
    status: readRequiredString(record.status, `${context}.status`),
    error_message: optionalString(record.error_message),
    answered_by_voice_mail: optionalBoolean(record.answered_by_voice_mail),
    transcript: optionalString(record.transcript),
    created_at: readRequiredString(record.created_at, `${context}.created_at`),
    updated_at: optionalString(record.updated_at),
    cost_breakdown: normalizeLooseObject(record.cost_breakdown, `${context}.cost_breakdown`),
    telephony_data: normalizeLooseObject(record.telephony_data, `${context}.telephony_data`),
    transfer_call_data: normalizeLooseObject(record.transfer_call_data, `${context}.transfer_call_data`),
    batch_run_details: normalizeLooseObject(record.batch_run_details, `${context}.batch_run_details`),
    extracted_data: normalizeNullableLooseObject(record.extracted_data, `${context}.extracted_data`),
    context_details: normalizeLooseObject(record.context_details, `${context}.context_details`),
  });
}

function normalizeBolnaExecutionLog(payload: unknown, context: string): Record<string, unknown> {
  const record = requiredRecord(payload, `${context} response`, providerDataError);
  return compactObject({
    created_at: readRequiredString(record.created_at, `${context}.created_at`),
    type: readRequiredString(record.type, `${context}.type`),
    component: readRequiredString(record.component, `${context}.component`),
    provider: optionalString(record.provider),
    data: readRequiredString(record.data, `${context}.data`),
    reasoning_content: optionalString(record.reasoning_content),
  });
}

function normalizeLooseObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Bolna response missing ${fieldName}`);
  }
  return record;
}

function normalizeNullableLooseObject(value: unknown, fieldName: string): Record<string, unknown> | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return normalizeLooseObject(value, fieldName);
}

function normalizeLooseObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Bolna response missing ${fieldName}`);
  }

  return value.map((item, index) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `Bolna response missing ${fieldName}[${index}]`);
    }
    return record;
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Bolna response missing ${fieldName}`);
  }
  return text;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Bolna response missing ${fieldName}`);
  }
  return parsed;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Bolna response missing ${fieldName}`);
  }
  return parsed;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerDataError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
