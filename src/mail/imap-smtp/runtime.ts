import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  RuntimeLogger,
  TransitFileWriter,
} from "../../core/types.ts";
import type { MailActionName } from "./actions.ts";
import type { MailCredential, MailFetchedMessage, MailProtocol, MailSendInput } from "./protocol.ts";

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  requireCustomCredential,
} from "../../providers/provider-runtime.ts";
import { mailConnectionTimeoutMs, mailImapPort, mailMessageFetchByteLimit, mailSmtpPort } from "./config.ts";
import { MailProtocolError } from "./errors.ts";
import { sanitizeTempFileName } from "./temp-files.ts";

const defaultFolder = "INBOX";
const defaultLimit = 20;
const mailSendAttachmentByteLimit = 25 * 1024 * 1024;

export interface MailRuntimeConfig {
  service: string;
  displayName: string;
  attachmentFallbackPrefix: string;
  connectAuthMessage: string;
  readCredential(values: Record<string, string>): MailCredential;
}

export interface MailActionContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
  protocol: MailProtocol;
  config: MailRuntimeConfig;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

type MailActionHandler = (input: Record<string, unknown>, context: MailActionContext) => Promise<unknown>;
type MailProtocolLoader = () => Promise<MailProtocol> | MailProtocol;

function createMailActionHandlers(): Record<MailActionName, MailActionHandler> {
  return {
    send_email(input, context) {
      return executeMailAction("send_email", input, context);
    },
    list_folders(input, context) {
      return executeMailAction("list_folders", input, context);
    },
    search_emails(input, context) {
      return executeMailAction("search_emails", input, context);
    },
    get_email(input, context) {
      return executeMailAction("get_email", input, context);
    },
    download_attachment(input, context) {
      return executeMailAction("download_attachment", input, context);
    },
    mark_email_read(input, context) {
      return executeMailAction("mark_email_read", input, context);
    },
    mark_email_unread(input, context) {
      return executeMailAction("mark_email_unread", input, context);
    },
    move_email(input, context) {
      return executeMailAction("move_email", input, context);
    },
    delete_email(input, context) {
      return executeMailAction("delete_email", input, context);
    },
    get_folder_status(input, context) {
      return executeMailAction("get_folder_status", input, context);
    },
    reply_email(input, context) {
      return executeMailAction("reply_email", input, context);
    },
    forward_email(input, context) {
      return executeMailAction("forward_email", input, context);
    },
  };
}

export interface MailProviderRuntime {
  executors: ProviderExecutors;
  credentialValidators: CredentialValidators;
}

export function createMailProviderRuntime(config: MailRuntimeConfig): MailProviderRuntime {
  let protocolPromise: Promise<MailProtocol> | undefined;
  const loadProtocol = (): Promise<MailProtocol> => {
    protocolPromise ??= import("./protocol.ts").then(({ createMailProtocol }) =>
      createMailProtocol({
        displayName: config.displayName,
        attachmentFallbackPrefix: config.attachmentFallbackPrefix,
      }),
    );
    return protocolPromise;
  };

  const executors = defineProviderExecutors<MailActionContext>({
    service: config.service,
    handlers: createMailActionHandlers(),
    async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MailActionContext> {
      const credential = await requireCustomCredential(context, config.service);
      const providerContext: MailActionContext = {
        values: credential.values,
        fetcher,
        protocol: await loadProtocol(),
        config,
        signal: context.signal,
      };
      if (context.transitFiles) {
        providerContext.transitFiles = context.transitFiles;
      }
      return providerContext;
    },
  });

  const credentialValidators: CredentialValidators = {
    async customCredential(input, options): Promise<CredentialValidationResult> {
      return validateMailCredential(input.values, loadProtocol, config, options.logger);
    },
  };

  return { executors, credentialValidators };
}

async function validateMailCredential(
  values: Record<string, string>,
  loadProtocol: MailProtocolLoader,
  config: MailRuntimeConfig,
  logger?: RuntimeLogger,
): Promise<CredentialValidationResult> {
  const credential = config.readCredential(values);
  if (isCloudflareWorkerRuntime()) {
    throw new ProviderRequestError(
      400,
      `${config.displayName} requires a Node.js runtime because IMAP/SMTP connections are not reliable from Cloudflare Workers.`,
    );
  }

  const protocol = await loadProtocol();
  try {
    await validateMailPhase(config, "imap", credential.imapHost, mailImapPort, logger, () =>
      protocol.validateImapCredential(credential),
    );
    await validateMailPhase(config, "smtp", credential.smtpHost, mailSmtpPort, logger, () =>
      protocol.validateSmtpCredential(credential),
    );
  } catch (error) {
    throw mapProtocolError(error, "connect", config);
  }

  const normalizedEmail = credential.email.toLowerCase();
  return {
    profile: {
      accountId: normalizedEmail,
      displayName: credential.email,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      email: normalizedEmail,
      imapHost: credential.imapHost,
      smtpHost: credential.smtpHost,
    },
  };
}

