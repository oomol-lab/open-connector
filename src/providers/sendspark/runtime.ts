import type {
  CredentialValidationResult,
  ExecutionContext,
  ProviderExecutors,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderExecutorDefinition, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { SendsparkActionName } from "./actions.ts";

import {
  compactObject,
  nullableInteger,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "sendspark";
export const sendsparkApiBaseUrl: string = "https://api-gw.sendspark.com";
const sendsparkHealthPath = "/v1/auth/health";

type SendsparkPhase = "validate" | "execute";

interface SendsparkContext {
  workspaceApiKey: string;
  userApiSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type SendsparkActionHandler = ProviderRuntimeHandler<SendsparkContext>;

export const sendsparkActionHandlers: Record<SendsparkActionName, SendsparkActionHandler> = {
  list_dynamic_campaigns(input, context) {
    return listDynamicCampaigns(input, context);
  },
  get_dynamic_campaign(input, context) {
    return getDynamicCampaign(input, context);
  },
  create_dynamic_campaign(input, context) {
    return createDynamicCampaign(input, context);
  },
  add_prospect(input, context) {
    return addProspect(input, context);
  },
  get_prospect_by_email(input, context) {
    return getProspectByEmail(input, context);
  },
};

export const sendsparkExecutorDefinition: ProviderExecutorDefinition<SendsparkContext> = {
  service: "sendspark",
  skipDnsValidation: true,
  handlers: sendsparkActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<SendsparkContext> {
    return createSendsparkContext(await requireApiKeyCredential(context, service), fetcher, context.signal);
  },
};

export async function validateSendsparkCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await sendsparkGetJson(
    sendsparkHealthPath,
    createSendsparkContext(
      {
        authType: "api_key",
        apiKey: input.apiKey,
        values: input.values,
        profile: { accountId: "api_key", displayName: "Sendspark API Key", grantedScopes: [] },
        metadata: {},
      },
      fetcher,
      signal,
    ),
    "validate",
  );
  const record = requireProviderRecord(payload);

  return {
    profile: {
      accountId: "api_key",
      displayName: "Sendspark API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: sendsparkApiBaseUrl,
      validationEndpoint: sendsparkHealthPath,
      validationMessage: optionalString(record.message),
    }),
  };
}

function createSendsparkContext(
  credential: Extract<ResolvedCredential, { authType: "api_key" }>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): SendsparkContext {
  const userApiSecret = requiredString(
    credential.values.userApiSecret,
    "userApiSecret",
    (message) => new ProviderRequestError(400, message),
  );
  return {
    workspaceApiKey: credential.apiKey,
    userApiSecret,
    fetcher,
    signal,
  };
}

async function listDynamicCampaigns(input: Record<string, unknown>, context: SendsparkContext): Promise<unknown> {
  const workspaceId = readInputString(input.workspaceId, "workspaceId");
  const path = buildWorkspacePath(workspaceId, "/dynamics");
  const url = new URL(path, sendsparkApiBaseUrl);
  setOptionalQuery(url, "limit", optionalInteger(input.limit));
  setOptionalQuery(url, "offset", optionalInteger(input.offset));
  setOptionalQuery(url, "search", optionalString(input.search));
  setOptionalQuery(url, "filters", optionalString(input.filters));

  const payload = await sendsparkGetJson(`${url.pathname}${url.search}`, context, "execute");
  const record = requireProviderRecord(payload);
  const response = requireProviderRecord(record.response ?? record);

  return {
    campaigns: readObjectArray(response.data),
    pagination: normalizePagination(response.pagination),
    links: normalizeLinks(response.links),
    raw: record,
  };
}

async function getDynamicCampaign(input: Record<string, unknown>, context: SendsparkContext): Promise<unknown> {
  const workspaceId = readInputString(input.workspaceId, "workspaceId");
  const dynamicId = readInputString(input.dynamicId, "dynamicId");
  const payload = await sendsparkGetJson(
    buildWorkspacePath(workspaceId, `/dynamics/${encodeURIComponent(dynamicId)}`),
    context,
    "execute",
  );
  const record = requireProviderRecord(payload);

  return {
    campaign: record,
    raw: record,
  };
}

async function createDynamicCampaign(input: Record<string, unknown>, context: SendsparkContext): Promise<unknown> {
  const workspaceId = readInputString(input.workspaceId, "workspaceId");
  const payload = await sendsparkPostJson(
    buildWorkspacePath(workspaceId, "/dynamics"),
    {
      name: readInputString(input.name, "name"),
    },
    context,
  );
  const record = requireProviderRecord(payload);
  const response = optionalRecord(record.response);
  const data = response ? readObjectArray(response.data) : [];

  return {
    campaign: data[0] ?? record,
    raw: record,
  };
}

async function addProspect(input: Record<string, unknown>, context: SendsparkContext): Promise<unknown> {
  const workspaceId = readInputString(input.workspaceId, "workspaceId");
  const dynamicId = readInputString(input.dynamicId, "dynamicId");
  const payload = await sendsparkPostJson(
    buildWorkspacePath(workspaceId, `/dynamics/${encodeURIComponent(dynamicId)}/prospect`),
    compactObject({
      processAndAuthorizeCharge: optionalBoolean(input.processAndAuthorizeCharge),
      prospect: optionalRecord(input.prospect),
      prospectDepurationConfig: optionalRecord(input.prospectDepurationConfig),
    }),
    context,
  );
  const record = requireProviderRecord(payload);

  return {
    prospects: readObjectArray(record.prospectList ?? record.data),
    raw: record,
  };
}

async function getProspectByEmail(input: Record<string, unknown>, context: SendsparkContext): Promise<unknown> {
  const workspaceId = readInputString(input.workspaceId, "workspaceId");
  const dynamicId = readInputString(input.dynamicId, "dynamicId");
  const email = readInputString(input.email, "email");
  const payload = await sendsparkGetJson(
    buildWorkspacePath(
      workspaceId,
      `/dynamics/${encodeURIComponent(dynamicId)}/prospects/${encodeURIComponent(email)}`,
    ),
    context,
    "execute",
  );
  const record = requireProviderRecord(payload);

  return {
    prospect: record,
    raw: record,
  };
}

async function sendsparkGetJson(path: string, context: SendsparkContext, phase: SendsparkPhase): Promise<unknown> {
  return sendsparkRequestJson("GET", path, undefined, context, phase);
}

async function sendsparkPostJson(
  path: string,
  body: Record<string, unknown>,
  context: SendsparkContext,
): Promise<unknown> {
  return sendsparkRequestJson("POST", path, body, context, "execute");
}

async function sendsparkRequestJson(
  method: "GET" | "POST",
  path: string,
  body: Record<string, unknown> | undefined,
  context: SendsparkContext,
  phase: SendsparkPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, sendsparkApiBaseUrl), {
      method,
      headers: sendsparkHeaders(context, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readSendsparkPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `sendspark request failed: ${error.message}` : "sendspark request failed",
    );
  }

  if (!response.ok) {
    throw createSendsparkError(response.status, payload, phase);
  }

  return payload;
}

