import type { CredentialValidationResult, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const mailgunDefaultApiBaseUrl = "https://api.mailgun.net";
const mailgunAllowedApiBaseUrls = new Set([mailgunDefaultApiBaseUrl, "https://api.eu.mailgun.net"]);
const validationPath = "/v4/domains";
const suppressionPathByKind = {
  bounce: "bounces",
  complaint: "complaints",
  unsubscribe: "unsubscribes",
  allowlist: "whitelists",
} as const;

type MailgunRequestPhase = "validate" | "execute";
type MailgunSuppressionKind = keyof typeof suppressionPathByKind;
type MailgunActionHandler = (input: Record<string, unknown>, context: MailgunContext) => Promise<unknown>;

export interface MailgunContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const mailgunActionHandlers: ProviderActionHandlers<"mailgun", MailgunActionHandler> = {
  list_domains(input, context) {
    return mailgunGetJson("/v4/domains", context, {
      limit: optionalInteger(input.limit),
      skip: optionalInteger(input.skip),
      state: optionalString(input.state),
      sort: optionalString(input.sort),
      authority: optionalString(input.authority),
      search: optionalString(input.search),
      include_subaccounts: optionalBoolean(input.includeSubaccounts),
    });
  },
  get_domain(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    return mailgunGetJson(`/v4/domains/${encodePathSegment(domain)}`, context);
  },
  verify_domain(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    return normalizeMessageResponse(
      mailgunRequestJson("PUT", `/v4/domains/${encodePathSegment(domain)}/verify`, context),
    );
  },
  get_domain_tracking_settings(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    return normalizeTrackingSettingsResponse(
      mailgunGetJson(`/v3/domains/${encodePathSegment(domain)}/tracking`, context),
    );
  },
  update_domain_tracking_settings(input, context) {
    return updateDomainTrackingSettings(input, context);
  },
  send_email(input, context) {
    return sendMailgunEmail(input, context);
  },
  list_events(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    return normalizeListResponse(
      mailgunGetJson(`/v3/${encodePathSegment(domain)}/events`, context, {
        begin: optionalString(input.begin),
        end: optionalString(input.end),
        ascending: optionalString(input.ascending),
        limit: optionalInteger(input.limit),
        event: optionalString(input.event),
        severity: optionalString(input.severity),
        recipient: optionalString(input.recipient),
        from: optionalString(input.from),
        to: optionalString(input.to),
        subject: optionalString(input.subject),
        "message-id": optionalString(input.messageId),
        tags: optionalString(input.tags),
      }),
    );
  },
  list_suppressions(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const kind = readSuppressionKind(input.kind);
    return normalizeListResponse(
      mailgunGetJson(`/v3/${encodePathSegment(domain)}/${suppressionPathByKind[kind]}`, context, {
        limit: optionalInteger(input.limit),
        page: optionalString(input.page),
        address: optionalString(input.address),
        term: optionalString(input.term),
      }),
    );
  },
  get_suppression(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const kind = readSuppressionKind(input.kind);
    const value = requiredInputString(input.value, "value");
    return mailgunGetJson(
      `/v3/${encodePathSegment(domain)}/${suppressionPathByKind[kind]}/${encodePathSegment(value)}`,
      context,
    );
  },
  add_suppression(input, context) {
    return addSuppression(input, context);
  },
  delete_suppression(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const kind = readSuppressionKind(input.kind);
    const value = requiredInputString(input.value, "value");
    return normalizeMessageResponse(
      mailgunRequestJson(
        "DELETE",
        `/v3/${encodePathSegment(domain)}/${suppressionPathByKind[kind]}/${encodePathSegment(value)}`,
        context,
      ),
    );
  },
  list_templates(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    return normalizeListResponse(
      mailgunGetJson(`/v3/${encodePathSegment(domain)}/templates`, context, {
        page: optionalString(input.page),
        limit: optionalInteger(input.limit),
        p: optionalString(input.pivot),
      }),
    );
  },
  get_template(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const templateName = requiredInputString(input.templateName, "templateName");
    return mailgunGetJson(
      `/v3/${encodePathSegment(domain)}/templates/${encodePathSegment(templateName)}`,
      context,
      optionalBoolean(input.active) ? { active: "yes" } : undefined,
    );
  },
  create_template(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const form = new FormData();
    appendString(form, "name", input.name);
    appendString(form, "description", input.description);
    appendString(form, "createdBy", input.createdBy);
    appendString(form, "template", input.template);
    appendString(form, "tag", input.tag);
    appendString(form, "comment", input.comment);
    appendJson(form, "headers", input.headers);
    return normalizeMessageResponse(mailgunPostForm(`/v3/${encodePathSegment(domain)}/templates`, form, context));
  },
  list_template_versions(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const templateName = requiredInputString(input.templateName, "templateName");
    return mailgunGetJson(
      `/v3/${encodePathSegment(domain)}/templates/${encodePathSegment(templateName)}/versions`,
      context,
      {
        page: optionalString(input.page),
        limit: optionalInteger(input.limit),
        p: optionalString(input.pivot),
      },
    );
  },
  get_template_version(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const templateName = requiredInputString(input.templateName, "templateName");
    const versionName = requiredInputString(input.versionName, "versionName");
    return mailgunGetJson(
      `/v3/${encodePathSegment(domain)}/templates/${encodePathSegment(templateName)}/versions/${encodePathSegment(versionName)}`,
      context,
    );
  },
  create_template_version(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const templateName = requiredInputString(input.templateName, "templateName");
    const form = new FormData();
    appendString(form, "template", input.template);
    appendString(form, "tag", input.tag);
    appendString(form, "comment", input.comment);
    appendYesWhenTrue(form, "active", input.active);
    appendJson(form, "headers", input.headers);
    return normalizeMessageResponse(
      mailgunPostForm(
        `/v3/${encodePathSegment(domain)}/templates/${encodePathSegment(templateName)}/versions`,
        form,
        context,
      ),
    );
  },
};

export async function validateMailgunCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveMailgunApiBaseUrl(values.apiBaseUrl);
  const payload = await mailgunGetJson(
    validationPath,
    { apiKey: requiredInputString(apiKey, "apiKey"), apiBaseUrl, fetcher, signal },
    { limit: 1 },
    "validate",
  );
  const firstDomain = extractFirstDomainName(payload);

  return {
    profile: {
      accountId: firstDomain ? `mailgun:domain:${firstDomain}` : "mailgun-api-key",
      displayName: firstDomain ? `Mailgun: ${firstDomain}` : "Mailgun API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: validationPath,
      firstDomain,
    }),
  };
}