function isCloudflareWorkerRuntime(): boolean {
  return typeof navigator === "object" && navigator.userAgent === "Cloudflare-Workers";
}

async function validateMailPhase(
  config: MailRuntimeConfig,
  phase: "imap" | "smtp",
  host: string,
  port: number,
  logger: RuntimeLogger | undefined,
  validate: () => Promise<void>,
): Promise<void> {
  const startedAt = Date.now();
  logger?.info(
    {
      service: config.service,
      phase,
      host,
      port,
      timeoutMs: mailConnectionTimeoutMs,
    },
    `${config.service} mail credential validation started`,
  );
  try {
    await validate();
    logger?.info(
      {
        service: config.service,
        phase,
        host,
        port,
        elapsedMs: Date.now() - startedAt,
      },
      `${config.service} mail credential validation completed`,
    );
  } catch (error) {
    logger?.warn(
      {
        service: config.service,
        phase,
        host,
        port,
        elapsedMs: Date.now() - startedAt,
        error: describeMailValidationError(error),
      },
      `${config.service} mail credential validation failed`,
    );
    throw error;
  }
}

function describeMailValidationError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const details = error as Error & { code?: unknown; kind?: unknown };
  return {
    name: error.name,
    message: error.message,
    code: typeof details.code === "string" ? details.code : undefined,
    kind: error instanceof MailProtocolError ? error.kind : typeof details.kind === "string" ? details.kind : undefined,
  };
}

