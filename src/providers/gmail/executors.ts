import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { PollDefinition } from "../../triggers/common/poll.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { GmailDraftResource, GmailMessageResource, GmailReplyHeaders, GmailThreadResource } from "./message.ts";

import { format as schemaFormat } from "@cfworker/json-schema";
import {
  looseArray,
  optionalBoolean,
  optionalNumberLike,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  googleBearerProxyAuth,
  googleServiceAccountValidator,
  resolveGoogleAccessToken,
} from "../googledrive/runtime-auth.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { decodeGmailAttachment } from "./attachment-stream.ts";
import { gmailMaxMimeBytes } from "./limits.ts";
import {
  assertMatchingReplySubject,
  buildRecipients,
  normalizeGmailMessage,
  normalizeMessageId,
  normalizeThreadId,
  readHeader,
  resolveReplyHeaders,
  summarizeGmailMessage,
} from "./message.ts";
import { readGmailAttachments } from "./mime-attachments.ts";
import { decodeMimeSubject, encodeMimeMessage, readMimeReplyHeaders, updateMimeMessage } from "./mime.ts";
import { gmailOAuthScopes } from "./scopes.ts";
import { gmailMessageReceived } from "./trigger-on-message-received.ts";

const service = "gmail";
const gmailApiBaseUrl = "https://gmail.googleapis.com/gmail/v1";
const detailHydrationBatchSize = 10;
// Attachments may reach Gmail's 25 MB cap, and the base64 JSON envelope is a third larger again;
// the default 30 s request budget covers fetch, decode, and disk write, so give this transfer longer.
const attachmentDownloadTimeoutMs = 120_000;
const defaultFetchEmailsMaxResults = 20;

interface ActionContext {
  userId: string;
  accessToken: string;
  fetcher: typeof fetch;
  transitFiles?: ExecutionContext["transitFiles"];
  signal?: AbortSignal;
}

interface DraftReplyTarget {
  threadId: string;
  headers: GmailReplyHeaders;
}

interface DraftReplyInput {
  threadId?: string;
  replyToMessageId?: string;
}

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

