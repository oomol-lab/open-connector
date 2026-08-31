import type { FeishuJsonRequest } from "./client.ts";

import { Buffer } from "node:buffer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { providerFetch, providerInputError, ProviderRequestError } from "../../provider-runtime.ts";
import { downloadFeishuSource } from "./media.ts";

interface MailActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

interface ComposeMailInput {
  readonly from: string;
  readonly to: string[];
  readonly cc: string[];
  readonly bcc: string[];
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly inReplyTo?: string;
  readonly replyToMessageId?: string;
  readonly allowNoRecipients?: boolean;
  readonly attachments: MailAttachment[];
}

interface MailAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Buffer;
}

const maxMailMimeBytes = 25 * 1024 * 1024;

export function createFeishuMailActionHandlers(
  request: FeishuJsonRequest,
  fetcher: typeof fetch = providerFetch,
): Record<string, MailActionHandler> {
  return {
    list_mail_messages: (input) => listMessages(input, request),
    search_mail_messages: (input) => searchMessages(input, request),
    get_mail_message: (input) => getMessage(input, request),
    get_mail_thread: (input) => getThread(input, request),
    create_mail_draft: (input) => createDraft(input, request, fetcher),
    update_mail_draft: (input) => updateDraft(input, request, fetcher),
    delete_mail_draft: (input) => deleteDraft(input, request),
    send_mail_draft: (input) => sendDraft(input, request),
    send_mail: (input) => composeAndSend(input, request, fetcher),
    get_mail_send_status: (input) => getSendStatus(input, request),
    cancel_scheduled_send: (input) => cancelScheduledSend(input, request),
    reply_mail: (input) => reply(input, request, fetcher, false),
    reply_all_mail: (input) => reply(input, request, fetcher, true),
    forward_mail: (input) => forward(input, request, fetcher),
    recall_sent_mail: (input) => recallSentMail(input, request),
    get_mail_recall_detail: (input) => getRecallDetail(input, request),
    modify_mail_messages: (input) => modifyMessages(input, request),
    trash_mail_messages: (input) => trashMessages(input, request),
    list_mail_signatures: (input) => listSignatures(input, request),
  };
}

async function listMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const folderId = optionalString(input.folderId);
  const labelId = optionalString(input.labelId);
  if (folderId && labelId) {
    throw providerInputError("folderId and labelId cannot be combined");
  }
  const data = await request({
    path: mailboxPath(input, "messages"),
    query: {
      folder_id: labelId ? undefined : (folderId ?? "INBOX"),
      label_id: labelId,
      only_unread: optionalBoolean(input.onlyUnread),
      page_size: optionalNumber(input.pageSize) ?? 50,
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function searchMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const filter = compact({
    from: optionalStringArray(input.from),
    to: optionalStringArray(input.to),
    cc: optionalStringArray(input.cc),
    bcc: optionalStringArray(input.bcc),
    subject: optionalString(input.subject),
    folder: optionalString(input.folder) ? [optionalString(input.folder)] : undefined,
    label: optionalString(input.label) ? [optionalString(input.label)] : undefined,
    is_unread: optionalBoolean(input.unread),
    has_attachment: optionalBoolean(input.hasAttachment),
    create_time:
      input.startTime || input.endTime
        ? compact({
            start_time: optionalString(input.startTime),
            end_time: optionalString(input.endTime),
          })
        : undefined,
  });
  if (!optionalString(input.query) && Object.keys(filter).length === 0) {
    throw providerInputError("mail search requires query or at least one filter");
  }
  const data = await request({
    method: "POST",
    path: mailboxPath(input, "search"),
    query: {
      page_size: optionalNumber(input.pageSize) ?? 50,
      page_token: optionalString(input.pageToken),
    },
    body: compact({
      query: optionalString(input.query),
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    }),
  });
  return normalizePage(data);
}

async function getMessage(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: mailboxPath(input, "messages", requiredString(input.messageId, "messageId")),
    query: { format: input.includeHtml === false ? "plain_text_full" : "full" },
  });
  return { message: recordValue(data.message ?? data) };
}

async function getThread(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const threadId = requiredString(input.threadId, "threadId");
  const data = await request({
    path: mailboxPath(input, "threads", threadId),
    query: {
      format: input.includeHtml === false ? "plain_text_full" : "full",
      include_spam_trash: optionalBoolean(input.includeSpamTrash),
    },
  });
  const thread = recordValue(data.thread);
  const rawItems = Array.isArray(thread.messages) ? thread.messages : data.items;
  const messages = recordArray(rawItems)
    .map((item) => recordValue(item.message ?? item))
    .filter((item) => optionalString(item.message_id))
    .sort((left, right) => Number(left.internal_date ?? 0) - Number(right.internal_date ?? 0));
  return { threadId, messages };
}

