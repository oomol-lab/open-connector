import type { GuardedFetchDnsLookup, ResolvedAddress } from "../../core/guarded-fetch.ts";
import type { FetchMessageObject, ImapFlowOptions, MessageStructureObject, SearchObject } from "imapflow";
import type { LookupFunction, Socket, TcpNetConnectOpts } from "node:net";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { connect as connectSocket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import nodemailer from "nodemailer";
import { resolveGuardedEgressTarget } from "../../core/guarded-fetch.ts";
import { isIpAddress, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { mailAttachmentDownloadByteLimit, mailConnectionTimeoutMs, mailImapPort, mailSmtpPort } from "./config.ts";
import { MailProtocolError } from "./errors.ts";
import { sanitizeTempFileName } from "./temp-files.ts";

export interface MailCredential {
  email: string;
  authorizationCode: string;
  imapHost: string;
  smtpHost: string;
  /**
   * Submission port, when the mailbox does not offer implicit TLS on 465.
   * Providers with a hardcoded host leave it unset and keep 465.
   */
  smtpPort?: number;
}

export interface MailProtocolConfig {
  displayName: string;
  attachmentFallbackPrefix: string;
  /**
   * Screen the resolved IP addresses of the mailbox hosts before connecting.
   *
   * Providers whose hosts are hardcoded do not need this: their hostnames are
   * part of the integration. It is meant for providers whose hosts come from
   * user input, where a save-time hostname check alone can be defeated by a DNS
   * record that only points at an internal address once the connection is made.
   */
  enforceHostNetworkPolicy?: boolean;
}

export interface MailSendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailOutgoingAttachment[];
}

export interface MailOutgoingAttachment {
  filename: string;
  contentType?: string;
  filePath: string;
}

export interface MailSendResult {
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  response: string;
}

export interface MailFolder {
  path: string;
  name: string;
  delimiter: string | null;
  flags: string[];
  specialUse: string | null;
}

export interface MailSearchCriteria {
  unseen?: boolean;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
}

export interface MailSearchPage {
  limit: number;
  beforeUid?: number;
  peek: true;
}

export interface MailSearchSummariesResult {
  summaries: MailSummary[];
  nextBeforeUid: number | null;
}

export interface MailAddress {
  name: string | null;
  email: string | null;
}

export interface MailSummary {
  uid: number;
  messageId: string | null;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  date: string | null;
  flags: string[];
  seen: boolean;
  hasAttachments: boolean;
  size: number | null;
}

export interface MailAttachment {
  attachmentId: string;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  contentId: string | null;
}

export interface MailDownloadedAttachment {
  attachmentId: string;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  filePath: string;
  cleanup(): Promise<void>;
}

export interface MailFolderStatus {
  folder: string;
  messages: number | null;
  recent: number | null;
  unseen: number | null;
  uidNext: number | null;
  uidValidity: string | null;
}

export interface MailFetchedMessage {
  summary: MailSummary;
  cc: MailAddress[];
  replyTo: MailAddress[];
  text: string | null;
  html: string | null;
  attachments: MailAttachment[];
  truncated: boolean;
}

export interface MailProtocol {
  validateImapCredential(credential: MailCredential): Promise<void>;
  validateSmtpCredential(credential: MailCredential): Promise<void>;
  sendMail(credential: MailCredential, input: MailSendInput): Promise<MailSendResult>;
  listFolders(credential: MailCredential): Promise<MailFolder[]>;
  searchUids(credential: MailCredential, folder: string, criteria: MailSearchCriteria): Promise<number[]>;
  fetchSummaries(
    credential: MailCredential,
    folder: string,
    uids: number[],
    options: { peek: true },
  ): Promise<MailSummary[]>;
  searchSummaries(
    credential: MailCredential,
    folder: string,
    criteria: MailSearchCriteria,
    page: MailSearchPage,
  ): Promise<MailSearchSummariesResult>;
  fetchMessage(
    credential: MailCredential,
    folder: string,
    uid: number,
    options: { peek: true; maxBytes: number; skipAttachmentBodies: true },
  ): Promise<MailFetchedMessage>;
  downloadAttachment(
    credential: MailCredential,
    folder: string,
    uid: number,
    attachmentId: string,
  ): Promise<MailDownloadedAttachment>;
  markSeen(credential: MailCredential, folder: string, uid: number): Promise<void>;
  markUnseen(credential: MailCredential, folder: string, uid: number): Promise<void>;
  moveMessage(credential: MailCredential, folder: string, uid: number, targetFolder: string): Promise<void>;
  deleteMessage(credential: MailCredential, folder: string, uid: number): Promise<void>;
  getFolderStatus(credential: MailCredential, folder: string): Promise<MailFolderStatus>;
}

export interface MailProtocolDependencies {
  createSmtpTransport?: (config: Record<string, unknown>) => MailSmtpTransport;
  createImapClient?: (config: Record<string, unknown>) => MailImapClient;
  lookup?: GuardedFetchDnsLookup;
  connectSocket?: (options: TcpNetConnectOpts) => Socket;
}

interface MailSmtpTransport {
  verify(): Promise<unknown>;
  sendMail(input: Record<string, unknown>): Promise<{
    messageId?: string;
    accepted?: unknown[];
    rejected?: unknown[];
    response?: string;
  }>;
  close(): void;
}

interface MailImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close?(): void;
  list(): Promise<unknown[]>;
}

