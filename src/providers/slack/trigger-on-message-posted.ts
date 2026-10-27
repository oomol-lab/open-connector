import type { PollContext, PollDefinition, PollEvent } from "../../triggers/common/poll.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { HttpRequestError } from "../../server/api/http-utils.ts";
import {
  eventsPollOutputs,
  PermanentPollError,
  PollConnectionError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-message-posted.definition.ts";

interface Config {
  readonly channelId: string;
  readonly fromUserIds: readonly string[];
  readonly ignoreUserIds: readonly string[];
  readonly includeBotMessages: boolean;
  readonly includeSystemMessages: boolean;
  readonly maxMessagesPerPoll: number;
  readonly textContains: string;
}

type Checkpoint = Readonly<Record<string, JsonValue>> & {
  readonly drainLatest?: string;
  readonly lastTs: string;
  readonly pendingHighTs?: string;
};

interface History {
  readonly error?: string;
  readonly has_more?: boolean;
  readonly messages?: readonly Message[];
  readonly ok?: boolean;
}

interface Message {
  readonly bot_id?: string;
  readonly files?: readonly {
    readonly id?: string;
    readonly mimetype?: string;
    readonly name?: string;
  }[];
  readonly subtype?: string;
  readonly text?: string;
  readonly thread_ts?: string;
  readonly ts?: string;
  readonly user?: string;
}

interface TimedMessage {
  readonly message: Message;
  readonly ts: string;
}

const seedBackoffMs = 60_000;
const plainSubtypes = new Set(["file_share", "thread_broadcast", "me_message", "bot_message"]);
const credentialErrors = new Set([
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
  "two_factor_setup_required",
]);
const permanentErrors = new Set([
  "channel_not_found",
  "not_in_channel",
  "not_allowed_token_type",
  "access_denied",
  "channel_is_limited_access",
  "ekm_access_denied",
  "enterprise_is_restricted",
  "no_permission",
  "team_access_not_granted",
  "invalid_ts_oldest",
  "invalid_ts_latest",
  "method_deprecated",
  "deprecated_endpoint",
  "accesslimited",
]);

export const slackMessagePosted: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null) {
      return { checkpoint: { lastTs: await seed(context, config.channelId) }, events: [] };
    }
    const checkpoint = readCheckpoint(context.checkpoint);
    const history = await fetchHistory(context, config, checkpoint);
    const messages = timedMessages(history);
    const events: PollEvent[] = [];
    let filtered = 0;
    for (const entry of messages.toReversed()) {
      if (!matches(entry.message, config)) {
        filtered += 1;
        continue;
      }
      events.push(event(entry, config.channelId));
    }
    return { checkpoint: nextCheckpoint(checkpoint, history, messages), events, filtered };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    channelId: value.channelId as string,
    fromUserIds: value.fromUserIds as readonly string[],
    ignoreUserIds: value.ignoreUserIds as readonly string[],
    includeBotMessages: value.includeBotMessages as boolean,
    includeSystemMessages: value.includeSystemMessages as boolean,
    maxMessagesPerPoll: value.maxMessagesPerPoll as number,
    textContains: value.textContains as string,
  };
}

async function seed(context: PollContext, channelId: string): Promise<string> {
  const result = await slackGet(context, { channel: channelId, limit: 1 });
  success(result, "baseline history fetch");
  const ts = (result.data as History).messages?.[0]?.ts;
  return ts != null && validTs(ts) ? ts : `${Math.floor((context.now.getTime() - seedBackoffMs) / 1000)}.000000`;
}

function readCheckpoint(value: JsonValue): Checkpoint {
  const checkpoint = value as Readonly<Record<string, JsonValue>>;
  if (typeof checkpoint.lastTs != "string" || checkpoint.lastTs.length == 0) {
    throw new PermanentPollError("Slack checkpoint lastTs is missing.");
  }
  const drainLatest = checkpoint.drainLatest;
  const pendingHighTs = checkpoint.pendingHighTs;
  if (drainLatest == null && pendingHighTs == null) return { lastTs: checkpoint.lastTs };
  if (
    typeof drainLatest != "string" ||
    drainLatest.length == 0 ||
    typeof pendingHighTs != "string" ||
    pendingHighTs.length == 0
  ) {
    throw new PermanentPollError("Slack checkpoint drain fields are incomplete.");
  }
  return { drainLatest, lastTs: checkpoint.lastTs, pendingHighTs };
}

