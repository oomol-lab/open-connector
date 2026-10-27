import type { PollContext, PollDefinition, PollEvent } from "../../triggers/common/poll.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  eventsPollOutputs,
  maximumPollEventsPerPage,
  PermanentPollError,
  PollConnectionError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-message-received.definition.ts";

interface Config {
  readonly includeDrafts: boolean;
  readonly includeSpamAndTrash: boolean;
  readonly labelNamesOrIds: readonly string[];
  readonly maxMessagesPerPoll: number;
  readonly readStatus: "All" | "Read" | "Unread";
  readonly search: string;
  readonly sender: string;
}

interface Checkpoint {
  readonly historyId: string;
  readonly pageToken?: string;
  readonly messageOffset?: number;
}

interface HistoryPage {
  readonly history?: readonly {
    readonly messagesAdded?: readonly {
      readonly message?: { readonly id?: string; readonly threadId?: string };
    }[];
  }[];
  readonly historyId?: string;
  readonly nextPageToken?: string;
}

interface Message {
  readonly historyId?: string;
  readonly id: string;
  readonly internalDate?: string;
  readonly labelIds?: readonly string[];
  readonly payload?: { readonly headers?: readonly Header[] };
  readonly threadId?: string;
}

interface Header {
  readonly name: string;
  readonly value: string;
}

export const gmailMessageReceived: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null) return { checkpoint: { historyId: await profileHistoryId(context) }, events: [] };
    const checkpoint = readCheckpoint(context.checkpoint);
    const labels = await labelIds(context, config.labelNamesOrIds);
    const budget = Math.min(config.maxMessagesPerPoll, maximumPollEventsPerPage);
    const { candidates, lastPage } = await listMessages(context, checkpoint, labels, budget);
    const offset = checkpoint.messageOffset ?? 0;
    const end = Math.min(offset + budget, candidates.length);
    // History pages count records, so consume all messages before advancing the page token.
    const next =
      end < candidates.length
        ? {
            checkpoint: { historyId: checkpoint.historyId, pageToken: checkpoint.pageToken, messageOffset: end },
            hasMore: true,
          }
        : nextCheckpoint(checkpoint.historyId, lastPage);
    const events: PollEvent[] = [];
    let filtered = 0;
    for (const candidate of candidates.slice(offset, end)) {
      const message = await messageMetadata(context, candidate.id);
      if (message == null) continue;
      if (!(await matches(context, message, config, labels))) {
        filtered += 1;
        continue;
      }
      events.push(event(message));
    }
    return {
      checkpoint: next.checkpoint as unknown as JsonValue,
      events,
      filtered,
      ...(next.hasMore ? { hasMore: true } : {}),
    };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    includeDrafts: value.includeDrafts as boolean,
    includeSpamAndTrash: value.includeSpamAndTrash as boolean,
    labelNamesOrIds: value.labelNamesOrIds as readonly string[],
    maxMessagesPerPoll: value.maxMessagesPerPoll as number,
    readStatus: value.readStatus as Config["readStatus"],
    search: (value.search as string).trim(),
    sender: (value.sender as string).trim(),
  };
}

async function profileHistoryId(context: PollContext): Promise<string> {
  const result = await get(context, "/users/me/profile");
  success(result, "profile fetch");
  const historyId = record(result.data)?.historyId;
  if (typeof historyId != "string" || historyId.length == 0)
    throw new TransientPollError("Gmail profile historyId is missing.");
  return historyId;
}

function readCheckpoint(value: JsonValue): Checkpoint {
  const checkpoint = record(value);
  if (typeof checkpoint?.historyId != "string" || checkpoint.historyId.length == 0) {
    throw new PermanentPollError("Gmail checkpoint historyId is missing; recreate the Trigger.");
  }
  if (
    checkpoint.messageOffset !== undefined &&
    (!Number.isInteger(checkpoint.messageOffset) || (checkpoint.messageOffset as number) < 0)
  ) {
    throw new PermanentPollError("Gmail checkpoint messageOffset is invalid; recreate the Trigger.");
  }
  return {
    historyId: checkpoint.historyId,
    ...(typeof checkpoint.pageToken == "string" ? { pageToken: checkpoint.pageToken } : {}),
    messageOffset: checkpoint.messageOffset as number | undefined,
  };
}

async function labelIds(context: PollContext, configured: readonly string[]): Promise<readonly string[]> {
  if (configured.length == 0) return [];
  const result = await get(context, "/users/me/labels");
  success(result, "labels list");
  const labels = record(result.data)?.labels;
  const byId = new Set<string>();
  const byName = new Map<string, string>();
  if (Array.isArray(labels)) {
    for (const value of labels) {
      const label = record(value);
      if (typeof label?.id != "string" || label.id.length == 0) continue;
      byId.add(label.id);
      if (typeof label.name == "string" && label.name.length > 0) byName.set(label.name.toLowerCase(), label.id);
    }
  }
  return [
    ...new Set(
      configured.map((value) => {
        const id = byId.has(value) ? value : byName.get(value.toLowerCase());
        if (id == null) throw new PermanentPollError(`Gmail label "${value}" does not exist.`);
        return id;
      }),
    ),
  ];
}