type RuntimeImapClient = MailImapClient & {
  mailboxOpen(path: string, options: { readOnly: boolean }): Promise<unknown>;
  search(query: SearchObject, options: { uid: true }): Promise<number[] | false>;
  fetchAll(range: number[], query: Record<string, unknown>, options: { uid: true }): Promise<unknown[]>;
  fetchOne(uid: number, query: Record<string, unknown>, options: { uid: true }): Promise<unknown | false>;
  messageFlagsAdd(range: number[], flags: string[], options: { uid: true }): Promise<boolean>;
  messageFlagsRemove(range: number[], flags: string[], options: { uid: true }): Promise<boolean>;
  messageMove(range: number[], targetFolder: string, options: { uid: true }): Promise<unknown | false>;
  messageDelete(range: number[], options: { uid: true }): Promise<boolean>;
  status(
    folder: string,
    query: {
      messages: true;
      recent: true;
      unseen: true;
      uidNext: true;
      uidValidity: true;
    },
  ): Promise<unknown>;
  download(
    uid: number,
    attachmentId: string,
    options: { uid: true; maxBytes: number },
  ): Promise<{
    meta: {
      expectedSize?: number;
      contentType?: string;
      filename?: string;
    };
    content: AsyncIterable<unknown>;
  }>;
};

interface BodyPart {
  part: string;
  type: string;
  parameters: Record<string, string>;
  encoding: string | null;
  size: number | null;
}