async function createDraft(input: Record<string, unknown>, request: FeishuJsonRequest, fetcher: typeof fetch) {
  const mailbox = mailboxId(input);
  const raw = await composeRaw(await composeInput(input, mailbox, request, fetcher, true));
  const data = await request({
    method: "POST",
    path: mailboxPathFromId(mailbox, "drafts"),
    body: { raw },
  });
  return { draftId: extractDraftId(data), raw: data };
}

async function updateDraft(input: Record<string, unknown>, request: FeishuJsonRequest, fetcher: typeof fetch) {
  const mailbox = mailboxId(input);
  const draftId = requiredString(input.draftId, "draftId");
  const raw = await composeRaw(await composeInput(input, mailbox, request, fetcher, true));
  const data = await request({
    method: "PUT",
    path: mailboxPathFromId(mailbox, "drafts", draftId),
    body: { raw },
  });
  return { draftId: extractDraftId(data, draftId), raw: data };
}

async function deleteDraft(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const draftId = requiredString(input.draftId, "draftId");
  await request({
    method: "DELETE",
    path: mailboxPath(input, "drafts", draftId),
  });
  return { deleted: true, draftId };
}

async function sendDraft(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const draftId = requiredString(input.draftId, "draftId");
  const sendTime = optionalString(input.sendTime);
  const data = await request({
    method: "POST",
    path: mailboxPath(input, "drafts", draftId, "send"),
    body: sendTime ? { send_time: unixSeconds(sendTime).toString() } : undefined,
  });
  return sendResult(draftId, data);
}

async function composeAndSend(input: Record<string, unknown>, request: FeishuJsonRequest, fetcher: typeof fetch) {
  if (!optionalStringArray(input.to) && !optionalStringArray(input.cc) && !optionalStringArray(input.bcc)) {
    throw providerInputError("at least one recipient is required");
  }
  const draft = await createDraft(input, request, fetcher);
  return sendDraft({ mailboxId: mailboxId(input), draftId: draft.draftId }, request);
}

async function getSendStatus(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requiredString(input.messageId, "messageId");
  const data = await request({
    path: mailboxPath(input, "messages", messageId, "send_status"),
  });
  const details = recordArray(data.details).map((detail) => {
    const status = mailDeliveryStatus(detail.status);
    return {
      ...detail,
      status: status.value,
      statusLabel: status.label,
    };
  });
  return {
    messageId: optionalString(data.message_id) ?? messageId,
    details,
    raw: data,
  };
}

async function cancelScheduledSend(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requiredString(input.messageId, "messageId");
  const data = await request({
    method: "POST",
    path: mailboxPath(input, "messages", messageId, "cancel_scheduled_send"),
  });
  return { messageId, canceled: true, raw: data };
}

async function recallSentMail(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requiredString(input.messageId, "messageId");
  const data = await request({
    method: "POST",
    path: mailboxPath(input, "messages", messageId, "recall"),
  });
  return {
    messageId,
    recallStatus: optionalString(data.recall_status) ?? null,
    recallRestrictionReason: optionalString(data.recall_restriction_reason) ?? null,
    raw: data,
  };
}

async function getRecallDetail(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requiredString(input.messageId, "messageId");
  const data = await request({
    path: mailboxPath(input, "messages", messageId, "recall"),
  });
  return {
    messageId,
    recallStatus: optionalString(data.recall_status) ?? null,
    recallResult: optionalString(data.recall_result) ?? null,
    successCount: optionalNumber(data.success_count) ?? null,
    failureCount: optionalNumber(data.failure_count) ?? null,
    processingCount: optionalNumber(data.processing_count) ?? null,
    items: recordArray(data.items),
    raw: data,
  };
}

async function reply(input: Record<string, unknown>, request: FeishuJsonRequest, fetcher: typeof fetch, all: boolean) {
  const mailbox = mailboxId(input);
  const source = await fetchFullMessage(input, request);
  const sender = await resolveSender(input, mailbox, request);
  const sourceFrom = address(source.head_from);
  const sourceTo = addresses(source.to);
  const sourceCc = addresses(source.cc);
  const explicitTo = optionalStringArray(input.to);
  const to = explicitTo ?? (sourceFrom ? [sourceFrom] : []);
  const cc = optionalStringArray(input.cc) ?? (all ? uniqueEmails([...sourceTo, ...sourceCc], sender) : []);
  const subject = optionalString(input.subject) ?? replySubject(optionalString(source.subject) ?? "");
  const compose: ComposeMailInput = {
    from: sender,
    to,
    cc,
    bcc: optionalStringArray(input.bcc) ?? [],
    subject,
    text: optionalString(input.text),
    html: optionalString(input.html),
    inReplyTo: optionalString(source.smtp_message_id),
    replyToMessageId: requiredString(input.messageId, "messageId"),
    attachments: await downloadMailAttachments(input.attachments, fetcher),
  };
  const raw = await composeRaw(compose);
  const created = await request({
    method: "POST",
    path: mailboxPathFromId(mailbox, "drafts"),
    body: { raw },
  });
  const draftId = extractDraftId(created);
  const sent = await request({
    method: "POST",
    path: mailboxPathFromId(mailbox, "drafts", draftId, "send"),
  });
  return sendResult(draftId, sent);
}

