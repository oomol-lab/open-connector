import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRawString, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const smtp2goApiBaseUrl = "https://api.smtp2go.com/v3";

const smtp2goDefaultRequestTimeoutMs = 30_000;

type Smtp2goPhase = "validate" | "execute";
type Smtp2goActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const smtp2goActionHandlers: ProviderActionHandlers<"smtp2go", Smtp2goActionHandler> = {
  async send_email(input, context) {
    validateSendEmailInput(input);
    const payload = await requestSmtp2goJson({
      path: "/email/send",
      body: compactObject({
        sender: input.sender,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        html_body: input.html_body,
        text_body: input.text_body,
        custom_headers: input.custom_headers,
        template_id: input.template_id,
        template_data: input.template_data,
        schedule: input.schedule,
        fastaccept: input.fastaccept,
      }),
      context,
      phase: "execute",
    });
    return normalizeSendEmailResult(payload);
  },
  async search_activity(input, context) {
    const payload = await requestSmtp2goJson({
      path: "/activity/search",
      body: compactObject({
        start_date: input.start_date,
        end_date: input.end_date,
        search: input.search,
        search_email_id: input.search_email_id,
        search_subject: input.search_subject,
        search_sender: input.search_sender,
        search_recipient: input.search_recipient,
        search_usernames: input.search_usernames,
        subaccounts: input.subaccounts,
        limit: input.limit,
        continue_token: input.continue_token,
        only_latest: input.only_latest,
        only_latest_by_sent: input.only_latest_by_sent,
        event_types: input.event_types,
        include_headers: input.include_headers,
        custom_headers: input.custom_headers,
        region: input.region,
      }),
      context,
      phase: "execute",
    });
    return normalizeActivitySearchResult(payload);
  },
  async get_email_summary(input, context) {
    const payload = await requestSmtp2goJson({
      path: "/stats/email_summary",
      body: compactObject({
        username: input.username,
      }),
      context,
      phase: "execute",
    });
    const data = requireDataObject(payload, "/stats/email_summary");
    return {
      requestId: readRequestId(payload, data),
      summary: data,
      data,
    };
  },
  async view_api_key_permissions(_input, context) {
    const payload = await requestSmtp2goJson({
      path: "/api_keys/permissions",
      body: {},
      context,
      phase: "execute",
    });
    return normalizeApiKeyPermissionsResult(payload);
  },
  async list_sender_domains(input, context) {
    const payload = await requestSmtp2goJson({
      path: "/domain/view",
      body: compactObject({
        domain: input.domain,
        subaccount_id: input.subaccount_id,
      }),
      context,
      phase: "execute",
    });
    const data = requireDataObject(payload, "/domain/view");
    return {
      requestId: readRequestId(payload, data),
      domains: readObjectArray(data.domains),
      data,
    };
  },
  async list_single_sender_emails(input, context) {
    const payload = await requestSmtp2goJson({
      path: "/single_sender_emails/view",
      body: compactObject({
        email_address: input.email_address,
        subaccount_id: input.subaccount_id,
      }),
      context,
      phase: "execute",
    });
    const data = requireDataObject(payload, "/single_sender_emails/view");
    return {
      requestId: readRequestId(payload, data),
      senders: readObjectArray(data.senders),
      data,
    };
  },
  async search_email_templates(input, context) {
    const payload = await requestSmtp2goJson({
      path: "/template/search",
      body: compactObject({
        fuzzy_search: input.fuzzy_search,
        search_terms: input.search_terms,
        tags: input.tags,
        sort_direction: input.sort_direction,
        page_size: input.page_size,
        continue_token: input.continue_token,
      }),
      context,
      phase: "execute",
    });
    const data = requireDataObject(payload, "/template/search");
    return {
      requestId: readRequestId(payload, data),
      templates: readObjectArray(data.templates),
      totalCount: readInteger(data.total_count, 0),
      continueToken: readNullableString(data.continue_token),
      data,
    };
  },
  async get_email_template(input, context) {
    const payload = await requestSmtp2goJson({
      path: "/template/view",
      body: {
        id: input.id,
      },
      context,
      phase: "execute",
    });
    const data = requireDataObject(payload, "/template/view");
    return {
      requestId: readRequestId(payload, data),
      template: data,
      data,
    };
  },
};

