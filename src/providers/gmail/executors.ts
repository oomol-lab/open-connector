import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { GmailDraftResource, GmailMessageResource, GmailThreadResource } from "./message.ts";

import {
  defineProviderExecutors,
  ProviderRequestError,
  requireOAuthCredential,
} from "../provider-runtime.ts";
import {
  buildRecipients,
  encodeMimeMessage,
  extractBodyContent,
  firstAddress,
  normalizeGmailMessage,
  normalizeMessageId,
  normalizeThreadId,
  parseAddressList,
  readHeader,
  resolveReplyHeaders,
  summarizeGmailMessage,
} from "./message.ts";

const gmailApiBaseUrl = "https://gmail.googleapis.com/gmail/v1";
const detailHydrationBatchSize = 10;
const defaultFetchEmailsMaxResults = 20;

type ActionContext = {
  userId: string;
  accessToken: string;
  fetcher: typeof fetch;
};

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

export const gmailActionHandlers: Record<string, ActionHandler> = {
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
    const message = await getMessageResource(
      userId,
      normalizeMessageId(input.messageId),
      accessToken,
      fetcher,
      "full",
    );
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
  send_email(input, { userId, accessToken, fetcher }) {
    return sendEmail(input, userId, accessToken, fetcher);
  },
  async reply_email(input, { userId, accessToken, fetcher }) {
    const output = await replyToMessage(input, userId, accessToken, fetcher);
    return { messageId: output.messageId };
  },
  reply_to_thread(input, { userId, accessToken, fetcher }) {
    return replyToThread(input, userId, accessToken, fetcher);
  },
  async create_draft(input, { userId, accessToken, fetcher }) {
    const output = await createEmailDraft(input, userId, accessToken, fetcher);
    return { draftId: output.draftId };
  },
  create_email_draft(input, { userId, accessToken, fetcher }) {
    return createEmailDraft(input, userId, accessToken, fetcher);
  },
  list_drafts(input, { userId, accessToken, fetcher }) {
    return listDrafts(input, userId, accessToken, fetcher);
  },
  get_draft(input, { userId, accessToken, fetcher }) {
    return getDraft(input, userId, accessToken, fetcher);
  },
  update_draft(input, { userId, accessToken, fetcher }) {
    return updateDraft(input, userId, accessToken, fetcher);
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
  service: "gmail",
  handlers: gmailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ActionContext> {
    const credential = await requireOAuthCredential(context, "gmail");
    return { userId: "me", accessToken: credential.accessToken, fetcher };
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }): Promise<void> {
    await getProfile("me", input.accessToken, fetcher);
  },
};

async function fetchEmails(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const detail = optionalString(input.detail) ?? "summary";
  const url = new URL(gmailUserUrl(userId, "messages"));
  const query = optionalString(input.query);
  if (query) {
    url.searchParams.set("q", query);
  }
  for (const labelId of toStringArray(input.labelIds)) {
    url.searchParams.append("labelIds", labelId);
  }
  if (input.pageToken != null) {
    url.searchParams.set("pageToken", String(input.pageToken));
  }
  const maxResults =
    normalizeOptionalPositiveInteger(input.maxResults) ?? defaultFetchEmailsMaxResults;
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
  const message = await getMessageResource(
    userId,
    normalizeMessageId(input.messageId),
    accessToken,
    fetcher,
    format,
  );

  return normalizeGmailMessage(message);
}

async function fetchMessagesByThreadId(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const thread = await getThreadResource(
    userId,
    normalizeThreadId(input.threadId),
    accessToken,
    fetcher,
    "full",
  );

  return {
    threadId: thread.id,
    historyId: thread.historyId ?? null,
    messages: (thread.messages ?? []).map((message) => normalizeGmailMessage(message)),
  };
}

async function listThreads(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const url = new URL(gmailUserUrl(userId, "threads"));
  const query = optionalString(input.query);
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

async function sendEmail(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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
          subject: optionalString(input.subject),
          body: optionalString(input.body) || optionalString(input.messageBody),
          isHtml: input.isHtml === true,
          from: optionalString(input.fromEmail),
        }),
      }),
    },
  );

  return { messageId: response.id };
}

