import iconv from "iconv-lite";
import { Buffer } from "node:buffer";
import { providerInputError, providerResponseError, ProviderRequestError } from "../provider-runtime.ts";
import { gmailMaxMimeBytes } from "./limits.ts";

/** Supplied file content after resolving a Base64 string or a transit file reference. */
export interface GmailMimeAttachment {
  filename?: string;
  mimeType: string;
  contentBase64: string;
  contentId?: string;
  disposition: "inline" | "attachment";
}

interface MimeMessagePatch {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  isHtml?: boolean;
  from?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: GmailMimeAttachment[];
}

interface MimeMessageInput extends MimeMessagePatch {
  to: string[];
}

interface MimeHeader {
  name: string;
  value: string;
  raw: string;
}

interface MimeEntity {
  headers: MimeHeader[];
  body: string;
  raw: string;
  newline: string;
}

interface MimeContent {
  body: string;
  isHtml: boolean;
  inline: string[];
  attachments: string[];
  preamble: string;
  epilogue: string;
}

interface MultipartContent {
  parts: MimeEntity[];
  preamble: string;
  epilogue: string;
}

interface ParsedMimeHeader {
  token: string;
  parameters: Map<string, string>;
  duplicateParameters: boolean;
}

interface MimeReplyHeaders {
  encodedSubject: string;
  inReplyTo: string;
  references: string;
}

/** Read a draft's subject and reply identity without changing or traversing its MIME body. */
export function readMimeReplyHeaders(original: string): MimeReplyHeaders {
  const root = parseEntity(decodeRaw(original));
  return {
    encodedSubject: Buffer.from(headerValue(root, "Subject"), "latin1").toString("utf8"),
    inReplyTo: headerValue(root, "In-Reply-To"),
    references: headerValue(root, "References"),
  };
}

/** Decode RFC 2047 subject words from Gmail payload or raw MIME headers. */
export function decodeMimeSubject(value: string): string {
  const unfolded = value.replace(/\r?\n[ \t]+/g, " ");
  const joined = unfolded.replace(/(=\?[^?\s]+\?[bq]\?[^?]*\?=)[ \t]+(?==\?[^?\s]+\?[bq]\?[^?]*\?=)/gi, "$1");
  return joined.replace(
    /=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi,
    (_word, charset: string, encoding: string, text: string) => {
      const bytes =
        encoding.toLowerCase() === "b"
          ? Buffer.from(text, "base64")
          : Buffer.from(
              text
                .replace(/_/g, " ")
                .replace(/=([0-9a-f]{2})/gi, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))),
              "latin1",
            );
      try {
        // RFC 2231 adds an optional language tag to the charset token.
        const charsetName = charset.split("*", 1)[0]!;
        let decoder: TextDecoder;
        try {
          decoder = new TextDecoder(charsetName, { fatal: true });
        } catch {
          // Fall back for unsupported charsets, never for invalid bytes in a supported charset.
          return iconv.decode(bytes, charsetName);
        }
        return decoder.decode(bytes);
      } catch {
        throw providerResponseError("Gmail subject has an invalid or unsupported RFC 2047 encoded word");
      }
    },
  );
}

/** Encode a Gmail message with caller-supplied attachments and CID resources. */
export function encodeMimeMessage(input: MimeMessageInput): string {
  const headers = messageHeaders(input);
  const attachmentParts = (input.attachments ?? []).map(encodeAttachment);
  const inline = attachmentParts.filter((part) => part.inline).map((part) => part.raw);
  const attachments = attachmentParts.filter((part) => !part.inline).map((part) => part.raw);
  const content = composeContent(encodeBody(input.body ?? "", input.isHtml === true), inline, attachments);
  return encodeRaw([...headers, "MIME-Version: 1.0", content].join("\r\n"));
}

/**
 * Patch headers without touching the original MIME body. Explicit content edits
 * support ordinary mixed/related/alternative mail and keep opaque file parts.
 */
