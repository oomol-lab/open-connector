import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const sendgridDefaultBaseUrl = "https://api.sendgrid.com";
const sendgridTemplatesPath = "/v3/templates";
const sendgridMailSendPath = "/v3/mail/send";
const allowedSendgridHosts = new Set(["api.sendgrid.com", "api.eu.sendgrid.com"]);

interface SendgridActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
}

interface SendgridValidationResult {
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}

type SendgridActionHandler = (input: Record<string, unknown>, context: SendgridActionContext) => Promise<unknown>;

interface SendgridRequestOptions {
  apiKey: string;
  baseUrl: string;
  path: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

interface SendgridErrorInfo {
  message: string;
}

type ValidationProbeResult =
  | { status: "accepted"; result: SendgridValidationResult }
  | { status: "continue" }
  | { status: "throw"; error: ProviderRequestError };

function buildValidationProviderMetadata(
  baseUrl: string,
  validationEndpoint: string,
  extra: Record<string, unknown> = {},
) {
  return compactObject({
    baseUrl,
    validationEndpoint,
    ...extra,
  });
}

export const sendgridActionHandlers: ProviderActionHandlers<"sendgrid", SendgridActionHandler> = {
  get_account_info(_input, context) {
    return getAccountInfo(context);
  },
  get_user_scopes(_input, context) {
    return getUserScopes(context);
  },
  list_transactional_templates(input, context) {
    return listTransactionalTemplates(input, context);
  },
  send_email(input, context) {
    return sendEmail(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SendgridActionContext>({
  service: "sendgrid",
  handlers: sendgridActionHandlers,
  async createContext(context, fetcher): Promise<SendgridActionContext> {
    const credential = await requireApiKeyCredential(context, "sendgrid");
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveSendgridBaseUrl(credential.values.baseUrl ?? credential.metadata.baseUrl),
      fetcher,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const apiKey = input.apiKey;
    const baseUrl = resolveSendgridBaseUrl(input.values.baseUrl);
    const probes = [
      () => probeSendgridScopes(apiKey, baseUrl, fetcher),
      () => probeSendgridUserEmail(apiKey, baseUrl, fetcher),
      () => probeSendgridAccountInfo(apiKey, baseUrl, fetcher),
      () => probeSendgridTemplates(apiKey, baseUrl, fetcher),
      () => probeSendgridMailSend(apiKey, baseUrl, fetcher),
    ];

    for (const probe of probes) {
      const result = await probe();
      if (result.status === "accepted") {
        return result.result;
      }
      if (result.status === "throw") {
        throw result.error;
      }
    }

    throw new ProviderRequestError(
      400,
      "SendGrid API key is invalid or does not grant access to the supported connector actions",
    );
  },
};

async function getAccountInfo(context: SendgridActionContext): Promise<unknown> {
  const payload = await requestSendgridJson({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/v3/user/account",
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    accountType: optionalRawString(payload.type) ?? "",
    reputation: optionalNumber(payload.reputation) ?? 0,
  };
}

async function getUserScopes(context: SendgridActionContext): Promise<unknown> {
  const payload = await requestSendgridJson({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/v3/scopes",
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    scopes: readStringArray(payload.scopes),
  };
}

async function listTransactionalTemplates(
  input: Record<string, unknown>,
  context: SendgridActionContext,
): Promise<unknown> {
  const payload = await requestSendgridJson({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: sendgridTemplatesPath,
    query: compactObject({
      page_size: typeof input.pageSize === "number" && Number.isFinite(input.pageSize) ? input.pageSize : 20,
      page_token: optionalRawString(input.pageToken),
      generations: optionalRawString(input.generations),
    }),
    fetcher: context.fetcher,
    mode: "execute",
  });

  const metadata = optionalRecord(payload._metadata);
  const templates = Array.isArray(payload.result)
    ? payload.result.map((item) => normalizeTransactionalTemplate(item)).filter((item) => item)
    : [];

  return {
    templates,
    count: normalizeOptionalInteger(metadata?.count),
    nextPageToken: extractPageToken(metadata?.next),
    previousPageToken: extractPageToken(metadata?.prev),
  };
}

async function sendEmail(input: Record<string, unknown>, context: SendgridActionContext): Promise<unknown> {
  const response = await sendgridFetch({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: sendgridMailSendPath,
    method: "POST",
    body: buildSendgridMailSendBody(input),
    fetcher: context.fetcher,
    mode: "execute",
  });

  if (response.status === 202) {
    return {
      accepted: true,
      messageId: response.headers.get("x-message-id"),
    };
  }

  const error = await readSendgridError(response);
  throw mapSendgridError(response.status, error.message, "execute");
}

async function requestSendgridJson(input: SendgridRequestOptions) {
  const response = await sendgridFetch(input);
  if (!response.ok) {
    const error = await readSendgridError(response);
    throw mapSendgridError(response.status, error.message, input.mode);
  }

  return readSendgridJsonObject(response);
}

async function probeSendgridScopes(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch,
): Promise<ValidationProbeResult> {
  const response = await sendgridFetch({
    apiKey,
    baseUrl,
    path: "/v3/scopes",
    fetcher,
    mode: "validate",
  });

  if (response.ok) {
    const objectPayload = await readSendgridJsonObject(response);
    const scopes = readStringArray(objectPayload.scopes);
    const email = await tryLoadSendgridUserEmail(apiKey, baseUrl, fetcher);

    return {
      status: "accepted",
      result: {
        profile: {
          accountId: email ?? "api_key",
          displayName: email ?? "SendGrid API Key",
        },
        grantedScopes: scopes,
        metadata: buildValidationProviderMetadata(baseUrl, "/v3/scopes", {
          email: email ?? undefined,
        }),
      },
    };
  }

  return normalizeValidationFailure(response);
}

async function probeSendgridUserEmail(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch,
): Promise<ValidationProbeResult> {
  const response = await sendgridFetch({
    apiKey,
    baseUrl,
    path: "/v3/user/email",
    fetcher,
    mode: "validate",
  });

  if (response.ok) {
    const objectPayload = await readSendgridJsonObject(response);
    const email = optionalRawString(objectPayload?.email);
    return {
      status: "accepted",
      result: {
        profile: {
          accountId: email ?? "api_key",
          displayName: email ?? "SendGrid API Key",
        },
        grantedScopes: [],
        metadata: buildValidationProviderMetadata(baseUrl, "/v3/user/email", {
          email: email ?? undefined,
        }),
      },
    };
  }

  return normalizeValidationFailure(response);
}

async function probeSendgridAccountInfo(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch,
): Promise<ValidationProbeResult> {
  const response = await sendgridFetch({
    apiKey,
    baseUrl,
    path: "/v3/user/account",
    fetcher,
    mode: "validate",
  });

  if (response.ok) {
    await readSendgridJsonObject(response);
    return {
      status: "accepted",
      result: {
        profile: {
          accountId: "api_key",
          displayName: "SendGrid API Key",
        },
        grantedScopes: [],
        metadata: buildValidationProviderMetadata(baseUrl, "/v3/user/account"),
      },
    };
  }

  return normalizeValidationFailure(response);
}

async function probeSendgridTemplates(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch,
): Promise<ValidationProbeResult> {
  const response = await sendgridFetch({
    apiKey,
    baseUrl,
    path: sendgridTemplatesPath,
    query: {
      page_size: 1,
      generations: "legacy,dynamic",
    },
    fetcher,
    mode: "validate",
  });

  if (response.ok) {
    await readSendgridJsonObject(response);
    return {
      status: "accepted",
      result: {
        profile: {
          accountId: "api_key",
          displayName: "SendGrid API Key",
        },
        grantedScopes: [],
        metadata: buildValidationProviderMetadata(baseUrl, sendgridTemplatesPath),
      },
    };
  }

  return normalizeValidationFailure(response);
}

async function probeSendgridMailSend(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch,
): Promise<ValidationProbeResult> {
  const response = await sendgridFetch({
    apiKey,
    baseUrl,
    path: sendgridMailSendPath,
    method: "POST",
    body: {},
    fetcher,
    mode: "validate",
  });

  if (response.status === 400 || response.ok) {
    return {
      status: "accepted",
      result: {
        profile: {
          accountId: "api_key",
          displayName: "SendGrid API Key",
        },
        grantedScopes: [],
        metadata: buildValidationProviderMetadata(baseUrl, sendgridMailSendPath),
      },
    };
  }

  return normalizeValidationFailure(response);
}

async function tryLoadSendgridUserEmail(apiKey: string, baseUrl: string, fetcher: typeof fetch) {
  const response = await sendgridFetch({
    apiKey,
    baseUrl,
    path: "/v3/user/email",
    fetcher,
    mode: "validate",
  });

  if (!response.ok) {
    return null;
  }

  const objectPayload = await readSendgridJsonObject(response);
  return optionalRawString(objectPayload?.email) ?? null;
}

async function normalizeValidationFailure(response: Response): Promise<ValidationProbeResult> {
  const error = await readSendgridError(response);
  if (response.status === 401 || response.status === 403) {
    return { status: "continue" };
  }
  if (response.status === 429) {
    return {
      status: "throw",
      error: new ProviderRequestError(429, error.message),
    };
  }
  if (response.status === 400 || response.status === 404) {
    return {
      status: "throw",
      error: new ProviderRequestError(400, error.message),
    };
  }
  return {
    status: "throw",
    error: new ProviderRequestError(502, error.message),
  };
}

async function sendgridFetch(input: SendgridRequestOptions) {
  const url = new URL(input.path, `${input.baseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: sendgridHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "SendGrid request failed");
  }
}

async function readSendgridJsonObject(response: Response) {
  try {
    const payload = (await response.json()) as unknown;
    const objectPayload = optionalRecord(payload);
    if (!objectPayload) {
      throw new ProviderRequestError(502, "SendGrid returned a non-object JSON payload");
    }
    return objectPayload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "SendGrid returned invalid JSON");
  }
}

function sendgridHeaders(apiKey: string, hasBody: boolean) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

function mapSendgridError(status: number, message: string, mode: "validate" | "execute") {
  if (status === 401) {
    if (mode === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(401, message);
  }
  if (status === 403) {
    if (mode === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(403, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

async function readSendgridError(response: Response): Promise<SendgridErrorInfo> {
  try {
    const payload = (await response.json()) as {
      errors?: Array<{ message?: unknown }>;
      error?: unknown;
      message?: unknown;
    };
    const firstError = Array.isArray(payload.errors)
      ? payload.errors.find(
          (item): item is { message: string } => !!item && typeof item === "object" && typeof item.message === "string",
        )
      : null;

    return {
      message:
        firstError?.message ??
        (typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : `SendGrid request failed with status ${response.status}`),
    };
  } catch {
    const text = (await response.text().catch(() => "")) || `SendGrid request failed with status ${response.status}`;
    return {
      message: text,
    };
  }
}

function buildSendgridMailSendBody(input: Record<string, unknown>) {
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc);
  const bcc = normalizeRecipients(input.bcc);
  const attachments = normalizeAttachments(input.attachments);
  const dynamicTemplateData = optionalRecord(input.dynamicTemplateData);
  const customArgs = normalizeStringRecord(input.customArgs);
  const categories = Array.isArray(input.categories)
    ? input.categories.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;
  const sendAt = typeof input.sendAt === "number" && Number.isInteger(input.sendAt) ? input.sendAt : undefined;

  const personalizations = [
    compactObject({
      to,
      cc,
      bcc,
      ...(dynamicTemplateData ? { dynamic_template_data: dynamicTemplateData } : {}),
    }),
  ];

  const content = [
    typeof input.textContent === "string"
      ? {
          type: "text/plain",
          value: input.textContent,
        }
      : undefined,
    typeof input.htmlContent === "string"
      ? {
          type: "text/html",
          value: input.htmlContent,
        }
      : undefined,
  ].filter((item): item is { type: string; value: string } => item !== undefined);

  return compactObject({
    from: normalizeSender(input.from),
    personalizations,
    reply_to: normalizeOptionalSender(input.replyTo),
    subject: optionalRawString(input.subject),
    content: content.length > 0 ? content : undefined,
    template_id: optionalRawString(input.templateId),
    categories: categories && categories.length > 0 ? categories : undefined,
    custom_args: customArgs,
    send_at: sendAt,
    attachments,
  });
}

function normalizeRecipients(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const recipients = value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) =>
      compactObject({
        email: optionalRawString(item.email),
        name: optionalRawString(item.name),
      }),
    )
    .filter((item) => typeof item.email === "string");

  return recipients.length > 0 ? recipients : undefined;
}

function normalizeSender(value: unknown) {
  const sender = optionalRecord(value);
  return compactObject({
    email: optionalRawString(sender?.email),
    name: optionalRawString(sender?.name),
  });
}

function normalizeOptionalSender(value: unknown) {
  const sender = optionalRecord(value);
  if (!sender) {
    return undefined;
  }
  const normalized = compactObject({
    email: optionalRawString(sender.email),
    name: optionalRawString(sender.name),
  });
  return typeof normalized.email === "string" ? normalized : undefined;
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const attachments = value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) =>
      compactObject({
        content: optionalRawString(item.contentBase64),
        filename: optionalRawString(item.filename),
        type: optionalRawString(item.type),
        disposition: optionalRawString(item.disposition),
        content_id: optionalRawString(item.contentId),
      }),
    )
    .filter((item) => typeof item.content === "string" && typeof item.filename === "string");

  return attachments.length > 0 ? attachments : undefined;
}

function normalizeStringRecord(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const entries = Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeTransactionalTemplate(value: unknown) {
  const template = optionalRecord(value);
  if (!template) {
    return null;
  }

  return {
    id: optionalRawString(template.id) ?? "",
    name: optionalRawString(template.name) ?? "",
    generation: optionalRawString(template.generation) === "dynamic" ? "dynamic" : "legacy",
    updatedAt: optionalRawString(template.updated_at) ?? "",
    versions: Array.isArray(template.versions)
      ? template.versions
          .map((version) => normalizeTemplateVersion(version))
          .filter((version): version is NonNullable<typeof version> => version !== null)
      : [],
  };
}

function normalizeTemplateVersion(value: unknown) {
  const version = optionalRecord(value);
  if (!version) {
    return null;
  }

  const editor = optionalRawString(version.editor);
  return compactObject({
    id: optionalRawString(version.id) ?? "",
    name: optionalRawString(version.name) ?? "",
    active: normalizeOptionalInteger(version.active) ?? 0,
    editor: editor === "code" || editor === "design" ? editor : undefined,
    subject: optionalRawString(version.subject),
    testData: optionalRawString(version.test_data),
    updatedAt: optionalRawString(version.updated_at),
    templateId: optionalRawString(version.template_id),
    htmlContent: optionalRawString(version.html_content),
    plainContent: optionalRawString(version.plain_content),
    thumbnailUrl: optionalRawString(version.thumbnail_url),
    generatePlainContent:
      typeof version.generate_plain_content === "boolean" ? version.generate_plain_content : undefined,
  });
}

function extractPageToken(value: unknown) {
  const urlString = optionalRawString(value);
  if (!urlString) {
    return null;
  }
  try {
    return new URL(urlString).searchParams.get("page_token");
  } catch {
    return null;
  }
}

function resolveSendgridBaseUrl(value: unknown) {
  const rawValue = optionalRawString(value)?.trim() || sendgridDefaultBaseUrl;
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (parsed.username || parsed.password || parsed.port || !allowedSendgridHosts.has(parsed.hostname.toLowerCase())) {
    throw new ProviderRequestError(400, "baseUrl must be an approved SendGrid host");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  let normalized = parsed.toString();
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function normalizeOptionalInteger(value: unknown) {
  const numberValue = optionalNumber(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
