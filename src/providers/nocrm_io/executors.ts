import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NocrmIoActionName } from "./actions.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString, stringArray } from "../../core/cast.ts";
import { compactJson, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "nocrm_io";
const nocrmValidationPath = "/api/v2/ping";
const nocrmRequestTimeoutMs = 30_000;

interface NocrmContext {
  apiKey: string;
  baseUrl: string;
  subdomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NocrmActionHandler = (input: Record<string, unknown>, context: NocrmContext) => Promise<unknown>;

export const nocrmIoActionHandlers: Record<NocrmIoActionName, NocrmActionHandler> = {
  async list_teams(_input, context) {
    const payload = await requestNocrmJson(context, {
      path: "/api/v2/teams",
      mode: "execute",
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "noCRM.io teams response must be an array", payload);
    }
    return { teams: payload };
  },
  create_lead(input, context) {
    return requestLead(context, {
      method: "POST",
      path: "/api/v2/leads",
      body: compactJson({
        title: requiredInputString(input.title, "title"),
        description: requiredInputString(input.description, "description"),
        user_id: identifierValue(input.userId),
        tags: input.tags === undefined ? undefined : stringArray(input.tags, "tags", providerInputError),
        step: identifierValue(input.step),
        created_at: optionalString(input.createdAt),
      }),
    });
  },
  duplicate_lead(input, context) {
    return requestLead(context, {
      method: "POST",
      path: `/api/v2/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}/duplicate_lead`,
      body: {
        step: identifierValueRequired(input.step, "step"),
      },
      notFoundAsInvalidInput: true,
    });
  },
  change_lead_status_to_standby(input, context) {
    const days = optionalInteger(input.days);
    if (days === undefined || days <= 0) {
      throw new ProviderRequestError(400, "days must be a positive integer");
    }
    return requestLead(context, {
      path: `/api/simple/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}/standby`,
      query: queryParams({
        days,
        activity_id: optionalInteger(input.activityId),
      }),
      notFoundAsInvalidInput: true,
    });
  },
  change_lead_status_to_cancelled(input, context) {
    return requestLead(context, {
      path: `/api/simple/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}/cancelled`,
      notFoundAsInvalidInput: true,
    });
  },
  assign_lead_to_user(input, context) {
    return requestLead(context, {
      method: "POST",
      path: `/api/v2/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}/assign`,
      body: {
        user_id: identifierValueRequired(input.userId, "userId"),
      },
      notFoundAsInvalidInput: true,
    });
  },
  add_tag_to_lead(input, context) {
    return requestLead(context, {
      path: `/api/simple/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}/add_tag`,
      query: {
        tag: requiredInputString(input.tag, "tag"),
      },
      notFoundAsInvalidInput: true,
    });
  },
  append_to_lead_description(input, context) {
    return requestLead(context, {
      path: `/api/simple/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}/append_to_description`,
      query: {
        to_append: requiredInputString(input.toAppend, "toAppend"),
      },
      notFoundAsInvalidInput: true,
    });
  },
  async delete_lead(input, context) {
    const payload = await requestNocrmJson(context, {
      method: "DELETE",
      path: `/api/v2/leads/${encodeURIComponent(identifierValueRequired(input.leadId, "leadId"))}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    const record = requiredOutputObject(payload, "noCRM.io delete lead response");
    const id = optionalInteger(record.id);
    if (id === undefined || id <= 0) {
      throw new ProviderRequestError(502, "noCRM.io delete lead response must include a positive integer id", payload);
    }
    return { id };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NocrmContext>({
  service,
  handlers: nocrmIoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NocrmContext> {
    const credential = await requireApiKeyCredential(context, service);
    const subdomain = normalizeNocrmSubdomain(credential.values.subdomain);
    return {
      apiKey: credential.apiKey,
      baseUrl: buildNocrmBaseUrl(subdomain),
      subdomain,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildNocrmBaseUrl(normalizeNocrmSubdomain(credential.values.subdomain));
  },
  auth: {
    type: "api_key_header",
    name: "x-api-key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const subdomain = normalizeNocrmSubdomain(input.values.subdomain);
    const baseUrl = buildNocrmBaseUrl(subdomain);
    const payload = await requestNocrmJson(
      {
        apiKey: input.apiKey,
        baseUrl,
        subdomain,
        fetcher,
        signal,
      },
      {
        path: nocrmValidationPath,
        mode: "validate",
      },
    );
    const record = requiredOutputObject(payload, "noCRM.io ping response");
    const status = optionalInteger(record.status);
    const message = optionalString(record.message);
    if (status !== undefined && status !== 200) {
      throw new ProviderRequestError(502, message ?? "noCRM.io ping did not report a successful status", payload);
    }
    return {
      profile: {
        accountId: `nocrm_io:${subdomain}`,
        displayName: `noCRM.io ${subdomain}`,
      },
      grantedScopes: [],
      metadata: {
        subdomain,
        baseUrl,
        validationEndpoint: nocrmValidationPath,
        validationMessage: message,
      },
    };
  },
};

async function requestLead(
  context: NocrmContext,
  input: Omit<NocrmRequestOptions, "mode">,
): Promise<{ lead: Record<string, unknown> }> {
  const payload = await requestNocrmJson(context, { ...input, mode: "execute" });
  return { lead: requiredOutputObject(payload, "noCRM.io lead response") };
}

interface NocrmRequestOptions {
  path: string;
  mode: "validate" | "execute";
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

async function requestNocrmJson(context: NocrmContext, input: NocrmRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, nocrmRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildNocrmUrl(context.baseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildNocrmHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readNocrmPayload(response);
    if (!response.ok) {
      throw createNocrmError(response.status, payload, input.mode, input.notFoundAsInvalidInput === true);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "noCRM.io request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `noCRM.io request failed: ${error.message}` : "noCRM.io request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildNocrmUrl(baseUrl: string, path: string, query?: Record<string, string>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function buildNocrmHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readNocrmPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "noCRM.io returned invalid JSON");
  }
}

function createNocrmError(
  status: number,
  payload: unknown,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractNocrmErrorMessage(payload) ?? `noCRM.io request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (notFoundAsInvalidInput && status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractNocrmErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.type) ?? optionalString(record?.error);
}

function buildNocrmBaseUrl(subdomain: string): string {
  return `https://${subdomain}.nocrm.io`;
}

function normalizeNocrmSubdomain(value: unknown): string {
  const raw = requiredInputString(value, "subdomain").toLowerCase();
  let normalized = raw;
  if (normalized.startsWith("https://")) {
    normalized = normalized.slice("https://".length);
  } else if (normalized.startsWith("http://")) {
    normalized = normalized.slice("http://".length);
  }
  normalized = normalized.replace(/\/+$/, "");
  if (normalized.endsWith(".nocrm.io")) {
    normalized = normalized.slice(0, -".nocrm.io".length);
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    throw new ProviderRequestError(
      400,
      "subdomain is invalid; only lowercase letters, numbers, and hyphens are allowed",
    );
  }
  return normalized;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function identifierValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return identifierValueRequired(value, "identifier");
}

function identifierValueRequired(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  return requiredInputString(value, fieldName);
}

function requiredOutputObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}
