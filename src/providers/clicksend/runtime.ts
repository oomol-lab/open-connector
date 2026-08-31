import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const clicksendApiBaseUrl = "https://rest.clicksend.com/v3";

const clicksendRequestBaseUrl = "https://rest.clicksend.com/v3/";
const clicksendValidationPath = "/account";

type ClicksendPhase = "validate" | "execute";
type ClicksendActionHandler = (input: Record<string, unknown>, context: ClicksendActionContext) => Promise<unknown>;

interface ClicksendRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  username: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: ClicksendPhase;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

export interface ClicksendActionContext {
  username: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const clicksendActionHandlers: ProviderActionHandlers<"clicksend", ClicksendActionHandler> = {
  get_account(_input, context) {
    return requestClicksendJson({
      method: "GET",
      path: clicksendValidationPath,
      ...context,
      phase: "execute",
    });
  },
  send_sms(input, context) {
    return requestClicksendJson({
      method: "POST",
      path: "/sms/send",
      body: buildSmsBody(input),
      ...context,
      phase: "execute",
    });
  },
  calculate_sms_price(input, context) {
    return requestClicksendJson({
      method: "POST",
      path: "/sms/price",
      body: buildSmsBody(input),
      ...context,
      phase: "execute",
    });
  },
  list_contact_lists(input, context) {
    return requestClicksendJson({
      method: "GET",
      path: "/lists",
      query: buildPaginationQuery(input),
      ...context,
      phase: "execute",
    });
  },
  create_contact_list(input, context) {
    return requestClicksendJson({
      method: "POST",
      path: "/lists",
      body: { list_name: input.list_name },
      ...context,
      phase: "execute",
    });
  },
  get_contact_list(input, context) {
    return requestClicksendJson({
      method: "GET",
      path: `/lists/${input.list_id}`,
      ...context,
      phase: "execute",
    });
  },
  update_contact_list(input, context) {
    return requestClicksendJson({
      method: "PUT",
      path: `/lists/${input.list_id}`,
      body: { list_name: input.list_name },
      ...context,
      phase: "execute",
    });
  },
  delete_contact_list(input, context) {
    return requestClicksendJson({
      method: "DELETE",
      path: `/lists/${input.list_id}`,
      ...context,
      phase: "execute",
    });
  },
  list_contacts(input, context) {
    return requestClicksendJson({
      method: "GET",
      path: `/lists/${input.list_id}/contacts`,
      query: buildPaginationQuery(input),
      ...context,
      phase: "execute",
    });
  },
  create_contact(input, context) {
    return requestClicksendJson({
      method: "POST",
      path: `/lists/${input.list_id}/contacts`,
      body: readContactBody(input),
      ...context,
      phase: "execute",
    });
  },
  get_contact(input, context) {
    return requestClicksendJson({
      method: "GET",
      path: `/lists/${input.list_id}/contacts/${input.contact_id}`,
      ...context,
      phase: "execute",
    });
  },
  update_contact(input, context) {
    return requestClicksendJson({
      method: "PUT",
      path: `/lists/${input.list_id}/contacts/${input.contact_id}`,
      body: readContactBody(input),
      ...context,
      phase: "execute",
    });
  },
  delete_contact(input, context) {
    return requestClicksendJson({
      method: "DELETE",
      path: `/lists/${input.list_id}/contacts/${input.contact_id}`,
      ...context,
      phase: "execute",
    });
  },
};

export async function validateClicksendCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const username = requireClicksendUsername(values);
  const payload = await requestClicksendJson({
    method: "GET",
    path: clicksendValidationPath,
    username,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const data = optionalRecord(payload.data);
  const account = optionalRecord(data?.user) ?? data;
  const accountId = readOptionalString(account?.user_id ?? account?.account_id ?? account?.id);
  const accountLabel =
    readOptionalString(account?.email) ??
    readOptionalString(account?.username) ??
    readOptionalString(account?.company_name) ??
    "ClickSend API Key";

  return {
    profile: {
      accountId,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: clicksendApiBaseUrl,
      validationEndpoint: clicksendValidationPath,
      username,
      accountId,
      email: readOptionalString(account?.email),
    }),
  };
}

async function requestClicksendJson(input: ClicksendRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(input.path.replace(/^\//, ""), clicksendRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: clicksendHeaders(input),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readClicksendPayload(response);
  } catch (error) {
    if (isAbortLikeError(error) && timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ClickSend request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ClickSend request failed: ${error.message}` : "ClickSend request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createClicksendError(response, payload, input.phase);
  }

  return normalizeClicksendEnvelope(payload);
}

function clicksendHeaders(input: ClicksendRequestInput): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(input.username, input.apiKey),
    "content-type": input.body === undefined ? undefined : "application/json",
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

async function readClicksendPayload(response: Response): Promise<unknown> {
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

function normalizeClicksendEnvelope(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    return {
      data: payload,
      raw: {},
    };
  }
  return compactObject({
    responseCode: readOptionalString(record.response_code),
    responseMessage: readOptionalString(record.response_msg),
    data: record.data,
    raw: record,
  });
}

function createClicksendError(response: Response, payload: unknown, phase: ClicksendPhase): ProviderRequestError {
  const message = extractClicksendErrorMessage(payload) ?? response.statusText ?? "ClickSend request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractClicksendErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return typeof payload === "string" && payload.trim() ? payload.trim() : undefined;
  }
  return (
    readOptionalString(record.response_msg) ?? readOptionalString(record.message) ?? readOptionalString(record.error)
  );
}

function buildSmsBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    messages: input.messages,
    shorten_urls: input.shorten_urls,
  });
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return compactObject({
    page: optionalNumber(input.page),
    limit: optionalNumber(input.limit),
  });
}

function readContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return requiredRecord(input.contact, "contact", (message) => new ProviderRequestError(400, message));
}

function requireClicksendUsername(values: Record<string, string>): string {
  const username = optionalString(values.username);
  if (!username) {
    throw new ProviderRequestError(400, "username is required");
  }
  return username;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return optionalString(value);
}

function buildBasicAuthorizationHeader(username: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${username}:${apiKey}`, "utf8").toString("base64")}`;
}
