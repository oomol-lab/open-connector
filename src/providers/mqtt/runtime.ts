import type { GuardedWebSocketOptions, WebSocketLike } from "../../core/guarded-websocket.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { IClientOptions, IClientPublishOptions, IClientSubscribeOptions, IPublishPacket, MqttClient } from "mqtt";

import mqtt from "mqtt";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { optionalInteger, optionalString } from "../../core/cast.ts";
import { openGuardedWebSocket } from "../../core/guarded-websocket.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

type MqttProtocolVersion = "3.1.1" | "5.0";
type PayloadEncoding = "utf8" | "base64";
type QualityOfService = 0 | 1 | 2;
type MqttActionHandler = (input: Record<string, unknown>, context: MqttActionContext) => Promise<unknown>;

interface MqttCredential {
  websocketUrl: string;
  username?: string;
  password?: string;
  protocolVersion: MqttProtocolVersion;
}

interface ReceivedMessage {
  topic: string;
  payload: string;
  qos: QualityOfService;
  retain: boolean;
  duplicate: boolean;
}

interface ReceiveResult {
  messages: ReceivedMessage[];
  timedOut: boolean;
}

export interface MqttConnectionDependencies {
  connect: (url: string, options: IClientOptions) => MqttClient;
  openWebSocket: (url: string, options: GuardedWebSocketOptions) => Promise<WebSocketLike>;
}

export interface MqttActionContext extends MqttCredential {
  signal?: AbortSignal;
}

export interface MqttActionDependencies {
  openClient: (credential: MqttCredential, signal?: AbortSignal) => Promise<MqttClient>;
}

const defaultDependencies: MqttConnectionDependencies = {
  connect: (url, options) => mqtt.connect(url, options),
  openWebSocket: (url, options) => openGuardedWebSocket(url, options),
};

export const mqttActionHandlers: Record<string, MqttActionHandler> = createMqttActionHandlers();

export function createMqttActionHandlers(
  dependencies: MqttActionDependencies = { openClient: openMqttClient },
): Record<string, MqttActionHandler> {
  return {
    async publish_message(input, context) {
      const topic = requireString(input.topic, "topic");
      if (topic.includes("+") || topic.includes("#")) {
        throw new ProviderRequestError(400, "topic must not contain MQTT wildcards");
      }
      const payloadEncoding = readPayloadEncoding(input.payloadEncoding);
      const payload = decodePayload(requirePresentString(input.payload, "payload"), payloadEncoding);
      const qos = readQos(input.qos);
      const retain = input.retain === true;
      const client = await dependencies.openClient(context, context.signal);
      try {
        const publishOptions: IClientPublishOptions = { qos, retain };
        await withAbort(
          client.publishAsync(topic, payload, publishOptions),
          context.signal,
          "MQTT publish was aborted",
        );
        return {
          topic,
          qos,
          retain,
          protocolVersion: context.protocolVersion,
          deliveryAcknowledged: qos !== 0,
        };
      } finally {
        await closeMqttClient(client);
      }
    },

    async receive_messages(input, context) {
      const topicFilter = requireString(input.topicFilter, "topicFilter");
      const qos = readQos(input.qos);
      const timeoutSeconds = readBoundedInteger(input.timeoutSeconds, "timeoutSeconds", 10, 1, 30);
      const maxMessages = readBoundedInteger(input.maxMessages, "maxMessages", 1, 1, 100);
      const payloadEncoding = readPayloadEncoding(input.payloadEncoding);
      const client = await dependencies.openClient(context, context.signal);
      try {
        const result = await receiveMessages(client, {
          topicFilter,
          qos,
          timeoutMs: timeoutSeconds * 1_000,
          maxMessages,
          payloadEncoding,
          signal: context.signal,
        });
        return { ...result, protocolVersion: context.protocolVersion };
      } finally {
        await closeMqttClient(client);
      }
    },
  };
}