export async function executeMailAction(
  actionName: MailActionName,
  input: Record<string, unknown>,
  context: MailActionContext,
): Promise<unknown> {
  const credential = context.config.readCredential(context.values);
  const protocol = context.protocol;
  try {
    switch (actionName) {
      case "send_email": {
        const prepared = await readSendInput(input as unknown as ParsedSendInput, context);
        try {
          return await protocol.sendMail(credential, prepared.sendInput);
        } finally {
          await prepared.cleanup();
        }
      }
      case "list_folders":
        return {
          folders: await protocol.listFolders(credential),
        };
      case "search_emails": {
        const searchInput = input as {
          folder?: string;
          limit?: number;
          beforeUid?: number;
        } & Record<string, unknown>;
        const folder = searchInput.folder ?? defaultFolder;
        const criteria = readSearchCriteria(searchInput);
        const { summaries, nextBeforeUid } = await protocol.searchSummaries(credential, folder, criteria, {
          limit: searchInput.limit ?? defaultLimit,
          ...(searchInput.beforeUid !== undefined ? { beforeUid: searchInput.beforeUid } : {}),
          peek: true,
        });
        return {
          folder,
          emails: summaries,
          nextBeforeUid,
        };
      }
      case "get_email": {
        const getInput = input as { folder?: string; uid: number };
        const folder = getInput.folder ?? defaultFolder;
        const message = await protocol.fetchMessage(credential, folder, getInput.uid, {
          peek: true,
          maxBytes: mailMessageFetchByteLimit,
          skipAttachmentBodies: true,
        });
        return {
          folder,
          uid: message.summary.uid,
          messageId: message.summary.messageId,
          subject: message.summary.subject,
          from: message.summary.from,
          to: message.summary.to,
          cc: message.cc,
          date: message.summary.date,
          flags: message.summary.flags,
          seen: message.summary.seen,
          text: message.text,
          html: message.html,
          truncated: message.truncated,
          attachments: message.attachments,
        };
      }
      case "download_attachment": {
        const downloadInput = input as {
          folder?: string;
          uid: number;
          attachmentId: string;
        };
        const folder = downloadInput.folder ?? defaultFolder;
        const attachment = await protocol.downloadAttachment(
          credential,
          folder,
          downloadInput.uid,
          downloadInput.attachmentId,
        );
        try {
          const transitFiles = requireTransitFiles(context);
          const name =
            attachment.filename ?? `${context.config.attachmentFallbackPrefix}-attachment-${attachment.attachmentId}`;
          const mimeType = attachment.contentType ?? "application/octet-stream";
          const upload = await transitFiles.create(
            new File([await readFile(attachment.filePath)], name, { type: mimeType }),
          );
          return {
            folder,
            uid: downloadInput.uid,
            attachmentId: attachment.attachmentId,
            size: attachment.size,
            file: {
              fileId: upload.fileId,
              downloadUrl: upload.downloadUrl,
              name,
              mimeType,
              sizeBytes: upload.sizeBytes,
            },
          };
        } finally {
          await attachment.cleanup();
        }
      }
      case "mark_email_read": {
        const markInput = input as { folder?: string; uid: number };
        const folder = markInput.folder ?? defaultFolder;
        await protocol.markSeen(credential, folder, markInput.uid);
        return {
          folder,
          uid: markInput.uid,
          read: true,
        };
      }
      case "mark_email_unread": {
        const markInput = input as { folder?: string; uid: number };
        const folder = markInput.folder ?? defaultFolder;
        await protocol.markUnseen(credential, folder, markInput.uid);
        return {
          folder,
          uid: markInput.uid,
          read: false,
        };
      }
      case "move_email": {
        const moveInput = input as {
          folder?: string;
          uid: number;
          targetFolder: string;
        };
        const folder = moveInput.folder ?? defaultFolder;
        await protocol.moveMessage(credential, folder, moveInput.uid, moveInput.targetFolder);
        return {
          folder,
          uid: moveInput.uid,
          targetFolder: moveInput.targetFolder,
          moved: true,
        };
      }
      case "delete_email": {
        const deleteInput = input as { folder?: string; uid: number };
        const folder = deleteInput.folder ?? defaultFolder;
        await protocol.deleteMessage(credential, folder, deleteInput.uid);
        return {
          folder,
          uid: deleteInput.uid,
          deleted: true,
        };
      }
      case "get_folder_status": {
        const statusInput = input as { folder?: string };
        return await protocol.getFolderStatus(credential, statusInput.folder ?? defaultFolder);
      }
      case "reply_email": {
        const replyInput = input as unknown as ParsedReplyInput;
        replyInput.folder = replyInput.folder ?? defaultFolder;
        replyInput.replyAll = replyInput.replyAll ?? false;
        const original = await protocol.fetchMessage(credential, replyInput.folder, replyInput.uid, {
          peek: true,
          maxBytes: mailMessageFetchByteLimit,
          skipAttachmentBodies: true,
        });
        const prepared = await buildReplySendInput(credential, original, replyInput, context);
        try {
          return await protocol.sendMail(credential, prepared.sendInput);
        } finally {
          await prepared.cleanup();
        }
      }
      case "forward_email": {
        const forwardInput = input as unknown as ParsedForwardInput;
        forwardInput.folder = forwardInput.folder ?? defaultFolder;
        const original = await protocol.fetchMessage(credential, forwardInput.folder, forwardInput.uid, {
          peek: true,
          maxBytes: mailMessageFetchByteLimit,
          skipAttachmentBodies: true,
        });
        const prepared = await buildForwardSendInput(original, forwardInput, context);
        try {
          return await protocol.sendMail(credential, prepared.sendInput);
        } finally {
          await prepared.cleanup();
        }
      }
    }
  } catch (error) {
    throw mapProtocolError(error, "execute", context.config);
  }
}

interface ParsedOutgoingAttachment {
  filename: string;
  contentType?: string;
  contentUrl: string;
}

interface ParsedSendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: ParsedOutgoingAttachment[];
}

interface ParsedReplyInput {
  folder: string;
  uid: number;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyAll: boolean;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: ParsedOutgoingAttachment[];
}

interface ParsedForwardInput {
  folder: string;
  uid: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: ParsedOutgoingAttachment[];
}

interface PreparedSendInput {
  sendInput: MailSendInput;
  cleanup(): Promise<void>;
}

async function readSendInput(input: ParsedSendInput, context: MailActionContext): Promise<PreparedSendInput> {
  const resolvedAttachments = input.attachments ? await resolveOutgoingAttachments(input.attachments, context) : null;

  return {
    sendInput: {
      to: input.to,
      ...(input.cc ? { cc: input.cc } : {}),
      ...(input.bcc ? { bcc: input.bcc } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      subject: input.subject,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.html !== undefined ? { html: input.html } : {}),
      ...(resolvedAttachments ? { attachments: resolvedAttachments.attachments } : {}),
    },
    cleanup: resolvedAttachments?.cleanup ?? noop,
  };
}

