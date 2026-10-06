import { parseMimeHeader } from "./mime.ts";

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
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
  sizeEstimate?: number;
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
  partId: string | null;
  contentId: string | null;
  disposition: "inline" | "attachment" | null;
}

export interface NormalizedGmailMessage extends GmailMessageSummary {
  preview: {
    subject: string;
    body: string;
  };
  payload: GmailMessagePart | null;
  messageText: string;
  attachmentList: GmailAttachmentSummary[];
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
  historyId?: string;
  internalDate?: string;
  sizeEstimate?: number;
  snippet?: string;
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
    historyId: resource.historyId,
    internalDate: resource.internalDate,
    sizeEstimate: resource.sizeEstimate,
    snippet: resource.snippet,
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
    attachmentList: collectAttachments(payload, true),
    raw: resource.raw,
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
    references: readHeader(headers, "References") || readHeader(headers, "Message-ID") || resource.id,
    inReplyTo: readHeader(headers, "Message-ID") || resource.id,
  };
}

function parseAddressList(value: string): string[] {
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

function firstAddress(value: string): string {
  return parseAddressList(value)[0] ?? "";
}

interface GmailBodyContent {
  body: string;
  isHtml: boolean;
}

export function extractBodyContent(payload: GmailMessagePart | null): GmailBodyContent {
  return extractPartBody(payload, true);
}

function extractPartBody(payload: GmailMessagePart | null, isBodyRoot: boolean): GmailBodyContent {
  if (!payload || isAttachmentPart(payload, isBodyRoot)) {
    return { body: "", isHtml: false };
  }

  const mimeType = payload.mimeType?.toLowerCase();
  if (mimeType === "multipart/related") {
    return extractPartBody(bodyRootPart(payload) ?? null, true);
  }
  if ((mimeType === "text/plain" || mimeType === "text/html") && payload.body?.data !== undefined) {
    return {
      body: decodeBase64Url(payload.body.data),
      isHtml: mimeType === "text/html",
    };
  }

  let fallback = { body: "", isHtml: false };
  const bodyRoot = bodyRootPart(payload);
  for (const part of payload.parts ?? []) {
    const content = extractPartBody(part, mimeType === "multipart/alternative" || part === bodyRoot);
    if (content.isHtml) {
      return content;
    }
    if (!fallback.body && content.body) {
      fallback = content;
    }
  }
  if (fallback.body) {
    return fallback;
  }

  if (payload.body?.data !== undefined && (!mimeType || mimeType.startsWith("text/"))) {
    return {
      body: decodeBase64Url(payload.body.data),
      isHtml: mimeType === "text/html",
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

interface RecipientsInput {
  to?: unknown;
  recipientEmail?: unknown;
  extraRecipients?: unknown;
  cc?: unknown;
  bcc?: unknown;
}

interface Recipients {
  to: string[];
  cc: string[];
  bcc: string[];
}

export function buildRecipients(input: RecipientsInput): Recipients {
  const primaryTo = optionalAddressList(input.to);
  const recipientEmail = optionalAddressList(input.recipientEmail);
  const extraRecipients = optionalAddressList(input.extraRecipients);

  return {
    to: [...primaryTo, ...recipientEmail, ...extraRecipients],
    cc: optionalAddressList(input.cc),
    bcc: optionalAddressList(input.bcc),
  };
}

function collectAttachments(payload: GmailMessagePart | null, isBodyRoot: boolean): GmailAttachmentSummary[] {
  if (!payload) {
    return [];
  }

  const attachments: GmailAttachmentSummary[] = [];
  if (isAttachmentPart(payload, isBodyRoot)) {
    attachments.push({
      attachmentId: payload.body?.attachmentId ?? null,
      filename: payload.filename ?? "",
      mimeType: payload.mimeType ?? "application/octet-stream",
      size: payload.body?.size ?? 0,
      partId: payload.partId ?? null,
      contentId: readPartContentId(payload),
      disposition: readPartDisposition(payload),
    });
  }

  const bodyRoot = bodyRootPart(payload);
  const isAlternative = payload.mimeType?.toLowerCase() === "multipart/alternative";
  for (const part of payload.parts ?? []) {
    attachments.push(...collectAttachments(part, isAlternative || part === bodyRoot));
  }

  return attachments;
}

function readPartContentId(part: GmailMessagePart): string | null {
  return normalizeContentId(readHeader(part.headers ?? [], "Content-ID"));
}

function normalizeContentId(input: string): string | null {
  const value = input.trim();
  const contentId = value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1).trim() : value;
  return contentId || null;
}

function bodyRootPart(part: GmailMessagePart): GmailMessagePart | undefined {
  const mimeType = part.mimeType?.toLowerCase();
  if (mimeType === "multipart/mixed") {
    const first = part.parts?.[0];
    const firstMimeType = first?.mimeType?.toLowerCase() ?? "";
    return firstMimeType === "text/plain" || firstMimeType === "text/html" || firstMimeType.startsWith("multipart/")
      ? first
      : undefined;
  }
  if (mimeType !== "multipart/related") return undefined;
  const type = parseMimeHeader(readHeader(part.headers ?? [], "Content-Type").replace(/\r?\n[ \t]+/g, " "));
  const start = type.parameters.get("start");
  if (start === undefined) return part.parts?.[0];
  const startId = normalizeContentId(start);
  return startId ? part.parts?.find((child) => readPartContentId(child) === startId) : undefined;
}

function readPartDisposition(part: GmailMessagePart): "inline" | "attachment" | null {
  const value = readHeader(part.headers ?? [], "Content-Disposition")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return value === "inline" || value === "attachment" ? value : null;
}

function isAttachmentPart(part: GmailMessagePart, isBodyRoot: boolean): boolean {
  const disposition = readPartDisposition(part);
  const mimeType = part.mimeType?.toLowerCase() ?? "";
  const isBodyRepresentation =
    isBodyRoot && (!mimeType || mimeType.startsWith("text/") || mimeType.startsWith("multipart/"));
  return Boolean(
    part.filename ||
    (!isBodyRepresentation && readPartContentId(part)) ||
    disposition === "attachment" ||
    (disposition === "inline" && !mimeType.startsWith("text/") && !mimeType.startsWith("multipart/")),
  );
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

function optionalAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const stringValue = String(value ?? "").trim();
  return stringValue ? [stringValue] : [];
}
