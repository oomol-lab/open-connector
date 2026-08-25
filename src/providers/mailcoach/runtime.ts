import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type MailcoachRequestMode = "validate" | "execute";
const maxMailcoachResponseBytes = 10 * 1024 * 1024;

export interface MailcoachActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MailcoachRequestOptions {
  apiKey: string;
  baseUrl: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: MailcoachRequestMode;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  noContent?: boolean;
  notFoundAsInvalidInput?: boolean;
}

export const mailcoachActionHandlers: ProviderActionHandlers<
  "mailcoach",
  ProviderRuntimeHandler<MailcoachActionContext>
> = {
  list_email_lists(input, context) {
    return requestMailcoachJson({
      ...context,
      path: "/email-lists",
      query: compactObject({
        "filter[search]": optionalString(input.search),
        "filter[name]": optionalString(input.name),
        sort: optionalString(input.sort),
        page: asOptionalPositiveInteger(input.page),
      }),
      mode: "execute",
    });
  },
  get_email_list(input, context) {
    return requestMailcoachJson({
      ...context,
      path: `/email-lists/${encodeURIComponent(requiredString(input.email_list_uuid, "email_list_uuid", inputError))}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_email_list(input, context) {
    return requestMailcoachJson({
      ...context,
      path: "/email-lists",
      method: "POST",
      body: buildEmailListBody(input),
      mode: "execute",
    });
  },
  update_email_list(input, context) {
    return requestMailcoachJson({
      ...context,
      path: `/email-lists/${encodeURIComponent(requiredString(input.email_list_uuid, "email_list_uuid", inputError))}`,
      method: "PUT",
      body: buildEmailListBody(input),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  delete_email_list(input, context) {
    return requestMailcoachJson({
      ...context,
      path: `/email-lists/${encodeURIComponent(requiredString(input.email_list_uuid, "email_list_uuid", inputError))}`,
      method: "DELETE",
      mode: "execute",
      noContent: true,
      notFoundAsInvalidInput: true,
    });
  },
  list_subscribers(input, context) {
    const emailListUuid = requiredString(input.email_list_uuid, "email_list_uuid", inputError);
    return requestMailcoachJson({
      ...context,
      path: `/email-lists/${encodeURIComponent(emailListUuid)}/subscribers`,
      query: compactObject({
        "filter[email]": optionalString(input.email),
        "filter[search]": optionalString(input.search),
        "filter[status]": optionalString(input.status),
        sort: optionalString(input.sort),
        page: asOptionalPositiveInteger(input.page),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_subscriber(input, context) {
    return subscriberRequest(input, context);
  },
  subscribe(input, context) {
    const emailListUuid = requiredString(input.email_list_uuid, "email_list_uuid", inputError);
    const strict = optionalBoolean(input.strict);
    return requestMailcoachJson({
      ...context,
      path: `/email-lists/${encodeURIComponent(emailListUuid)}/subscribers`,
      method: "POST",
      query: strict === undefined ? undefined : { strict },
      body: compactObject({
        email: requiredString(input.email, "email", inputError),
        first_name: readNullableString(input.first_name),
        last_name: readNullableString(input.last_name),
        extra_attributes: readOptionalNullableObject(input.extra_attributes),
        tags: readOptionalStringArray(input.tags),
        skip_confirmation: optionalBoolean(input.skip_confirmation),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  update_subscriber(input, context) {
    return requestMailcoachJson({
      ...context,
      path: `/subscribers/${encodeURIComponent(requiredString(input.subscriber_uuid, "subscriber_uuid", inputError))}`,
      method: "PATCH",
      body: compactObject({
        email: requiredString(input.email, "email", inputError),
        first_name: readNullableString(input.first_name),
        last_name: readNullableString(input.last_name),
        tags: readOptionalStringArray(input.tags),
        append_tags: optionalBoolean(input.append_tags),
        extra_attributes: readOptionalNullableObject(input.extra_attributes),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  delete_subscriber(input, context) {
    return subscriberCommand(input, context, undefined, "DELETE");
  },
  confirm_subscriber(input, context) {
    return subscriberCommand(input, context, "confirm");
  },
  unsubscribe_subscriber(input, context) {
    return subscriberCommand(input, context, "unsubscribe");
  },
  resend_subscriber_confirmation(input, context) {
    return subscriberCommand(input, context, "resend-confirmation");
  },
};

export async function validateMailcoachCredential(
  apiKey: string,
  baseUrlInput: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeMailcoachBaseUrl(baseUrlInput);
  const payload = await requestMailcoachJson({
    apiKey,
    baseUrl,
    path: "/user",
    fetcher,
    signal,
    mode: "validate",
    notFoundAsInvalidInput: true,
  });
  const user = optionalRecord(optionalRecord(payload)?.data);
  const userId = normalizeIdentifier(user?.id);
  const email = optionalString(user?.email);
  if (!userId && !email) {
    throw new ProviderRequestError(502, "mailcoach user response is missing both id and email");
  }

  return {
    profile: {
      accountId: `mailcoach:${baseUrl}:${userId ?? email}`,
      displayName: email ?? `Mailcoach ${new URL(baseUrl).hostname}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      validationEndpoint: "/api/user",
      userId,
      email,
    }),
  };
}

