import type { ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-executors.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { downloadUploadSource } from "../provider-files.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";
import { zohoMailOrigin } from "./data-centers.ts";
// Preserve decimal IDs beyond Number.MAX_SAFE_INTEGER on the JSON wire.
const zohoJson = JSON as JSON & { rawJSON(value: string): unknown };

const attachmentMaximumBytes = 20 * 1024 * 1024;
interface Context {
  origin?: string;
  providerSecret?: Record<string, unknown>;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}
export async function fetchCurrentAccount(
  accessToken: string,
  dataCenter: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{ accountId: string; displayName: string }> {
  const payload = await request({ origin: zohoMailOrigin(dataCenter), accessToken, fetcher, signal }, "/api/accounts");
  const account = requiredResponseRecord(
    requireItems(payload).find((item) => item.type === "ZOHO_ACCOUNT"),
    "Zoho Mail native account",
  );
  const accountId = optionalString(account.accountId);
  if (typeof accountId !== "string" || !accountId) throw providerResponseError("Zoho Mail accountId is missing");
  return {
    accountId,
    displayName:
      optionalString(account.primaryEmailAddress) ??
      optionalString(account.mailboxAddress) ??
      optionalString(account.displayName) ??
      "Zoho Mail Account",
  };
}
function accountPath(values: Record<string, unknown>): string {
  return `/api/accounts/${encodeURIComponent(requiredInputString(values.accountId, "accountId"))}`;
}
function messagePath(values: Record<string, unknown>): string {
  return `${accountPath(values)}/folders/${encodeURIComponent(requiredInputString(values.folderId, "folderId"))}/messages/${encodeURIComponent(requiredInputString(values.messageId, "messageId"))}`;
}
async function listMessages(values: Record<string, unknown>, context: OAuthProviderContext, search = false) {
  const { accountId: _accountId, ...query } = values;
  return {
    items: requireItems(
      await request(context, `${accountPath(values)}/messages/${search ? "search" : "view"}`, "GET", undefined, query),
    ),
  };
}
async function writeMessage(
  values: Record<string, unknown>,
  context: OAuthProviderContext,
  mode: "send" | "reply" | "draft",
) {
  const base = accountPath(values);
  if (values.isSchedule === true && values.scheduleType == null)
    throw new ProviderRequestError(400, "scheduleType is required when isSchedule is true");
  if (values.isSchedule === true && values.scheduleType === 6 && (!values.timeZone || !values.scheduleTime))
    throw new ProviderRequestError(400, "timeZone and scheduleTime are required for custom scheduling");
  const body = { ...values };
  delete body.accountId;
  delete body.messageId;
  if (mode === "reply") body.action = "reply";
  if (mode === "draft") body.mode = values.mode ?? "draft";
  if (Array.isArray(values.attachments)) {
    body.attachments = [];
    for (const value of values.attachments) {
      const attachment = requiredResponseRecord(value, "Zoho Mail attachment input");
      const fileName = requiredInputString(attachment.fileName, "fileName");
      if (fileName.includes("/") || fileName.includes("\\"))
        throw new ProviderRequestError(400, "fileName must not contain a directory path");
      const source = await downloadUploadSource({
        url: requiredInputString(attachment.fileUrl, "fileUrl"),
        fetcher: context.fetcher,
        fieldName: "attachments.fileUrl",
        maximumBytes: attachmentMaximumBytes,
        signal: context.signal,
      });
      const uploaded = await request(
        context,
        `${base}/messages/attachments`,
        "POST",
        source.bytes,
        { fileName, isInline: false },
        source.contentType ?? "application/octet-stream",
      );
      const resource = requiredResponseRecord(uploaded.data, "Zoho Mail uploaded attachment");
      const result: Record<string, unknown> = {};
      for (const key of ["storeName", "attachmentName", "attachmentPath"]) {
        const field = optionalString(resource[key]);
        if (!field) throw new ProviderRequestError(502, `Zoho Mail attachment response is missing ${key}`);
        result[key] = field;
      }
      (body.attachments as unknown[]).push(result);
    }
  }
  const suffix = mode === "reply" ? `/${encodeURIComponent(requiredInputString(values.messageId, "messageId"))}` : "";
  return normalize(await request(context, `${base}/messages${suffix}`, "POST", body));
}
async function updateMessages(values: Record<string, unknown>, context: OAuthProviderContext, move = false) {
  const base = accountPath(values);
  if (!values.messageId && !values.threadId) throw new ProviderRequestError(400, "Provide messageId or threadId");
  if (values.messageId && values.threadId)
    throw new ProviderRequestError(400, "Provide either messageId or threadId, not both");
  if (values.isFolderSpecific === true && !values.folderId)
    throw new ProviderRequestError(400, "folderId is required when isFolderSpecific is true");
  const body = {
    ...values,
    mode: move ? "moveMessage" : values.read ? "markAsRead" : "markAsUnread",
  };
  delete (body as Record<string, unknown>).accountId;
  delete (body as Record<string, unknown>).read;
  return normalize(await request(context, `${base}/updatemessage`, "PUT", body, undefined, undefined, true));
}
async function downloadAttachment(values: Record<string, unknown>, context: OAuthProviderContext) {
  const attachmentPath = messagePath(values);
  const transitFiles = context.transitFiles;
  if (!transitFiles) throw providerInputError("Zoho Mail attachment download requires transit file storage");
  const fileName = requiredInputString(values.fileName, "fileName");
  return runProviderRequest({ label: "Zoho Mail attachment", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(
      `${zohoMailOrigin(context.providerSecret?.dataCenter)}${attachmentPath}/attachments/${encodeURIComponent(requiredInputString(values.attachmentId, "attachmentId"))}`,
      { headers: headers(context.accessToken, "application/octet-stream"), signal },
    );
    if (!response.ok) await parseResponse(response);
    return storeResponseInTransit(response, transitFiles, {
      name: fileName,
      mimeType: response.headers.get("content-type") ?? "application/octet-stream",
      fieldName: "Zoho Mail attachment",
      createError: (message) => new ProviderRequestError(413, message),
      signal,
      maxBytes: attachmentMaximumBytes,
    });
  });
}
async function readMessage(values: Record<string, unknown>, context: OAuthProviderContext, suffix: string) {
  return normalize(
    await request(context, `${messagePath(values)}/${suffix}`, "GET", undefined, {
      includeBlockContent: values.includeBlockContent,
      includeInline: values.includeInline,
    }),
  );
}

function headers(accessToken: string, accept = "application/json") {
  return { authorization: `Zoho-oauthtoken ${accessToken}`, accept };
}
function normalize(payload: Record<string, unknown>) {
  return { data: payload.data ?? null };
}
function requireItems(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(payload.data)) throw new ProviderRequestError(502, "Zoho Mail response data must be an array");
  return payload.data.map((item) => requiredResponseRecord(item, "Zoho Mail resource"));
}
async function request(
  context: Context,
  pathname: string,
  method = "GET",
  body?: Record<string, unknown> | Uint8Array,
  query?: Record<string, unknown>,
  contentType?: string,
  numericIds = false,
) {
  return runProviderRequest({ label: "Zoho Mail", signal: context.signal }, async (signal) => {
    const url = new URL(pathname, context.origin ?? zohoMailOrigin(context.providerSecret?.dataCenter));
    for (const [key, value] of Object.entries(query ?? {})) if (value != null) url.searchParams.set(key, String(value));
    const response = await context.fetcher(url, {
      method,
      signal,
      headers: {
        ...headers(context.accessToken),
        "content-type": contentType ?? "application/json",
      },
      body: body instanceof Uint8Array ? new Uint8Array(body) : body == null ? undefined : serialize(body, numericIds),
    });
    return parseResponse(response);
  });
}
function serialize(body: Record<string, unknown>, numericIds: boolean) {
  if (!numericIds) return JSON.stringify(body);
  const encoded: Record<string, unknown> = { ...body };
  for (const key of ["messageId", "threadId", "folderId", "destfolderId"]) {
    const value = encoded[key];
    if (Array.isArray(value)) encoded[key] = value.map((item) => zohoJson.rawJSON(String(item)));
    else if (value != null) encoded[key] = zohoJson.rawJSON(String(value));
  }
  return JSON.stringify(encoded);
}
async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = requiredResponseRecord(
      JSON.parse(text, (key: string, value: unknown, context?: { source: string }) =>
        typeof value === "number" &&
        Number.isInteger(value) &&
        ["accountId", "folderId", "messageId", "threadId", "attachmentId", "zuid"].includes(key) &&
        context?.source
          ? context.source
          : value,
      ),
      "Zoho Mail response",
    );
  } catch (error) {
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        `Zoho Mail request failed with HTTP ${response.status}`,
        undefined,
        "provider_error",
      );
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, "Zoho Mail returned invalid JSON");
  }
  const status = optionalRecord(payload.status);
  const statusCode = optionalNumber(status?.code);
  if (!response.ok || (statusCode != null && statusCode >= 400)) {
    const data = optionalRecord(payload.data);
    const message =
      optionalString(data?.moreInfo) ??
      optionalString(data?.errorCode) ??
      optionalString(status?.description) ??
      optionalString(payload.message) ??
      `HTTP ${response.status}`;
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `Zoho Mail: ${message}`,
      undefined,
      "provider_error",
    );
  }
  return payload;
}

export const executors: ProviderExecutors = defineOAuthProviderExecutors("zoho_mail", {
  list_accounts: async (_input, context) => ({ items: requireItems(await request(context, "/api/accounts")) }),
  list_folders: async (input, context) => ({
    items: requireItems(await request(context, `${accountPath(input)}/folders`)),
  }),
  list_messages: (input, context) => listMessages(input, context),
  search_messages: (input, context) => listMessages(input, context, true),
  get_message: (input, context) => readMessage(input, context, "details"),
  get_message_content: (input, context) => readMessage(input, context, "content"),
  get_message_headers: (input, context) => readMessage(input, context, "header"),
  send_message: (input, context) => writeMessage(input, context, "send"),
  reply_message: (input, context) => writeMessage(input, context, "reply"),
  save_draft: (input, context) => writeMessage(input, context, "draft"),
  set_read_state: (input, context) => updateMessages(input, context),
  move_messages: (input, context) => updateMessages(input, context, true),
  list_attachments: (input, context) => readMessage(input, context, "attachmentinfo"),
  download_attachment: downloadAttachment,
});