export const gmailActionHandlers: ProviderActionHandlers<typeof service, ActionHandler> = {
  async download_attachment(input, context) {
    const { transitFiles, fetcher, accessToken } = context;
    if (!transitFiles?.createFromStream) {
      throw new ProviderRequestError(
        400,
        "Gmail attachment downloads require a streaming transit file backend (filesystem).",
      );
    }
    const messageId = requiredInputString(input.messageId, "messageId");
    const attachmentId = requiredInputString(input.attachmentId, "attachmentId");
    const userId = optionalString(input.userId) ?? context.userId;
    const url = `${gmailUserUrl(userId, "messages")}/${encodePathSegment(messageId)}/attachments/${encodePathSegment(attachmentId)}?fields=data,size`;
    return runProviderRequest(
      { signal: context.signal, label: "Gmail attachment", timeoutMs: attachmentDownloadTimeoutMs },
      async (signal) => {
        const response = await fetcher(url, { headers: { authorization: `Bearer ${accessToken}` }, signal });
        await assertGmailResponse(response);
        if (!response.body) throw new ProviderRequestError(502, "Gmail attachment response has no body");
        return transitFiles.createFromStream!({
          body: decodeGmailAttachment(response.body, transitFiles.maxBytes),
          name: optionalString(input.fileName) ?? "attachment",
          mimeType: optionalString(input.mimeType) ?? "application/octet-stream",
          signal,
        });
      },
    );
  },
  async search_threads(input, { userId, accessToken, fetcher }) {
    const output = await listThreads(input, userId, accessToken, fetcher);
    return {
      threads: output.threads.map((thread) => ({
        threadId: thread.threadId,
        snippet: thread.snippet,
      })),
    };
  },
  list_threads(input, { userId, accessToken, fetcher }) {
    return listThreads(input, userId, accessToken, fetcher);
  },
  fetch_emails(input, { userId, accessToken, fetcher }) {
    return fetchEmails(input, userId, accessToken, fetcher);
  },
  async get_message(input, { userId, accessToken, fetcher }) {
    const message = await getMessageResource(userId, normalizeMessageId(input.messageId), accessToken, fetcher, "full");
    const output = normalizeGmailMessage(message);
    return {
      messageId: output.messageId,
      threadId: output.threadId,
      subject: output.subject,
      from: output.sender,
      to: output.to,
      date: readHeader(message.payload?.headers ?? [], "Date"),
      body: output.messageText,
    };
  },
  fetch_message_by_message_id(input, { userId, accessToken, fetcher }) {
    return fetchMessageByMessageId(input, userId, accessToken, fetcher);
  },
  fetch_message_by_thread_id(input, { userId, accessToken, fetcher }) {
    return fetchMessagesByThreadId(input, userId, accessToken, fetcher);
  },
  get_profile(_input, { userId, accessToken, fetcher }) {
    return getProfile(userId, accessToken, fetcher);
  },
  send_email(input, context) {
    return sendEmail(input, context);
  },
  reply_email(input, context) {
    return replyToMessage(input, context);
  },
  reply_to_thread(input, context) {
    return replyToThread(input, context);
  },
  create_draft(input, context) {
    return createEmailDraft(input, context);
  },
  create_email_draft(input, context) {
    return createEmailDraft(input, context);
  },
  list_drafts(input, { userId, accessToken, fetcher }) {
    return listDrafts(input, userId, accessToken, fetcher);
  },
  get_draft(input, { userId, accessToken, fetcher }) {
    return getDraft(input, userId, accessToken, fetcher);
  },
  update_draft(input, context) {
    return updateDraft(input, context);
  },
  send_draft(input, { userId, accessToken, fetcher }) {
    return sendDraft(input, userId, accessToken, fetcher);
  },
  delete_draft(input, { userId, accessToken, fetcher }) {
    return deleteDraft(input, userId, accessToken, fetcher);
  },
  list_labels(_input, { userId, accessToken, fetcher }) {
    return listLabels(userId, accessToken, fetcher);
  },
  get_label(input, { userId, accessToken, fetcher }) {
    return getLabel(input, userId, accessToken, fetcher);
  },
  create_label(input, { userId, accessToken, fetcher }) {
    return createLabel(input, userId, accessToken, fetcher);
  },
  patch_label(input, { userId, accessToken, fetcher }) {
    return patchLabel(input, userId, accessToken, fetcher);
  },
  update_label(input, { userId, accessToken, fetcher }) {
    return updateLabel(input, userId, accessToken, fetcher);
  },
  delete_label(input, { userId, accessToken, fetcher }) {
    return deleteLabel(input, userId, accessToken, fetcher);
  },
  add_label_to_email(input, { userId, accessToken, fetcher }) {
    return addLabelToEmail(input, userId, accessToken, fetcher);
  },
  batch_modify_messages(input, { userId, accessToken, fetcher }) {
    return batchModifyMessages(input, userId, accessToken, fetcher);
  },
  move_to_trash(input, { userId, accessToken, fetcher }) {
    return moveMessageToTrash(input, userId, accessToken, fetcher);
  },
  untrash_message(input, { userId, accessToken, fetcher }) {
    return untrashMessage(input, userId, accessToken, fetcher);
  },
  modify_thread_labels(input, { userId, accessToken, fetcher }) {
    return modifyThreadLabels(input, userId, accessToken, fetcher);
  },
  move_thread_to_trash(input, { userId, accessToken, fetcher }) {
    return moveThreadToTrash(input, userId, accessToken, fetcher);
  },
  untrash_thread(input, { userId, accessToken, fetcher }) {
    return untrashThread(input, userId, accessToken, fetcher);
  },
  list_history(input, { userId, accessToken, fetcher }) {
    return listHistory(input, userId, accessToken, fetcher);
  },
  list_filters(_input, { userId, accessToken, fetcher }) {
    return listFilters(userId, accessToken, fetcher);
  },
  get_filter(input, { userId, accessToken, fetcher }) {
    return getFilter(input, userId, accessToken, fetcher);
  },
  create_filter(input, { userId, accessToken, fetcher }) {
    return createFilter(input, userId, accessToken, fetcher);
  },
  delete_filter(input, { userId, accessToken, fetcher }) {
    return deleteFilter(input, userId, accessToken, fetcher);
  },
  get_language_settings(_input, { userId, accessToken, fetcher }) {
    return getSettingsResource("language", userId, accessToken, fetcher);
  },
  update_language_settings(input, { userId, accessToken, fetcher }) {
    return updateSettingsResource("language", input, userId, accessToken, fetcher);
  },
  get_vacation_settings(_input, { userId, accessToken, fetcher }) {
    return getSettingsResource("vacation", userId, accessToken, fetcher);
  },
  update_vacation_settings(input, { userId, accessToken, fetcher }) {
    return updateSettingsResource("vacation", input, userId, accessToken, fetcher);
  },
  get_auto_forwarding(_input, { userId, accessToken, fetcher }) {
    return getSettingsResource("autoForwarding", userId, accessToken, fetcher);
  },
  list_forwarding_addresses(_input, { userId, accessToken, fetcher }) {
    return listForwardingAddresses(userId, accessToken, fetcher);
  },
  settings_get_imap(_input, { userId, accessToken, fetcher }) {
    return getSettingsResource("imap", userId, accessToken, fetcher);
  },
  update_imap_settings(input, { userId, accessToken, fetcher }) {
    return updateSettingsResource("imap", input, userId, accessToken, fetcher);
  },
  settings_get_pop(_input, { userId, accessToken, fetcher }) {
    return getSettingsResource("pop", userId, accessToken, fetcher);
  },
  update_pop_settings(input, { userId, accessToken, fetcher }) {
    return updateSettingsResource("pop", input, userId, accessToken, fetcher);
  },
  stop_watch(_input, { userId, accessToken, fetcher }) {
    return stopWatch(userId, accessToken, fetcher);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ActionContext>({
  service,
  handlers: gmailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ActionContext> {
    const resolved = await resolveGoogleAccessToken({
      service,
      scopes: gmailOAuthScopes,
      credential: await context.getCredential(service),
      fetcher,
      signal: context.signal,
    });
    return {
      userId: "me",
      accessToken: resolved.accessToken,
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gmailApiBaseUrl,
  auth: googleBearerProxyAuth(gmailOAuthScopes),
  readError: readGmailError,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await getProfile("me", input.accessToken, fetcher);
    return {
      profile: {
        accountId: profile.emailAddress,
        displayName: profile.emailAddress,
      },
    };
  },
  customCredential: googleServiceAccountValidator(service, gmailOAuthScopes),
};

async function fetchEmails(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  const detail = trimmedString(input.detail) || "summary";
  const url = new URL(gmailUserUrl(userId, "messages"));
  const query = trimmedString(input.query);
  if (query) {
    url.searchParams.set("q", query);
  }
  for (const labelId of toStringArray(input.labelIds)) {
    url.searchParams.append("labelIds", labelId);
  }
  if (input.pageToken != null) {
    url.searchParams.set("pageToken", String(input.pageToken));
  }
  const maxResults = normalizeOptionalPositiveInteger(input.maxResults) ?? defaultFetchEmailsMaxResults;
  url.searchParams.set("maxResults", String(maxResults));
  if (input.includeSpamTrash != null) {
    url.searchParams.set("includeSpamTrash", String(Boolean(input.includeSpamTrash)));
  }

  const payload = await fetchJson<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(url.toString(), accessToken, fetcher);
  const messages = payload.messages ?? [];

  if (detail === "ids") {
    return {
      messages: messages.map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
      })),
      nextPageToken: payload.nextPageToken ?? null,
      resultSizeEstimate: payload.resultSizeEstimate ?? messages.length,
    };
  }

  const includeFullMessage = detail === "full";
  const format = includeFullMessage ? "full" : "metadata";
  const hydrated = await hydrateInBatches(messages, (message) =>
    getMessageResource(userId, message.id, accessToken, fetcher, format),
  );

  return {
    messages: hydrated.map((message) =>
      includeFullMessage ? normalizeGmailMessage(message) : summarizeGmailMessage(message),
    ),
    nextPageToken: payload.nextPageToken ?? null,
    resultSizeEstimate: payload.resultSizeEstimate ?? hydrated.length,
  };
}

async function fetchMessageByMessageId(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const format = normalizeFormat(input.format, "full");
  const message = await getMessageResource(userId, normalizeMessageId(input.messageId), accessToken, fetcher, format);

  return normalizeGmailMessage(message);
}

async function fetchMessagesByThreadId(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const thread = await getThreadResource(userId, normalizeThreadId(input.threadId), accessToken, fetcher, "full");

  return {
    threadId: thread.id,
    historyId: thread.historyId ?? null,
    messages: (thread.messages ?? []).map((message) => normalizeGmailMessage(message)),
  };
}

async function listThreads(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  const url = new URL(gmailUserUrl(userId, "threads"));
  const query = trimmedString(input.query);
  if (query) {
    url.searchParams.set("q", query);
  }
  if (input.pageToken != null) {
    url.searchParams.set("pageToken", String(input.pageToken));
  }
  if (input.maxResults != null) {
    url.searchParams.set("maxResults", String(input.maxResults));
  }

  const payload = await fetchJson<{
    threads?: Array<{ id: string; snippet?: string; historyId?: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(url.toString(), accessToken, fetcher);
  const threads = payload.threads ?? [];

  if (input.verbose === true) {
    const hydrated = await hydrateInBatches(threads, (thread) =>
      getThreadResource(userId, thread.id, accessToken, fetcher, "full"),
    );
    return {
      threads: hydrated.map((thread) => ({
        threadId: thread.id,
        snippet: thread.snippet ?? "",
        historyId: thread.historyId ?? null,
        messages: (thread.messages ?? []).map((message) => normalizeGmailMessage(message)),
      })),
      nextPageToken: payload.nextPageToken ?? null,
      resultSizeEstimate: payload.resultSizeEstimate ?? hydrated.length,
    };
  }

  return {
    threads: threads.map((thread) => ({
      threadId: thread.id,
      snippet: thread.snippet ?? "",
      historyId: thread.historyId ?? null,
    })),
    nextPageToken: payload.nextPageToken ?? null,
    resultSizeEstimate: payload.resultSizeEstimate ?? threads.length,
  };
}

async function sendEmail(input: Record<string, unknown>, context: ActionContext) {
  const { userId, accessToken, fetcher } = context;
  const attachments = await readGmailAttachments(input.attachments, context);
  const recipients = buildRecipients(input);
  const response = await fetchJson<{ id: string; threadId?: string }>(
    gmailUserUrl(userId, "messages", "send"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({
        raw: encodeMimeMessage({
          to: recipients.to,
          cc: recipients.cc,
          bcc: recipients.bcc,
          subject: optionalRawString(input.subject),
          body: optionalRawString(input.body) ?? optionalRawString(input.messageBody),
          isHtml: input.isHtml === true,
          from: optionalRawString(input.fromEmail),
          attachments,
        }),
      }),
    },
  );

  return { messageId: response.id, threadId: optionalString(response.threadId) };
}

async function replyToThread(input: Record<string, unknown>, context: ActionContext) {
  const { userId, accessToken, fetcher } = context;
  const attachments = await readGmailAttachments(input.attachments, context);
  const thread = await getThreadResource(userId, normalizeThreadId(input.threadId), accessToken, fetcher, "full");
  const target = latestReplyMessage(thread);

  const recipients = buildRecipients(input);
  const replyHeaders = resolveReplyHeaders(target);
  const response = await sendThreadMessage(
    userId,
    accessToken,
    fetcher,
    thread.id,
    encodeMimeMessage({
      to: recipients.to.length > 0 ? recipients.to : [replyHeaders.to],
      cc: recipients.cc,
      bcc: recipients.bcc,
      subject: replyHeaders.subject,
      body: optionalRawString(input.messageBody) ?? optionalRawString(input.body),
      isHtml: input.isHtml === true,
      inReplyTo: replyHeaders.inReplyTo,
      references: replyHeaders.references,
      attachments,
    }),
  );

  return { messageId: response.id, threadId: optionalString(response.threadId) };
}

async function replyToMessage(input: Record<string, unknown>, context: ActionContext) {
  const { userId, accessToken, fetcher } = context;
  const to = Object.hasOwn(input, "to") ? requiredInputString(input.to, "to") : undefined;
  if (to !== undefined && !schemaFormat.email!(to)) {
    throw providerInputError("to must be a valid email address");
  }
  const recipients = buildRecipients({ to });
  const attachments = await readGmailAttachments(input.attachments, context);
  const message = await getMessageResource(userId, normalizeMessageId(input.messageId), accessToken, fetcher, "full");
  const threadId = optionalString(message.threadId);
  if (!threadId) throw providerResponseError("Gmail reply target is missing its threadId");
  const requestedThreadId = optionalString(input.threadId);
  if (requestedThreadId && normalizeThreadId(requestedThreadId) !== threadId) {
    throw providerInputError("threadId must match the reply target message's threadId");
  }
  const replyHeaders = resolveReplyHeaders(message);
  const response = await sendThreadMessage(
    userId,
    accessToken,
    fetcher,
    threadId,
    encodeMimeMessage({
      to: to !== undefined ? recipients.to : [replyHeaders.to],
      subject: replyHeaders.subject,
      body: optionalRawString(input.body),
      isHtml: input.isHtml === true,
      inReplyTo: replyHeaders.inReplyTo,
      references: replyHeaders.references,
      attachments,
    }),
  );

  return {
    messageId: response.id,
    threadId: optionalString(response.threadId),
  };
}

async function createEmailDraft(input: Record<string, unknown>, context: ActionContext) {
  const { userId, accessToken, fetcher } = context;
  const attachments = await readGmailAttachments(input.attachments, context);
  const recipients = buildRecipients(input);
  const replyTarget = await resolveDraftReplyTarget(
    {
      threadId: optionalString(input.threadId),
      replyToMessageId: optionalString(input.replyToMessageId),
    },
    context,
  );
  const subject = optionalRawString(input.subject) ?? replyTarget?.headers.subject;
  if (replyTarget && subject !== undefined) {
    assertMatchingReplySubject(subject, replyTarget.headers.subject);
  }
  const hasRecipients = ["to", "recipientEmail", "extraRecipients"].some((name) => Object.hasOwn(input, name));
  const payload = await fetchJson<GmailDraftResource>(gmailUserUrl(userId, "drafts"), accessToken, fetcher, {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw: encodeMimeMessage({
          to: hasRecipients ? recipients.to : replyTarget ? [replyTarget.headers.to] : [],
          cc: recipients.cc,
          bcc: recipients.bcc,
          subject,
          body: optionalRawString(input.body) ?? optionalRawString(input.messageBody),
          isHtml: input.isHtml === true,
          from: optionalRawString(input.fromEmail),
          inReplyTo: replyTarget?.headers.inReplyTo,
          references: replyTarget?.headers.references,
          attachments,
        }),
        threadId: replyTarget?.threadId,
      },
    }),
  });

  return {
    draftId: payload.id,
    messageId: optionalString(payload.message?.id),
    threadId: optionalString(payload.message?.threadId),
  };
}