export function createMailProtocol(config: MailProtocolConfig, deps: MailProtocolDependencies = {}): MailProtocol {
  return {
    async validateImapCredential(credential) {
      await withImapClient(config, deps, credential, async (client) => {
        await client.list();
      });
    },
    async validateSmtpCredential(credential) {
      const transport = await createSmtpTransport(config, deps, credential);
      try {
        await transport.verify();
      } catch (error) {
        throw mapLibraryError(error, config);
      } finally {
        transport.close();
      }
    },
    async sendMail(credential, input) {
      const transport = await createSmtpTransport(config, deps, credential);
      try {
        const result = await transport.sendMail({
          from: credential.email,
          to: input.to,
          ...(input.cc ? { cc: input.cc } : {}),
          ...(input.bcc ? { bcc: input.bcc } : {}),
          ...(input.replyTo ? { replyTo: input.replyTo } : {}),
          ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
          ...(input.references ? { references: input.references } : {}),
          subject: input.subject,
          ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.html !== undefined ? { html: input.html } : {}),
          ...(input.attachments
            ? {
                attachments: input.attachments.map((attachment) => ({
                  filename: attachment.filename,
                  ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
                  path: attachment.filePath,
                })),
              }
            : {}),
        });
        return {
          messageId: typeof result.messageId === "string" ? result.messageId : null,
          accepted: normalizeStringArray(result.accepted),
          rejected: normalizeStringArray(result.rejected),
          response: typeof result.response === "string" ? result.response : "",
        };
      } catch (error) {
        throw mapLibraryError(error, config);
      } finally {
        transport.close();
      }
    },
    async listFolders(credential) {
      return await withImapClient(config, deps, credential, async (client) =>
        (await client.list()).map(normalizeMailbox),
      );
    },
    async searchUids(credential, folder, criteria) {
      return await withMailbox(config, deps, credential, folder, true, async (client) => {
        return await searchUidsInMailbox(client, criteria);
      });
    },
    async fetchSummaries(credential, folder, uids) {
      return await withMailbox(config, deps, credential, folder, true, async (client) => {
        return await fetchSummariesInMailbox(client, uids);
      });
    },
    async searchSummaries(credential, folder, criteria, page) {
      return await withMailbox(config, deps, credential, folder, true, async (client) => {
        const uids = await searchUidsInMailbox(client, criteria);
        const { returnedUids, nextBeforeUid } = pageUids(uids, page.limit, page.beforeUid);
        return {
          summaries: await fetchSummariesInMailbox(client, returnedUids),
          nextBeforeUid,
        };
      });
    },
    async fetchMessage(credential, folder, uid, options) {
      return await withMailbox(config, deps, credential, folder, true, async (client) => {
        const metadata = await client.fetchOne(
          uid,
          {
            uid: true,
            envelope: true,
            flags: true,
            size: true,
            bodyStructure: true,
          },
          { uid: true },
        );
        if (!metadata) {
          throw new MailProtocolError("uid_not_found", "Mail message UID does not exist in the selected folder.");
        }

        const message = metadata as FetchMessageObject;
        const selectedParts = selectBodyParts(message.bodyStructure, options.maxBytes);
        const bodyFetch =
          selectedParts.length === 0
            ? false
            : await client.fetchOne(
                uid,
                {
                  bodyParts: selectedParts.map(({ part, maxLength }) => ({
                    key: part.part,
                    maxLength,
                  })),
                },
                { uid: true },
              );
        const parsedBody = await parseSelectedBodyParts(selectedParts, bodyFetch);

        return {
          summary: normalizeSummary(message),
          cc: normalizeEnvelopeAddresses(message, "cc"),
          replyTo: normalizeEnvelopeAddresses(message, "replyTo"),
          text: parsedBody.text,
          html: parsedBody.html,
          attachments: collectAttachmentMetadata(message.bodyStructure),
          truncated: parsedBody.truncated,
        };
      });
    },
    async downloadAttachment(credential, folder, uid, attachmentId) {
      return await withMailbox(config, deps, credential, folder, true, async (client) => {
        const downloaded = await downloadAttachmentPart(client, uid, attachmentId);
        const expectedSize = readInteger(downloaded.meta.expectedSize);
        const filename =
          readString(downloaded.meta.filename) ?? `${config.attachmentFallbackPrefix}-attachment-${attachmentId}`;
        const { filePath, cleanup } = await writeAsyncIterableToTempFile(
          downloaded.content,
          filename,
          `oomol-connect-${config.attachmentFallbackPrefix}-download-`,
        );
        return {
          attachmentId,
          filename,
          contentType: readString(downloaded.meta.contentType),
          size: expectedSize,
          filePath,
          cleanup,
        };
      });
    },
    async markSeen(credential, folder, uid) {
      await withMailbox(config, deps, credential, folder, false, async (client) => {
        const updated = await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });
        if (!updated) {
          throw new MailProtocolError("uid_not_found", "Mail message UID does not exist in the selected folder.");
        }
      });
    },
    async markUnseen(credential, folder, uid) {
      await withMailbox(config, deps, credential, folder, false, async (client) => {
        const updated = await client.messageFlagsRemove([uid], ["\\Seen"], { uid: true });
        if (!updated) {
          throw new MailProtocolError("uid_not_found", "Mail message UID does not exist in the selected folder.");
        }
      });
    },
    async moveMessage(credential, folder, uid, targetFolder) {
      await withMailbox(config, deps, credential, folder, false, async (client) => {
        const moved = await moveMessageToFolder(client, uid, targetFolder);
        if (!moved) {
          throw new MailProtocolError("uid_not_found", "Mail message UID does not exist in the selected folder.");
        }
      });
    },
    async deleteMessage(credential, folder, uid) {
      await withMailbox(config, deps, credential, folder, false, async (client) => {
        const deleted = await client.messageDelete([uid], { uid: true });
        if (!deleted) {
          throw new MailProtocolError("uid_not_found", "Mail message UID does not exist in the selected folder.");
        }
      });
    },
    async getFolderStatus(credential, folder) {
      return await withImapClient(config, deps, credential, async (client) => {
        const status = toRecord(
          await client.status(folder, {
            messages: true,
            recent: true,
            unseen: true,
            uidNext: true,
            uidValidity: true,
          }),
        );
        return {
          folder,
          messages: readInteger(status?.messages),
          recent: readInteger(status?.recent),
          unseen: readInteger(status?.unseen),
          uidNext: readInteger(status?.uidNext),
          uidValidity: readBigIntString(status?.uidValidity),
        };
      });
    },
  };
}