export function createMqttContext(values: Record<string, string>, signal?: AbortSignal): MqttActionContext {
  const websocketUrl = normalizeWebSocketUrl(values.websocketUrl);
  const username = optionalString(values.username);
  const password = optionalString(values.password);
  if (password && !username) {
    throw new ProviderRequestError(400, "username is required when password is configured");
  }
  return {
    websocketUrl,
    username,
    password,
    protocolVersion: readProtocolVersion(values.protocolVersion),
    signal,
  };
}

export async function validateMqttCredential(
  values: Record<string, string>,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createMqttContext(values, signal);
  const client = await openMqttClient(context, context.signal);
  await closeMqttClient(client);
  const url = new URL(context.websocketUrl);
  return {
    profile: {
      accountId: `mqtt:${url.host}${url.pathname}`,
      displayName: url.host,
    },
    grantedScopes: [],
    metadata: {
      websocketUrl: context.websocketUrl,
      protocolVersion: context.protocolVersion,
    },
  };
}

export async function openMqttClient(
  credential: MqttCredential,
  signal?: AbortSignal,
  dependencies: MqttConnectionDependencies = defaultDependencies,
): Promise<MqttClient> {
  const websocket = await dependencies.openWebSocket(credential.websocketUrl, {
    allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    fieldName: "websocketUrl",
    protocols: ["mqtt"],
    signal,
  });
  let handedOff = false;
  const options: IClientOptions = {
    clean: true,
    clientId: `oomol-connect-${randomUUID()}`,
    connectTimeout: 15_000,
    forceNativeWebSocket: true,
    protocolVersion: credential.protocolVersion === "5.0" ? 5 : 4,
    reconnectPeriod: 0,
    username: credential.username,
    password: credential.password,
    createWebsocket(_url, protocols) {
      if (handedOff) {
        throw new ProviderRequestError(502, "MQTT.js requested more than one WebSocket connection");
      }
      handedOff = true;
      if (protocols.length !== 1 || protocols[0] !== "mqtt") {
        throw new ProviderRequestError(502, "MQTT.js requested an unexpected WebSocket subprotocol");
      }
      return websocket;
    },
  };

  let client: MqttClient;
  try {
    client = dependencies.connect(credential.websocketUrl, options);
    await waitForMqttConnection(client, signal);
    return client;
  } catch (error) {
    closeWebSocket(websocket);
    throw toMqttError(error, "MQTT connection failed");
  }
}

interface ReceiveMessagesOptions {
  topicFilter: string;
  qos: QualityOfService;
  timeoutMs: number;
  maxMessages: number;
  payloadEncoding: PayloadEncoding;
  signal?: AbortSignal;
}

async function receiveMessages(client: MqttClient, options: ReceiveMessagesOptions): Promise<ReceiveResult> {
  const messages: ReceivedMessage[] = [];
  let settled = false;
  let finish: (result: ReceiveResult) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const result = new Promise<ReceiveResult>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const complete = (value: ReceiveResult): void => {
    if (settled) return;
    settled = true;
    finish(value);
  };
  const failOnce = (error: Error): void => {
    if (settled) return;
    settled = true;
    fail(error);
  };
  const onMessage = (topic: string, payload: Buffer, packet: IPublishPacket): void => {
    if (settled) return;
    messages.push({
      topic,
      payload: encodePayload(payload, options.payloadEncoding),
      qos: readPacketQos(packet.qos),
      retain: packet.retain === true,
      duplicate: packet.dup === true,
    });
    if (messages.length >= options.maxMessages) {
      complete({ messages, timedOut: false });
    }
  };
  const onAbort = (): void => failOnce(new ProviderRequestError(499, "MQTT receive was aborted"));
  client.on("message", onMessage);
  try {
    const subscribeOptions: IClientSubscribeOptions = { qos: options.qos };
    await withAbort(
      client.subscribeAsync(options.topicFilter, subscribeOptions),
      options.signal,
      "MQTT subscription was aborted",
    );
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = globalThis.setTimeout(() => complete({ messages, timedOut: true }), options.timeoutMs);
    try {
      if (options.signal?.aborted) onAbort();
      return await result;
    } finally {
      globalThis.clearTimeout(timer);
    }
  } catch (error) {
    throw toMqttError(error, "MQTT subscription failed");
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    client.removeListener("message", onMessage);
    await client.unsubscribeAsync(options.topicFilter).catch(() => undefined);
  }
}