export function normalizeMailcoachBaseUrl(
  input?: string,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = input?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  const parsed = assertPublicHttpUrl(withProtocol, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (parsed.username || parsed.password) {
    throw new ProviderRequestError(400, "baseUrl must not include URL credentials");
  }
  if (!parsed.hostname) {
    throw new ProviderRequestError(400, "baseUrl must include a host");
  }
  if (parsed.search || parsed.hash) {
    throw new ProviderRequestError(400, "baseUrl must not include query or fragment");
  }

  const pathname = trimTrailingSlash(parsed.pathname);
  if (pathname.endsWith("/api")) {
    parsed.pathname = pathname.slice(0, -"/api".length) || "/";
  } else {
    parsed.pathname = pathname || "/";
  }
  const normalizedPath = trimTrailingSlash(parsed.pathname);
  return normalizedPath && normalizedPath !== "/" ? `${parsed.origin}${normalizedPath}` : parsed.origin;
}

export function resolveMailcoachProxyBaseUrl(providerMetadata: Record<string, unknown>): string {
  const baseUrl = optionalString(providerMetadata.baseUrl);
  if (!baseUrl) {
    throw new ProviderRequestError(500, "mailcoach connection is missing baseUrl metadata");
  }
  return `${normalizeMailcoachBaseUrl(baseUrl)}/api`;
}

function subscriberRequest(input: Record<string, unknown>, context: MailcoachActionContext): Promise<unknown> {
  return requestMailcoachJson({
    ...context,
    path: `/subscribers/${encodeURIComponent(requiredString(input.subscriber_uuid, "subscriber_uuid", inputError))}`,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

function subscriberCommand(
  input: Record<string, unknown>,
  context: MailcoachActionContext,
  command?: "confirm" | "unsubscribe" | "resend-confirmation",
  method: "POST" | "DELETE" = "POST",
) {
  const subscriberUuid = encodeURIComponent(requiredString(input.subscriber_uuid, "subscriber_uuid", inputError));
  return requestMailcoachJson({
    ...context,
    path: `/subscribers/${subscriberUuid}${command ? `/${command}` : ""}`,
    method,
    mode: "execute",
    noContent: true,
    notFoundAsInvalidInput: true,
  });
}

async function requestMailcoachJson(input: MailcoachRequestOptions) {
  let response: Response;
  let payload: unknown;
  try {
    response = await mailcoachFetch(input);
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new ProviderRequestError(504, "mailcoach request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `mailcoach request failed: ${error.message}` : "mailcoach request failed",
    );
  }

  if (!response.ok) {
    throw createMailcoachError(response, payload, input.mode, input.notFoundAsInvalidInput);
  }
  if (input.noContent || response.status === 204) {
    return { success: true };
  }
  return payload;
}

function mailcoachFetch(input: MailcoachRequestOptions): Promise<Response> {
  const url = buildMailcoachUrl(input.baseUrl, input.path);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return input.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    redirect: "manual",
    signal: input.signal,
  });
}

function buildMailcoachUrl(baseUrl: string, path: string) {
  const relative = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relative, `${trimTrailingSlash(baseUrl)}/api/`);
}

function buildEmailListBody(input: Record<string, unknown>) {
  return compactObject({
    name: requiredString(input.name, "name", inputError),
    default_from_email: requiredString(input.default_from_email, "default_from_email", inputError),
    default_from_name: optionalString(input.default_from_name),
    default_reply_to_email: optionalString(input.default_reply_to_email),
    default_reply_to_name: optionalString(input.default_reply_to_name),
    campaign_mailer: optionalString(input.campaign_mailer),
    automation_mailer: optionalString(input.automation_mailer),
    transactional_mailer: optionalString(input.transactional_mailer),
    campaigns_feed_enabled: optionalBoolean(input.campaigns_feed_enabled),
    report_recipients: optionalString(input.report_recipients),
    report_campaign_sent: optionalBoolean(input.report_campaign_sent),
    report_campaign_summary: optionalBoolean(input.report_campaign_summary),
    report_email_list_summary: optionalBoolean(input.report_email_list_summary),
    allow_form_subscriptions: optionalBoolean(input.allow_form_subscriptions),
    requires_confirmation: optionalBoolean(input.requires_confirmation),
    allowed_form_subscription_tags: readOptionalStringArray(input.allowed_form_subscription_tags),
    redirect_after_subscribed: optionalString(input.redirect_after_subscribed),
    redirect_after_already_subscribed: optionalString(input.redirect_after_already_subscribed),
    redirect_after_subscription_pending: optionalString(input.redirect_after_subscription_pending),
    redirect_after_unsubscribed: optionalString(input.redirect_after_unsubscribed),
    confirmation_mail: optionalString(input.confirmation_mail),
    confirmation_mail_subject: optionalString(input.confirmation_mail_subject),
    confirmation_mail_content: optionalString(input.confirmation_mail_content),
  });
}

async function readPayload(response: Response) {
  const text = await readResponseText(response);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function readResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxMailcoachResponseBytes) {
    await response.body?.cancel().catch(() => {});
    throw mailcoachResponseTooLargeError();
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Array<Uint8Array> = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      byteLength += next.value.byteLength;
      if (byteLength > maxMailcoachResponseBytes) {
        await reader.cancel().catch(() => {});
        throw mailcoachResponseTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function mailcoachResponseTooLargeError() {
  return new ProviderRequestError(502, `mailcoach response exceeded ${maxMailcoachResponseBytes} bytes`);
}

function createMailcoachError(
  response: Response,
  payload: unknown,
  mode: MailcoachRequestMode,
  notFoundAsInvalidInput?: boolean,
) {
  const fallbackMessage = response.statusText.trim() || `mailcoach request failed with status ${response.status}`;
  const message = extractMailcoachErrorMessage(payload) ?? fallbackMessage;
  if (response.status >= 300 && response.status < 400) {
    return new ProviderRequestError(502, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 422 || (response.status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractMailcoachErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  const message = optionalString(object?.message);
  const errors = optionalRecord(object?.errors);
  if (!errors) {
    return message;
  }
  for (const [field, value] of Object.entries(errors)) {
    if (Array.isArray(value)) {
      const first = value.find((item): item is string => typeof item === "string");
      if (first) {
        return `${message ? `${message} ` : ""}${field}: ${first}`.trim();
      }
    }
  }
  return message;
}

function readOptionalStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function readNullableString(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function readOptionalNullableObject(value: unknown) {
  return value === null ? null : optionalRecord(value);
}

function asOptionalPositiveInteger(value: unknown) {
  const integer = optionalInteger(value);
  return integer !== undefined && integer > 0 ? integer : undefined;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === "TimeoutError";
}

function normalizeIdentifier(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function trimTrailingSlash(value: string) {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function inputError(message: string) {
  return new ProviderRequestError(400, message);
}
