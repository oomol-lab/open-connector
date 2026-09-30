import type {
  IntegrationDefinition,
  IntegrationReceiveContext,
  IntegrationReceiveResult,
  IntegrationReconcileContext,
  IntegrationStateContext,
} from "../../triggers/common/integration.ts";
import type { ConnectorProxy, ConnectorProxyRequest, ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { resolveTriggerConfig } from "../../triggers/common/config.ts";
import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { snapshot, additionalSnapshot0 } from "./trigger-changes.definition.ts";

interface Config {
  readonly driveId?: string;
  readonly includeCorpusRemovals: boolean;
  readonly includeItemsFromAllDrives: boolean;
  readonly includeRemoved: boolean;
  readonly pageSize: number;
  readonly restrictToMyDrive: boolean;
}

interface Channel {
  readonly createdAt: string;
  readonly expiration: string;
  readonly id: string;
  readonly resourceId?: string;
  readonly state: "active" | "creating" | "retiring" | "stopping";
}

interface ReadContext {
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly connector: ConnectorProxy;
  readonly signal?: AbortSignal;
}

interface ChannelResponse {
  readonly expiration?: string;
  readonly resourceId?: string;
}

const channelLifetimeMs = 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
const channelRenewalLeadMs = 60 * 60 * 1000;
const creatingGraceMs = 60 * 1000;
const retryMs = 60 * 1000;
const maximumUnresolvedChannels = 2;

const encoder = new TextEncoder();
const changeFields =
  "nextPageToken,newStartPageToken,changes(fileId,kind,changeType,removed,time,driveId,file(id,name,mimeType,webViewLink,createdTime,modifiedTime,size,driveId,parents,shared,starred,trashed))";

export const googleDriveChanges: IntegrationDefinition = {
  initialState: { checkpoint: null, subscription: { channels: [] } },
  snapshot,
  async receive(context) {
    const verified = await receiveNotification(context);
    if (verified.outcome != "wake") return verified;
    const state = requireState(context.state);
    const resourceState = context.header("x-goog-resource-state")!;
    if (!context.admit) {
      return context.current
        ? { body: "", contentType: "text/plain", outcome: "respond", status: 503 }
        : { outcome: "ignored", reason: "Google Drive channel belongs to a retiring runtime." };
    }
    if (context.allow != null && !(await context.allow()))
      return { outcome: "ignored", reason: "The Team cannot admit Trigger events." };

    const page = await readGoogleDriveChanges(context, state.checkpoint);
    const notification = {
      changedTypes: (context.header("x-goog-changed") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      messageNumber: context.header("x-goog-message-number") ?? null,
      resourceState,
      resourceUri: context.header("x-goog-resource-uri") ?? null,
    };
    const events = page.changes.map((change) => normalizeChange(change, notification));
    const delivery = {
      checkpoint: page.checkpoint,
      continue: page.hasMore,
      dedupeKey: page.dedupeKey,
    };
    return events.length == 0
      ? { ...delivery, outcome: "ignored", reason: "Google Drive change page is empty." }
      : { ...delivery, outcome: "event", outputs: { events } };
  },
  async reconcile(context) {
    const state = requireState(context.state);
    let channels = readChannels(state);
    const currentTime = context.now.getTime();
    const current = channels.filter((channel) => Date.parse(channel.expiration) > currentTime);
    if (current.length != channels.length) {
      channels = current;
      await saveChannels(state, channels, context.now);
    }
    if (!context.active) return await retire(context, channels);

    const adopted = channels
      .filter((channel) => channel.state == "creating" && channel.resourceId != null)
      .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    if (adopted != null) {
      channels = channels.map((channel) => ({
        ...channel,
        state: channel.id == adopted.id ? "active" : "retiring",
      }));
      await saveChannels(state, channels, context.now);
    }

    let active = channels.find((channel) => channel.state == "active");
    const creating = channels.filter((channel) => channel.state == "creating");
    const staleCreating = creating.filter((channel) => Date.parse(channel.createdAt) + creatingGraceMs <= currentTime);
    if (staleCreating.length > 0) {
      const staleIds = new Set(staleCreating.map((channel) => channel.id));
      channels = channels.map((channel) => (staleIds.has(channel.id) ? { ...channel, state: "retiring" } : channel));
      await saveChannels(state, channels, context.now);
    }

    active = channels.find((channel) => channel.state == "active");
    if (active != null) {
      try {
        channels = await stopRetiring(context, channels);
      } catch {
        return { outcome: "ready" };
      }
      active = channels.find((channel) => channel.state == "active");
      if (active != null && Date.parse(active.expiration) - channelRenewalLeadMs > currentTime) {
        await saveChannels(state, channels, nextReconcileAt(channels, context.now));
        return { outcome: "ready" };
      }
    }

    if (channels.some((channel) => channel.state == "creating")) {
      await saveChannels(state, channels, nextReconcileAt(channels, context.now));
      return { outcome: active == null ? "pending" : "ready" };
    }
    const unresolved = channels.filter((channel) => channel.resourceId == null);
    if (unresolved.length >= maximumUnresolvedChannels) {
      await saveChannels(state, channels, nextReconcileAt(channels, context.now));
      return { outcome: active == null ? "pending" : "ready" };
    }
    return await watch(context, channels);
  },
};

function requireState(state: IntegrationStateContext | undefined): IntegrationStateContext {
  if (state == null) throw new PermanentIntegrationError("Google Drive Integration state is missing.");
  return state;
}

function resolveConfig(config: Readonly<Record<string, JsonValue>>): Config {
  const value = resolveTriggerConfig(snapshot.configInputs, config);
  return {
    ...(typeof value.driveId == "string" ? { driveId: value.driveId } : {}),
    includeCorpusRemovals: value.includeCorpusRemovals as boolean,
    includeItemsFromAllDrives: value.includeItemsFromAllDrives as boolean,
    includeRemoved: value.includeRemoved as boolean,
    pageSize: value.pageSize as number,
    restrictToMyDrive: value.restrictToMyDrive as boolean,
  };
}

function checkpoint(value: JsonValue): string {
  const pageToken = isRecord(value) ? optionalString(value.pageToken) : undefined;
  if (pageToken == null) throw new PermanentIntegrationError("Google Drive checkpoint pageToken is missing.");
  return pageToken;
}

function readChannels(state: IntegrationStateContext): Channel[] {
  const value = state.subscription.channels;
  if (!Array.isArray(value)) throw new PermanentIntegrationError("Google Drive channel state is invalid.");
  const channels = value.map((item) => {
    if (item == null || typeof item != "object" || Array.isArray(item))
      throw new PermanentIntegrationError("Google Drive channel is invalid.");
    const channel = item as Readonly<Record<string, JsonValue>>;
    if (
      typeof channel.createdAt != "string" ||
      !Number.isFinite(Date.parse(channel.createdAt)) ||
      typeof channel.expiration != "string" ||
      !Number.isFinite(Date.parse(channel.expiration)) ||
      typeof channel.id != "string" ||
      !["active", "creating", "retiring", "stopping"].includes(String(channel.state)) ||
      (channel.resourceId != null && typeof channel.resourceId != "string")
    ) {
      throw new PermanentIntegrationError("Google Drive channel fields are invalid.");
    }
    const parsed = {
      createdAt: channel.createdAt,
      expiration: channel.expiration,
      id: channel.id,
      state: channel.state as Channel["state"],
    };
    return typeof channel.resourceId == "string" ? Object.assign(parsed, { resourceId: channel.resourceId }) : parsed;
  });
  if (new Set(channels.map((channel) => channel.id)).size != channels.length) {
    throw new PermanentIntegrationError("Google Drive channel IDs are duplicated.");
  }
  return channels;
}

async function watch(context: IntegrationReconcileContext, channels: Channel[]) {
  const state = requireState(context.state);
  const config = resolveConfig(context.config);
  let pageToken: string;
  if (state.checkpoint === null) {
    pageToken = await googleDriveStartPageToken(context);
    await state.saveCheckpoint({ pageToken });
  } else {
    pageToken = checkpoint(state.checkpoint);
  }
  const channel: Channel = {
    createdAt: context.now.toISOString(),
    expiration: new Date(context.now.getTime() + channelLifetimeMs).toISOString(),
    id: crypto.randomUUID(),
    state: "creating",
  };
  channels = [...channels, channel];
  await saveChannels(state, channels, new Date(context.now.getTime() + creatingGraceMs));
  let response: ConnectorProxyResult;
  try {
    response = await execute(context, {
      body: {
        address: context.endpointUrl,
        expiration: String(Date.parse(channel.expiration)),
        id: channel.id,
        token: await channelToken(context.callbackSecret, channel.id),
        type: "web_hook",
      },
      endpoint: "/drive/v3/changes/watch",
      method: "POST",
      query: {
        ...(config.driveId == null ? {} : { driveId: config.driveId }),
        includeItemsFromAllDrives: config.driveId == null ? config.includeItemsFromAllDrives : true,
        pageToken,
        restrictToMyDrive: config.restrictToMyDrive,
        supportsAllDrives: true,
      },
    });
  } catch (error) {
    if (error instanceof IntegrationConnectionError || error instanceof PermanentIntegrationError) {
      await saveChannels(
        state,
        channels.filter((candidate) => candidate.id != channel.id),
        context.now,
      );
    }
    throw error;
  }
  if (!(response.status >= 200 && response.status < 300 && isRecord(response.data))) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408)
      await saveChannels(
        state,
        channels.filter((candidate) => candidate.id !== channel.id),
        context.now,
      );
    failure(response, "changes.watch");
  }
  const result = response.data as ChannelResponse;
  const resourceId = optionalString(result.resourceId);
  if (resourceId == null)
    throw new TransientIntegrationError("Google Drive changes.watch response is missing resourceId.");
  const expiration = epoch(result.expiration) ?? channel.expiration;
  channels = channels.map((candidate) => {
    if (candidate.id == channel.id) return { ...candidate, expiration, resourceId, state: "active" };
    return candidate.state == "active" ? { ...candidate, state: "retiring" } : candidate;
  });
  await saveChannels(state, channels, nextReconcileAt(channels, context.now));
  try {
    channels = await stopRetiring(context, channels);
  } catch {
    return { outcome: "ready" as const };
  }
  await saveChannels(state, channels, nextReconcileAt(channels, context.now));
  return { outcome: "ready" as const };
}

