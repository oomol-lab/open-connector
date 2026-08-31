import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  objectArray,
  optionalInteger,
  optionalObjectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { compactJson, encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  readProviderJsonBody,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  setSearchParams,
} from "../provider-runtime.ts";

const resendApiBaseUrl = "https://api.resend.com";
const resendCredentialValidationErrors = new Set(["validation_error", "missing_required_field"]);

type ResendActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type ResendRequestPhase = "validate" | "execute";

interface ResendRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface ResendRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export const resendActionHandlers: ProviderActionHandlers<"resend", ResendActionHandler> = {
  send_email: sendEmail,
  send_batch_emails: sendBatchEmails,
  list_sent_emails: listSentEmails,
  get_sent_email: getSentEmail,
  update_scheduled_email: updateScheduledEmail,
  cancel_scheduled_email: cancelScheduledEmail,
  list_sent_email_attachments: listSentEmailAttachments,
  get_sent_email_attachment: getSentEmailAttachment,
  list_received_emails: listReceivedEmails,
  get_received_email: getReceivedEmail,
  list_received_email_attachments: listReceivedEmailAttachments,
  get_received_email_attachment: getReceivedEmailAttachment,
};

export async function validateResendCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const validationResponse = await fetcher(`${resendApiBaseUrl}/emails`, {
    method: "POST",
    headers: resendHeaders(apiKey),
    body: JSON.stringify({}),
    signal,
  });
  const validationError = await readResendError(validationResponse);

  if (
    !validationResponse.ok &&
    (validationError.name === "invalid_api_key" || validationError.name === "missing_api_key")
  ) {
    throw new ProviderRequestError(401, validationError.message, validationError);
  }
  if (!validationResponse.ok && !resendCredentialValidationErrors.has(validationError.name)) {
    throw new ProviderRequestError(502, validationError.message, validationError);
  }

  const metadata: Record<string, unknown> = {
    validationEndpoint: "/emails",
  };
  const scopesResponse = await fetcher(`${resendApiBaseUrl}/api-keys?limit=1`, {
    headers: resendHeaders(apiKey),
    signal,
  });
  if (scopesResponse.ok) {
    metadata.accessLevel = "full_access";
    return {
      profile: {
        accountId: "resend-api-key",
        displayName: "Resend API Key",
        grantedScopes: ["full_access"],
      },
      grantedScopes: ["full_access"],
      metadata,
    };
  }

  const scopesError = await readResendError(scopesResponse);
  if (scopesError.name === "restricted_api_key") {
    metadata.accessLevel = "sending_access";
    return {
      profile: {
        accountId: "resend-api-key",
        displayName: "Resend API Key",
        grantedScopes: ["sending_access"],
      },
      grantedScopes: ["sending_access"],
      metadata,
    };
  }

  throw createResendError(scopesResponse.status, scopesError, "validate");
}

async function sendEmail(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  if (optionalRawString(input.html) === undefined && optionalRawString(input.text) === undefined) {
    throw new ProviderRequestError(400, "at least one email body field is required");
  }

  const payload = await resendRequestJson(
    "/emails",
    context,
    {
      method: "POST",
      body: compactJson({
        from: requiredString(input.from, "from", providerInputError),
        to: requiredString(input.to, "to", providerInputError),
        subject: requiredString(input.subject, "subject", providerInputError),
        html: optionalRawString(input.html),
        text: optionalRawString(input.text),
      }),
    },
    "execute",
  );

  return { emailId: readRequiredString(payload, "id", "Resend send email response") };
}

async function sendBatchEmails(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const emails = objectArray(input.emails, "emails", providerInputError).map(buildBatchEmailBody);
  const idempotencyKey = optionalString(input.idempotencyKey);
  const payload = await resendRequestJson(
    "/emails/batch",
    context,
    {
      method: "POST",
      body: emails,
      headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
    },
    "execute",
  );
  const data = readRequiredArray(payload, "data", "Resend batch send response");
  return {
    emailIds: data.map((item) =>
      readRequiredString(requiredResponseRecord(item, "Resend batch item"), "id", "Resend batch item"),
    ),
  };
}

async function listSentEmails(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson("/emails", context, { query: buildPaginationQuery(input) }, "execute");
  return normalizeEmailList(payload, "sent", normalizeSentEmailSummary);
}

async function getSentEmail(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson(`/emails/${readPathId(input, "emailId")}`, context, {}, "execute");
  return { email: normalizeSentEmail(payload) };
}

async function updateScheduledEmail(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson(
    `/emails/${readPathId(input, "emailId")}`,
    context,
    {
      method: "PATCH",
      body: {
        scheduled_at: requiredString(input.scheduledAt, "scheduledAt", providerInputError),
      },
    },
    "execute",
  );
  return { emailId: readRequiredString(payload, "id", "Resend update email response") };
}