export function updateMimeMessage(original: string, patch: MimeMessagePatch): string {
  if (patch.isHtml !== undefined && patch.body === undefined) {
    throw providerInputError("isHtml requires body or messageBody when updating a draft");
  }
  const raw = decodeRaw(original);
  const root = parseEntity(raw);
  let headers = patchMessageHeaders(root.headers, patch, root.newline);
  if (patch.body === undefined && patch.attachments === undefined) {
    return encodeRaw(renderEntity(headers, root.body, root.newline));
  }

  const contentRoot = parseEntity(renderEntity(root.headers.filter(isContentHeader), root.body, root.newline));
  const existing = decomposeContent(contentRoot, patch.body !== undefined, 0, true);
  const body = patch.body === undefined ? existing.body : encodeBody(patch.body, patch.isHtml ?? existing.isHtml);
  let inline = existing.inline;
  let attachments = existing.attachments;
  if (patch.attachments !== undefined) {
    const parts = patch.attachments.map(encodeAttachment);
    inline = parts.filter((part) => part.inline).map((part) => part.raw);
    attachments = parts.filter((part) => !part.inline).map((part) => part.raw);
  } else {
    const contentIds = new Set<string>();
    for (const rawPart of inline) {
      const id = headerValue(parseEntity(rawPart), "Content-ID").trim();
      if (!id) continue;
      if (contentIds.has(id))
        throw unsupportedMime("retained inline parts have duplicate Content-ID; supply a replacement attachments list");
      contentIds.add(id);
    }
  }
  const content = composeContent(body, inline, attachments, existing.preamble, existing.epilogue);
  headers = headers.filter((header) => !isContentHeader(header) && header.name.toLowerCase() !== "mime-version");
  const rebuilt = parseEntity(content);
  const retainedHeaders = [...headers, ...rebuilt.headers].map((header) => header.raw.replace(/\r?\n/g, "\r\n"));
  retainedHeaders.push("MIME-Version: 1.0");
  return encodeRaw(`${retainedHeaders.join("\r\n")}\r\n\r\n${rebuilt.body}`);
}

/** Reject header delimiters before encoding can conceal them in an encoded word. */
function assertMimeHeaderValue(value: string, field: string): void {
  const allowsTab = field === "subject" || field === "In-Reply-To" || field === "References";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code <= 0x1f && !(code === 0x09 && allowsTab)) || code === 0x7f)
      throw providerInputError(`${field} must not contain control characters`);
  }
}

function messageHeaders(input: MimeMessagePatch): string[] {
  const headers: string[] = [];
  for (const [name, value] of headerValues(input)) {
    if (value !== undefined && (value !== "" || name === "Subject")) {
      headers.push(foldHeader(name, value));
    }
  }
  return headers;
}

function headerValues(input: MimeMessagePatch): Map<string, string | undefined> {
  if (input.inReplyTo !== undefined) assertMimeHeaderValue(input.inReplyTo, "In-Reply-To");
  if (input.references !== undefined) assertMimeHeaderValue(input.references, "References");
  return new Map([
    ["From", input.from === undefined ? undefined : encodeAddress(input.from)],
    ["To", input.to === undefined ? undefined : input.to.map(encodeAddress).join(", ")],
    ["Cc", input.cc === undefined ? undefined : input.cc.map(encodeAddress).join(", ")],
    ["Bcc", input.bcc === undefined ? undefined : input.bcc.map(encodeAddress).join(", ")],
    ["Subject", input.subject === undefined ? undefined : encodeWords(input.subject, "subject")],
    ["In-Reply-To", input.inReplyTo],
    ["References", input.references],
  ]);
}

function patchMessageHeaders(headers: MimeHeader[], patch: MimeMessagePatch, newline: string): MimeHeader[] {
  const result = [...headers];
  for (const [name, value] of headerValues(patch)) {
    if (value === undefined) continue;
    assertMimeHeaderValue(value.replace(/\r\n /g, " "), name);
    const index = result.findIndex((header) => header.name.toLowerCase() === name.toLowerCase());
    const retained = result.filter((header) => header.name.toLowerCase() !== name.toLowerCase());
    if (value !== "" || name === "Subject") {
      retained.splice(index < 0 ? retained.length : index, 0, {
        name,
        value,
        raw: foldHeader(name, value).replace(/\r\n/g, newline),
      });
    }
    result.splice(0, result.length, ...retained);
  }
  return result;
}