async function forward(input: Record<string, unknown>, request: FeishuJsonRequest, fetcher: typeof fetch) {
  const mailbox = mailboxId(input);
  const source = await fetchFullMessage(input, request);
  const to = requiredStringArray(input.to, "to");
  const originalText = optionalString(source.body_plain_text) ?? optionalString(source.body) ?? "(No plain-text body)";
  const subject = optionalString(input.subject) ?? forwardSubject(optionalString(source.subject) ?? "");
  const body = optionalString(input.text) ?? "";
  const compose: ComposeMailInput = {
    from: await resolveSender(input, mailbox, request),
    to,
    cc: optionalStringArray(input.cc) ?? [],
    bcc: optionalStringArray(input.bcc) ?? [],
    subject,
    text: `${body}\n\n---------- Forwarded message ----------\n${originalText}`,
    html: optionalString(input.html),
    attachments: await downloadMailAttachments(input.attachments, fetcher),
  };
  const raw = await composeRaw(compose);
  const created = await request({
    method: "POST",
    path: mailboxPathFromId(mailbox, "drafts"),
    body: { raw },
  });
  const draftId = extractDraftId(created);
  const sent = await request({
    method: "POST",
    path: mailboxPathFromId(mailbox, "drafts", draftId, "send"),
  });
  return sendResult(draftId, sent);
}

async function modifyMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageIds = requiredStringArray(input.messageIds, "messageIds");
  if (
    !optionalStringArray(input.addLabelIds) &&
    !optionalStringArray(input.removeLabelIds) &&
    !optionalString(input.targetFolderId)
  ) {
    throw providerInputError("at least one label or folder change is required");
  }
  return runMessageBatches(messageIds, async (ids) => {
    await request({
      method: "POST",
      path: mailboxPath(input, "messages", "batch_modify"),
      body: compact({
        message_ids: ids,
        add_label_ids: optionalStringArray(input.addLabelIds),
        remove_label_ids: optionalStringArray(input.removeLabelIds),
        add_folder: optionalString(input.targetFolderId),
      }),
    });
  });
}

async function trashMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageIds = requiredStringArray(input.messageIds, "messageIds");
  return runMessageBatches(messageIds, async (ids) => {
    await request({
      method: "POST",
      path: mailboxPath(input, "messages", "batch_trash"),
      body: { message_ids: ids },
    });
  });
}

async function listSignatures(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: mailboxPath(input, "settings", "signatures"),
  });
  return {
    items: recordArray(data.signatures ?? data.items),
    hasMore: false,
    pageToken: null,
  };
}

async function composeInput(
  input: Record<string, unknown>,
  mailbox: string,
  request: FeishuJsonRequest,
  fetcher: typeof fetch,
  allowNoRecipients = false,
): Promise<ComposeMailInput> {
  return {
    from: await resolveSender(input, mailbox, request),
    to: allowNoRecipients ? (optionalStringArray(input.to) ?? []) : requiredStringArray(input.to, "to"),
    cc: optionalStringArray(input.cc) ?? [],
    bcc: optionalStringArray(input.bcc) ?? [],
    subject: requiredString(input.subject, "subject"),
    text: optionalString(input.text),
    html: optionalString(input.html),
    allowNoRecipients,
    attachments: await downloadMailAttachments(input.attachments, fetcher),
  };
}

async function resolveSender(input: Record<string, unknown>, mailbox: string, request: FeishuJsonRequest) {
  const explicit = optionalString(input.from);
  if (explicit) {
    return explicit;
  }
  const data = await request({ path: mailboxPathFromId(mailbox, "profile") });
  const profile = recordValue(data.user_mailbox);
  return requiredString(data.primary_email_address ?? profile.primary_email_address, "mailbox primary_email_address");
}

async function fetchFullMessage(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: mailboxPath(input, "messages", requiredString(input.messageId, "messageId")),
    query: { format: "full" },
  });
  return recordValue(data.message ?? data);
}