async function downloadAttachmentPart(client: RuntimeImapClient, uid: number, attachmentId: string) {
  try {
    return await client.download(uid, attachmentId, {
      uid: true,
      maxBytes: mailAttachmentDownloadByteLimit,
    });
  } catch (error) {
    if (isFolderMissingError(error)) {
      throw new MailProtocolError("uid_not_found", "Mail message UID does not exist in the selected folder.");
    }
    throw error;
  }
}

async function moveMessageToFolder(client: RuntimeImapClient, uid: number, targetFolder: string) {
  try {
    return await client.messageMove([uid], targetFolder, { uid: true });
  } catch (error) {
    if (isFolderMissingError(error)) {
      throw new MailProtocolError("folder_not_found", "Mail folder does not exist.");
    }
    throw error;
  }
}

interface MailHostTarget {
  host: string;
  servername?: string;
  lookup?: LookupFunction;
}

async function pinMailHost(
  host: string,
  fieldName: string,
  config: MailProtocolConfig,
  deps: MailProtocolDependencies,
): Promise<MailHostTarget> {
  if (!config.enforceHostNetworkPolicy) {
    return { host };
  }

  const target = await resolveGuardedEgressTarget(`https://${host}`, {
    fieldName,
    createError: (message) => new MailProtocolError("blocked_host", message),
    createResolutionError: (message) => new MailProtocolError("network", message),
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
    lookup: deps.lookup,
  });
  if (target.addresses.length === 0) {
    throw new MailProtocolError("network", `${fieldName} could not be resolved for validation.`);
  }
  return {
    host: target.url.hostname,
    ...(!isIpAddress(target.url.hostname) ? { servername: target.url.hostname } : {}),
    lookup: createPinnedLookup(target.addresses),
  };
}

function createPinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return ((_hostname, options, callback) => {
    if (typeof options === "object" && options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  }) as LookupFunction;
}

async function createSmtpTransport(
  config: MailProtocolConfig,
  deps: MailProtocolDependencies,
  credential: MailCredential,
): Promise<MailSmtpTransport> {
  const target = await pinMailHost(credential.smtpHost, "SMTP host", config, deps);
  const port = credential.smtpPort ?? mailSmtpPort;
  const transportConfig = {
    host: target.host,
    ...(target.servername ? { servername: target.servername } : {}),
    port,
    ...(target.lookup ? { getSocket: createSmtpSocketFactory(target.host, port, target.lookup, deps) } : {}),
    // Implicit TLS is the wire convention on 465 only. Every other submission
    // port starts in cleartext and upgrades, so STARTTLS is demanded rather than
    // taken opportunistically: nodemailer then aborts instead of sending the
    // password in the clear to a server that does not offer the upgrade. The
    // flag stays off for implicit TLS, where it would only make a server whose
    // EHLO fails unusable rather than falling back to HELO as before.
    secure: port === mailSmtpPort,
    requireTLS: port !== mailSmtpPort,
    auth: {
      user: credential.email,
      pass: credential.authorizationCode,
    },
    connectionTimeout: mailConnectionTimeoutMs,
    greetingTimeout: mailConnectionTimeoutMs,
    socketTimeout: mailConnectionTimeoutMs,
  };

  return deps.createSmtpTransport
    ? deps.createSmtpTransport(transportConfig)
    : (nodemailer.createTransport(transportConfig as never) as MailSmtpTransport);
}

async function createImapClient(
  config: MailProtocolConfig,
  deps: MailProtocolDependencies,
  credential: MailCredential,
): Promise<MailImapClient> {
  const target = await pinMailHost(credential.imapHost, "IMAP host", config, deps);
  const clientConfig = {
    host: target.host,
    ...(target.servername ? { servername: target.servername } : {}),
    ...(target.lookup ? { tls: { lookup: target.lookup, autoSelectFamily: true } } : {}),
    port: mailImapPort,
    secure: true,
    auth: {
      user: credential.email,
      pass: credential.authorizationCode,
    },
    connectionTimeout: mailConnectionTimeoutMs,
    greetingTimeout: mailConnectionTimeoutMs,
    socketTimeout: mailConnectionTimeoutMs,
    logger: false,
  };

  return deps.createImapClient ? deps.createImapClient(clientConfig) : new ImapFlow(clientConfig as ImapFlowOptions);
}

