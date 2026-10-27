import type { PollContext, PollDefinition, PollEvent } from "../../triggers/common/poll.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  eventsPollOutputs,
  PermanentPollError,
  PollConnectionError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-message-received.definition.ts";

interface Config {
  readonly folder: string;
  readonly includeDrafts: boolean;
  readonly maxMessagesPerPoll: number;
  readonly readStatus: "All" | "Read" | "Unread";
  readonly senderAddress: string;
  readonly subjectContains: string;
  readonly withAttachmentsOnly: boolean;
}

interface Checkpoint {
  readonly boundaryMessageIds: readonly string[];
  readonly lastReceivedDateTime: string;
}

interface Recipient {
  readonly emailAddress?: { readonly address?: string; readonly name?: string };
}

interface Message {
  readonly bodyPreview?: string;
  readonly categories?: readonly string[];
  readonly conversationId?: string;
  readonly from?: Recipient;
  readonly hasAttachments?: boolean;
  readonly id?: string;
  readonly importance?: string;
  readonly internetMessageId?: string;
  readonly isDraft?: boolean;
  readonly isRead?: boolean;
  readonly parentFolderId?: string;
  readonly receivedDateTime?: string;
  readonly subject?: string;
  readonly toRecipients?: readonly Recipient[];
  readonly webLink?: string;
}

const markerPageSize = 100;
const seedAnchor = "1970-01-01T00:00:00Z";
const select =
  "id,internetMessageId,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,hasAttachments,isRead,isDraft,importance,categories,parentFolderId,webLink";

export const outlookMessageReceived: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null)
      return { checkpoint: (await seed(context, config)) as unknown as JsonValue, events: [] };
    const checkpoint = readCheckpoint(context.checkpoint);
    const result = await get(context, endpoint(config.folder), {
      $filter: filter(config, checkpoint.lastReceivedDateTime),
      $orderby: "receivedDateTime asc",
      $select: select,
      $top: config.maxMessagesPerPoll,
    });
    success(result, "message list");
    const rows = messages(result.data);
    if (rows.length == 0) return { checkpoint: checkpoint as unknown as JsonValue, events: [] };

    const previousMs = Date.parse(checkpoint.lastReceivedDateTime);
    let watermarkMs = previousMs;
    let watermark = checkpoint.lastReceivedDateTime;
    for (const row of rows) {
      const ms = isoMs(row.receivedDateTime);
      if (row.receivedDateTime != null && ms != null && ms > watermarkMs) {
        watermarkMs = ms;
        watermark = row.receivedDateTime;
      }
    }
    const moved = watermarkMs > previousMs;
    const processed = new Set(checkpoint.boundaryMessageIds);
    const full = rows.length >= config.maxMessagesPerPoll;
    if (full && !moved && rows.every((row) => typeof row.id == "string" && processed.has(row.id))) {
      throw new PermanentPollError(
        "Outlook cursor is stuck on a full timestamp boundary; increase maxMessagesPerPoll and resume the Trigger.",
      );
    }

    const boundary = new Set(moved ? [] : checkpoint.boundaryMessageIds);
    const events: PollEvent[] = [];
    let filtered = 0;
    for (const row of rows) {
      if (row.id == null || row.id.length == 0) continue;
      if (isoMs(row.receivedDateTime) == watermarkMs) boundary.add(row.id);
      if (processed.has(row.id)) continue;
      if (!matches(row, config)) {
        filtered += 1;
        continue;
      }
      events.push(event(row, row.id));
    }
    const hasMore = full && (moved || events.length > 0);
    return {
      checkpoint: { boundaryMessageIds: [...boundary], lastReceivedDateTime: watermark },
      events,
      filtered,
      ...(hasMore ? { hasMore: true } : {}),
    };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    folder: value.folder as string,
    includeDrafts: value.includeDrafts as boolean,
    maxMessagesPerPoll: value.maxMessagesPerPoll as number,
    readStatus: value.readStatus as Config["readStatus"],
    senderAddress: (value.senderAddress as string).trim(),
    subjectContains: (value.subjectContains as string).trim(),
    withAttachmentsOnly: value.withAttachmentsOnly as boolean,
  };
}

async function seed(context: PollContext, config: Config): Promise<Checkpoint> {
  const marker = await get(context, endpoint(config.folder), {
    $orderby: "receivedDateTime desc",
    $select: "id,receivedDateTime",
    $top: markerPageSize,
  });
  success(marker, "seed marker fetch");
  const shape = await get(context, endpoint(config.folder), {
    $filter: filter(config, seedAnchor),
    $orderby: "receivedDateTime desc",
    $top: 1,
  });
  success(shape, "seed filter shape check");
  const newest = newestMessage(messages(marker.data));
  if (newest == null) return { boundaryMessageIds: [], lastReceivedDateTime: context.now.toISOString() };
  const boundary = messages(marker.data).filter((row) => isoMs(row.receivedDateTime) == newest.ms);
  if (boundary.length >= config.maxMessagesPerPoll) {
    return {
      boundaryMessageIds: [],
      lastReceivedDateTime: new Date(newest.ms + 1_000).toISOString(),
    };
  }
  return {
    boundaryMessageIds: boundary.flatMap((row) => (row.id == null || row.id.length == 0 ? [] : [row.id])),
    lastReceivedDateTime: newest.iso,
  };
}