export function defineMailgunExecutors(service: string): ProviderExecutors {
  return defineProviderExecutors<MailgunContext>({
    service,
    handlers: mailgunActionHandlers,
    async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MailgunContext> {
      const credential = await requireApiKeyCredential(context, service);
      return {
        apiKey: credential.apiKey,
        apiBaseUrl: resolveMailgunApiBaseUrl(credential.values.apiBaseUrl ?? credential.metadata.apiBaseUrl),
        fetcher,
        signal: context.signal,
      };
    },
  });
}

function sendMailgunEmail(input: Record<string, unknown>, context: MailgunContext): Promise<unknown> {
  const domain = requiredInputString(input.domain, "domain");
  if (
    !optionalString(input.text) &&
    !optionalString(input.html) &&
    !optionalString(input.ampHtml) &&
    !optionalString(input.template)
  ) {
    throw new ProviderRequestError(400, "At least one of text, html, ampHtml, or template is required.");
  }
  if (!optionalString(input.template) && !optionalString(input.from)) {
    throw new ProviderRequestError(400, "from is required unless template has a preset From header.");
  }
  if (!optionalString(input.template) && !optionalString(input.subject)) {
    throw new ProviderRequestError(400, "subject is required unless template has a preset Subject header.");
  }

  const form = new FormData();
  appendString(form, "from", input.from);
  appendStringArray(form, "to", input.to);
  appendStringArray(form, "cc", input.cc);
  appendStringArray(form, "bcc", input.bcc);
  appendString(form, "subject", input.subject);
  appendString(form, "text", input.text);
  appendString(form, "html", input.html);
  appendString(form, "amp-html", input.ampHtml);
  appendString(form, "template", input.template);
  appendString(form, "t:version", input.templateVersion);
  appendYesWhenTrue(form, "t:text", input.templateText);
  appendJson(form, "t:variables", input.templateVariables);
  appendJson(form, "recipient-variables", input.recipientVariables);
  appendStringArray(form, "o:tag", input.tags);
  appendString(form, "o:deliverytime", input.deliveryTime);
  appendString(form, "o:deliver-within", input.deliverWithin);
  appendString(form, "o:dkim", input.dkim);
  appendString(form, "o:tracking", input.tracking);
  appendString(form, "o:tracking-clicks", input.trackingClicks);
  appendString(form, "o:tracking-opens", input.trackingOpens);
  appendString(form, "o:sending-ip", input.sendingIp);
  appendString(form, "o:sending-ip-pool", input.sendingIpPool);
  appendYesWhenTrue(form, "o:testmode", input.testMode);
  appendBooleanAsYesNo(form, "o:require-tls", input.requireTls);
  appendBooleanAsYesNo(form, "o:skip-verification", input.skipVerification);
  appendPrefixedRecord(form, "h:", input.headers);
  appendPrefixedRecord(form, "v:", input.variables);

  return normalizeSendMessageResponse(mailgunPostForm(`/v3/${encodePathSegment(domain)}/messages`, form, context));
}

