import type { FeishuJsonRequest } from "./client.ts";

import { Buffer } from "node:buffer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

interface MailAdvancedActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const readReceiptRequestLabel = "READ_RECEIPT_REQUEST";
const maximumTemplateContentBytes = 3 * 1024 * 1024;
const templateConcurrencyWarning =
  "Template updates have no optimistic locking; concurrent writes are last-write-wins.";

export function createFeishuMailAdvancedActionHandlers(
  request: FeishuJsonRequest,
): Record<string, MailAdvancedActionHandler> {
  return {
    send_mail_read_receipt: (input) => sendReadReceipt(input, request),
    decline_mail_read_receipt: (input) => declineReadReceipt(input, request),
    get_mail_signature_detail: (input) => getSignatureDetail(input, request),
    share_mail_to_chat: (input) => shareMailToChat(input, request),
    create_mail_template: (input) => createMailTemplate(input, request),
    update_mail_template: (input) => updateMailTemplate(input, request),
    triage_mail_messages: (input) => triageMailMessages(input, request),
    subscribe_mail_events: (input) => changeMailEventSubscription(input, request, true),
    unsubscribe_mail_events: (input) => changeMailEventSubscription(input, request, false),
  };
}

async function sendReadReceipt(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const messageId = requiredString(input.messageId, "messageId");
  const source = await fetchMessage(mailboxId, messageId, request);
  if (!hasReceiptRequest(source)) {
    throw providerInputError(`message ${messageId} did not request a read receipt; READ_RECEIPT_REQUEST is absent`);
  }

  const recipient = address(source.head_from);
  if (!recipient) {
    throw providerInputError("the original message has no sender address");
  }
  const sender = optionalString(input.from) ?? (await resolveMailboxAddress(mailboxId, request));
  const subject = optionalString(source.subject) ?? "";
  const language =
    optionalString(input.language) === "zh" || (optionalString(input.language) !== "en" && containsCjk(subject))
      ? "zh"
      : "en";
  const sentAt = readableReceiptTime(source.internal_date);
  const readAt = new Date().toISOString();
  const receiptSubject = receiptSubjectFor(subject, language);
  const text =
    language === "zh"
      ? [
          "您发送的邮件已被阅读，详情如下：",
          `> 主题：${subject.trim()}`,
          `> 收件人：${sender}`,
          `> 发送时间：${sentAt}`,
          `> 阅读时间：${readAt}`,
        ].join("\n")
      : [
          "Your message has been read. Details:",
          `> Subject: ${subject.trim()}`,
          `> To: ${sender}`,
          `> Sent: ${sentAt}`,
          `> Read: ${readAt}`,
        ].join("\n");
  const html = `<div><p>${escapeHtml(text.split("\n")[0]!)}</p><blockquote>${text
    .split("\n")
    .slice(1)
    .map((line) => escapeHtml(line.replace("> ", "")))
    .join("<br>")}</blockquote></div>`;
  const raw = await composeReceiptRaw({
    sender,
    recipient,
    subject: receiptSubject,
    text,
    html,
    sourceMessageId: messageId,
    smtpMessageId: normalizeSmtpMessageId(source.smtp_message_id),
    references: stringArray(source.references),
  });
  const draftData = await request({
    method: "POST",
    path: mailboxPath(mailboxId, "drafts"),
    body: { raw },
  });
  const draftId = extractDraftId(draftData);
  const sent = await request({
    method: "POST",
    path: mailboxPath(mailboxId, "drafts", draftId, "send"),
  });
  const nested = recordValue(sent.message);
  return {
    receiptForMessageId: messageId,
    draftId,
    messageId: optionalString(sent.message_id ?? nested.message_id) ?? null,
    threadId: optionalString(sent.thread_id ?? nested.thread_id) ?? null,
    raw: sent,
  };
}

async function declineReadReceipt(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const messageId = requiredString(input.messageId, "messageId");
  const source = await fetchMessage(mailboxId, messageId, request);
  if (!hasReceiptRequest(source)) {
    return { messageId, declined: false, alreadyCleared: true };
  }
  await request({
    method: "PUT",
    path: mailboxPath(mailboxId, "messages", messageId, "modify"),
    body: { remove_label_ids: [readReceiptRequestLabel] },
  });
  return { messageId, declined: true, alreadyCleared: false };
}