function createSmtpSocketFactory(host: string, port: number, lookup: LookupFunction, deps: MailProtocolDependencies) {
  return (_options: unknown, callback: (error: Error | null, options?: { connection: Socket }) => void): void => {
    const socket = (deps.connectSocket ?? connectSocket)({ host, port, lookup, autoSelectFamily: true });
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
      socket.removeListener("timeout", onTimeout);
      socket.setTimeout(0);
      callback(error ?? null, error ? undefined : { connection: socket });
    };
    const onConnect = (): void => finish();
    const onError = (error: Error): void => finish(error);
    const onTimeout = (): void => {
      const error = new Error("Connection timeout") as NodeJS.ErrnoException;
      error.code = "ETIMEDOUT";
      socket.destroy();
      finish(error);
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(mailConnectionTimeoutMs);
  };
}

async function withImapClient<T>(
  config: MailProtocolConfig,
  deps: MailProtocolDependencies,
  credential: MailCredential,
  callback: (client: RuntimeImapClient) => Promise<T>,
) {
  const client = await createImapClient(config, deps, credential);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    return await callback(client as RuntimeImapClient);
  } catch (error) {
    throw mapLibraryError(error, config);
  } finally {
    if (connected) {
      try {
        await client.logout();
      } catch {
        client.close?.();
      }
    } else {
      client.close?.();
    }
  }
}

async function withMailbox<T>(
  config: MailProtocolConfig,
  deps: MailProtocolDependencies,
  credential: MailCredential,
  folder: string,
  readOnly: boolean,
  callback: (client: RuntimeImapClient) => Promise<T>,
) {
  return await withImapClient(config, deps, credential, async (client) => {
    try {
      await client.mailboxOpen(folder, { readOnly });
    } catch (error) {
      if (isFolderMissingError(error)) {
        throw new MailProtocolError("folder_not_found", "Mail folder does not exist.");
      }
      throw error;
    }

    return await callback(client);
  });
}

function createSearchQuery(criteria: MailSearchCriteria): SearchObject {
  const query: SearchObject = {};
  if (criteria.unseen === true) {
    query.seen = false;
  }
  if (criteria.from) {
    query.from = criteria.from;
  }
  if (criteria.to) {
    query.to = criteria.to;
  }
  if (criteria.subject) {
    query.subject = criteria.subject;
  }
  if (criteria.text) {
    query.body = criteria.text;
  }
  if (criteria.since) {
    query.since = criteria.since;
  }
  if (criteria.before) {
    query.before = criteria.before;
  }

  return Object.keys(query).length === 0 ? { all: true } : query;
}

async function searchUidsInMailbox(client: RuntimeImapClient, criteria: MailSearchCriteria) {
  const result = await client.search(createSearchQuery(criteria), { uid: true });
  return result === false ? [] : result.filter((uid) => Number.isInteger(uid) && uid > 0);
}

async function fetchSummariesInMailbox(client: RuntimeImapClient, uids: number[]) {
  if (uids.length === 0) {
    return [];
  }

  const messages = await client.fetchAll(
    uids,
    {
      uid: true,
      envelope: true,
      flags: true,
      size: true,
      bodyStructure: true,
    },
    { uid: true },
  );
  const summariesByUid = new Map(
    messages.map((message) => {
      const summary = normalizeSummary(message);
      return [summary.uid, summary] as const;
    }),
  );
  return uids.flatMap((uid) => {
    const summary = summariesByUid.get(uid);
    return summary ? [summary] : [];
  });
}

function pageUids(uids: number[], limit: number, beforeUid: number | undefined) {
  const sorted = [...uids].sort((left, right) => right - left);
  const filtered = beforeUid === undefined ? sorted : sorted.filter((uid) => uid < beforeUid);
  const pageProbe = filtered.slice(0, limit + 1);
  const returnedUids = pageProbe.slice(0, limit);
  const lastReturnedUid = returnedUids.at(-1) ?? null;
  return {
    returnedUids,
    nextBeforeUid: pageProbe.length > limit ? lastReturnedUid : null,
  };
}