function addSuppression(input: Record<string, unknown>, context: MailgunContext): Promise<unknown> {
  const domain = requiredInputString(input.domain, "domain");
  const kind = readSuppressionKind(input.kind);
  if (kind === "allowlist" && !optionalString(input.address) && !optionalString(input.allowlistDomain)) {
    throw new ProviderRequestError(400, "address or allowlistDomain is required for allowlist records.");
  }
  if (kind !== "allowlist" && !optionalString(input.address)) {
    throw new ProviderRequestError(400, "address is required for bounce, complaint, and unsubscribe records.");
  }

  const form = new FormData();
  if (kind === "allowlist") {
    appendString(form, "address", input.address);
    appendString(form, "domain", input.allowlistDomain);
  } else {
    appendString(form, "address", input.address);
    appendString(form, "created_at", input.createdAt);
  }

  if (kind === "bounce") {
    appendString(form, "code", input.code);
    appendString(form, "error", input.error);
  }
  if (kind === "unsubscribe") {
    appendString(form, "tags", input.tags);
  }

  return normalizeMessageResponse(
    mailgunPostForm(`/v3/${encodePathSegment(domain)}/${suppressionPathByKind[kind]}`, form, context),
  );
}

async function updateDomainTrackingSettings(input: Record<string, unknown>, context: MailgunContext): Promise<unknown> {
  const domain = requiredInputString(input.domain, "domain");
  const output: Record<string, unknown> = {};
  const open = optionalRecord(input.open);
  if (open && ("active" in open || "placeAtTheTop" in open)) {
    const form = new FormData();
    appendBooleanAsTrueFalse(form, "active", open.active);
    appendBooleanAsTrueFalse(form, "place_at_the_top", open.placeAtTheTop);
    output.open = await normalizeMessageResponse(
      mailgunPutForm(`/v3/domains/${encodePathSegment(domain)}/tracking/open`, form, context),
    );
  }

  const click = optionalRecord(input.click);
  if (click && "active" in click) {
    const form = new FormData();
    appendString(form, "active", click.active);
    output.click = await normalizeMessageResponse(
      mailgunPutForm(`/v3/domains/${encodePathSegment(domain)}/tracking/click`, form, context),
    );
  }

  const unsubscribe = optionalRecord(input.unsubscribe);
  if (unsubscribe && ("active" in unsubscribe || "htmlFooter" in unsubscribe || "textFooter" in unsubscribe)) {
    const form = new FormData();
    appendBooleanAsTrueFalse(form, "active", unsubscribe.active);
    appendString(form, "html_footer", unsubscribe.htmlFooter);
    appendString(form, "text_footer", unsubscribe.textFooter);
    output.unsubscribe = await normalizeMessageResponse(
      mailgunPutForm(`/v3/domains/${encodePathSegment(domain)}/tracking/unsubscribe`, form, context),
    );
  }

  if (!Object.keys(output).length) {
    throw new ProviderRequestError(400, "At least one tracking setting must be provided.");
  }
  return output;
}

function mailgunGetJson(
  path: string,
  context: MailgunContext,
  query?: Record<string, unknown>,
  phase: MailgunRequestPhase = "execute",
): Promise<unknown> {
  return mailgunRequestJson("GET", path, context, query, phase);
}

async function mailgunRequestJson(
  method: string,
  path: string,
  context: MailgunContext,
  query?: Record<string, unknown>,
  phase: MailgunRequestPhase = "execute",
): Promise<unknown> {
  const response = await mailgunFetch(method, path, context, {
    headers: { accept: "application/json" },
    query,
  });
  const payload = await readMailgunPayload(response);
  if (!response.ok) {
    throw createMailgunError(response, payload, phase);
  }
  return payload;
}

function mailgunPostForm(path: string, form: FormData, context: MailgunContext): Promise<unknown> {
  return mailgunRequestForm("POST", path, form, context);
}

function mailgunPutForm(path: string, form: FormData, context: MailgunContext): Promise<unknown> {
  return mailgunRequestForm("PUT", path, form, context);
}

async function mailgunRequestForm(
  method: string,
  path: string,
  form: FormData,
  context: MailgunContext,
): Promise<unknown> {
  const response = await mailgunFetch(method, path, context, {
    body: form,
    headers: { accept: "application/json" },
  });
  const payload = await readMailgunPayload(response);
  if (!response.ok) {
    throw createMailgunError(response, payload, "execute");
  }
  return payload;
}