async function getSignatureDetail(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const signatureId = requiredString(input.signatureId, "signatureId");
  const data = await request({ path: mailboxPath(mailboxId, "signatures") });
  const signatures = recordArray(data.signatures ?? data.items);
  const signature = signatures.find((item) => optionalString(item.id ?? item.signature_id) === signatureId);
  if (!signature) {
    throw new ProviderRequestError(404, `signature ${signatureId} was not found in mailbox ${mailboxId}`);
  }

  let isSendDefault = false;
  let isReplyDefault = false;
  for (const usage of recordArray(data.usages ?? data.signature_usages)) {
    if (optionalString(usage.send_mail_signature_id) === signatureId) {
      isSendDefault = true;
    }
    if (optionalString(usage.reply_signature_id) === signatureId) {
      isReplyDefault = true;
    }
  }
  return { signature, isSendDefault, isReplyDefault };
}

async function shareMailToChat(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const messageId = optionalString(input.messageId);
  const threadId = optionalString(input.threadId);
  if (Boolean(messageId) === Boolean(threadId)) {
    throw providerInputError("provide exactly one of messageId or threadId");
  }
  const created = await request({
    method: "POST",
    path: mailboxPath(mailboxId, "messages", "share_token"),
    body: threadId ? { thread_id: threadId } : { message_id: messageId },
  });
  const cardId = requiredProviderString(created.card_id, "mail share card_id");
  const sent = await request({
    method: "POST",
    path: mailboxPath(mailboxId, "share_tokens", cardId, "send"),
    query: { receive_id_type: optionalString(input.receiveIdType) ?? "chat_id" },
    body: { receive_id: requiredString(input.receiveId, "receiveId") },
  });
  return {
    cardId,
    imMessageId: optionalString(sent.message_id) ?? null,
    raw: sent,
  };
}

async function createMailTemplate(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const template = buildTemplateFromInput(input, true);
  const data = await request({
    method: "POST",
    path: mailboxPath(mailboxId, "templates"),
    body: { template },
  });
  return { template: recordValue(data.template ?? data) };
}

async function updateMailTemplate(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const templateId = requiredString(input.templateId, "templateId");
  if (
    !["name", "subject", "templateContent", "isPlainText", "to", "cc", "bcc", "attachments"].some((field) =>
      Object.hasOwn(input, field),
    )
  ) {
    throw providerInputError("provide at least one template field to update");
  }
  const fetched = await request({ path: mailboxPath(mailboxId, "templates", templateId) });
  const template = { ...recordValue(fetched.template ?? fetched) };
  const patch = buildTemplateFromInput(input, false);
  for (const [key, value] of Object.entries(patch)) {
    if (key !== "attachments") {
      template[key] = value;
    }
  }
  if ("attachments" in patch) {
    const next = recordArray(patch.attachments);
    template.attachments =
      optionalString(input.attachmentsMode) === "append"
        ? dedupeAttachments([...recordArray(template.attachments), ...next])
        : next;
  }
  template.template_id ??= templateId;
  template.attachments = recordArray(template.attachments).map(completeAttachment);

  const data = await request({
    method: "PUT",
    path: mailboxPath(mailboxId, "templates", templateId),
    body: { template },
  });
  return {
    template: recordValue(data.template ?? data),
    warning: templateConcurrencyWarning,
  };
}