function normalizeMailbox(value: unknown): MailFolder {
  const record = toRecord(value);
  const delimiter = readString(record?.delimiter);
  const path = readString(record?.path) ?? readString(record?.name) ?? "";
  return {
    path,
    name: readString(record?.name) ?? lastPathSegment(path, delimiter),
    delimiter,
    flags: normalizeStringArray(record?.flags),
    specialUse: readString(record?.specialUse),
  };
}

function normalizeSummary(value: unknown): MailSummary {
  const record = toRecord(value);
  const envelope = toRecord(record?.envelope);
  const uid = readPositiveInteger(record?.uid);
  const flags = normalizeStringArray(record?.flags);
  return {
    uid,
    messageId: readString(envelope?.messageId),
    subject: readString(envelope?.subject),
    from: normalizeEnvelopeAddresses(value, "from")[0] ?? null,
    to: normalizeEnvelopeAddresses(value, "to"),
    date: normalizeDate(envelope?.date ?? record?.internalDate),
    flags,
    seen: flags.includes("\\Seen"),
    hasAttachments: collectAttachmentMetadata(record?.bodyStructure).length > 0,
    size: readInteger(record?.size),
  };
}

function normalizeEnvelopeAddresses(value: unknown, key: "from" | "to" | "cc" | "replyTo"): MailAddress[] {
  const envelope = toRecord(toRecord(value)?.envelope);
  return normalizeAddressList(envelope?.[key]);
}

function normalizeAddressList(value: unknown): MailAddress[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const address = normalizeAddress(item);
    return address.name || address.email ? [address] : [];
  });
}

function normalizeAddress(value: unknown): MailAddress {
  const record = toRecord(value);
  return {
    name: readString(record?.name),
    email: readString(record?.address) ?? readString(record?.email),
  };
}

function collectBodyParts(bodyStructure: unknown): BodyPart[] {
  const record = toRecord(bodyStructure);
  if (!record) {
    return [];
  }

  const childNodes = record.childNodes;
  const childParts = Array.isArray(childNodes) ? childNodes.flatMap(collectBodyParts) : [];
  const type = readString(record.type)?.toLowerCase();
  const part = readString(record.part);
  if (!type || !part || !type.startsWith("text/") || isAttachment(record)) {
    return childParts;
  }

  return [
    ...childParts,
    {
      part,
      type,
      parameters: normalizeStringRecord(record.parameters),
      encoding: readString(record.encoding),
      size: readInteger(record.size),
    },
  ];
}

function collectAttachmentMetadata(bodyStructure: unknown): MailAttachment[] {
  const record = toRecord(bodyStructure);
  if (!record) {
    return [];
  }

  const childNodes = record.childNodes;
  const childAttachments = Array.isArray(childNodes) ? childNodes.flatMap(collectAttachmentMetadata) : [];
  if (!isAttachment(record)) {
    return childAttachments;
  }

  const parameters = normalizeStringRecord(record.parameters);
  const dispositionParameters = normalizeStringRecord(record.dispositionParameters);
  const attachmentId = readString(record.part) ?? readString(record.id);
  if (!attachmentId) {
    return childAttachments;
  }

  return [
    ...childAttachments,
    {
      attachmentId,
      filename: dispositionParameters.filename ?? parameters.name ?? null,
      contentType: readString(record.type),
      size: readInteger(record.size),
      contentId: readString(record.id),
    },
  ];
}