async function mailgunFetch(
  method: string,
  path: string,
  context: MailgunContext,
  options: {
    body?: BodyInit;
    headers?: Record<string, string>;
    query?: Record<string, unknown>;
  } = {},
): Promise<Response> {
  const url = new URL(path, context.apiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  try {
    return await context.fetcher(url, {
      method,
      headers: {
        authorization: createMailgunAuthorizationHeader(context.apiKey),
        "user-agent": providerUserAgent,
        ...options.headers,
      },
      body: options.body,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mailgun request failed: ${error.message}` : "Mailgun request failed",
    );
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value == null || value === "") {
    return;
  }
  if (typeof value === "boolean") {
    url.searchParams.set(key, value ? "true" : "false");
    return;
  }
  url.searchParams.set(key, String(value));
}

function createMailgunAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
}

export function resolveMailgunApiBaseUrl(value: unknown): string {
  const rawValue = optionalString(value);
  if (!rawValue) {
    return mailgunDefaultApiBaseUrl;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }
  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new ProviderRequestError(400, "apiBaseUrl must not include credentials, port, query, or hash");
  }

  const normalizedUrl = url.origin;
  if (!mailgunAllowedApiBaseUrls.has(normalizedUrl)) {
    throw new ProviderRequestError(400, "apiBaseUrl must be https://api.mailgun.net or https://api.eu.mailgun.net");
  }

  return normalizedUrl;
}

async function readMailgunPayload(response: Response): Promise<unknown> {
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

function createMailgunError(response: Response, payload: unknown, phase: MailgunRequestPhase): ProviderRequestError {
  const message = extractMailgunErrorMessage(payload) ?? response.statusText ?? "Mailgun request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractMailgunErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_message) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(error?.message) ??
    optionalString(error?.detail)
  );
}

async function normalizeSendMessageResponse(payloadPromise: Promise<unknown>): Promise<unknown> {
  const payload = await payloadPromise;
  const record = optionalRecord(payload);
  return {
    id: optionalString(record?.id) ?? null,
    message: optionalString(record?.message) ?? null,
    raw: record ?? {},
  };
}

async function normalizeTrackingSettingsResponse(payloadPromise: Promise<unknown>): Promise<unknown> {
  const payload = await payloadPromise;
  const record = optionalRecord(payload);
  return {
    tracking: optionalRecord(record?.tracking) ?? {},
    raw: record ?? {},
  };
}

async function normalizeMessageResponse(payloadPromise: Promise<unknown>): Promise<unknown> {
  const payload = await payloadPromise;
  const record = optionalRecord(payload);
  return {
    message: optionalString(record?.message) ?? null,
    raw: record ?? {},
  };
}

async function normalizeListResponse(payloadPromise: Promise<unknown>): Promise<unknown> {
  const payload = await payloadPromise;
  const record = optionalRecord(payload);
  const items = Array.isArray(record?.items) ? record.items : [];
  return {
    items,
    paging: optionalRecord(record?.paging),
    raw: record ?? {},
  };
}

function extractFirstDomainName(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const items = Array.isArray(record?.items) ? record.items : [];
  const first = optionalRecord(items[0]);
  return optionalString(first?.name);
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readSuppressionKind(value: unknown): MailgunSuppressionKind {
  if (value === "bounce" || value === "complaint" || value === "unsubscribe" || value === "allowlist") {
    return value;
  }
  throw new ProviderRequestError(400, "invalid suppression kind");
}

function appendString(form: FormData, key: string, value: unknown): void {
  const stringValue = optionalString(value);
  if (stringValue) {
    form.append(key, stringValue);
  }
}

function appendStringArray(form: FormData, key: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    appendString(form, key, item);
  }
}

function appendBooleanAsYesNo(form: FormData, key: string, value: unknown): void {
  const booleanValue = optionalBoolean(value);
  if (booleanValue !== undefined) {
    form.append(key, booleanValue ? "yes" : "no");
  }
}

function appendBooleanAsTrueFalse(form: FormData, key: string, value: unknown): void {
  const booleanValue = optionalBoolean(value);
  if (booleanValue !== undefined) {
    form.append(key, booleanValue ? "true" : "false");
  }
}

function appendYesWhenTrue(form: FormData, key: string, value: unknown): void {
  if (optionalBoolean(value)) {
    form.append(key, "yes");
  }
}

function appendJson(form: FormData, key: string, value: unknown): void {
  const record = optionalRecord(value);
  if (record) {
    form.append(key, JSON.stringify(record));
  }
}

function appendPrefixedRecord(form: FormData, prefix: string, value: unknown): void {
  const record = optionalRecord(value);
  if (!record) {
    return;
  }

  for (const [key, child] of Object.entries(record)) {
    if (!key || child == null) {
      continue;
    }
    form.append(`${prefix}${key}`, typeof child === "string" ? child : JSON.stringify(child));
  }
}
