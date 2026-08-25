import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const signwellApiBaseUrl = "https://www.signwell.com";
const signwellValidationPath = "/api/v1/me";
const signwellDefaultTimeoutMs = 30_000;

type SignwellPhase = "validate" | "execute";
type SignwellActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const signwellActionHandlers: ProviderActionHandlers<"signwell", SignwellActionHandler> = {
  get_me(_input, context) {
    return getMe(context);
  },
  get_template(input, context) {
    return getTemplate(input, context);
  },
  create_document_from_template(input, context) {
    return createDocumentFromTemplate(input, context);
  },
  get_document(input, context) {
    return getDocument(input, context);
  },
  send_document(input, context) {
    return sendDocument(input, context);
  },
  send_document_reminder(input, context) {
    return sendDocumentReminder(input, context);
  },
};

export async function validateSignwellCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSignwellJson<Record<string, unknown>>({
    apiKey,
    path: signwellValidationPath,
    fetcher,
    phase: "validate",
    signal,
  });

  const account = requireRecord(payload.account, "SignWell account");
  const workspace = requireRecord(payload.workspace, "SignWell workspace");
  const user = requireRecord(payload.user, "SignWell user");

  const accountId = requireString(account.id, "SignWell account id");
  const userId = requireString(user.id, "SignWell user id");
  const accountLabel =
    optionalString(workspace.name) ?? optionalString(account.name) ?? optionalString(user.email) ?? "SignWell API Key";

  return {
    profile: {
      accountId: `${accountId}:${userId}`,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: signwellValidationPath,
      role: optionalString(payload.role),
      archived: typeof payload.archived === "boolean" ? payload.archived : undefined,
      userId,
      userEmail: optionalString(user.email),
      workspaceId: optionalString(workspace.id),
      workspaceName: optionalString(workspace.name),
      planTier: optionalString(workspace.plan_tier) ?? optionalString(account.plan_tier),
      activeTemplates:
        typeof workspace.active_templates === "number"
          ? workspace.active_templates
          : typeof account.active_templates === "number"
            ? account.active_templates
            : undefined,
    }),
  };
}

async function getMe(context: ApiKeyProviderContext): Promise<unknown> {
  return requestSignwellJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: signwellValidationPath,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function getTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requireInputString(input.id, "id");
  return requestSignwellJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v1/document_templates/${encodeURIComponent(id)}`,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function createDocumentFromTemplate(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestSignwellJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/api/v1/document_templates/documents",
    method: "POST",
    body: buildTemplateDocumentRequestBody(input),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  if (!Array.isArray(payload.template_ids)) {
    payload.template_ids = [];
  }

  return payload;
}

async function getDocument(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requireInputString(input.id, "id");
  const payload = await requestSignwellJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v1/documents/${encodeURIComponent(id)}`,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  if (!Array.isArray(payload.template_ids)) {
    payload.template_ids = [];
  }

  return payload;
}

async function sendDocument(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requireInputString(input.id, "id");
  const payload = await requestSignwellJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v1/documents/${encodeURIComponent(id)}/send`,
    method: "POST",
    body: buildSendDocumentRequestBody(input),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  if (!Array.isArray(payload.template_ids)) {
    payload.template_ids = [];
  }

  return payload;
}

async function sendDocumentReminder(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requireInputString(input.id, "id");
  const payload = await requestSignwellJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v1/documents/${encodeURIComponent(id)}/remind`,
    method: "POST",
    body: buildReminderRequestBody(input),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  if (!Array.isArray(payload.template_ids)) {
    payload.template_ids = [];
  }

  return payload;
}

function buildTemplateDocumentRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    test_mode: readOptionalBoolean(input.test_mode),
    template_id: optionalString(input.template_id),
    template_ids: readOptionalTrimmedStringArray(input.template_ids),
    name: optionalString(input.name),
    subject: optionalString(input.subject),
    message: optionalString(input.message),
    recipients: readOptionalArray(input.recipients),
    exclude_placeholders: readOptionalTrimmedStringArray(input.exclude_placeholders),
    draft: readOptionalBoolean(input.draft),
    with_signature_page: readOptionalBoolean(input.with_signature_page),
    expires_in: readOptionalInteger(input.expires_in, "expires_in"),
    reminders: readOptionalBoolean(input.reminders),
    apply_signing_order: readOptionalBoolean(input.apply_signing_order),
    api_application_id: optionalString(input.api_application_id),
    embedded_signing: readOptionalBoolean(input.embedded_signing),
    embedded_signing_notifications: readOptionalBoolean(input.embedded_signing_notifications),
    text_tags: readOptionalBoolean(input.text_tags),
    custom_requester_name: optionalString(input.custom_requester_name),
    custom_requester_email: optionalString(input.custom_requester_email),
    redirect_url: optionalString(input.redirect_url),
    allow_decline: readOptionalBoolean(input.allow_decline),
    allow_reassign: readOptionalBoolean(input.allow_reassign),
    decline_redirect_url: optionalString(input.decline_redirect_url),
    language: optionalString(input.language),
    metadata: optionalRecord(input.metadata),
    template_fields: readOptionalArray(input.template_fields),
    files: readOptionalArray(input.files),
    fields: readOptionalArray(input.fields),
    attachment_requests: readOptionalArray(input.attachment_requests),
    copied_contacts: readOptionalArray(input.copied_contacts),
    labels: readOptionalArray(input.labels),
    checkbox_groups: readOptionalArray(input.checkbox_groups),
  });
}

function buildSendDocumentRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    test_mode: readOptionalBoolean(input.test_mode),
    name: optionalString(input.name),
    subject: optionalString(input.subject),
    message: optionalString(input.message),
    expires_in: readOptionalInteger(input.expires_in, "expires_in"),
    reminders: readOptionalBoolean(input.reminders),
    apply_signing_order: readOptionalBoolean(input.apply_signing_order),
    api_application_id: optionalString(input.api_application_id),
    embedded_signing: readOptionalBoolean(input.embedded_signing),
    embedded_signing_notifications: readOptionalBoolean(input.embedded_signing_notifications),
    custom_requester_name: optionalString(input.custom_requester_name),
    custom_requester_email: optionalString(input.custom_requester_email),
    redirect_url: optionalString(input.redirect_url),
    allow_decline: readOptionalBoolean(input.allow_decline),
    allow_reassign: readOptionalBoolean(input.allow_reassign),
    decline_redirect_url: optionalString(input.decline_redirect_url),
    metadata: optionalRecord(input.metadata),
    labels: readOptionalArray(input.labels),
    checkbox_groups: readOptionalArray(input.checkbox_groups),
  });
}

function buildReminderRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    recipients: readOptionalArray(input.recipients),
  });
}

async function requestSignwellJson<T>(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: SignwellPhase;
  method?: string;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<T> {
  const timeoutHandle = createProviderTimeout(input.signal, signwellDefaultTimeoutMs);

  try {
    const response = await input.fetcher(new URL(input.path, signwellApiBaseUrl), {
      method: input.method ?? "GET",
      headers: buildHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      throw createSignwellError(response.status, payload, input.phase);
    }

    if (payload === null) {
      return {} as T;
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "SignWell returned an invalid payload");
    }

    return record as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `SignWell request timed out after ${Math.max(1, Math.ceil(signwellDefaultTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SignWell request failed: ${error.message}` : "SignWell request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    accept: "application/json",
    "x-api-key": apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SignWell returned invalid JSON");
  }
}

function createSignwellError(status: number, payload: unknown, phase: SignwellPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `SignWell request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 404 || status === 400 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const meta = optionalRecord(record.meta);
  const metaMessage = firstNonEmptyString([meta?.message, ...(Array.isArray(meta?.messages) ? meta.messages : [])]);
  if (metaMessage) {
    return metaMessage;
  }

  if (Array.isArray(record.errors)) {
    return firstNonEmptyString(record.errors);
  }

  const errorRecord = optionalRecord(record.errors);
  if (errorRecord) {
    return flattenErrorRecord(errorRecord);
  }

  return firstNonEmptyString([record.message, record.error, record.detail, record.title, meta?.error]);
}

function flattenErrorRecord(record: Record<string, unknown>, prefix = ""): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" && value.trim()) {
      return `${path}: ${value.trim()}`;
    }
    if (Array.isArray(value)) {
      const first = firstNonEmptyString(value);
      if (first) {
        return `${path}: ${first}`;
      }
    }
    const child = optionalRecord(value);
    if (child) {
      const nested = flattenErrorRecord(child, path);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function firstNonEmptyString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function requireInputString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function readOptionalTrimmedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing from the response`);
  }
  return record;
}

function requireString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(502, `${label} is missing from the response`);
  }
  return result;
}