async function composeRaw(input: ComposeMailInput) {
  if (!input.allowNoRecipients && input.to.length === 0 && input.cc.length === 0 && input.bcc.length === 0) {
    throw providerInputError("at least one recipient is required");
  }
  if (!input.text && !input.html) {
    throw providerInputError("text or html body is required");
  }
  const headers: Record<string, string> = {};
  if (input.replyToMessageId) {
    headers["X-LMS-Reply-To-Message-Id"] = input.replyToMessageId;
  }
  const buffer = await new MailComposer({
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.inReplyTo,
    references: input.inReplyTo,
    headers,
    attachments: input.attachments,
  })
    .compile()
    .build();
  if (buffer.byteLength > maxMailMimeBytes) {
    throw providerInputError("mail MIME exceeds the 25 MB limit");
  }
  const normalized = buffer.toString("utf8").replaceAll("\r\n", "\n");
  return Buffer.from(normalized).toString("base64url");
}

async function downloadMailAttachments(value: unknown, fetcher: typeof fetch) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 20) {
    throw providerInputError("attachments must be an array with at most 20 items");
  }
  const attachments: MailAttachment[] = [];
  let totalBytes = 0;
  for (const [index, item] of value.entries()) {
    const attachment = recordValue(item);
    const source = await downloadFeishuSource(
      {
        sourceUrl: requiredString(attachment.fileUrl, `attachments.${index}.fileUrl`),
        kind: "file",
        fileName: optionalString(attachment.fileName),
        fieldName: `attachments.${index}.fileUrl`,
        maxBytes: maxMailMimeBytes,
      },
      fetcher,
    );
    const bytes = source.bytes;
    if (!bytes) {
      throw new ProviderRequestError(502, "Feishu mail attachment source is not available in memory");
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > maxMailMimeBytes) {
      throw providerInputError("mail attachment source bytes exceed 25 MB");
    }
    attachments.push({
      filename: source.fileName,
      contentType: optionalString(attachment.contentType) ?? source.mimeType,
      content: Buffer.from(bytes),
    });
  }
  return attachments;
}

async function runMessageBatches(messageIds: string[], run: (ids: string[]) => Promise<void>) {
  const successfulMessageIds: string[] = [];
  const failed: Record<string, unknown>[] = [];
  for (let index = 0; index < messageIds.length; index += 20) {
    const ids = messageIds.slice(index, index + 20);
    try {
      await run(ids);
      successfulMessageIds.push(...ids);
    } catch (error) {
      failed.push(...ids.map((messageId) => ({ messageId, reason: errorMessage(error) })));
    }
  }
  return { successfulMessageIds, failed };
}

function sendResult(draftId: string, data: Record<string, unknown>) {
  const nested = recordValue(data.message);
  return {
    draftId,
    messageId: optionalString(data.message_id ?? nested.message_id) ?? null,
    threadId: optionalString(data.thread_id ?? nested.thread_id) ?? null,
    raw: data,
  };
}

function mailDeliveryStatus(value: unknown) {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  const status = Number.isInteger(numeric) && numeric >= 0 && numeric <= 6 ? numeric : 0;
  const label =
    {
      0: "unknown",
      1: "delivering",
      2: "retrying",
      3: "bounced",
      4: "delivered",
      5: "pending_approval",
      6: "approval_rejected",
    }[status] ?? "unknown";
  return { value: status, label };
}

function extractDraftId(data: Record<string, unknown>, fallback?: string) {
  const draft = recordValue(data.draft);
  return requiredString(data.draft_id ?? data.id ?? draft.draft_id ?? fallback, "draft_id");
}

function mailboxPath(input: Record<string, unknown>, ...parts: string[]) {
  return mailboxPathFromId(mailboxId(input), ...parts);
}

function mailboxPathFromId(mailbox: string, ...parts: string[]) {
  return `/mail/v1/user_mailboxes/${[mailbox, ...parts].map(encodeURIComponent).join("/")}`;
}

function mailboxId(input: Record<string, unknown>) {
  return optionalString(input.mailboxId) ?? "me";
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: recordArray(data.items),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
  };
}

function address(value: unknown) {
  const object = recordValue(value);
  return optionalString(object.mail_address ?? object.email);
}

function addresses(value: unknown) {
  return recordArray(value)
    .map(address)
    .filter((item): item is string => Boolean(item));
}

function uniqueEmails(values: string[], excluded: string) {
  return [...new Set(values.filter((value) => value.toLowerCase() !== excluded.toLowerCase()))];
}

function replySubject(subject: string) {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function forwardSubject(subject: string) {
  return subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
}

function unixSeconds(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw providerInputError("sendTime must be an RFC 3339 date-time");
  }
  return Math.trunc(milliseconds / 1000);
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw providerInputError(`${field} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredStringArray(value: unknown, field: string) {
  const values = optionalStringArray(value);
  if (!values) {
    throw providerInputError(`${field} must contain at least one value`);
  }
  return values;
}

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return values.length > 0 ? values : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