async function retire(context: IntegrationReconcileContext, channels: Channel[]) {
  const state = requireState(context.state);
  if (channels.some((channel) => channel.state == "active" || channel.state == "creating")) {
    channels = channels.map((channel) => ({ ...channel, state: "retiring" }));
    await saveChannels(state, channels, context.now);
  }
  channels = await stopRetiring(context, channels);
  if (channels.length == 0) return { outcome: "ready" as const };
  await saveChannels(state, channels, nextReconcileAt(channels, context.now));
  return { outcome: "pending" as const };
}

async function stopRetiring(context: IntegrationReconcileContext, channels: Channel[]): Promise<Channel[]> {
  const state = requireState(context.state);
  for (const channel of channels) {
    if ((channel.state != "retiring" && channel.state != "stopping") || channel.resourceId == null) continue;
    const stopping = channels.map((candidate) =>
      candidate.id == channel.id ? { ...candidate, state: "stopping" as const } : candidate,
    );
    await saveChannels(state, stopping, new Date(context.now.getTime() + retryMs));
    await stopChannel(context, channel);
    channels = stopping.filter((candidate) => candidate.id != channel.id);
    await saveChannels(state, channels, context.now);
  }
  return channels;
}

export async function googleDriveStartPageToken(context: ReadContext): Promise<string> {
  const config = resolveConfig(context.config);
  const result = await request(
    context,
    {
      endpoint: "/drive/v3/changes/startPageToken",
      method: "GET",
      query: {
        ...(config.driveId == null ? {} : { driveId: config.driveId }),
        supportsAllDrives: true,
      },
    },
    "changes.getStartPageToken",
  );
  const token = isRecord(result) ? optionalString(result.startPageToken) : undefined;
  if (token == null) throw new TransientIntegrationError("Google Drive startPageToken response is invalid.");
  return token;
}