async function cancelScheduledEmail(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson(
    `/emails/${readPathId(input, "emailId")}/cancel`,
    context,
    { method: "POST" },
    "execute",
  );
  return { emailId: readRequiredString(payload, "id", "Resend cancel email response") };
}

async function listSentEmailAttachments(
  input: Record<string, unknown>,
  context: ResendRequestContext,
): Promise<unknown> {
  const payload = await resendRequestJson(
    `/emails/${readPathId(input, "emailId")}/attachments`,
    context,
    { query: buildPaginationQuery(input) },
    "execute",
  );
  return normalizeAttachmentList(payload);
}

async function getSentEmailAttachment(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson(
    `/emails/${readPathId(input, "emailId")}/attachments/${readPathId(input, "attachmentId")}`,
    context,
    {},
    "execute",
  );
  return { attachment: normalizeAttachment(payload) };
}

async function listReceivedEmails(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson(
    "/emails/receiving",
    context,
    { query: buildPaginationQuery(input) },
    "execute",
  );
  return normalizeEmailList(payload, "received", normalizeReceivedEmailSummary);
}

async function getReceivedEmail(input: Record<string, unknown>, context: ResendRequestContext): Promise<unknown> {
  const payload = await resendRequestJson(`/emails/receiving/${readPathId(input, "emailId")}`, context, {}, "execute");
  return { email: normalizeReceivedEmail(payload) };
}

async function listReceivedEmailAttachments(
  input: Record<string, unknown>,
  context: ResendRequestContext,
): Promise<unknown> {
  const payload = await resendRequestJson(
    `/emails/receiving/${readPathId(input, "emailId")}/attachments`,
    context,
    { query: buildPaginationQuery(input) },
    "execute",
  );
  return normalizeAttachmentList(payload);
}

async function getReceivedEmailAttachment(
  input: Record<string, unknown>,
  context: ResendRequestContext,
): Promise<unknown> {
  const payload = await resendRequestJson(
    `/emails/receiving/${readPathId(input, "emailId")}/attachments/${readPathId(input, "attachmentId")}`,
    context,
    {},
    "execute",
  );
  return { attachment: normalizeAttachment(payload) };
}