async function resolveDraftReplyTarget(
  input: DraftReplyInput,
  context: ActionContext,
): Promise<DraftReplyTarget | undefined> {
  const threadId = input.threadId ? normalizeThreadId(input.threadId) : undefined;
  if (!threadId && !input.replyToMessageId) return undefined;
  const { userId, accessToken, fetcher } = context;
  const message = input.replyToMessageId
    ? await getMessageResource(userId, input.replyToMessageId, accessToken, fetcher, "full")
    : latestReplyMessage(await getThreadResource(userId, threadId!, accessToken, fetcher, "full"));
  const resolvedThreadId = optionalString(message.threadId);
  if (!resolvedThreadId) throw providerResponseError("Gmail reply target is missing its threadId");
  if (threadId && threadId !== resolvedThreadId) {
    throw providerInputError("threadId must match the reply target message's threadId");
  }
  return { threadId: resolvedThreadId, headers: resolveReplyHeaders(message) };
}

function latestReplyMessage(thread: GmailThreadResource): GmailMessageResource {
  let latest: GmailMessageResource | undefined;
  let latestTimestamp: number | undefined;
  for (const message of thread.messages ?? []) {
    if (message.labelIds?.includes("DRAFT")) continue;
    const timestamp = optionalNumberLike(message.internalDate);
    if (latestTimestamp !== undefined && (timestamp === undefined || timestamp < latestTimestamp)) continue;
    latest = message;
    latestTimestamp = timestamp;
  }
  if (!latest) throw providerInputError("thread has no non-draft messages to reply to");
  return latest;
}