async function replyToThread(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const thread = await getThreadResource(
    userId,
    normalizeThreadId(input.threadId),
    accessToken,
    fetcher,
    "full",
  );
  const target = thread.messages?.at(-1);
  if (!target) {
    throw new ProviderRequestError(400, "thread has no messages");
  }

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
      body: optionalString(input.messageBody) || optionalString(input.body),
      isHtml: input.isHtml === true,
      inReplyTo: replyHeaders.inReplyTo,
      references: replyHeaders.references,
    }),
  );

  return { messageId: response.id, threadId: response.threadId ?? thread.id };
}

async function replyToMessage(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const message = await getMessageResource(
    userId,
    normalizeMessageId(input.messageId),
    accessToken,
    fetcher,
    "full",
  );
  const replyHeaders = resolveReplyHeaders(message);
  const threadId = normalizeThreadId(message.threadId || input.threadId);
  const response = await sendThreadMessage(
    userId,
    accessToken,
    fetcher,
    threadId,
    encodeMimeMessage({
      to: [replyHeaders.to],
      subject: replyHeaders.subject,
      body: optionalString(input.body),
      inReplyTo: replyHeaders.inReplyTo,
      references: replyHeaders.references,
    }),
  );

  return {
    messageId: response.id,
    threadId: response.threadId ?? normalizeThreadId(input.threadId),
  };
}

async function createEmailDraft(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const recipients = buildRecipients(input);
  const payload = await fetchJson<GmailDraftResource>(
    gmailUserUrl(userId, "drafts"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({
        message: {
          raw: encodeMimeMessage({
            to: recipients.to,
            cc: recipients.cc,
            bcc: recipients.bcc,
            subject: optionalString(input.subject),
            body: optionalString(input.body) || optionalString(input.messageBody),
            isHtml: input.isHtml === true,
            from: optionalString(input.fromEmail),
          }),
          ...(optionalString(input.threadId)
            ? { threadId: normalizeThreadId(input.threadId) }
            : {}),
        },
      }),
    },
  );

  return {
    draftId: payload.id,
    messageId: payload.message?.id ?? "",
    threadId: payload.message?.threadId ?? "",
  };
}

async function listDrafts(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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
        messageId: draft.message?.id ?? "",
        threadId: draft.message?.threadId ?? "",
      },
    })),
    nextPageToken: payload.nextPageToken ?? null,
  };
}

async function getDraft(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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

async function updateDraft(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const draftId = normalizeMessageId(input.draftId);
  const existing = await getDraftResource(userId, draftId, accessToken, fetcher, "full");
  const headers = existing.message.payload?.headers ?? [];
  const nextRecipients = buildRecipients(input);
  const recipients = buildRecipients({
    to:
      nextRecipients.to.length > 0
        ? nextRecipients.to
        : parseAddressList(readHeader(headers, "To")),
    cc:
      nextRecipients.cc.length > 0
        ? nextRecipients.cc
        : parseAddressList(readHeader(headers, "Cc")),
    bcc:
      nextRecipients.bcc.length > 0
        ? nextRecipients.bcc
        : parseAddressList(readHeader(headers, "Bcc")),
  });

  const existingBody = extractBodyContent(existing.message.payload ?? null);
  const subject = optionalString(input.subject) || readHeader(headers, "Subject");
  const body = Object.hasOwn(input, "body")
    ? optionalString(input.body)
    : Object.hasOwn(input, "messageBody")
      ? optionalString(input.messageBody)
      : existingBody.body;
  const isHtml = typeof input.isHtml === "boolean" ? input.isHtml : existingBody.isHtml;
  const threadId = optionalString(input.threadId) || existing.message.threadId;

  const payload = await fetchJson<GmailDraftResource>(
    gmailUserUrl(userId, "drafts", draftId),
    accessToken,
    fetcher,
    {
      method: "PUT",
      body: JSON.stringify({
        id: draftId,
        message: {
          raw: encodeMimeMessage({
            to: recipients.to,
            cc: recipients.cc,
            bcc: recipients.bcc,
            subject,
            body,
            isHtml,
            from: optionalString(input.fromEmail) || firstAddress(readHeader(headers, "From")),
          }),
          ...(threadId ? { threadId: normalizeThreadId(threadId) } : {}),
        },
      }),
    },
  );

  return {
    draftId: payload.id,
    messageId: payload.message?.id ?? "",
    threadId: payload.message?.threadId ?? "",
  };
}

async function sendDraft(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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
    threadId: payload.threadId ?? null,
  };
}