async function resendRequestJson(
  path: string,
  context: ResendRequestContext,
  options: ResendRequestOptions,
  phase: ResendRequestPhase,
): Promise<Record<string, unknown>> {
  const url = new URL(path, resendApiBaseUrl);
  setSearchParams(url, options.query ?? {});
  const headers = resendHeaders(context.apiKey);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers[name] = value;
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: context.signal,
    });
    payload = await readResendPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Resend request failed: ${error.message}` : "Resend request failed",
    );
  }

  if (!response.ok) {
    throw createResendError(response.status, payload, phase);
  }
  return requiredResponseRecord(payload, "Resend response");
}

function resendHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readResendPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Resend returned invalid JSON",
    invalidJsonFallback: (text) => ({ message: text }),
  });
}

async function readResendError(response: Response): Promise<{ name: string; message: string }> {
  return parseResendError(response.status, await readResendPayload(response));
}

function createResendError(status: number, payload: unknown, phase: ResendRequestPhase): ProviderRequestError {
  const error = parseResendError(status, payload);
  if (status === 429) {
    return new ProviderRequestError(429, error.message, error);
  }
  if (error.name === "invalid_api_key" || error.name === "missing_api_key") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, error.message, error);
  }
  if (error.name === "restricted_api_key") {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, error.message, error);
  }
  if (status >= 500) {
    return new ProviderRequestError(502, error.message, error);
  }
  if (status === 404 || status === 409) {
    return new ProviderRequestError(status, error.message, error);
  }
  return new ProviderRequestError(400, error.message, error);
}

function parseResendError(status: number, payload: unknown): { name: string; message: string } {
  const object = optionalRecord(payload) ?? {};
  return {
    name: optionalString(object.name) ?? optionalString(object.error) ?? "provider_error",
    message:
      optionalString(object.message) ??
      optionalString(object.error_description) ??
      `Resend request failed with ${status}`,
  };
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const after = optionalString(input.after);
  const before = optionalString(input.before);
  if (after && before) {
    throw new ProviderRequestError(400, "after and before cannot be used together");
  }
  const limit = optionalInteger(input.limit);
  if (limit !== undefined && (limit < 1 || limit > 100)) {
    throw new ProviderRequestError(400, "limit must be between 1 and 100");
  }
  return {
    limit: limit === undefined ? undefined : String(limit),
    after,
    before,
  };
}

function buildBatchEmailBody(input: Record<string, unknown>): unknown {
  const html = optionalRawString(input.html);
  const text = optionalRawString(input.text);
  const template = optionalRecord(input.template);
  if (html === undefined && text === undefined && template === undefined) {
    throw providerInputError("each batch email requires html, text, or template");
  }
  if (template !== undefined && (html !== undefined || text !== undefined)) {
    throw providerInputError("template cannot be used with html or text");
  }

  const headers = optionalRecord(input.headers);
  const tags =
    input.tags === undefined ? undefined : objectArray(input.tags, "tags", providerInputError).map(normalizeTagInput);
  return compactJson({
    from: requiredString(input.from, "from", providerInputError),
    to: requiredStringArray(input.to, "to", providerInputError),
    subject: requiredString(input.subject, "subject", providerInputError),
    html,
    text,
    cc: readOptionalStringArrayInput(input.cc, "cc"),
    bcc: readOptionalStringArrayInput(input.bcc, "bcc"),
    reply_to: readOptionalStringArrayInput(input.replyTo, "replyTo"),
    headers: headers === undefined ? undefined : readStringRecordInput(headers, "headers"),
    tags,
    template: template === undefined ? undefined : buildTemplateInput(template),
  });
}

function buildTemplateInput(input: Record<string, unknown>): Record<string, unknown> {
  const variables = optionalRecord(input.variables);
  const output: Record<string, unknown> = {
    id: requiredString(input.id, "template.id", providerInputError),
  };
  if (variables !== undefined) {
    output.variables = variables;
  }
  return output;
}

function normalizeTagInput(input: Record<string, unknown>): Record<string, string> {
  return {
    name: requiredString(input.name, "tags.name", providerInputError),
    value: requiredString(input.value, "tags.value", providerInputError),
  };
}

function readOptionalStringArrayInput(value: unknown, fieldName: string): string[] | undefined {
  return value === undefined ? undefined : requiredStringArray(value, fieldName, providerInputError);
}

function readStringRecordInput(input: Record<string, unknown>, fieldName: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      throw providerInputError(`${fieldName}.${key} must be a string`);
    }
    output[key] = value;
  }
  return output;
}

function normalizeEmailList(
  payload: Record<string, unknown>,
  label: string,
  normalizeItem: (value: unknown) => Record<string, unknown>,
): Record<string, unknown> {
  return {
    hasMore: readRequiredBoolean(payload, "has_more", `Resend ${label} email list`),
    emails: readRequiredArray(payload, "data", `Resend ${label} email list`).map(normalizeItem),
  };
}

function normalizeSentEmailSummary(value: unknown): Record<string, unknown> {
  const email = requiredResponseRecord(value, "Resend sent email");
  return {
    ...normalizeEmailEnvelope(email, "Resend sent email"),
    subject: readRequiredString(email, "subject", "Resend sent email"),
    lastEvent: readNullableString(email.last_event, "last_event"),
    scheduledAt: readNullableString(email.scheduled_at, "scheduled_at"),
  };
}

function normalizeSentEmail(value: unknown): Record<string, unknown> {
  const email = requiredResponseRecord(value, "Resend sent email");
  return {
    ...normalizeEmailEnvelope(email, "Resend sent email"),
    subject: readRequiredString(email, "subject", "Resend sent email"),
    html: readNullableString(email.html, "html"),
    text: readNullableString(email.text, "text"),
    lastEvent: readNullableString(email.last_event, "last_event"),
    scheduledAt: readNullableString(email.scheduled_at, "scheduled_at"),
    tags: optionalObjectArray(email.tags, "Resend email tag", providerResponseError).map(normalizeTagOutput),
  };
}

function normalizeReceivedEmailSummary(value: unknown): Record<string, unknown> {
  const email = requiredResponseRecord(value, "Resend received email");
  return {
    ...normalizeEmailEnvelope(email, "Resend received email"),
    subject: readNullableString(email.subject, "subject"),
    attachments: optionalObjectArray(email.attachments, "Resend attachment", providerResponseError).map(
      normalizeAttachmentReference,
    ),
  };
}

function normalizeReceivedEmail(value: unknown): Record<string, unknown> {
  const email = requiredResponseRecord(value, "Resend received email");
  const raw = email.raw;
  return {
    ...normalizeEmailEnvelope(email, "Resend received email"),
    subject: readRequiredString(email, "subject", "Resend received email"),
    html: readNullableString(email.html, "html"),
    text: readNullableString(email.text, "text"),
    headers: email.headers == null ? null : normalizeResponseStringRecord(email.headers, "headers"),
    raw: raw == null ? null : normalizeRawEmail(raw),
    attachments: optionalObjectArray(email.attachments, "Resend attachment", providerResponseError).map(
      normalizeAttachmentReference,
    ),
  };
}

function normalizeEmailEnvelope(email: Record<string, unknown>, label: string): Record<string, unknown> {
  return {
    id: readRequiredString(email, "id", label),
    messageId: readNullableString(email.message_id, "message_id"),
    to: readRequiredStringArray(email, "to", label),
    from: readRequiredString(email, "from", label),
    createdAt: readRequiredString(email, "created_at", label),
    bcc: readNullableStringArray(email.bcc, "bcc"),
    cc: readNullableStringArray(email.cc, "cc"),
    replyTo: readNullableStringArray(email.reply_to, "reply_to"),
  };
}

function normalizeRawEmail(value: unknown): Record<string, unknown> {
  const raw = requiredResponseRecord(value, "Resend raw email");
  return {
    downloadUrl: readRequiredString(raw, "download_url", "Resend raw email"),
    expiresAt: readRequiredString(raw, "expires_at", "Resend raw email"),
  };
}

function normalizeTagOutput(input: Record<string, unknown>): Record<string, string> {
  return {
    name: readRequiredString(input, "name", "Resend email tag"),
    value: readRequiredString(input, "value", "Resend email tag"),
  };
}

function normalizeAttachmentList(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    hasMore: readRequiredBoolean(payload, "has_more", "Resend attachment list"),
    attachments: readRequiredArray(payload, "data", "Resend attachment list").map(normalizeAttachment),
  };
}

function normalizeAttachment(value: unknown): Record<string, unknown> {
  const attachment = requiredResponseRecord(value, "Resend attachment");
  return {
    ...normalizeAttachmentReference(attachment),
    size: readRequiredInteger(attachment, "size", "Resend attachment"),
    contentType: readRequiredString(attachment, "content_type", "Resend attachment"),
    downloadUrl: readRequiredString(attachment, "download_url", "Resend attachment"),
    expiresAt: readRequiredString(attachment, "expires_at", "Resend attachment"),
  };
}

function normalizeAttachmentReference(value: unknown): Record<string, unknown> {
  const attachment = requiredResponseRecord(value, "Resend attachment");
  return {
    id: readRequiredString(attachment, "id", "Resend attachment"),
    filename: readNullableString(attachment.filename, "filename"),
    size: readNullableInteger(attachment.size, "size"),
    contentType: readNullableString(attachment.content_type, "content_type"),
    contentDisposition: readNullableString(attachment.content_disposition, "content_disposition"),
    contentId: readNullableString(attachment.content_id, "content_id"),
  };
}

function readPathId(input: Record<string, unknown>, fieldName: string): string {
  return encodePathSegment(requiredString(input[fieldName], fieldName, providerInputError));
}

function readRequiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = input[key];
  if (typeof value === "string") {
    return value;
  }
  throw providerResponseError(`${label} field ${key} must be a string`);
}

function readRequiredBoolean(input: Record<string, unknown>, key: string, label: string): boolean {
  const value = input[key];
  if (typeof value === "boolean") {
    return value;
  }
  throw providerResponseError(`${label} field ${key} must be a boolean`);
}

function readRequiredInteger(input: Record<string, unknown>, key: string, label: string): number {
  const value = input[key];
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw providerResponseError(`${label} field ${key} must be an integer`);
}

function readRequiredArray(input: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = input[key];
  if (Array.isArray(value)) {
    return value;
  }
  throw providerResponseError(`${label} field ${key} must be an array`);
}

function readRequiredStringArray(input: Record<string, unknown>, key: string, label: string): string[] {
  const value = optionalStringArray(input[key]);
  if (value) {
    return value;
  }
  throw providerResponseError(`${label} field ${key} must be an array of strings`);
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw providerResponseError(`Resend response field ${fieldName} must be a string or null`);
}

function readNullableStringArray(value: unknown, fieldName: string): string[] | null {
  if (value == null) {
    return null;
  }
  const strings = optionalStringArray(value);
  if (strings) {
    return strings;
  }
  throw providerResponseError(`Resend response field ${fieldName} must be an array of strings or null`);
}

function readNullableInteger(value: unknown, fieldName: string): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw providerResponseError(`Resend response field ${fieldName} must be an integer or null`);
}

function normalizeResponseStringRecord(value: unknown, fieldName: string): Record<string, string> {
  const input = optionalRecord(value);
  if (!input) {
    throw providerResponseError(`Resend response field ${fieldName} must be an object`);
  }
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item !== "string") {
      throw providerResponseError(`Resend response field ${fieldName}.${key} must be a string`);
    }
    output[key] = item;
  }
  return output;
}