async function listDrafts(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  const url = new URL(gmailUserUrl(userId, "drafts"));
  if (input.pageToken != null) {
    url.searchParams.set("pageToken", String(input.pageToken));
  }
  if (input.maxResults != null) {
    url.searchParams.set("maxResults", String(input.maxResults));
  }

  const payload = await fetchJson<{
    drafts?: Array<{ id: string; message?: Pick<GmailMessageResource, "id" | "threadId"> }>;
    nextPageToken?: string;
  }>(url.toString(), accessToken, fetcher);
  const drafts = payload.drafts ?? [];

  if (input.verbose === true) {
    const hydrated = await hydrateInBatches(drafts, (draft) =>
      getDraftResource(userId, draft.id, accessToken, fetcher, "full"),
    );
    return {
      drafts: hydrated.map((draft) => ({
        id: draft.id,
        message: normalizeGmailMessage(draft.message),
      })),
      nextPageToken: payload.nextPageToken ?? null,
    };
  }

  return {
    drafts: drafts.map((draft) => ({
      id: draft.id,
      message: {
        messageId: optionalString(draft.message?.id),
        threadId: optionalString(draft.message?.threadId),
      },
    })),
    nextPageToken: payload.nextPageToken ?? null,
  };
}

async function getDraft(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  const draft = await getDraftResource(
    userId,
    normalizeMessageId(input.draftId),
    accessToken,
    fetcher,
    normalizeFormat(input.format, "full"),
  );

  return {
    id: draft.id,
    message: normalizeGmailMessage(draft.message),
  };
}