async function deleteDraft(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await fetchEmpty(
    gmailUserUrl(userId, "drafts", normalizeMessageId(input.draftId)),
    accessToken,
    fetcher,
    {
      method: "DELETE",
    },
  );

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

async function getLabel(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "labels", normalizeMessageId(input.labelId)),
    accessToken,
    fetcher,
  );
}

async function createLabel(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return fetchJson<Record<string, unknown>>(gmailUserUrl(userId, "labels"), accessToken, fetcher, {
    method: "POST",
    body: JSON.stringify(buildLabelPayload(input)),
  });
}

async function patchLabel(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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

async function updateLabel(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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

async function deleteLabel(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await fetchEmpty(
    gmailUserUrl(userId, "labels", normalizeMessageId(input.labelId)),
    accessToken,
    fetcher,
    {
      method: "DELETE",
    },
  );

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

async function listHistory(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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
    await fetchJson<unknown>(gmailUserUrl(userId, "settings", "filters"), accessToken, fetcher),
    "gmail filters list",
  );
  const filters = payload.filter;

  return {
    filters: Array.isArray(filters) ? filters : [],
  };
}

async function getFilter(
  input: Record<string, unknown>,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
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
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "settings", "filters"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({
        criteria: asObject(input.criteria),
        action: asObject(input.action),
      }),
    },
  );
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

async function getSettingsResource(
  resource: string,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "settings", resource),
    accessToken,
    fetcher,
  );
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

  return fetchJson<Record<string, unknown>>(
    gmailUserUrl(userId, "settings", resource),
    accessToken,
    fetcher,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

async function listForwardingAddresses(userId: string, accessToken: string, fetcher: typeof fetch) {
  const payload = normalizeNullableObjectResponse(
    await fetchJson<unknown>(
      gmailUserUrl(userId, "settings", "forwardingAddresses"),
      accessToken,
      fetcher,
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
  return fetchJson<GmailDraftResource>(url.toString(), accessToken, fetcher);
}

async function sendThreadMessage(
  userId: string,
  accessToken: string,
  fetcher: typeof fetch,
  threadId: string,
  raw: string,
) {
  return fetchJson<{ id: string; threadId?: string }>(
    gmailUserUrl(userId, "messages", "send"),
    accessToken,
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({
        threadId,
        raw,
      }),
    },
  );
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
    Object.entries(input).filter(
      ([key, value]) => key !== "userId" && key !== "labelId" && value !== undefined,
    ),
  );
}

function buildLabelMutationPayload(input: Record<string, unknown>) {
  return {
    addLabelIds: toStringArray(input.addLabelIds),
    removeLabelIds: toStringArray(input.removeLabelIds),
  };
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

async function fetchJson<T>(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
) {
  const requestInit = buildGmailRequestInit(accessToken, init);
  const response = await fetcher(url, requestInit);
  await assertGmailResponse(response);
  return (await response.json()) as T;
}

async function fetchEmpty(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
) {
  const requestInit = buildGmailRequestInit(accessToken, init);
  const response = await fetcher(url, requestInit);
  await assertGmailResponse(response);
}

function buildGmailRequestInit(accessToken: string, init: RequestInit) {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  };
}

function resolveUserId(value: unknown) {
  const userId = String(value ?? "me").trim();
  return userId || "me";
}

function normalizeFormat(value: unknown, fallback: string) {
  const format = String(value ?? fallback).trim();
  return format || fallback;
}

function normalizeOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 500
    ? value
    : undefined;
}

function optionalString(value: unknown) {
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

  const text = await response.text().catch(() => "");
  const message = readGmailErrorMessage(text) || `gmail request failed with ${response.status}`;
  if (response.status === 400) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }

  throw new ProviderRequestError(response.status, message);
}

function readGmailErrorMessage(text: string): string {
  if (!text) {
    return "";
  }

  try {
    const payload = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof payload.error === "string") {
      return payload.error;
    }
    return payload.error?.message ?? text;
  } catch {
    return text;
  }
}