export async function validateSmtp2goCredential(
  apiKeyInput: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(apiKeyInput, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestSmtp2goJson({
    path: "/api_keys/permissions",
    body: {},
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const permissions = readPermissionList(payload.data);

  return {
    profile: {
      displayName: "SMTP2GO API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/api_keys/permissions",
      permissionCount: permissions.length,
      firstPermission: permissions[0],
    }),
  };
}

async function requestSmtp2goJson(input: {
  path: string;
  body: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: Smtp2goPhase;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, smtp2goDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildSmtp2goUrl(input.path), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "X-Smtp2go-Api-Key": input.context.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readSmtp2goPayload(response);

    if (!response.ok) {
      throw createSmtp2goError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "SMTP2GO returned an invalid payload");
    }
    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "SMTP2GO request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SMTP2GO request failed: ${error.message}` : "SMTP2GO request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSmtp2goUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${smtp2goApiBaseUrl}/`).toString();
}

async function readSmtp2goPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SMTP2GO returned invalid JSON");
  }
}

function createSmtp2goError(status: number, payload: unknown, phase: Smtp2goPhase): ProviderRequestError {
  const message = extractSmtp2goErrorMessage(payload) ?? `SMTP2GO request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractSmtp2goErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelError = optionalString(record.error);
  if (topLevelError) {
    return topLevelError;
  }

  const data = optionalRecord(record.data);
  const dataError = optionalString(data?.error);
  if (dataError) {
    return dataError;
  }

  const fieldValidation = optionalRecord(data?.field_validation_errors);
  const fieldValidationMessage = optionalString(fieldValidation?.message);
  if (fieldValidationMessage) {
    return fieldValidationMessage;
  }

  return undefined;
}

function normalizeSendEmailResult(payload: Record<string, unknown>): Record<string, unknown> {
  const data = requireDataObject(payload, "/email/send");
  return {
    requestId: readRequestId(payload, data),
    succeeded: readInteger(data.succeeded, 0),
    failed: readInteger(data.failed, 0),
    failures: readObjectArray(data.failures),
    emailId: readNullableString(data.email_id),
    scheduleId: readNullableString(data.schedule_id),
    data,
  };
}

function normalizeActivitySearchResult(payload: Record<string, unknown>): Record<string, unknown> {
  const data = requireDataObject(payload, "/activity/search");
  return {
    requestId: readRequestId(payload, data),
    events: readObjectArray(data.events),
    totalEvents: readInteger(data.total_events, 0),
    continueToken: readNullableString(data.continue_token),
    data,
  };
}

function normalizeApiKeyPermissionsResult(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId: readRequestId(payload),
    permissions: readPermissionList(payload.data),
    data: payload.data,
  };
}

function requireDataObject(payload: Record<string, unknown>, path: string): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  if (!data) {
    throw new ProviderRequestError(502, `SMTP2GO ${path} response missing data`);
  }
  return data;
}

function readRequestId(payload: Record<string, unknown>, data?: Record<string, unknown>): string {
  return optionalRawString(payload.request_id) ?? optionalRawString(data?.request_id) ?? "";
}

function readInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? (value as number) : fallback;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : (optionalRawString(value) ?? null);
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => optionalRecord(item) != null);
}

function readPermissionList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  const record = optionalRecord(value);
  if (!record) {
    return [];
  }

  return readPermissionList(record.data);
}

function validateSendEmailInput(input: Record<string, unknown>): void {
  const templateId = optionalString(input.template_id);
  if (templateId) {
    return;
  }

  if (!optionalString(input.subject)) {
    throw new ProviderRequestError(400, "subject is required when template_id is not provided");
  }

  if (!optionalString(input.html_body) && !optionalString(input.text_body)) {
    throw new ProviderRequestError(400, "html_body or text_body is required when template_id is not provided");
  }
}