async function triageMailMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  if (input.unread === false) {
    throw providerInputError("unread must be true when provided");
  }
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const maximum = Math.min(optionalNumber(input.maxResults) ?? 20, 400);
  const parsedToken = parseTriageToken(optionalString(input.pageToken));
  const useSearch = parsedToken?.source === "search" || wantsSearch(input);
  if (parsedToken && parsedToken.source !== (useSearch ? "search" : "list")) {
    throw providerInputError("pageToken source does not match the current triage filters");
  }

  const messages: Record<string, unknown>[] = [];
  let pageToken = parsedToken?.token;
  let hasMore = false;
  let notice: string | null = null;
  if (useSearch) {
    while (messages.length < maximum) {
      const data = await request({
        method: "POST",
        path: mailboxPath(mailboxId, "search"),
        query: {
          page_size: Math.min(maximum - messages.length, 15),
          page_token: pageToken,
        },
        body: buildTriageSearchBody(input),
      });
      if (!notice) {
        notice = optionalString(data.notice) ?? null;
      }
      messages.push(...normalizeSearchItems(data.items));
      hasMore = data.has_more === true;
      pageToken = optionalString(data.page_token);
      if (!hasMore || !pageToken) break;
    }
    messages.splice(maximum);
    if (input.includeLabels === true && messages.length > 0) {
      const metadata = await batchGetMetadata(
        mailboxId,
        messages.map((item) => requiredString(item.messageId, "messageId")),
        request,
      );
      mergeLabels(messages, metadata);
    }
  } else {
    const messageIds: string[] = [];
    while (messageIds.length < maximum) {
      const data = await request({
        path: mailboxPath(mailboxId, "messages"),
        query: {
          folder_id: optionalString(input.labelId) ? undefined : (optionalString(input.folderId) ?? "INBOX"),
          label_id: optionalString(input.labelId),
          only_unread: optionalBoolean(input.unread),
          page_size: Math.min(maximum - messageIds.length, 20),
          page_token: pageToken,
        },
      });
      messageIds.push(...extractMessageIds(data.items));
      hasMore = data.has_more === true;
      pageToken = optionalString(data.page_token);
      if (!hasMore || !pageToken) break;
    }
    messageIds.splice(maximum);
    messages.push(...(await batchGetMetadata(mailboxId, messageIds, request)));
  }

  return {
    messages,
    mailboxId,
    count: messages.length,
    source: useSearch ? "search" : "list",
    hasMore,
    pageToken: hasMore && pageToken ? `${useSearch ? "search" : "list"}:${pageToken}` : null,
    notice,
  };
}

async function changeMailEventSubscription(
  input: Record<string, unknown>,
  request: FeishuJsonRequest,
  subscribe: boolean,
) {
  const mailboxId = optionalString(input.mailboxId) ?? "me";
  const data = await request({
    method: "POST",
    path: mailboxPath(mailboxId, "event", subscribe ? "subscribe" : "unsubscribe"),
    body: { event_type: 1 },
  });
  return subscribe
    ? { mailboxId, subscribed: true, eventType: 1, raw: data }
    : { mailboxId, unsubscribed: true, eventType: 1, raw: data };
}

async function fetchMessage(mailboxId: string, messageId: string, request: FeishuJsonRequest) {
  const data = await request({
    path: mailboxPath(mailboxId, "messages", messageId),
    query: { format: "plain_text_full" },
  });
  return recordValue(data.message ?? data);
}

async function resolveMailboxAddress(mailboxId: string, request: FeishuJsonRequest) {
  const data = await request({ path: mailboxPath(mailboxId, "profile") });
  const mailbox = recordValue(data.user_mailbox);
  return requiredProviderString(
    data.primary_email_address ?? mailbox.primary_email_address,
    "mailbox primary_email_address",
  );
}

interface ReceiptComposeInput {
  readonly sender: string;
  readonly recipient: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly sourceMessageId: string;
  readonly smtpMessageId?: string;
  readonly references: string[];
}

async function composeReceiptRaw(input: ReceiptComposeInput) {
  const references = [...input.references];
  if (input.smtpMessageId) references.push(input.smtpMessageId);
  const buffer = await new MailComposer({
    from: input.sender,
    to: input.recipient,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.smtpMessageId,
    references,
    headers: {
      "X-Lark-Read-Receipt-Mail": "1",
      "X-LMS-Reply-To-Message-Id": input.sourceMessageId,
    },
  })
    .compile()
    .build();
  return Buffer.from(buffer.toString("utf8").replaceAll("\r\n", "\n")).toString("base64url");
}

function hasReceiptRequest(message: Record<string, unknown>) {
  return stringArray(message.label_ids).some((label) => label === readReceiptRequestLabel || label === "-607");
}