async function updateDraft(input: Record<string, unknown>, context: ActionContext) {
  const { userId, accessToken, fetcher } = context;
  const attachments = await readGmailAttachments(input.attachments, context);
  const draftId = normalizeMessageId(input.draftId);
  const existing = requiredResponseRecord(
    await getDraftResource(userId, draftId, accessToken, fetcher, "raw"),
    "Gmail draft",
  );
  const existingMessage = requiredResponseRecord(existing.message, "Gmail draft message");
  const originalRaw = optionalRawString(existingMessage.raw);
  if (!originalRaw) throw providerResponseError("Gmail draft response is missing its raw MIME message");
  const recipients = buildRecipients(input);
  const existingThreadId = optionalString(existingMessage.threadId);
  const requestedThreadId = optionalString(input.threadId);
  const normalizedThreadId = requestedThreadId ? normalizeThreadId(requestedThreadId) : undefined;
  const replyToMessageId = optionalString(input.replyToMessageId);
  const rebuildReply = Boolean(replyToMessageId || (normalizedThreadId && normalizedThreadId !== existingThreadId));
  const replyTarget = rebuildReply
    ? await resolveDraftReplyTarget({ threadId: normalizedThreadId, replyToMessageId }, context)
    : undefined;
  const subject = optionalRawString(input.subject) ?? replyTarget?.headers.subject;
  if (subject !== undefined) {
    if (replyTarget) {
      assertMatchingReplySubject(subject, replyTarget.headers.subject);
    } else {
      const currentHeaders = readMimeReplyHeaders(originalRaw);
      if (currentHeaders.inReplyTo || currentHeaders.references) {
        assertMatchingReplySubject(subject, decodeMimeSubject(currentHeaders.encodedSubject));
      }
    }
  }
  const threadId = replyTarget?.threadId ?? existingThreadId;
  const raw = updateMimeMessage(originalRaw, {
    to: ["to", "recipientEmail", "extraRecipients"].some((name) => Object.hasOwn(input, name))
      ? recipients.to
      : undefined,
    cc: Object.hasOwn(input, "cc") ? recipients.cc : undefined,
    bcc: Object.hasOwn(input, "bcc") ? recipients.bcc : undefined,
    subject,
    body: optionalRawString(input.body) ?? optionalRawString(input.messageBody),
    isHtml: optionalBoolean(input.isHtml),
    from: optionalRawString(input.fromEmail),
    inReplyTo: replyTarget?.headers.inReplyTo,
    references: replyTarget?.headers.references,
    attachments,
  });

  const payload = await fetchJson<GmailDraftResource>(gmailUserUrl(userId, "drafts", draftId), accessToken, fetcher, {
    method: "PUT",
    body: JSON.stringify({
      id: draftId,
      message: {
        raw,
        threadId: threadId ? normalizeThreadId(threadId) : undefined,
      },
    }),
  });

  return {
    draftId: payload.id,
    messageId: optionalString(payload.message?.id),
    threadId: optionalString(payload.message?.threadId),
  };
}