async function readGoogleDriveChanges(context: ReadContext, cursor: JsonValue) {
  const config = resolveConfig(context.config);
  const pageToken = checkpoint(cursor);
  const result = await request<Record<string, JsonValue>>(
    context,
    {
      endpoint: "/drive/v3/changes",
      method: "GET",
      query: {
        ...(config.driveId == null ? {} : { driveId: config.driveId }),
        fields: changeFields,
        includeCorpusRemovals: config.includeCorpusRemovals,
        includeItemsFromAllDrives: config.driveId == null ? config.includeItemsFromAllDrives : true,
        includeRemoved: config.includeCorpusRemovals || config.includeRemoved,
        pageSize: config.pageSize,
        pageToken,
        restrictToMyDrive: config.restrictToMyDrive,
        supportsAllDrives: true,
      },
    },
    "changes.list",
  );
  for (const field of ["nextPageToken", "newStartPageToken"] as const) {
    if (result[field] !== undefined && optionalString(result[field]) == null) {
      throw new TransientIntegrationError(`Google Drive changes response contains an invalid ${field}.`);
    }
  }
  const nextPageToken = optionalString(result.nextPageToken);
  const nextCheckpoint = nextPageToken ?? optionalString(result.newStartPageToken);
  if (nextCheckpoint == null)
    throw new TransientIntegrationError("Google Drive changes response is missing its next checkpoint.");
  if (result.changes != null && (!Array.isArray(result.changes) || !result.changes.every(isRecord))) {
    throw new TransientIntegrationError("Google Drive changes response contains invalid changes.");
  }
  if (nextPageToken === pageToken)
    throw new TransientIntegrationError("Google Drive changes continuation did not advance.");
  return {
    changes: (result.changes ?? []) as readonly Readonly<Record<string, JsonValue>>[],
    checkpoint: { pageToken: nextCheckpoint },
    dedupeKey: `${config.driveId ?? "my-drive"}:${pageToken}`,
    hasMore: nextPageToken != null,
  };
}