function encodeBody(body: string, isHtml: boolean): string {
  if (Buffer.byteLength(body, "utf8") > gmailMaxMimeBytes) throw tooLarge("Gmail message body");
  return `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${foldBase64(Buffer.from(body, "utf8").toString("base64"))}`;
}

/** Validate attachment header metadata for both input resolution and MIME encoding. */
export function assertMimeAttachmentMetadata(attachment: GmailMimeAttachment): void {
  assertMimeHeaderValue(attachment.mimeType, "attachment.mimeType");
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(attachment.mimeType)) {
    throw providerInputError("attachment.mimeType must be a type/subtype without parameters");
  }
  if (attachment.filename !== undefined) {
    assertMimeHeaderValue(attachment.filename, "attachment.filename");
    if (attachment.filename.length === 0) throw providerInputError("attachment.filename must not be empty");
    if (!attachment.filename.isWellFormed()) throw providerInputError("attachment.filename must contain valid Unicode");
  }
  if (attachment.contentId !== undefined) {
    assertMimeHeaderValue(attachment.contentId, "attachment.contentId");
    if (!/^[\x21-\x7e]+$/.test(attachment.contentId) || /[<>:]/.test(attachment.contentId)) {
      throw providerInputError("attachment.contentId must be a bare ASCII ID without cid: or angle brackets");
    }
  }
  if (attachment.disposition === "inline" && !attachment.contentId) {
    throw providerInputError("inline attachments require contentId");
  }
}

function encodeAttachment(attachment: GmailMimeAttachment): { raw: string; inline: boolean } {
  assertMimeAttachmentMetadata(attachment);
  const headers = [`Content-Type: ${attachment.mimeType}`, "Content-Transfer-Encoding: base64"];
  let disposition = `Content-Disposition: ${attachment.disposition}`;
  if (attachment.filename !== undefined) disposition += filenameParameters(attachment.filename);
  headers.push(disposition);
  if (attachment.contentId !== undefined) headers.push(`Content-ID: <${attachment.contentId}>`);
  if (headers.some((header) => header.split("\r\n").some((line) => Buffer.byteLength(line, "utf8") > 998))) {
    throw providerInputError("attachment headers exceed the MIME line length limit");
  }
  return {
    raw: `${headers.join("\r\n")}\r\n\r\n${foldBase64(attachment.contentBase64)}`,
    inline: attachment.disposition === "inline",
  };
}