async function listMessages(
  context: PollContext,
  checkpoint: Checkpoint,
  labels: readonly string[],
  maxMessages: number,
): Promise<{
  readonly candidates: readonly { readonly id: string }[];
  readonly lastPage: HistoryPage;
}> {
  const candidates = new Map<string, { readonly id: string }>();
  const result = await get(context, "/users/me/history", {
    historyTypes: "messageAdded",
    labelId: labels[0],
    maxResults: maxMessages,
    pageToken: checkpoint.pageToken,
    startHistoryId: checkpoint.historyId,
  });
  if (result.status == 404) throw new PermanentPollError("Gmail history checkpoint expired; recreate the Trigger.");
  success(result, "history list");
  const lastPage = (record(result.data) ?? {}) as HistoryPage;
  for (const history of lastPage.history ?? []) {
    for (const added of history.messagesAdded ?? []) {
      const id = added.message?.id;
      if (id != null && id.length > 0 && !candidates.has(id)) candidates.set(id, { id });
    }
  }
  return { candidates: [...candidates.values()], lastPage };
}

function nextCheckpoint(
  historyId: string,
  page: HistoryPage,
): { readonly checkpoint: Checkpoint; readonly hasMore: boolean } {
  if (page.nextPageToken) return { checkpoint: { historyId, pageToken: page.nextPageToken }, hasMore: true };
  if (!page.historyId) throw new TransientPollError("Gmail history response historyId is missing.");
  return { checkpoint: { historyId: page.historyId }, hasMore: false };
}

async function messageMetadata(context: PollContext, id: string): Promise<Message | null> {
  const result = await get(context, `/users/me/messages/${encodeURIComponent(id)}`, {
    format: "metadata",
  });
  if (result.status == 404) return null;
  success(result, "message metadata fetch");
  return (record(result.data) as Message | undefined) ?? null;
}

async function matches(
  context: PollContext,
  message: Message,
  config: Config,
  requiredLabels: readonly string[],
): Promise<boolean> {
  const labels = message.labelIds ?? [];
  if (labels.includes("SENT") && !labels.includes("INBOX")) return false;
  if (!config.includeSpamAndTrash && (labels.includes("SPAM") || labels.includes("TRASH"))) return false;
  if (!config.includeDrafts && labels.includes("DRAFT")) return false;
  if (config.readStatus == "Unread" && !labels.includes("UNREAD")) return false;
  if (config.readStatus == "Read" && labels.includes("UNREAD")) return false;
  if (!requiredLabels.every((label) => labels.includes(label))) return false;
  const query = searchQuery(config);
  return query.length == 0 || (await matchesQuery(context, message, query, config.includeSpamAndTrash));
}

function searchQuery(config: Config): string {
  const query = config.search.length == 0 ? [] : [config.search];
  const sender = config.sender.replaceAll('"', "").trim();
  if (sender.length > 0) query.push(`from:${/\s/.test(sender) ? `"${sender}"` : sender}`);
  return query.join(" ");
}

async function matchesQuery(
  context: PollContext,
  message: Message,
  query: string,
  includeSpamAndTrash: boolean,
): Promise<boolean> {
  const messageId = header(message.payload?.headers ?? [], "Message-ID")
    .replace(/^</, "")
    .replace(/>$/, "");
  if (messageId.length == 0) return false;
  const result = await get(context, "/users/me/messages", {
    includeSpamTrash: includeSpamAndTrash ? "true" : undefined,
    q: `${query} rfc822msgid:${messageId}`,
  });
  success(result, "query match");
  const messages = record(result.data)?.messages;
  return Array.isArray(messages) && messages.some((value) => record(value)?.id === message.id);
}

function event(message: Message): PollEvent {
  const headers = message.payload?.headers ?? [];
  return {
    dedupeKey: message.id,
    payload: {
      historyId: message.historyId ?? null,
      labelIds: message.labelIds ?? [],
      messageId: message.id,
      messageTimestamp: timestamp(message.internalDate, header(headers, "Date")),
      sender: header(headers, "From"),
      subject: header(headers, "Subject"),
      threadId: message.threadId ?? "",
      to: header(headers, "To"),
    },
  };
}

async function get(
  context: PollContext,
  endpoint: string,
  query: Readonly<Record<string, number | string | undefined>> = {},
): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute(
      {
        endpoint,
        method: "GET",
        query: Object.fromEntries(
          Object.entries(query).filter((entry): entry is [string, number | string] => entry[1] != null),
        ),
      },
      context.signal,
    );
  } catch (cause) {
    throw new TransientPollError(`Gmail proxy request to ${endpoint} failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401 || result.status == 403)
    throw new PollConnectionError(`Gmail ${operation} rejected the Connection.`);
  throw new TransientPollError(`Gmail ${operation} failed with status ${result.status}.`);
}

function header(headers: readonly Header[], name: string): string {
  return headers.find((value) => value.name.toLowerCase() == name.toLowerCase())?.value ?? "";
}

function timestamp(internalDate: string | undefined, fallback: string): string {
  const epoch = internalDate == null ? Number.NaN : Number(internalDate);
  if (Number.isFinite(epoch)) {
    const date = new Date(epoch);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = Date.parse(fallback);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