function sendsparkHeaders(context: SendsparkContext, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "x-api-key": context.workspaceApiKey,
    "x-api-secret": context.userApiSecret,
  }) as Record<string, string>;
}

async function readSendsparkPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Sendspark returned invalid JSON");
  }
}

function createSendsparkError(status: number, payload: unknown, phase: SendsparkPhase): ProviderRequestError {
  const message = extractSendsparkErrorMessage(payload) ?? `Sendspark request failed with ${status}`;
  const mappedStatus = phase === "validate" && (status === 401 || status === 403) ? 400 : status || 500;
  return new ProviderRequestError(mappedStatus, message, payload);
}

function extractSendsparkErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function buildWorkspacePath(workspaceId: string, suffix: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}${suffix}`;
}

function setOptionalQuery(url: URL, key: string, value: string | number | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireProviderRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Sendspark returned an invalid payload", payload);
  }
  return record;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizePagination(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    limit: nullableInteger(record.limit) ?? null,
    offset: nullableInteger(record.offset) ?? null,
    total: nullableInteger(record.total) ?? null,
    raw: record,
  };
}

function normalizeLinks(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    next: typeof record.next === "string" ? record.next : null,
    previous: typeof record.previous === "string" ? record.previous : null,
    ...record,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defineSendsparkExecutors(): ProviderExecutors {
  return defineProviderExecutors(sendsparkExecutorDefinition);
}