async function fetchHistory(context: PollContext, config: Config, checkpoint: Checkpoint): Promise<History> {
  const result = await slackGet(context, {
    channel: config.channelId,
    inclusive: "false",
    latest: checkpoint.drainLatest,
    limit: config.maxMessagesPerPoll,
    oldest: checkpoint.lastTs,
  });
  success(result, "history list");
  return result.data as History;
}

async function slackGet(
  context: PollContext,
  query: Record<string, number | string | undefined>,
): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute(
      {
        endpoint: "/conversations.history",
        method: "GET",
        query: Object.fromEntries(
          Object.entries(query).filter((entry): entry is [string, number | string] => entry[1] != null),
        ),
      },
      context.signal,
    );
  } catch (cause) {
    throw new TransientPollError("Slack proxy request failed.", { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  const body: History =
    result.data != null && typeof result.data === "object" && !Array.isArray(result.data)
      ? (result.data as History)
      : {};
  if (result.status >= 200 && result.status < 300 && body.ok === true) return;
  const code = typeof body.error == "string" ? body.error : "";
  if (code === "missing_scope")
    throw new HttpRequestError(
      "scope_missing",
      "Slack history permission is missing for the selected conversation",
      403,
    );
  if (credentialErrors.has(code)) throw new PollConnectionError(`Slack ${operation} rejected with ${code}.`);
  if (permanentErrors.has(code)) throw new PermanentPollError(`Slack ${operation} rejected with ${code}.`);
  throw new TransientPollError(`Slack ${operation} failed with ${code || `status ${result.status}`}.`);
}

function timedMessages(history: History): TimedMessage[] {
  return (history.messages ?? []).flatMap((message) =>
    message.ts != null && validTs(message.ts) ? [{ message, ts: message.ts }] : [],
  );
}

function nextCheckpoint(checkpoint: Checkpoint, history: History, messages: readonly TimedMessage[]): Checkpoint {
  const newestTs = messages[0]?.ts;
  const oldestTs = messages.at(-1)?.ts;
  if (history.has_more === true) {
    if (newestTs == null || oldestTs == null)
      throw new TransientPollError("Slack history reports has_more without a usable timestamp.");
    return {
      drainLatest: oldestTs,
      lastTs: checkpoint.lastTs,
      pendingHighTs: checkpoint.pendingHighTs ?? newestTs,
    };
  }
  if (checkpoint.pendingHighTs != null) return { lastTs: checkpoint.pendingHighTs };
  return { lastTs: newestTs ?? checkpoint.lastTs };
}

function matches(message: Message, config: Config): boolean {
  if (!config.includeBotMessages && (message.bot_id != null || message.subtype == "bot_message")) return false;
  if (!config.includeSystemMessages && message.subtype != null && !plainSubtypes.has(message.subtype)) return false;
  if (config.fromUserIds.length > 0 && (message.user == null || !config.fromUserIds.includes(message.user)))
    return false;
  if (message.user != null && config.ignoreUserIds.includes(message.user)) return false;
  return (
    config.textContains.length == 0 || (message.text ?? "").toLowerCase().includes(config.textContains.toLowerCase())
  );
}

function event(entry: TimedMessage, channelId: string): PollEvent {
  return {
    dedupeKey: `${channelId}:${entry.ts}`,
    payload: {
      botId: entry.message.bot_id ?? null,
      channelId,
      files: (entry.message.files ?? []).map((file) => ({
        id: file.id ?? "",
        mimetype: file.mimetype ?? "",
        name: file.name ?? "",
      })),
      messageTs: entry.ts,
      subtype: entry.message.subtype ?? null,
      text: entry.message.text ?? "",
      threadTs: entry.message.thread_ts ?? null,
      userId: entry.message.user ?? null,
    },
  };
}

function validTs(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value) && !Number.isNaN(new Date(Math.round(Number(value) * 1000)).getTime());
}
