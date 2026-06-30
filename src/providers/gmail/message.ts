export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: {
    attachmentId?: string;
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessageResource {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  raw?: string;
  payload?: GmailMessagePart;
}

export interface GmailDraftResource {
  id: string;
  message: GmailMessageResource;
}

export interface GmailThreadResource {
  id: string;
  historyId?: string;
  snippet?: string;
  messages?: GmailMessageResource[];
}

export interface GmailAttachmentSummary {
  attachmentId: string | null;
  filename: string;
  mimeType: string;
  size: number;
}

export interface NormalizedGmailMessage {
  messageId: string;
  threadId: string;
  labelIds: string[];
  subject: string;
  sender: string;
  to: string;
  preview: {
    subject: string;
    body: string;
  };
  payload: GmailMessagePart | null;
  messageText: string;
  attachmentList: GmailAttachmentSummary[];
  messageTimestamp: string;
  raw?: string;
}

export interface GmailMessageSummary {
  messageId: string;
  threadId: string;
  labelIds: string[];
  subject: string;
  sender: string;
  to: string;
  messageTimestamp: string;
}

export interface MimeMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  isHtml?: boolean;
  from?: string;
  inReplyTo?: string;
  references?: string;
}

export function summarizeGmailMessage(resource: GmailMessageResource): GmailMessageSummary {
  const headers = resource.payload?.headers ?? [];
  return {
    messageId: resource.id,
    threadId: resource.threadId,
    labelIds: resource.labelIds ?? [],
    subject: readHeader(headers, "Subject"),
    sender: readHeader(headers, "From"),
    to: readHeader(headers, "To"),
    messageTimestamp: toMessageTimestamp(resource.internalDate, readHeader(headers, "Date")),
  };
}

export function normalizeGmailMessage(resource: GmailMessageResource): NormalizedGmailMessage {
  const payload = resource.payload ?? null;
  const summary = summarizeGmailMessage(resource);
  const messageText = extractBodyContent(payload).body;

  return {
    ...summary,
    preview: {
      subject: summary.subject,
      body: resource.snippet ?? messageText.slice(0, 200),
    },
    payload,
    messageText,
    attachmentList: collectAttachments(payload),
    ...(resource.raw ? { raw: resource.raw } : {}),
  };
}

export function readHeader(headers: GmailMessageHeader[], name: string): string {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function resolveReplyHeaders(resource: GmailMessageResource): {
  subject: string;
  to: string;
  references: string;
  inReplyTo: string;
} {
  const headers = resource.payload?.headers ?? [];
  return {
    subject: normalizeReplySubject(readHeader(headers, "Subject")),
    to: firstAddress(readHeader(headers, "Reply-To")) || firstAddress(readHeader(headers, "From")),
    references:
      readHeader(headers, "References") || readHeader(headers, "Message-ID") || resource.id,
    inReplyTo: readHeader(headers, "Message-ID") || resource.id,
  };
}

export function encodeMimeMessage(input: MimeMessageInput): string {
  const headers = [
    headerLine("From", joinAddresses(input.from ? [input.from] : [])),
    headerLine("To", joinAddresses(input.to)),
    headerLine("Cc", joinAddresses(input.cc ?? [])),
    headerLine("Bcc", joinAddresses(input.bcc ?? [])),
    headerLine("Subject", encodeSubject(input.subject ?? "")),
    headerLine("In-Reply-To", input.inReplyTo),
    headerLine("References", input.references),
    "MIME-Version: 1.0",
    `Content-Type: ${input.isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);

  const body = Buffer.from(input.body ?? "", "utf8").toString("base64");
  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function parseAddressList(value: string): string[] {
  const addresses: string[] = [];
  let current = "";
  let inQuotes = false;
  let angleDepth = 0;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      if (inQuotes) {
        escaped = true;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes) {
      if (char === "<") {
        angleDepth += 1;
      } else if (char === ">" && angleDepth > 0) {
        angleDepth -= 1;
      } else if (char === "," && angleDepth === 0) {
        const address = current.trim();
        if (address) {
          addresses.push(address);
        }
        current = "";
        continue;
      }
    }

    current += char;
  }

  const address = current.trim();
  if (address) {
    addresses.push(address);
  }

  return addresses;
}

export function firstAddress(value: string): string {
  return parseAddressList(value)[0] ?? "";
}

export function extractBodyContent(payload: GmailMessagePart | null): {
  body: string;
  isHtml: boolean;
} {
  if (!payload) {
    return { body: "", isHtml: false };
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return {
      body: decodeBase64Url(payload.body.data),
      isHtml: false,
    };
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return {
      body: decodeBase64Url(payload.body.data),
      isHtml: true,
    };
  }

  for (const part of payload.parts ?? []) {
    const content = extractBodyContent(part);
    if (content.body) {
      return content;
    }
  }

  if (payload.body?.data && (!payload.mimeType || payload.mimeType.startsWith("text/"))) {
    return {
      body: decodeBase64Url(payload.body.data),
      isHtml: payload.mimeType === "text/html",
    };
  }

  return { body: "", isHtml: false };
}

export function normalizeThreadId(value: unknown): string {
  return String(value ?? "")
    .replace(/^thread-f:/i, "")
    .replace(/^msg-f:/i, "")
    .trim();
}

export function normalizeMessageId(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildRecipients(input: {
  to?: unknown;
  recipientEmail?: unknown;
  extraRecipients?: unknown;
  cc?: unknown;
  bcc?: unknown;
}): { to: string[]; cc: string[]; bcc: string[] } {
  const primaryTo = optionalAddressList(input.to);
  const recipientEmail = optionalAddressList(input.recipientEmail);
  const extraRecipients = optionalAddressList(input.extraRecipients);

  return {
    to: [...primaryTo, ...recipientEmail, ...extraRecipients],
    cc: optionalAddressList(input.cc),
    bcc: optionalAddressList(input.bcc),
  };
}

function collectAttachments(payload: GmailMessagePart | null): GmailAttachmentSummary[] {
  if (!payload) {
    return [];
  }

  const attachments: GmailAttachmentSummary[] = [];
  if (payload.filename) {
    attachments.push({
      attachmentId: payload.body?.attachmentId ?? null,
      filename: payload.filename,
      mimeType: payload.mimeType ?? "application/octet-stream",
      size: payload.body?.size ?? 0,
    });
  }

  for (const part of payload.parts ?? []) {
    attachments.push(...collectAttachments(part));
  }

  return attachments;
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function toMessageTimestamp(internalDate?: string, fallbackDate?: string) {
  if (internalDate) {
    const parsed = Number(internalDate);
    if (Number.isFinite(parsed)) {
      const date = new Date(parsed);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  if (fallbackDate) {
    const parsed = new Date(fallbackDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return "";
}

function normalizeReplySubject(subject: string) {
  if (!subject) {
    return "Re:";
  }

  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function encodeSubject(subject: string) {
  return subject.split("").every((char) => char.charCodeAt(0) <= 0x7f)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function joinAddresses(addresses: string[]) {
  return addresses.filter(Boolean).join(", ");
}

function headerLine(name: string, value?: string) {
  return value ? `${name}: ${value}` : "";
}

function optionalAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const stringValue = String(value ?? "").trim();
  return stringValue ? [stringValue] : [];
}