async function writeAsyncIterableToTempFile(content: AsyncIterable<unknown>, name: string, prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const filePath = join(directory, `${randomUUID()}-${sanitizeTempFileName(name)}`);

  try {
    await pipeline(Readable.from(content), createWriteStream(filePath));
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

function isAttachment(record: Record<string, unknown>) {
  const disposition = readString(record.disposition)?.toLowerCase();
  const parameters = normalizeStringRecord(record.parameters);
  const dispositionParameters = normalizeStringRecord(record.dispositionParameters);
  return disposition === "attachment" || dispositionParameters.filename !== undefined || parameters.name !== undefined;
}

function selectBodyParts(bodyStructure: MessageStructureObject | undefined, maxBytes: number) {
  const parts = collectBodyParts(bodyStructure);
  let remaining = maxBytes;
  let truncated = false;
  const selected: Array<{ part: BodyPart; maxLength: number; truncatedBeforeFetch: boolean }> = [];

  for (const part of parts) {
    if (remaining <= 0) {
      truncated = true;
      continue;
    }

    const maxLength = Math.min(part.size ?? remaining, remaining);
    remaining -= maxLength;
    selected.push({
      part,
      maxLength,
      truncatedBeforeFetch: part.size !== null && part.size > maxLength,
    });
  }

  if (truncated) {
    return selected.map((item) => ({ ...item, truncatedBeforeFetch: true }));
  }

  return selected;
}

async function parseSelectedBodyParts(
  selectedParts: Array<{ part: BodyPart; maxLength: number; truncatedBeforeFetch: boolean }>,
  bodyFetch: unknown,
): Promise<{ text: string | null; html: string | null; truncated: boolean }> {
  const bodyParts = toRecord(bodyFetch)?.bodyParts;
  const buffers = bodyParts instanceof Map ? bodyParts : new Map<string, Buffer>();
  let text: string | null = null;
  let html: string | null = null;
  let truncated = selectedParts.some((item) => item.truncatedBeforeFetch);

  for (const { part } of selectedParts) {
    const content = buffers.get(part.part);
    if (!content) {
      continue;
    }
    if (part.size !== null && content.length < part.size) {
      truncated = true;
    }

    const parsed = await simpleParser(createBodyPartSource(part, content), {
      skipHtmlToText: true,
      skipTextToHtml: true,
      skipTextLinks: true,
      skipImageLinks: true,
    });
    if (part.type === "text/plain" && parsed.text) {
      text = appendBody(text, parsed.text);
    }
    if (part.type === "text/html" && typeof parsed.html === "string") {
      html = appendBody(html, parsed.html);
    }
  }

  return { text, html, truncated };
}

function createBodyPartSource(part: BodyPart, content: Buffer) {
  const headers = [
    `Content-Type: ${formatContentType(part)}`,
    ...(part.encoding ? [`Content-Transfer-Encoding: ${part.encoding}`] : []),
  ];
  return Buffer.concat([Buffer.from(`${headers.join("\r\n")}\r\n\r\n`), content]);
}

function formatContentType(part: BodyPart) {
  const parameters = Object.entries(part.parameters).map(
    ([key, value]) => `; ${key}="${value.split('"').join('\\"')}"`,
  );
  return `${part.type}${parameters.join("")}`;
}

function appendBody(current: string | null, next: string) {
  return current ? `${current}\n\n${next}` : next;
}

function mapLibraryError(error: unknown, config: MailProtocolConfig): MailProtocolError {
  if (error instanceof MailProtocolError) {
    return error;
  }

  const message = error instanceof Error ? error.message : `${config.displayName} protocol error.`;
  const code = readString(toRecord(error)?.code);
  const lowerMessage = message.toLowerCase();

  if (isAuthError(error, code, lowerMessage)) {
    return new MailProtocolError("auth", message);
  }
  if (isTimeoutError(code, lowerMessage)) {
    return new MailProtocolError("timeout", message);
  }
  if (isNetworkError(code)) {
    return new MailProtocolError("network", message);
  }

  return new MailProtocolError("provider", message);
}

function isAuthError(error: unknown, code: string | null, lowerMessage: string) {
  return (
    toRecord(error)?.authenticationFailed === true ||
    code === "EAUTH" ||
    code === "AUTHENTICATIONFAILED" ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("invalid login") ||
    lowerMessage.includes("login failed")
  );
}

function isTimeoutError(code: string | null, lowerMessage: string) {
  return (
    code === "ETIMEDOUT" ||
    code === "Timeout" ||
    code === "LockTimeout" ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("timeout")
  );
}

function isNetworkError(code: string | null) {
  return ["ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ESOCKET"].includes(
    code ?? "",
  );
}

function isFolderMissingError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = readString(toRecord(error)?.code);
  return (
    code === "NONEXISTENT" ||
    code === "NotFound" ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("nonexistent")
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (value instanceof Set) {
    return Array.from(value).filter((item): item is string => typeof item === "string");
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) => (typeof item === "string" ? [[key, item]] : [])),
  );
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function readBigIntString(value: unknown): string | null {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return readString(value);
}

function readPositiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function lastPathSegment(path: string, delimiter: string | null) {
  const parts = delimiter ? path.split(delimiter) : [path];
  return parts.at(-1) ?? path;
}
