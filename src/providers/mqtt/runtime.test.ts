import type { GuardedWebSocketOptions, WebSocketLike } from "../../core/guarded-websocket.ts";
import type { IClientOptions, MqttClient } from "mqtt";

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createMqttActionHandlers, createMqttContext, openMqttClient } from "./runtime.ts";

class FakeMqttClient extends EventEmitter {
  public published?: { topic: string; payload: Buffer; options: unknown };
  public onSubscribe?: () => void;

  public publishAsync(topic: string, payload: Buffer, options: unknown): Promise<undefined> {
    this.published = { topic, payload, options };
    return Promise.resolve(undefined);
  }

  public subscribeAsync(): Promise<[]> {
    queueMicrotask(() => this.onSubscribe?.());
    return Promise.resolve([]);
  }

  public unsubscribeAsync(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public endAsync(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeWebSocket implements WebSocketLike {
  public send(): void {}
  public close(): void {}
  public addEventListener(): void {}
}

describe("MQTT credential context", () => {
  it("defaults to MQTT 3.1.1 and normalizes the WebSocket URL", () => {
    expect(createMqttContext({ websocketUrl: "wss://broker.example.com/mqtt" })).toMatchObject({
      websocketUrl: "wss://broker.example.com/mqtt",
      protocolVersion: "3.1.1",
    });
  });

  it("rejects a password without a username", () => {
    expect(() => createMqttContext({ websocketUrl: "wss://broker.example.com/mqtt", password: "secret" })).toThrow(
      /username is required/,
    );
  });

  it("rejects non-WebSocket transports", () => {
    expect(() => createMqttContext({ websocketUrl: "mqtts://broker.example.com:8883" })).toThrow(/must use ws or wss/);
  });
});

describe("MQTT guarded WebSocket handoff", () => {
  it("opens one guarded mqtt socket and gives it to the MQTT.js native transport", async () => {
    const socket = new FakeWebSocket();
    let guardedOptions: GuardedWebSocketOptions | undefined;
    let mqttOptions: IClientOptions | undefined;
    const client = new FakeMqttClient();
    const openWebSocket = vi.fn(async (_url: string, options: GuardedWebSocketOptions) => {
      guardedOptions = options;
      return socket;
    });
    const connect = vi.fn((_url: string, options: IClientOptions) => {
      mqttOptions = options;
      expect(options.createWebsocket?.(_url, ["mqtt"], options)).toBe(socket);
      queueMicrotask(() => client.emit("connect"));
      return client as unknown as MqttClient;
    });

    await expect(
      openMqttClient({ websocketUrl: "wss://broker.example.com/mqtt", protocolVersion: "5.0" }, undefined, {
        connect,
        openWebSocket,
      }),
    ).resolves.toBe(client);

    expect(openWebSocket).toHaveBeenCalledWith(
      "wss://broker.example.com/mqtt",
      expect.objectContaining({ fieldName: "websocketUrl", protocols: ["mqtt"] }),
    );
    expect(guardedOptions?.allowPrivateNetwork).toBeTypeOf("function");
    expect(mqttOptions).toMatchObject({ forceNativeWebSocket: true, protocolVersion: 5, reconnectPeriod: 0 });
  });
});

describe("MQTT publish action", () => {
  it("decodes base64 and reports the MQTT acknowledgement boundary", async () => {
    const client = new FakeMqttClient();
    const handlers = createMqttActionHandlers({
      openClient: async () => client as unknown as MqttClient,
    });

    await expect(
      handlers.publish_message?.(
        { topic: "devices/one/command", payload: "AP+A", payloadEncoding: "base64", qos: 1, retain: true },
        { websocketUrl: "wss://broker.example.com/mqtt", protocolVersion: "3.1.1" },
      ),
    ).resolves.toEqual({
      topic: "devices/one/command",
      qos: 1,
      retain: true,
      protocolVersion: "3.1.1",
      deliveryAcknowledged: true,
    });
    expect(client.published).toMatchObject({
      topic: "devices/one/command",
      payload: Buffer.from([0, 255, 128]),
      options: { qos: 1, retain: true },
    });
  });
});

describe("MQTT receive action", () => {
  it("stops at maxMessages even when more messages arrive in the same turn", async () => {
    const client = new FakeMqttClient();
    client.onSubscribe = () => {
      client.emit("message", "devices/one/status", Buffer.from("first"), { qos: 1, retain: false, dup: false });
      client.emit("message", "devices/two/status", Buffer.from("second"), { qos: 1, retain: false, dup: false });
    };
    const handlers = createMqttActionHandlers({
      openClient: async () => client as unknown as MqttClient,
    });

    await expect(
      handlers.receive_messages?.(
        { topicFilter: "devices/+/status", maxMessages: 1, timeoutSeconds: 1 },
        { websocketUrl: "wss://broker.example.com/mqtt", protocolVersion: "3.1.1" },
      ),
    ).resolves.toEqual({
      messages: [
        {
          topic: "devices/one/status",
          payload: "first",
          qos: 1,
          retain: false,
          duplicate: false,
        },
      ],
      timedOut: false,
      protocolVersion: "3.1.1",
    });
  });
});