async function stopChannel(context: IntegrationReconcileContext, channel: Channel): Promise<void> {
  const result = await execute(context, {
    body: { id: channel.id, resourceId: channel.resourceId! },
    endpoint: "/drive/v3/channels/stop",
    method: "POST",
  });
  if ((result.status >= 200 && result.status < 300) || result.status == 404) return;
  failure(result, "channels.stop");
}

async function request<T>(context: ProxyContext, input: ConnectorProxyRequest, operation: string): Promise<T> {
  const result = await execute(context, input);
  if (result.status >= 200 && result.status < 300 && isRecord(result.data)) return result.data as T;
  failure(result, operation);
}

async function execute(context: ProxyContext, input: ConnectorProxyRequest): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute(input, context.signal);
  } catch (cause) {
    if (cause instanceof IntegrationConnectionError) throw cause;
    throw new TransientIntegrationError("Google Drive proxy request failed.", { cause });
  }
}

type ProxyContext = Pick<IntegrationReceiveContext, "connector"> & Pick<IntegrationReconcileContext, "signal">;

function failure(result: ConnectorProxyResult, operation: string): never {
  const reason = googleReason(result.data);
  if (result.status == 401 || (result.status == 403 && !reason.toLowerCase().includes("ratelimit"))) {
    throw new IntegrationConnectionError(`Google Drive ${operation} requires Connection reauthorization.`);
  }
  if (result.status == 408 || result.status == 429 || result.status >= 500) {
    throw new TransientIntegrationError(`Google Drive ${operation} is temporarily unavailable.`);
  }
  throw new PermanentIntegrationError(
    `Google Drive ${operation} rejected the subscription${reason == "" ? "." : ` with ${reason}.`}`,
  );
}