async function resolveOutgoingAttachments(attachments: ParsedOutgoingAttachment[], context: MailActionContext) {
  const resolved = [];
  const cleanups: Array<() => Promise<void>> = [];

  try {
    for (const attachment of attachments) {
      const url = assertPublicHttpUrl(attachment.contentUrl, {
        fieldName: "attachments.contentUrl",
        createError: (message) => new ProviderRequestError(400, message),
      });
      const response = await context.fetcher(url, { signal: context.signal });
      if (!response.ok) {
        throw new ProviderRequestError(
          400,
          `${context.config.displayName} attachment URL returned HTTP ${response.status}.`,
        );
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength !== null && Number(contentLength) > mailSendAttachmentByteLimit) {
        throw new ProviderRequestError(400, `${context.config.displayName} attachment is too large.`);
      }

      if (!response.body) {
        throw new ProviderRequestError(
          400,
          `${context.config.displayName} attachment URL did not return a readable body.`,
        );
      }

      const { filePath, cleanup } = await writeWebStreamToTempFile(
        response.body,
        attachment.filename,
        `oomol-connect-${context.config.attachmentFallbackPrefix}-send-`,
        mailSendAttachmentByteLimit,
        context.config.displayName,
      );
      cleanups.push(cleanup);

      const contentType = attachment.contentType ?? response.headers.get("content-type");
      resolved.push({
        filename: attachment.filename,
        ...(contentType ? { contentType } : {}),
        filePath,
      });
    }
  } catch (error) {
    await cleanupAll(cleanups);
    throw error;
  }

  return {
    attachments: resolved,
    cleanup: async () => {
      await cleanupAll(cleanups);
    },
  };
}

async function buildReplySendInput(
  credential: MailCredential,
  original: MailFetchedMessage,
  input: ParsedReplyInput,
  context: MailActionContext,
): Promise<PreparedSendInput> {
  const to = input.to ?? inferReplyRecipients(credential, original, input.replyAll);
  if (to.length === 0) {
    throw new ProviderRequestError(400, `${context.config.displayName} reply recipient is unavailable.`);
  }

  const cc = input.cc ?? (input.replyAll ? filterRecipientEmails(original.cc, credential.email) : undefined);
  const resolvedAttachments = input.attachments ? await resolveOutgoingAttachments(input.attachments, context) : null;
  return {
    sendInput: {
      to,
      ...(cc && cc.length > 0 ? { cc } : {}),
      ...(input.bcc ? { bcc: input.bcc } : {}),
      subject: input.subject ?? prefixSubject("Re:", original.summary.subject),
      ...(input.text !== undefined ? { text: buildReplyText(input.text, original) } : {}),
      ...(input.html !== undefined ? { html: buildReplyHtml(input.html, original) } : {}),
      ...(original.summary.messageId
        ? {
            inReplyTo: original.summary.messageId,
            references: original.summary.messageId,
          }
        : {}),
      ...(resolvedAttachments ? { attachments: resolvedAttachments.attachments } : {}),
    },
    cleanup: resolvedAttachments?.cleanup ?? noop,
  };
}

async function buildForwardSendInput(
  original: MailFetchedMessage,
  input: ParsedForwardInput,
  context: MailActionContext,
): Promise<PreparedSendInput> {
  const resolvedAttachments = input.attachments ? await resolveOutgoingAttachments(input.attachments, context) : null;

  return {
    sendInput: {
      to: input.to,
      ...(input.cc ? { cc: input.cc } : {}),
      ...(input.bcc ? { bcc: input.bcc } : {}),
      subject: input.subject ?? prefixSubject("Fwd:", original.summary.subject),
      text: buildForwardText(input.text, original),
      html: buildForwardHtml(input.html, original),
      ...(resolvedAttachments ? { attachments: resolvedAttachments.attachments } : {}),
    },
    cleanup: resolvedAttachments?.cleanup ?? noop,
  };
}

async function writeWebStreamToTempFile(
  stream: ReadableStream<Uint8Array>,
  name: string,
  prefix: string,
  maxBytes: number,
  displayName: string,
) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const filePath = join(directory, `${randomUUID()}-${sanitizeTempFileName(name)}`);

  try {
    await pipeline(
      Readable.fromWeb(stream as never),
      createByteLimitTransform(maxBytes, displayName),
      createWriteStream(filePath),
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return {
    filePath,
    cleanup: async () => {
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    },
  };
}

function createByteLimitTransform(maxBytes: number, displayName: string) {
  let totalBytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        callback(new ProviderRequestError(400, `${displayName} attachment is too large.`));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function cleanupAll(cleanups: Array<() => Promise<void>>) {
  await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
}

function noop() {
  return Promise.resolve();
}

function requireTransitFiles(context: MailActionContext) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }
  return context.transitFiles;
}

function inferReplyRecipients(credential: MailCredential, original: MailFetchedMessage, replyAll: boolean) {
  const directRecipients =
    original.replyTo.length > 0 ? original.replyTo : original.summary.from ? [original.summary.from] : [];
  const recipients = [...directRecipients, ...(replyAll ? original.summary.to : [])];
  return filterRecipientEmails(recipients, credential.email);
}

