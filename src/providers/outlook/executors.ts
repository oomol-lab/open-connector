import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, requiredRecord } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const outlookGraphBaseUrl = "https://graph.microsoft.com/v1.0";
const graphHost = "graph.microsoft.com";

type OutlookRuntimeDeps = OAuthProviderContext;

type OutlookActionHandler = (input: Record<string, unknown>, deps: OutlookRuntimeDeps) => Promise<unknown>;

type OutlookRequestInput = {
  accessToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, string | undefined>;
  absoluteUrlPolicy?: "mailFolders" | "messages";
  headers?: Record<string, string>;
  body?: unknown;
};

type OutlookErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
    innerError?: unknown;
  };
  message?: unknown;
};

export const outlookActionHandlers: Record<string, OutlookActionHandler> = {
  get_profile(_input, deps) {
    return getProfile(deps);
  },
  list_mail_folders(input, deps) {
    return listMailFolders(input, deps);
  },
  list_messages(input, deps) {
    return listMessages(input, deps);
  },
  get_message(input, deps) {
    return getMessage(input, deps);
  },
  create_draft(input, deps) {
    return createDraft(input, deps);
  },
  update_draft(input, deps) {
    return updateDraft(input, deps);
  },
  send_draft(input, deps) {
    return sendDraft(input, deps);
  },
  send_email(input, deps) {
    return sendEmail(input, deps);
  },
  reply_email(input, deps) {
    return replyEmail(input, deps);
  },
  get_mailbox_settings(_input, deps) {
    return getMailboxSettings(deps);
  },
  update_mailbox_settings(input, deps) {
    return updateMailboxSettings(input, deps);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors("outlook", outlookActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await outlookJsonRequest<{
      id?: unknown;
      displayName?: unknown;
      mail?: unknown;
      userPrincipalName?: unknown;
    }>("me", {
      accessToken: input.accessToken,
      fetcher,
      query: {
        $select: ["id", "displayName", "mail", "userPrincipalName"].join(","),
      },
    });
    const accountId = requiredString(profile.id, "outlook current account id");
    const displayName = typeof profile.displayName === "string" ? profile.displayName : undefined;
    const mail = typeof profile.mail === "string" ? profile.mail : undefined;
    const userPrincipalName = typeof profile.userPrincipalName === "string" ? profile.userPrincipalName : undefined;
    return {
      profile: {
        accountId,
        displayName: mail ?? userPrincipalName ?? displayName ?? accountId,
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

export async function outlookJsonRequest<T>(pathOrUrl: string, input: OutlookRequestInput): Promise<T> {
  const response = await outlookRequest(pathOrUrl, input);
  return (await response.json()) as T;
}

async function outlookRequest(pathOrUrl: string, input: OutlookRequestInput) {
  const target = buildOutlookUrl(pathOrUrl, input.query, input.absoluteUrlPolicy);
  const hasJsonBody = input.body !== undefined;
  const method = (input.method ?? (hasJsonBody ? "POST" : "GET")).toUpperCase();
  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    ...(input.headers ?? {}),
  };

  if ((method === "GET" || method === "HEAD") && hasJsonBody) {
    throw new ProviderRequestError(400, `outlook ${method} request must not include a body`);
  }

  const response = await input.fetcher(target.toString(), {
    method,
    headers:
      hasJsonBody && !hasContentTypeHeader(headers)
        ? {
            ...headers,
            "content-type": "application/json",
          }
        : headers,
    ...(hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
  });

  await assertOutlookResponse(response);
  return response;
}

function buildOutlookUrl(
  pathOrUrl: string,
  query?: Record<string, string | undefined>,
  absoluteUrlPolicy: "mailFolders" | "messages" = "messages",
) {
  const isAbsolutePath = isAbsoluteUrl(pathOrUrl);
  const target = isAbsolutePath ? new URL(pathOrUrl) : new URL(pathOrUrl, `${outlookGraphBaseUrl}/`);

  if (target.hostname !== graphHost) {
    throw new ProviderRequestError(400, "nextLink must target graph.microsoft.com");
  }
  if (isAbsolutePath) {
    assertAllowedOutlookNextLink(target, absoluteUrlPolicy);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    target.searchParams.set(key, value);
  }

  return target;
}

function isAbsoluteUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://");
}

function assertAllowedOutlookNextLink(target: URL, absoluteUrlPolicy: "mailFolders" | "messages") {
  if (target.protocol !== "https:") {
    throw new ProviderRequestError(400, "nextLink must use https");
  }
  if (absoluteUrlPolicy === "messages" && !isAllowedOutlookMessageNextLinkPath(target.pathname)) {
    throw new ProviderRequestError(400, "nextLink must target Outlook message pagination endpoints");
  }
  if (absoluteUrlPolicy === "mailFolders" && !isAllowedOutlookMailFolderNextLinkPath(target.pathname)) {
    throw new ProviderRequestError(400, "nextLink must target Outlook mail folder pagination endpoints");
  }
}

function isAllowedOutlookMessageNextLinkPath(pathname: string) {
  const normalizedPath = trimTrailingSlash(pathname);
  const segments = normalizedPath.split("/").filter(Boolean);

  if (segments[0] !== "v1.0") {
    return false;
  }
  if (segments[1] !== "me") {
    return false;
  }
  if (segments.length === 3 && segments[2] === "messages") {
    return true;
  }
  if (segments.length === 4 && isParenthesizedMailFoldersSegment(segments[2]) && segments[3] === "messages") {
    return true;
  }
  return segments.length === 5 && segments[2] === "mailFolders" && segments[3] !== "" && segments[4] === "messages";
}

// Graph's @odata.nextLink uses the OData parenthesized-key form for
// folder-scoped listings: /v1.0/me/mailFolders('{id}')/messages.
function isParenthesizedMailFoldersSegment(segment: string) {
  return (
    segment.startsWith("mailFolders('") && segment.endsWith("')") && segment.length > "mailFolders('')".length
  );
}

function isAllowedOutlookMailFolderNextLinkPath(pathname: string) {
  const normalizedPath = trimTrailingSlash(pathname);
  const segments = normalizedPath.split("/").filter(Boolean);

  if (segments[0] !== "v1.0") {
    return false;
  }
  return segments[1] === "me" && segments.length === 3 && segments[2] === "mailFolders";
}

function trimTrailingSlash(value: string) {
  let normalizedValue = value;
  while (normalizedValue.endsWith("/") && normalizedValue.length > 1) {
    normalizedValue = normalizedValue.slice(0, -1);
  }
  return normalizedValue;
}

function hasContentTypeHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

export async function assertOutlookResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const { code, message } = await extractOutlookError(response);

  if (response.status === 400) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 403 && isScopeError(code, message)) {
    throw new ProviderRequestError(403, message);
  }
  if (response.status === 403) {
    throw new ProviderRequestError(403, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }

  throw new ProviderRequestError(response.status, message);
}

async function extractOutlookError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {
      code: "",
      message: `outlook request failed with status ${response.status}`,
    };
  }

  try {
    const parsed = JSON.parse(text) as OutlookErrorPayload;
    const code = typeof parsed.error?.code === "string" ? parsed.error.code : "";
    const message =
      (typeof parsed.error?.message === "string" && parsed.error.message) ||
      (typeof parsed.message === "string" && parsed.message) ||
      text;

    return { code, message };
  } catch {
    return {
      code: "",
      message: text,
    };
  }
}

function isScopeError(code: string, message: string) {
  const loweredCode = code.toLowerCase();
  const loweredMessage = message.toLowerCase();
  return (
    loweredCode.includes("accessdenied") ||
    loweredMessage.includes("insufficient privileges") ||
    loweredMessage.includes("required scopes") ||
    loweredMessage.includes("does not have permission") ||
    loweredMessage.includes("access is denied")
  );
}

async function getProfile({ accessToken, fetcher }: OutlookRuntimeDeps) {
  return outlookJsonRequest("me", {
    accessToken,
    fetcher,
    query: {
      $select: ["id", "displayName", "mail", "userPrincipalName"].join(","),
    },
  });
}

async function listMailFolders(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  const pathOrUrl = typeof input.nextLink === "string" ? input.nextLink : "me/mailFolders";
  const query =
    typeof input.nextLink === "string"
      ? undefined
      : compactObject({
          includeHiddenFolders:
            typeof input.includeHiddenFolders === "boolean" ? String(input.includeHiddenFolders) : undefined,
          $top: typeof input.top === "number" ? String(input.top) : undefined,
          $select: Array.isArray(input.select) ? input.select.join(",") : undefined,
        });

  const payload = await outlookJsonRequest<{
    value?: unknown[];
    "@odata.nextLink"?: unknown;
  }>(pathOrUrl, {
    accessToken,
    fetcher,
    query,
    absoluteUrlPolicy: "mailFolders",
  });

  return {
    mailFolders: Array.isArray(payload.value) ? payload.value : [],
    nextLink: typeof payload["@odata.nextLink"] === "string" ? payload["@odata.nextLink"] : null,
  };
}

async function listMessages(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  const pathOrUrl =
    typeof input.nextLink === "string"
      ? input.nextLink
      : typeof input.mailFolderId === "string"
        ? `me/mailFolders/${encodeURIComponent(input.mailFolderId)}/messages`
        : "me/messages";
  const query =
    typeof input.nextLink === "string"
      ? undefined
      : compactObject({
          $top: typeof input.top === "number" ? String(input.top) : undefined,
          $filter: typeof input.filter === "string" ? input.filter : undefined,
          $orderby: typeof input.orderby === "string" ? input.orderby : undefined,
          $select: Array.isArray(input.select) ? input.select.join(",") : undefined,
        });
  const headers =
    input.bodyContentType === "text" || input.bodyContentType === "html"
      ? {
          Prefer: `outlook.body-content-type="${input.bodyContentType}"`,
        }
      : undefined;

  const payload = await outlookJsonRequest<{
    value?: unknown[];
    "@odata.nextLink"?: unknown;
  }>(pathOrUrl, {
    accessToken,
    fetcher,
    query,
    headers,
  });

  return {
    messages: Array.isArray(payload.value) ? payload.value : [],
    nextLink: typeof payload["@odata.nextLink"] === "string" ? payload["@odata.nextLink"] : null,
  };
}

async function getMessage(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  const query = compactObject({
    $select: Array.isArray(input.select) ? input.select.join(",") : undefined,
  });
  const headers =
    input.bodyContentType === "text" || input.bodyContentType === "html"
      ? {
          Prefer: `outlook.body-content-type="${input.bodyContentType}"`,
        }
      : undefined;

  return outlookJsonRequest(`me/messages/${encodeURIComponent(String(input.messageId))}`, {
    accessToken,
    fetcher,
    query,
    headers,
  });
}

async function createDraft(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  return outlookJsonRequest("me/messages", {
    accessToken,
    fetcher,
    body: buildMessageWritePayload(input, {
      requireSubject: true,
      requireBody: true,
    }),
  });
}

async function updateDraft(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  return outlookJsonRequest(`me/messages/${encodeURIComponent(String(input.messageId))}`, {
    accessToken,
    fetcher,
    method: "PATCH",
    body: buildMessageWritePayload(input, {
      requireSubject: false,
      requireBody: false,
    }),
  });
}

async function sendDraft(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  await outlookRequest(`me/messages/${encodeURIComponent(String(input.messageId))}/send`, {
    accessToken,
    fetcher,
    method: "POST",
  });

  return { success: true };
}

async function sendEmail(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  const body = compactObject({
    message: buildMessageWritePayload(input, {
      requireSubject: true,
      requireBody: true,
    }),
    saveToSentItems: input.saveToSentItems === false ? false : undefined,
  });

  await outlookRequest("me/sendMail", {
    accessToken,
    fetcher,
    method: "POST",
    body,
  });

  return { success: true };
}

async function replyEmail(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  const messagePayload = buildReplyMessagePayload(input);
  const body = compactObject({
    comment: typeof input.comment === "string" ? input.comment : undefined,
    message: Object.keys(messagePayload).length > 0 ? messagePayload : undefined,
  });

  await outlookRequest(`me/messages/${encodeURIComponent(String(input.messageId))}/reply`, {
    accessToken,
    fetcher,
    method: "POST",
    body,
  });

  return { success: true };
}

async function getMailboxSettings({ accessToken, fetcher }: OutlookRuntimeDeps) {
  return outlookJsonRequest("me/mailboxSettings", {
    accessToken,
    fetcher,
  });
}

async function updateMailboxSettings(input: Record<string, unknown>, { accessToken, fetcher }: OutlookRuntimeDeps) {
  return outlookJsonRequest("me/mailboxSettings", {
    accessToken,
    fetcher,
    method: "PATCH",
    body: buildMailboxSettingsPayload(input),
  });
}

function buildMessageWritePayload(
  input: Record<string, unknown>,
  options: {
    requireSubject: boolean;
    requireBody: boolean;
  },
) {
  const payload = compactObject({
    subject:
      typeof input.subject === "string"
        ? input.subject
        : options.requireSubject
          ? requiredString(input.subject, "subject")
          : undefined,
    body:
      typeof input.body === "string"
        ? {
            contentType: normalizeMessageBodyContentType(input.isHtml),
            content: input.body,
          }
        : options.requireBody
          ? {
              contentType: normalizeMessageBodyContentType(input.isHtml),
              content: requiredString(input.body, "body"),
            }
          : undefined,
    toRecipients: normalizeRecipients(input.toRecipients),
    ccRecipients: normalizeRecipients(input.ccRecipients),
    bccRecipients: normalizeRecipients(input.bccRecipients),
    replyTo: normalizeRecipients(input.replyTo),
    importance: typeof input.importance === "string" ? input.importance : undefined,
    categories: Array.isArray(input.categories) ? input.categories.map(String) : undefined,
  });

  return payload;
}

function buildReplyMessagePayload(input: Record<string, unknown>) {
  return compactObject({
    body:
      typeof input.body === "string"
        ? {
            contentType: normalizeMessageBodyContentType(input.isHtml),
            content: input.body,
          }
        : undefined,
    toRecipients: normalizeRecipients(input.toRecipients),
    ccRecipients: normalizeRecipients(input.ccRecipients),
    bccRecipients: normalizeRecipients(input.bccRecipients),
  });
}

function normalizeMessageBodyContentType(value: unknown) {
  return value === true ? "HTML" : "Text";
}

function normalizeRecipients(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (value.length === 0) {
    return [];
  }

  return value.map((item) => {
    if (typeof item === "string") {
      return {
        emailAddress: {
          address: item,
        },
      };
    }

    const object = asObject(item);
    return {
      emailAddress: compactObject({
        address: requiredString(object.address, "address"),
        name: typeof object.name === "string" ? object.name : undefined,
      }),
    };
  });
}

function buildMailboxSettingsPayload(input: Record<string, unknown>) {
  return compactObject({
    automaticRepliesSetting:
      input.automaticRepliesSetting && typeof input.automaticRepliesSetting === "object"
        ? buildAutomaticRepliesSettingPayload(asObject(input.automaticRepliesSetting))
        : undefined,
    dateFormat: typeof input.dateFormat === "string" ? input.dateFormat : undefined,
    delegateMeetingMessageDeliveryOptions:
      typeof input.delegateMeetingMessageDeliveryOptions === "string"
        ? input.delegateMeetingMessageDeliveryOptions
        : undefined,
    language:
      input.language && typeof input.language === "object" ? buildLanguagePayload(asObject(input.language)) : undefined,
    timeFormat: typeof input.timeFormat === "string" ? input.timeFormat : undefined,
    timeZone: typeof input.timeZone === "string" ? input.timeZone : undefined,
    workingHours:
      input.workingHours && typeof input.workingHours === "object"
        ? buildWorkingHoursPayload(asObject(input.workingHours))
        : undefined,
  });
}

function buildAutomaticRepliesSettingPayload(value: Record<string, unknown>) {
  return compactObject({
    status: typeof value.status === "string" ? value.status : undefined,
    externalAudience: typeof value.externalAudience === "string" ? value.externalAudience : undefined,
    scheduledStartDateTime:
      value.scheduledStartDateTime && typeof value.scheduledStartDateTime === "object"
        ? buildDateTimeTimeZonePayload(asObject(value.scheduledStartDateTime))
        : undefined,
    scheduledEndDateTime:
      value.scheduledEndDateTime && typeof value.scheduledEndDateTime === "object"
        ? buildDateTimeTimeZonePayload(asObject(value.scheduledEndDateTime))
        : undefined,
    internalReplyMessage: typeof value.internalReplyMessage === "string" ? value.internalReplyMessage : undefined,
    externalReplyMessage: typeof value.externalReplyMessage === "string" ? value.externalReplyMessage : undefined,
  });
}

function buildLanguagePayload(value: Record<string, unknown>) {
  return compactObject({
    locale: requiredString(value.locale, "locale"),
    displayName: typeof value.displayName === "string" ? value.displayName : undefined,
  });
}

function buildWorkingHoursPayload(value: Record<string, unknown>) {
  return compactObject({
    daysOfWeek: Array.isArray(value.daysOfWeek) ? value.daysOfWeek.map(String) : undefined,
    startTime: typeof value.startTime === "string" ? value.startTime : undefined,
    endTime: typeof value.endTime === "string" ? value.endTime : undefined,
    timeZone:
      typeof value.timeZone === "string"
        ? { name: value.timeZone }
        : value.timeZone && typeof value.timeZone === "object"
          ? compactObject({
              name: requiredString(asObject(value.timeZone).name, "timeZone.name"),
            })
          : undefined,
  });
}

function buildDateTimeTimeZonePayload(value: Record<string, unknown>) {
  return {
    dateTime: requiredString(value.dateTime, "dateTime"),
    timeZone: requiredString(value.timeZone, "timeZone"),
  };
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new ProviderRequestError(400, `${field} is required`);
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}