function waitForMqttConnection(client: MqttClient, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onConnect = (): void => finish(resolve);
    const onError = (error: Error): void => finish(() => reject(error));
    const onClose = (): void => finish(() => reject(new Error("MQTT connection closed before CONNACK")));
    const onAbort = (): void => finish(() => reject(new ProviderRequestError(499, "MQTT connection was aborted")));
    const finish = (complete: () => void): void => {
      client.removeListener("connect", onConnect);
      client.removeListener("error", onError);
      client.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
      complete();
    };
    client.once("connect", onConnect);
    client.once("error", onError);
    client.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined, message: string): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new ProviderRequestError(499, message));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function closeMqttClient(client: MqttClient): Promise<void> {
  try {
    await client.endAsync();
  } catch {
    await client.endAsync(true).catch(() => undefined);
  }
}

function closeWebSocket(socket: WebSocketLike): void {
  try {
    socket.close();
  } catch {
    // The connection error remains more useful than a secondary close failure.
  }
}

function normalizeWebSocketUrl(value: unknown): string {
  const rawValue = requireString(value, "websocketUrl");
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "websocketUrl must be a valid URL");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new ProviderRequestError(400, "websocketUrl must use ws or wss");
  }
  if (url.username || url.password || url.hash) {
    throw new ProviderRequestError(400, "websocketUrl must not contain credentials or a fragment");
  }
  return url.toString();
}

function readProtocolVersion(value: unknown): MqttProtocolVersion {
  const version = optionalString(value) ?? "3.1.1";
  if (version === "3.1.1" || version === "5.0") return version;
  throw new ProviderRequestError(400, "protocolVersion must be 3.1.1 or 5.0");
}

function readPayloadEncoding(value: unknown): PayloadEncoding {
  const encoding = optionalString(value) ?? "utf8";
  if (encoding === "utf8" || encoding === "base64") return encoding;
  throw new ProviderRequestError(400, "payloadEncoding must be utf8 or base64");
}

function readQos(value: unknown): QualityOfService {
  const qos = optionalInteger(value) ?? 0;
  if (qos === 0 || qos === 1 || qos === 2) return qos;
  throw new ProviderRequestError(400, "qos must be 0, 1, or 2");
}

function readPacketQos(value: unknown): QualityOfService {
  return value === 1 || value === 2 ? value : 0;
}

function readBoundedInteger(
  value: unknown,
  field: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = optionalInteger(value) ?? defaultValue;
  if (minimum <= parsed && parsed <= maximum) return parsed;
  throw new ProviderRequestError(400, `${field} must be between ${minimum} and ${maximum}`);
}

function decodePayload(payload: string, encoding: PayloadEncoding): Buffer {
  if (encoding === "utf8") return Buffer.from(payload, "utf8");
  const decoded = Buffer.from(payload, "base64");
  const normalizedInput = payload.replaceAll("=", "");
  const normalizedOutput = decoded.toString("base64").replaceAll("=", "");
  if (normalizedInput !== normalizedOutput) {
    throw new ProviderRequestError(400, "payload must be valid base64 when payloadEncoding is base64");
  }
  return decoded;
}

function encodePayload(payload: Buffer, encoding: PayloadEncoding): string {
  return payload.toString(encoding === "base64" ? "base64" : "utf8");
}

function requireString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (parsed) return parsed;
  throw new ProviderRequestError(400, `${field} is required`);
}

function requirePresentString(value: unknown, field: string): string {
  if (typeof value === "string") return value;
  throw new ProviderRequestError(400, `${field} is required`);
}

function toMqttError(error: unknown, fallback: string): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  return new ProviderRequestError(502, error instanceof Error ? error.message : fallback, error);
}