function filterRecipientEmails(addresses: Array<{ email: string | null }>, connectedEmail: string) {
  const seen = new Set<string>();
  const emails = [];
  const self = connectedEmail.toLowerCase();
  for (const address of addresses) {
    const email = address.email;
    if (!email) {
      continue;
    }
    const key = email.toLowerCase();
    if (key === self || seen.has(key)) {
      continue;
    }
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

function prefixSubject(prefix: string, subject: string | null) {
  const value = subject ?? "";
  return value.toLowerCase().startsWith(prefix.toLowerCase()) ? value : `${prefix} ${value}`.trim();
}

function buildReplyText(replyText: string, original: MailFetchedMessage) {
  const quote = quotePlain(original.text);
  if (!quote) {
    return replyText;
  }

  return `${replyText}\n\nOn ${original.summary.date ?? "an unknown date"}, ${formatAddress(
    original.summary.from,
  )} wrote:\n${quote}`;
}

function buildReplyHtml(replyHtml: string, original: MailFetchedMessage) {
  const quoted = original.html ?? (original.text ? `<pre>${escapeHtml(original.text)}</pre>` : "");
  if (!quoted) {
    return replyHtml;
  }

  return `${replyHtml}<br><br><blockquote>${quoted}</blockquote>`;
}

function buildForwardText(prefixText: string | undefined, original: MailFetchedMessage) {
  const header = [
    "---------- Forwarded message ---------",
    `From: ${formatAddress(original.summary.from)}`,
    `Date: ${original.summary.date ?? ""}`,
    `Subject: ${original.summary.subject ?? ""}`,
    `To: ${original.summary.to.map(formatAddress).join(", ")}`,
  ].join("\n");
  return [prefixText, `${header}\n\n${original.text ?? ""}`]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n");
}

function buildForwardHtml(prefixHtml: string | undefined, original: MailFetchedMessage) {
  const originalHtml = original.html ?? (original.text ? `<pre>${escapeHtml(original.text)}</pre>` : "");
  const header = `<p>---------- Forwarded message ---------<br>From: ${escapeHtml(
    formatAddress(original.summary.from),
  )}<br>Date: ${escapeHtml(original.summary.date ?? "")}<br>Subject: ${escapeHtml(
    original.summary.subject ?? "",
  )}<br>To: ${escapeHtml(original.summary.to.map(formatAddress).join(", "))}</p>`;
  return [prefixHtml, `${header}${originalHtml}`]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("<br><br>");
}

function quotePlain(text: string | null) {
  return text
    ?.split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function formatAddress(address: { name: string | null; email: string | null } | null) {
  if (!address) {
    return "";
  }
  if (address.name && address.email) {
    return `${address.name} <${address.email}>`;
  }
  return address.email ?? address.name ?? "";
}

function escapeHtml(value: string) {
  return value.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;");
}

function readSearchCriteria(input: Record<string, unknown>) {
  return {
    ...(typeof input.unseen === "boolean" ? { unseen: input.unseen } : {}),
    ...(typeof input.from === "string" ? { from: input.from } : {}),
    ...(typeof input.to === "string" ? { to: input.to } : {}),
    ...(typeof input.subject === "string" ? { subject: input.subject } : {}),
    ...(typeof input.text === "string" ? { text: input.text } : {}),
    ...(typeof input.since === "string" ? { since: input.since } : {}),
    ...(typeof input.before === "string" ? { before: input.before } : {}),
  };
}

export function mapProtocolError(
  error: unknown,
  phase: "connect" | "execute",
  config: MailRuntimeConfig,
): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  if (error instanceof MailProtocolError) {
    switch (error.kind) {
      case "auth":
        return phase === "connect"
          ? new ProviderRequestError(400, config.connectAuthMessage)
          : new ProviderRequestError(
              401,
              `${config.displayName} rejected the stored authorization code. Reconnect the account with a fresh ${config.displayName} authorization code.`,
            );
      case "folder_not_found":
        return new ProviderRequestError(400, `${config.displayName} folder does not exist.`);
      case "uid_not_found":
        return new ProviderRequestError(
          400,
          `${config.displayName} message UID does not exist in the selected folder.`,
        );
      case "timeout":
        return new ProviderRequestError(504, error.message);
      case "network":
        return new ProviderRequestError(502, error.message);
      case "provider":
        return new ProviderRequestError(502, error.message);
    }
  }

  return new ProviderRequestError(
    502,
    error instanceof Error ? error.message : `${config.displayName} provider error.`,
  );
}