function readCheckpoint(value: JsonValue): Checkpoint {
  const checkpoint = record(value);
  const watermark = checkpoint?.lastReceivedDateTime;
  if (typeof watermark != "string" || isoMs(watermark) == null) {
    throw new PermanentPollError("Outlook checkpoint is invalid; recreate the Trigger.");
  }
  const boundary = checkpoint?.boundaryMessageIds;
  return {
    boundaryMessageIds: Array.isArray(boundary)
      ? boundary.filter((id): id is string => typeof id == "string" && id.length > 0)
      : [],
    lastReceivedDateTime: watermark,
  };
}

function endpoint(folder: string): string {
  return folder.length == 0 ? "/me/messages" : `/me/mailFolders/${encodeURIComponent(folder)}/messages`;
}

function filter(config: Config, watermark: string): string {
  const clauses = [`receivedDateTime ge ${watermark}`];
  if (config.readStatus == "Unread") clauses.push("isRead eq false");
  if (config.readStatus == "Read") clauses.push("isRead eq true");
  if (config.withAttachmentsOnly) clauses.push("hasAttachments eq true");
  if (config.senderAddress.length > 0)
    clauses.push(`from/emailAddress/address eq '${config.senderAddress.replaceAll("'", "''")}'`);
  return clauses.join(" and ");
}

function matches(message: Message, config: Config): boolean {
  if (message.isDraft === true && !config.includeDrafts) return false;
  return (
    config.subjectContains.length == 0 ||
    (message.subject ?? "").toLowerCase().includes(config.subjectContains.toLowerCase())
  );
}

function event(message: Message, id: string): PollEvent {
  return {
    dedupeKey: id,
    payload: {
      bodyPreview: message.bodyPreview ?? "",
      categories: message.categories ?? [],
      conversationId: message.conversationId ?? "",
      from: message.from?.emailAddress?.address ?? "",
      fromName: message.from?.emailAddress?.name ?? "",
      hasAttachments: message.hasAttachments ?? false,
      importance: message.importance ?? "",
      internetMessageId: message.internetMessageId ?? "",
      isDraft: message.isDraft ?? false,
      isRead: message.isRead ?? false,
      messageId: id,
      parentFolderId: message.parentFolderId ?? "",
      receivedDateTime: message.receivedDateTime ?? "",
      subject: message.subject ?? "",
      to: (message.toRecipients ?? []).flatMap(({ emailAddress }) =>
        emailAddress?.address == null ? [] : [emailAddress.address],
      ),
      webLink: message.webLink ?? "",
    },
  };
}

async function get(
  context: PollContext,
  path: string,
  query: Readonly<Record<string, number | string>>,
): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute(
      { endpoint: path, headers: { Prefer: 'IdType="ImmutableId"' }, method: "GET", query },
      context.signal,
    );
  } catch (cause) {
    throw new TransientPollError(`Outlook proxy request to ${path} failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  const codes = errorCodes(result.data);
  if (result.status == 401) throw new PollConnectionError(`Outlook ${operation} rejected the Connection.`);
  if (result.status == 403 && codes.has("mailboxnotenabledforrestapi")) {
    throw new PermanentPollError("The Outlook mailbox is not reachable through the Graph mail APIs.");
  }
  if (result.status == 403 && (codes.has("accessdenied") || codes.has("erroraccessdenied"))) {
    throw new PollConnectionError(`Outlook ${operation} rejected the Connection.`);
  }
  if (result.status == 404 && (codes.has("erroritemnotfound") || codes.has("itemnotfound"))) {
    throw new PermanentPollError("The configured Outlook folder does not exist.");
  }
  if (result.status == 400 && (codes.has("errorinvalididmalformed") || codes.has("inefficientfilter"))) {
    throw new PermanentPollError("Outlook rejected the configured folder or filters.");
  }
  throw new TransientPollError(`Outlook ${operation} failed with status ${result.status}.`);
}

function errorCodes(data: unknown): Set<string> {
  const codes = new Set<string>();
  let value = record(data)?.error;
  for (let depth = 0; depth < 4; depth += 1) {
    const error = record(value);
    if (error == null) break;
    if (typeof error.code == "string" && error.code.length > 0) codes.add(error.code.toLowerCase());
    value = error.innerError ?? error.innererror;
  }
  return codes;
}

function messages(data: unknown): readonly Message[] {
  const value = record(data)?.value;
  return Array.isArray(value) ? (value as readonly Message[]) : [];
}

function newestMessage(rows: readonly Message[]): { readonly iso: string; readonly ms: number } | null {
  let newest: { readonly iso: string; readonly ms: number } | null = null;
  for (const row of rows) {
    const ms = isoMs(row.receivedDateTime);
    if (row.receivedDateTime != null && ms != null && (newest == null || ms > newest.ms))
      newest = { iso: row.receivedDateTime, ms };
  }
  return newest;
}

function isoMs(value: string | undefined): number | null {
  if (value == null || value.length == 0) return null;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? null : milliseconds;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