async function sendDraft(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  const payload = await fetchJson<{ id: string; threadId?: string }>(
    gmailUserUrl(userId, "drafts", "send"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({
        id: normalizeMessageId(input.draftId),
      }),
    },
  );

  return {
    messageId: payload.id,
    threadId: optionalString(payload.threadId) ?? null,
  };
}

async function deleteDraft(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  await fetchEmpty(gmailUserUrl(userId, "drafts", normalizeMessageId(input.draftId)), accessToken, fetcher, {
    method: "DELETE",
  });

  return { success: true };
}

async function listLabels(userId: string, accessToken: string, fetcher: typeof fetch) {
  const payload = await fetchJson<{ labels?: Array<Record<string, unknown>> }>(
    gmailUserUrl(userId, "labels"),
    accessToken,
    fetcher,
  );

  return {
    labels: payload.labels ?? [],
  };
}

async function getLabel(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "labels", normalizeMessageId(input.labelId)),
    accessToken,
    fetcher,
  );
}

async function createLabel(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<Record<string, unknown>>(gmailUserUrl(userId, "labels"), accessToken, fetcher, {
    method: "POST",
    body: JSON.stringify(buildLabelPayload(input)),
  });
}

async function patchLabel(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "labels", normalizeMessageId(input.labelId)),
    accessToken,
    fetcher,
    {
      method: "PATCH",
      body: JSON.stringify(buildLabelPayload(input)),
    },
  );
}

async function updateLabel(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "labels", normalizeMessageId(input.labelId)),
    accessToken,
    fetcher,
    {
      method: "PUT",
      body: JSON.stringify(buildLabelPayload(input)),
    },
  );
}

async function deleteLabel(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  await fetchEmpty(gmailUserUrl(userId, "labels", normalizeMessageId(input.labelId)), accessToken, fetcher, {
    method: "DELETE",
  });

  return { success: true };
}

async function addLabelToEmail(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const message = await fetchJson<GmailMessageResource>(
    gmailUserUrl(userId, "messages", normalizeMessageId(input.messageId), "modify"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify(buildLabelMutationPayload(input)),
    },
  );

  return normalizeGmailMessage(message);
}

async function batchModifyMessages(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await fetchEmpty(gmailUserUrl(userId, "messages", "batchModify"), accessToken, fetcher, {
    method: "POST",
    body: JSON.stringify({
      ids: toStringArray(input.messageIds),
      ...buildLabelMutationPayload(input),
    }),
  });

  return { success: true };
}

async function moveMessageToTrash(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const message = await fetchJson<GmailMessageResource>(
    gmailUserUrl(userId, "messages", normalizeMessageId(input.messageId), "trash"),
    accessToken,
    fetcher,
    {
      method: "POST",
    },
  );

  return normalizeGmailMessage(message);
}

async function untrashMessage(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const message = await fetchJson<GmailMessageResource>(
    gmailUserUrl(userId, "messages", normalizeMessageId(input.messageId), "untrash"),
    accessToken,
    fetcher,
    {
      method: "POST",
    },
  );

  return normalizeGmailMessage(message);
}

async function modifyThreadLabels(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const thread = await fetchJson<GmailThreadResource>(
    gmailUserUrl(userId, "threads", normalizeThreadId(input.threadId), "modify"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify(buildLabelMutationPayload(input)),
    },
  );

  return normalizeThread(thread);
}