function filenameParameters(filename: string): string {
  // Keep an ASCII fallback for older clients and RFC 2231 UTF-8 continuations for the actual name.
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .slice(0, 120)
    .replace(/[\\"]/g, "\\$&");
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const chunks = encoded.match(/(?:%[0-9a-f]{2}|[^%]){1,45}/gi) ?? [""];
  return `;\r\n filename="${fallback}"${chunks.map((chunk, index) => `;\r\n filename*${index}*=${index === 0 ? "UTF-8''" : ""}${chunk}`).join("")}`;
}

function composeContent(body: string, inline: string[], attachments: string[], preamble = "", epilogue = ""): string {
  let result = body;
  if (inline.length > 0) result = encodeMultipart("related", [result, ...inline]);
  if (attachments.length > 0) result = encodeMultipart("mixed", [result, ...attachments]);
  // A framing-only mixed wrapper retains MIME preambles/epilogues even after clearing all files.
  if (preamble || epilogue) {
    const parsed = parseEntity(result);
    if (mimeHeader(parsed, "Content-Type").token.startsWith("multipart/")) {
      result = renderEntity(parsed.headers, `${preamble}${parsed.body}${epilogue}`, parsed.newline);
    } else {
      result = encodeMultipart("mixed", [result], preamble, epilogue);
    }
  }
  return result;
}

function encodeMultipart(kind: string, parts: string[], preamble = "", epilogue = ""): string {
  let boundary: string;
  do {
    boundary = `oomol_${crypto.randomUUID()}`;
  } while (parts.some((part) => part.includes(boundary)) || preamble.includes(boundary) || epilogue.includes(boundary));
  const prefix = preamble && !preamble.endsWith("\n") ? `${preamble}\r\n` : preamble;
  const type =
    kind === "related" ? `; type="${mimeHeader(parseEntity(parts[0]!), "Content-Type").token || "text/plain"}"` : "";
  return `Content-Type: multipart/${kind}${type}; boundary="${boundary}"\r\n\r\n${prefix}${parts.map((part) => `--${boundary}\r\n${part}\r\n`).join("")}--${boundary}--\r\n${epilogue}`;
}

function decomposeContent(entity: MimeEntity, replaceBody: boolean, depth = 0, isRelatedRoot = false): MimeContent {
  if (depth > 20) throw unsupportedMime("MIME nesting is too deep");
  const type = mimeHeader(entity, "Content-Type");
  const empty: MimeContent = {
    body: entity.raw,
    isHtml: type.token === "text/html",
    inline: [],
    attachments: [],
    preamble: "",
    epilogue: "",
  };
  if (type.token === "text/plain" || type.token === "text/html" || type.token === "") {
    if (isAttachmentEntity(entity, isRelatedRoot)) throw unsupportedMime("the draft has no editable message body");
    return empty;
  }
  if (!["multipart/mixed", "multipart/related", "multipart/alternative"].includes(type.token)) {
    throw unsupportedMime(`content type ${type.token || "unknown"}`);
  }
  const multipart = parseMultipart(entity, type.parameters.get("boundary"));
  if (type.token === "multipart/alternative") {
    const alternatives = multipart.parts.map((part) => decomposeContent(part, replaceBody, depth + 1, true));
    if (alternatives.length === 0) throw unsupportedMime("empty multipart/alternative");
    const hasHtml = alternatives.some((part) => part.isHtml);
    return {
      body: replaceBody
        ? ""
        : renderEntity(
            entity.headers,
            renderOriginalMultipart(
              entity,
              multipart,
              alternatives.map((part) => part.body),
            ),
            entity.newline,
          ),
      isHtml: hasHtml,
      inline: alternatives.flatMap((part) => part.inline),
      attachments: alternatives.flatMap((part) => part.attachments),
      preamble: (replaceBody ? multipart.preamble : "") + alternatives.map((part) => part.preamble).join(""),
      epilogue: alternatives.map((part) => part.epilogue).join("") + (replaceBody ? multipart.epilogue : ""),
    };
  }

  let bodyIndex = 0;
  if (type.token === "multipart/related") {
    const start = type.parameters.get("start");
    if (start) {
      bodyIndex = multipart.parts.findIndex((part) => headerValue(part, "Content-ID").trim() === start.trim());
      if (bodyIndex < 0) throw unsupportedMime("multipart/related start does not identify its body");
    }
  } else {
    const candidates = multipart.parts
      .map((part, index) => (isBodyEntity(part, index === 0) ? index : -1))
      .filter((index) => index >= 0);
    if (candidates.length !== 1) throw unsupportedMime("multipart/mixed has an ambiguous message body");
    bodyIndex = candidates[0]!;
  }
  const bodyPart = multipart.parts[bodyIndex];
  if (!bodyPart) throw unsupportedMime("multipart body is missing");
  // Related roots may carry Content-ID to match the container's start parameter.
  const content = decomposeContent(bodyPart, replaceBody, depth + 1, true);
  for (let index = 0; index < multipart.parts.length; index++) {
    if (index === bodyIndex) continue;
    const part = multipart.parts[index]!;
    const inline = type.token === "multipart/related" || mimeHeader(part, "Content-Disposition").token === "inline";
    (inline ? content.inline : content.attachments).push(part.raw);
  }
  content.preamble = multipart.preamble + content.preamble;
  content.epilogue += multipart.epilogue;
  return content;
}

function isBodyEntity(entity: MimeEntity, isBodyRoot: boolean): boolean {
  if (isAttachmentEntity(entity, isBodyRoot)) return false;
  const type = mimeHeader(entity, "Content-Type").token;
  return (
    type === "text/plain" ||
    type === "text/html" ||
    type === "" ||
    ["multipart/alternative", "multipart/related", "multipart/mixed"].includes(type)
  );
}

function isAttachmentEntity(entity: MimeEntity, isRelatedRoot = false): boolean {
  const disposition = mimeHeader(entity, "Content-Disposition");
  const type = mimeHeader(entity, "Content-Type");
  return (
    disposition.token === "attachment" ||
    disposition.parameters.has("filename") ||
    [...disposition.parameters.keys()].some((key) => key.startsWith("filename*")) ||
    type.parameters.has("name") ||
    (!isRelatedRoot && headerValue(entity, "Content-ID") !== "")
  );
}

function parseEntity(raw: string): MimeEntity {
  let separator = /\r\n\r\n|\n\n/.exec(raw);
  if (raw.startsWith("\r\n") || raw.startsWith("\n")) separator = /^(?:\r\n|\n)/.exec(raw);
  // The CRLF introducing a multipart boundary may also finish an empty part's separator.
  if (!separator) separator = /(?:\r\n|\n)$/.exec(raw);
  if (!separator) throw providerResponseError("Gmail raw draft has no MIME header separator");
  const newline = separator[0].startsWith("\r") ? "\r\n" : "\n";
  const headerText = raw.slice(0, separator.index);
  const headers: MimeHeader[] = [];
  if (headerText) {
    for (const line of headerText.split(/\r?\n/)) {
      if (/^[ \t]/.test(line)) {
        const previous = headers.at(-1);
        if (!previous) throw providerResponseError("Gmail raw draft has an invalid folded header");
        previous.raw += newline + line;
        previous.value += " " + line.trim();
        continue;
      }
      const match = /^([!#$%&'*+.^_`|~a-z0-9-]+):[ \t]*(.*)$/i.exec(line);
      if (!match) throw providerResponseError("Gmail raw draft has an invalid MIME header");
      headers.push({ name: match[1]!, value: match[2]!, raw: line });
    }
  }
  return { headers, body: raw.slice(separator.index + separator[0].length), raw, newline };
}

function parseMultipart(entity: MimeEntity, boundary?: string): MultipartContent {
  if (!boundary || boundary.length > 70 || /[^\x20-\x7e]|[\r\n]/.test(boundary))
    throw unsupportedMime("invalid multipart boundary");
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const delimiters = [...entity.body.matchAll(new RegExp(`^--${escaped}(--)?[ \\t]*(?:\\r?\\n|$)`, "gm"))];
  if (
    delimiters.length < 2 ||
    delimiters[0]![1] ||
    !delimiters.at(-1)![1] ||
    delimiters.slice(0, -1).some((match) => match[1])
  ) {
    throw unsupportedMime("incomplete multipart boundaries");
  }
  if (delimiters.length > 1001) throw unsupportedMime("too many MIME parts");
  const parts = delimiters.slice(0, -1).map((delimiter, index) => {
    const start = delimiter.index! + delimiter[0].length;
    const next = delimiters[index + 1]!.index!;
    const end = entity.body.slice(0, next).endsWith("\r\n") ? next - 2 : next - 1;
    if (end < start) throw unsupportedMime("empty MIME part framing");
    return parseEntity(entity.body.slice(start, end));
  });
  const closing = delimiters.at(-1)!;
  return {
    parts,
    preamble: entity.body.slice(0, delimiters[0]!.index),
    epilogue: entity.body.slice(closing.index! + closing[0].length),
  };
}

function renderOriginalMultipart(entity: MimeEntity, multipart: MultipartContent, parts: string[]): string {
  const boundary = mimeHeader(entity, "Content-Type").parameters.get("boundary")!;
  return `${multipart.preamble}${parts.map((part) => `--${boundary}${entity.newline}${part}${entity.newline}`).join("")}--${boundary}--${entity.newline}${multipart.epilogue}`;
}

function mimeHeader(entity: MimeEntity, name: string): ParsedMimeHeader {
  const parsed = parseMimeHeader(headerValue(entity, name));
  if (parsed.duplicateParameters) throw unsupportedMime(`duplicate ${name} parameter`);
  return parsed;
}

/** Read MIME media types and quoted parameters from Gmail payload headers. */
export function parseMimeHeader(value: string): ParsedMimeHeader {
  const parameters = new Map<string, string>();
  let duplicateParameters = false;
  for (const match of value.matchAll(/;[ \t]*([a-z0-9*-]+)[ \t]*=[ \t]*(?:"((?:[^"\\]|\\.)*)"|([^; \t]+))/gi)) {
    const key = match[1]!.toLowerCase();
    if (parameters.has(key)) duplicateParameters = true;
    else parameters.set(key, match[2] === undefined ? match[3]! : match[2].replace(/\\(.)/g, "$1"));
  }
  return { token: value.split(";", 1)[0]!.trim().toLowerCase(), parameters, duplicateParameters };
}

function headerValue(entity: MimeEntity, name: string): string {
  const values = entity.headers.filter((header) => header.name.toLowerCase() === name.toLowerCase());
  if (values.length > 1) throw unsupportedMime(`duplicate ${name} header`);
  return values[0]?.value ?? "";
}

function isContentHeader(header: MimeHeader): boolean {
  return header.name.toLowerCase().startsWith("content-");
}

function renderHeaders(headers: MimeHeader[], newline: string): string {
  return headers.map((header) => header.raw).join(newline);
}

function renderEntity(headers: MimeHeader[], body: string, newline: string): string {
  const prefix = headers.length > 0 ? `${renderHeaders(headers, newline)}${newline}` : "";
  return `${prefix}${newline}${body}`;
}

function encodeAddress(address: string): string {
  assertMimeHeaderValue(address, "email address");
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(address);
  if (match && /[^\x20-\x7f]/.test(match[1]!)) {
    const displayName = match[1]!.trim().replace(/^"(.*)"$/, "$1");
    return `${encodeWords(displayName, "display name")} <${match[2]}>`;
  }
  return address;
}

function encodeWords(value: string, field: string): string {
  assertMimeHeaderValue(value, field);
  if (!/[^\x20-\x7f]/.test(value) && !/=\?[^?\s]+\?[bq]\?[^?]*\?=/i.test(value)) return value;
  const chunks: string[] = [];
  let current = "";
  for (const char of value) {
    if (Buffer.byteLength(current + char, "utf8") > 45) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks.map((chunk) => `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`).join("\r\n ");
}

function foldHeader(name: string, value: string): string {
  // Only our RFC 2047 folds are permitted; raw caller values were checked before encoding.
  assertMimeHeaderValue(value.replace(/\r\n /g, " "), name);
  let line = `${name}:`;
  const lines: string[] = [];
  for (const word of value.replace(/\r\n /g, " ").split(" ")) {
    if (Buffer.byteLength(`${line} ${word}`, "utf8") > 78 && line !== `${name}:`) {
      lines.push(line);
      line = "";
    }
    line += ` ${word}`;
    if (Buffer.byteLength(line, "utf8") > 998) throw providerInputError(`${name} exceeds the MIME line length limit`);
  }
  lines.push(line);
  return Buffer.from(lines.join("\r\n"), "utf8").toString("latin1");
}

function foldBase64(value: string): string {
  return value.replace(/.{76}(?=.)/g, "$&\r\n");
}

function encodeRaw(raw: string): string {
  if (raw.length > gmailMaxMimeBytes) throw tooLarge("Gmail MIME message");
  const bytes = Buffer.from(raw, "latin1");
  if (bytes.byteLength > gmailMaxMimeBytes) throw tooLarge("Gmail MIME message");
  return bytes.toString("base64url");
}

function decodeRaw(encoded: string): string {
  if (encoded.length > Math.ceil((gmailMaxMimeBytes * 4) / 3) + 4) throw tooLarge("Gmail raw draft");
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded.replace(/=+$/, ""))
    throw providerResponseError("Gmail raw draft is not valid base64url");
  if (bytes.byteLength > gmailMaxMimeBytes) throw tooLarge("Gmail raw draft");
  return bytes.toString("latin1");
}

function unsupportedMime(reason: string): Error {
  return providerInputError(
    `Cannot safely edit this draft's MIME content: ${reason}. Header-only updates are supported.`,
  );
}

function tooLarge(field: string): ProviderRequestError {
  return new ProviderRequestError(413, `${field} exceeds ${gmailMaxMimeBytes} bytes`);
}