function googleReason(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error)) return "";
  const errors = value.error.errors;
  if (Array.isArray(errors) && isRecord(errors[0]) && typeof errors[0].reason == "string") return errors[0].reason;
  return typeof value.error.status == "string" ? value.error.status : "";
}

function normalizeChange(
  change: Readonly<Record<string, JsonValue>>,
  notification: Readonly<Record<string, JsonValue>>,
) {
  const driveId = optionalString(change.driveId);
  const fileId = optionalString(change.fileId);
  const time = optionalString(change.time);
  const changeType = optionalString(change.changeType);
  const removed = change.removed === true;
  return {
    changeId: [
      driveId ?? "my-drive",
      fileId ?? "unknown-file",
      time ?? "unknown-time",
      changeType ?? "unknown-change",
      removed ? "removed" : "present",
    ].join(":"),
    changeType: changeType ?? null,
    driveId: driveId ?? null,
    file: isRecord(change.file) ? change.file : null,
    fileId: fileId ?? null,
    notification,
    removed,
    time: time ?? null,
  };
}

async function saveChannels(
  state: IntegrationStateContext,
  channels: readonly Channel[],
  reconcileAt: Date,
): Promise<void> {
  await state.saveSubscription({ channels: channels as unknown as JsonValue }, reconcileAt);
}

function nextReconcileAt(channels: readonly Channel[], now: Date): Date {
  const times = channels.map((channel) => {
    if (channel.state == "active") return Date.parse(channel.expiration) - channelRenewalLeadMs;
    if (channel.state == "creating") return Date.parse(channel.createdAt) + creatingGraceMs;
    return channel.resourceId == null ? Date.parse(channel.expiration) : now.getTime() + retryMs;
  });
  const next = times.length == 0 ? now.getTime() + retryMs : Math.min(...times);
  return new Date(Math.max(now.getTime(), next));
}

async function channelToken(secret: string, channelId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { hash: "SHA-256", name: "HMAC" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`google-drive-channel/v1/${channelId}`)),
  );
  return Buffer.from(signature).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function sameSecret(candidate: string, expected: string): boolean {
  if (candidate.length != expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1)
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference == 0;
}

function epoch(value: unknown): string | undefined {
  const timestamp = typeof value == "string" || typeof value == "number" ? Number(value) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value == "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value != null && typeof value == "object" && !Array.isArray(value);
}

async function receiveNotification(context: IntegrationReceiveContext): Promise<IntegrationReceiveResult> {
  const state = requireState(context.state);
  const channelId = context.header("x-goog-channel-id");
  const resourceId = context.header("x-goog-resource-id");
  const resourceState = context.header("x-goog-resource-state");
  const token = context.header("x-goog-channel-token");
  if (channelId == null || resourceId == null || resourceState == null || token == null) {
    return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
  }
  let channels = readChannels(state);
  const channel = channels.find(
    (candidate) => candidate.id == channelId && Date.parse(candidate.expiration) > context.now.getTime(),
  );
  if (
    channel == null ||
    !sameSecret(token, await channelToken(context.callbackSecret, channelId)) ||
    (channel.resourceId != null && channel.resourceId != resourceId)
  ) {
    return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
  }
  if (channel.resourceId == null) {
    channels = channels.map((candidate) => (candidate.id == channelId ? { ...candidate, resourceId } : candidate));
    await saveChannels(state, channels, context.now);
  }
  if (resourceState != "sync" && resourceState != "change") {
    return { outcome: "ignored", reason: "Google Drive notification state is not actionable." };
  }
  return { outcome: "wake" };
}

export const googleDriveChangeListener: IntegrationDefinition = {
  initialState: googleDriveChanges.initialState,
  reconcile: googleDriveChanges.reconcile,
  receive: receiveNotification,
  listener: {
    intervalMs: 300_000,
    async read(context) {
      const page = await readGoogleDriveChanges(context, context.checkpoint);
      return {
        checkpoint: page.checkpoint,
        dedupeKey: page.dedupeKey,
        hasMore: page.hasMore,
        outputs: page.changes.length == 0 ? null : { events: page.changes },
      };
    },
  },
  snapshot: additionalSnapshot0,
};