async function moveThreadToTrash(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const thread = await fetchJson<GmailThreadResource>(
    gmailUserUrl(userId, "threads", normalizeThreadId(input.threadId), "trash"),
    accessToken,
    fetcher,
    {
      method: "POST",
    },
  );

  return normalizeThread(thread);
}

async function untrashThread(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const thread = await fetchJson<GmailThreadResource>(
    gmailUserUrl(userId, "threads", normalizeThreadId(input.threadId), "untrash"),
    accessToken,
    fetcher,
    {
      method: "POST",
    },
  );

  return normalizeThread(thread);
}

async function listHistory(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  const url = new URL(gmailUserUrl(userId, "history"));
  url.searchParams.set("startHistoryId", normalizeMessageId(input.startHistoryId));
  if (input.pageToken != null) {
    url.searchParams.set("pageToken", String(input.pageToken));
  }
  if (input.maxResults != null) {
    url.searchParams.set("maxResults", String(input.maxResults));
  }
  if (input.labelId != null) {
    url.searchParams.set("labelId", String(input.labelId));
  }
  for (const historyType of toStringArray(input.historyTypes)) {
    url.searchParams.append("historyTypes", historyType);
  }

  const payload = await fetchJson<{
    history?: Array<Record<string, unknown>>;
    historyId?: string;
    nextPageToken?: string;
  }>(url.toString(), accessToken, fetcher);

  return {
    history: payload.history ?? [],
    historyId: payload.historyId ?? normalizeMessageId(input.startHistoryId),
    nextPageToken: payload.nextPageToken ?? null,
  };
}

async function listFilters(userId: string, accessToken: string, fetcher: typeof fetch) {
  const payload = normalizeNullableObjectResponse(
    await fetchNullableJson(gmailUserUrl(userId, "settings", "filters"), accessToken, fetcher, "gmail filters list"),
    "gmail filters list",
  );
  const filters = payload.filter;

  return {
    filters: Array.isArray(filters) ? filters : [],
  };
}

async function getFilter(input: Record<string, unknown>, userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "settings", "filters", normalizeMessageId(input.filterId)),
    accessToken,
    fetcher,
  );
}

async function createFilter(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return fetchJson<Record<string, unknown>>(gmailUserUrl(userId, "settings", "filters"), accessToken, fetcher, {
    method: "POST",
    body: JSON.stringify({
      criteria: asObject(input.criteria),
      action: asObject(input.action),
    }),
  });
}

async function deleteFilter(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await fetchEmpty(
    gmailUserUrl(userId, "settings", "filters", normalizeMessageId(input.filterId)),
    accessToken,
    fetcher,
    {
      method: "DELETE",
    },
  );

  return { success: true };
}

async function getSettingsResource(resource: string, userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<Record<string, unknown>>(gmailUserUrl(userId, "settings", resource), accessToken, fetcher);
}

async function updateSettingsResource(
  resource: string,
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const body = Object.fromEntries(
    Object.entries(input).filter(([key, value]) => key !== "userId" && value !== undefined),
  );

  return fetchJson<Record<string, unknown>>(gmailUserUrl(userId, "settings", resource), accessToken, fetcher, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function listForwardingAddresses(userId: string, accessToken: string, fetcher: typeof fetch) {
  const payload = normalizeNullableObjectResponse(
    await fetchNullableJson(
      gmailUserUrl(userId, "settings", "forwardingAddresses"),
      accessToken,
      fetcher,
      "gmail forwarding addresses list",
    ),
    "gmail forwarding addresses list",
  );
  const forwardingAddresses = payload.forwardingAddresses;

  return {
    forwardingAddresses: Array.isArray(forwardingAddresses) ? forwardingAddresses : [],
  };
}

async function stopWatch(userId: string, accessToken: string, fetcher: typeof fetch) {
  await fetchEmpty(gmailUserUrl(userId, "stop"), accessToken, fetcher, {
    method: "POST",
  });

  return { success: true };
}

async function getProfile(userId: string, accessToken: string, fetcher: typeof fetch) {
  return fetchJson<{
    emailAddress: string;
    messagesTotal: number;
    threadsTotal: number;
    historyId: string;
  }>(gmailUserUrl(userId, "profile"), accessToken, fetcher);
}

async function getMessageResource(
  userId: string,
  messageId: string,
  accessToken: string,
  fetcher: typeof fetch,
  format: string,
) {
  const url = new URL(gmailUserUrl(userId, "messages", messageId));
  url.searchParams.set("format", format);
  return fetchJson<GmailMessageResource>(url.toString(), accessToken, fetcher);
}

async function getThreadResource(
  userId: string,
  threadId: string,
  accessToken: string,
  fetcher: typeof fetch,
  format: string,
) {
  const url = new URL(gmailUserUrl(userId, "threads", threadId));
  url.searchParams.set("format", format);
  return fetchJson<GmailThreadResource>(url.toString(), accessToken, fetcher);
}

async function getDraftResource(
  userId: string,
  draftId: string,
  accessToken: string,
  fetcher: typeof fetch,
  format: string,
) {
  const url = new URL(gmailUserUrl(userId, "drafts", draftId));
  url.searchParams.set("format", format);
  if (format === "raw") {
    // Raw MIME includes all files. Bound the encoded envelope without the small JSON default.
    const response = await sendGmailRequest(url.toString(), accessToken, fetcher);
    return (await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Gmail raw draft response must be valid JSON",
      maxBytes: Math.ceil((gmailMaxMimeBytes * 4) / 3) + 64 * 1024,
    })) as GmailDraftResource;
  }
  return fetchJson<GmailDraftResource>(url.toString(), accessToken, fetcher);
}