function receiptSubjectFor(subject: string, language: "zh" | "en") {
  let result = subject.trim();
  while (true) {
    if (result.startsWith("已读回执：")) {
      result = result.slice("已读回执：".length).trim();
    } else if (result.toLowerCase().startsWith("read receipt:")) {
      result = result.slice("read receipt:".length).trim();
    } else {
      break;
    }
  }
  return `${language === "zh" ? "已读回执：" : "Read receipt: "}${result}`;
}

function containsCjk(value: string) {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (
      (point >= 0x3400 && point <= 0x4dbf) ||
      (point >= 0x4e00 && point <= 0x9fff) ||
      (point >= 0xf900 && point <= 0xfaff)
    ) {
      return true;
    }
  }
  return false;
}

function readableReceiptTime(value: unknown) {
  const milliseconds = typeof value === "number" ? value : Number.parseInt(optionalString(value) ?? "", 10);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : "-";
}

function normalizeSmtpMessageId(value: unknown) {
  const id = optionalString(value)?.replaceAll("<", "").replaceAll(">", "");
  return id ? `<${id}>` : undefined;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTemplateFromInput(input: Record<string, unknown>, create: boolean) {
  const template: Record<string, unknown> = {};
  if (create || "name" in input) {
    const name = requiredString(input.name, "name");
    if ([...name].length > 100) throw providerInputError("name must not exceed 100 characters");
    template.name = name;
  }
  assignIfPresent(template, "subject", input, "subject");
  assignIfPresent(template, "template_content", input, "templateContent");
  if (
    typeof template.template_content === "string" &&
    Buffer.byteLength(template.template_content) > maximumTemplateContentBytes
  ) {
    throw providerInputError("templateContent must not exceed 3 MB");
  }
  assignIfPresent(template, "is_plain_text_mode", input, "isPlainText");
  if ("to" in input) template.tos = templateAddresses(input.to, "to");
  if ("cc" in input) template.ccs = templateAddresses(input.cc, "cc");
  if ("bcc" in input) template.bccs = templateAddresses(input.bcc, "bcc");
  if ("attachments" in input) {
    template.attachments = templateAttachments(input.attachments);
  }
  if (create) {
    template.subject ??= "";
    template.template_content ??= "";
    template.is_plain_text_mode ??= false;
  }
  return template;
}

function templateAddresses(value: unknown, field: string) {
  if (!Array.isArray(value)) throw providerInputError(`${field} must be an array`);
  return value.map((item, index) => {
    const address = recordValue(item);
    return {
      mail_address: requiredString(address.mailAddress, `${field}[${index}].mailAddress`),
      name: optionalString(address.name),
    };
  });
}

function templateAttachments(value: unknown) {
  if (!Array.isArray(value)) throw providerInputError("attachments must be an array");
  return value.map((item, index) => {
    const attachment = recordValue(item);
    const fileKey = requiredString(attachment.fileKey, `attachments[${index}].fileKey`);
    const cid = optionalString(attachment.cid);
    const inline = attachment.inline === true;
    const attachmentType = optionalString(attachment.attachmentType);
    if (inline && !cid) {
      throw providerInputError("inline attachments require cid");
    }
    if (inline && attachmentType === "large") {
      throw providerInputError("inline attachments cannot use the large attachment type");
    }
    return {
      id: fileKey,
      filename: requiredString(attachment.fileName, `attachments[${index}].fileName`),
      cid,
      is_inline: inline,
      attachment_type: attachmentType === "large" ? 2 : 1,
      body: fileKey,
    };
  });
}

function completeAttachment(attachment: Record<string, unknown>) {
  return {
    ...attachment,
    body: optionalString(attachment.body) ?? optionalString(attachment.id),
  };
}

function dedupeAttachments(attachments: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${optionalString(attachment.id) ?? ""}|${optionalString(attachment.cid) ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wantsSearch(input: Record<string, unknown>) {
  if (input.unread === false) return true;
  return [
    "query",
    "folder",
    "label",
    "from",
    "to",
    "cc",
    "bcc",
    "subject",
    "hasAttachment",
    "startTime",
    "endTime",
  ].some((key) => input[key] !== undefined);
}

function buildTriageSearchBody(input: Record<string, unknown>) {
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
      input.startTime !== undefined || input.endTime !== undefined
        ? compact({
            start_time: optionalString(input.startTime),
            end_time: optionalString(input.endTime),
          })
        : undefined,
  });
  return compact({
    query: optionalString(input.query),
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });
}

function normalizeSearchItems(value: unknown) {
  return recordArray(value)
    .map((item) => {
      const metadata = recordValue(item.meta_data);
      const messageId = optionalString(metadata.message_biz_id ?? metadata.message_id ?? item.message_id);
      return messageId
        ? {
            messageId,
            threadId: optionalString(metadata.thread_id) ?? null,
            subject: optionalString(metadata.title ?? metadata.subject) ?? "",
            from: recordValue(metadata.from),
            date: optionalString(metadata.create_time) ?? null,
            labels: [],
            raw: item,
          }
        : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
}

function extractMessageIds(value: unknown) {
  return recordArray(value)
    .map((item) => optionalString(item.message_id ?? item.id))
    .filter((item): item is string => Boolean(item));
}

async function batchGetMetadata(mailboxId: string, messageIds: string[], request: FeishuJsonRequest) {
  const byId = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < messageIds.length; index += 20) {
    const batch = messageIds.slice(index, index + 20);
    const data = await request({
      method: "POST",
      path: mailboxPath(mailboxId, "messages", "batch_get"),
      body: { format: "metadata", message_ids: batch },
    });
    for (const message of recordArray(data.messages ?? data.items)) {
      const messageId = optionalString(message.message_id);
      if (messageId) byId.set(messageId, normalizeMessageMetadata(message));
    }
  }
  return messageIds.map(
    (messageId) =>
      byId.get(messageId) ?? {
        messageId,
        error: "metadata not returned by batch_get",
      },
  );
}

function normalizeMessageMetadata(message: Record<string, unknown>) {
  return {
    messageId: optionalString(message.message_id),
    threadId: optionalString(message.thread_id) ?? null,
    subject: optionalString(message.subject) ?? "",
    from: recordValue(message.head_from),
    date: optionalString(message.date ?? message.internal_date) ?? null,
    folderId: optionalString(message.folder_id) ?? null,
    labels: stringArray(message.label_ids),
    raw: message,
  };
}

function mergeLabels(messages: Record<string, unknown>[], metadata: Record<string, unknown>[]) {
  const byId = new Map(metadata.map((item) => [optionalString(item.messageId), stringArray(item.labels)]));
  for (const message of messages) {
    message.labels = byId.get(optionalString(message.messageId)) ?? [];
  }
}

interface TriageToken {
  readonly source: "list" | "search";
  readonly token: string;
}

function parseTriageToken(value: string | undefined): TriageToken | undefined {
  if (!value) return undefined;
  const separator = value.indexOf(":");
  const source = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if ((source !== "list" && source !== "search") || separator < 1 || !token) {
    throw providerInputError("pageToken must start with list: or search:");
  }
  return { source, token };
}

function assignIfPresent(
  target: Record<string, unknown>,
  targetKey: string,
  source: Record<string, unknown>,
  sourceKey: string,
) {
  if (sourceKey in source) target[targetKey] = source[sourceKey];
}

function extractDraftId(data: Record<string, unknown>) {
  const draft = recordValue(data.draft);
  return requiredProviderString(data.draft_id ?? data.id ?? draft.draft_id, "draft_id");
}

function mailboxPath(mailboxId: string, ...parts: string[]) {
  return `/mail/v1/user_mailboxes/${[mailboxId, ...parts].map(encodeURIComponent).join("/")}`;
}

function address(value: unknown) {
  if (typeof value === "string") return optionalString(value);
  const object = recordValue(value);
  return optionalString(object.mail_address ?? object.email);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function optionalStringArray(value: unknown) {
  const values = stringArray(value);
  return values.length > 0 ? values : undefined;
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

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw providerInputError(`${field} must be a non-empty string`);
  return result;
}

function requiredProviderString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(502, `Feishu response is missing ${field}`);
  }
  return result;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