async function sendThreadMessage(
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
  threadId: string,
  raw: string,
) {
  return fetchJson<{ id: string; threadId?: string }>(gmailUserUrl(userId, "messages", "send"), accessToken, fetcher, {
    method: "POST",
    body: JSON.stringify({
      threadId,
      raw,
    }),
  });
}

function gmailUserUrl(userId: string, ...segments: string[]) {
  const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return `${gmailApiBaseUrl}/users/${encodeURIComponent(userId)}${path ? `/${path}` : ""}`;
}

function normalizeThread(thread: GmailThreadResource) {
  return {
    threadId: thread.id,
    historyId: thread.historyId ?? null,
    messages: (thread.messages ?? []).map((message) => normalizeGmailMessage(message)),
  };
}

async function hydrateInBatches<T, TResult>(
  items: T[],
  hydrate: (item: T) => Promise<TResult>,
  batchSize = detailHydrationBatchSize,
) {
  const hydrated: TResult[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    hydrated.push(...(await Promise.all(batch.map((item) => hydrate(item)))));
  }
  return hydrated;
}

function buildLabelPayload(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => key !== "userId" && key !== "labelId" && value !== undefined),
  );
}

function buildLabelMutationPayload(input: Record<string, unknown>) {
  return {
    addLabelIds: toStringArray(input.addLabelIds),
    removeLabelIds: toStringArray(input.removeLabelIds),
  };
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeNullableObjectResponse(value: unknown, operation: string) {
  if (value === null) {
    return {};
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ProviderRequestError(502, `${operation} response must be an object`);
}

async function fetchJson<T>(url: string, accessToken: string, fetcher: typeof fetch, init: RequestInit = {}) {
  const response = await sendGmailRequest(url, accessToken, fetcher, init);
  return (await response.json()) as T;
}

async function fetchNullableJson(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  operation: string,
): Promise<unknown> {
  return readProviderJsonBody(await sendGmailRequest(url, accessToken, fetcher), {
    emptyBody: null,
    invalidJsonMessage: `${operation} response must be valid JSON`,
  });
}

async function fetchEmpty(url: string, accessToken: string, fetcher: typeof fetch, init: RequestInit = {}) {
  await sendGmailRequest(url, accessToken, fetcher, init);
}

async function sendGmailRequest(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
): Promise<Response> {
  const requestInit = buildGmailRequestInit(accessToken, init);
  const response = await fetcher(url, requestInit);
  await assertGmailResponse(response);
  return response;
}

function buildGmailRequestInit(accessToken: string, init: RequestInit) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  };
  if (init.body) {
    headers["content-type"] = "application/json";
  }
  Object.assign(headers, init.headers);

  return {
    ...init,
    headers,
  };
}

function normalizeFormat(value: unknown, fallback: string) {
  const format = String(value ?? fallback).trim();
  return format || fallback;
}

function normalizeOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 500 ? value : undefined;
}

function trimmedString(value: unknown) {
  const stringValue = String(value ?? "").trim();
  return stringValue || "";
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

async function assertGmailResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  throw await readGmailError(response);
}

const gmailQuotaReasons = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
]);

async function readGmailError(response: Response): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "gmail error response");
  let error: Record<string, unknown> | undefined;
  try {
    error = optionalRecord(optionalRecord(JSON.parse(text))?.error);
  } catch {
    // A malformed response must not expose its raw body or change status classification.
  }
  const rateLimited =
    response.status === 403 &&
    looseArray(error?.errors).some((entry) =>
      gmailQuotaReasons.has(optionalString(optionalRecord(entry)?.reason) ?? ""),
    );
  return new ProviderRequestError(
    response.status,
    optionalString(error?.message) ?? `gmail request failed with ${response.status}`,
    withRetryAfterSeconds(response),
    rateLimited ? "rate_limited" : undefined,
  );
}

export const triggers: readonly (IntegrationDefinition | PollDefinition)[] = [gmailMessageReceived];
