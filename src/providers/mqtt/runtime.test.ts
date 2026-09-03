import type { GuardedWebSocketOptions, WebSocketLike } from "../../core/guarded-websocket.ts";
import type { IClientOptions, MqttClient } from "mqtt";

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createMqttActionHandlers, createMqttContext, openMqttClient, validateMqttCredential } from "./runtime.ts";

class FakeMqttClient extends EventEmitter {
  public publishAsync(): Promise<void> {
    return Promise.resolve();
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
    expect(mqttOptions?.clientId).toMatch(/^oomol-connect-/);
  });

  it("passes a configured Client ID through without changing the generic MQTT credentials", async () => {
    const socket = new FakeWebSocket();
    const client = new FakeMqttClient();
    let mqttOptions: IClientOptions | undefined;
    const connect = vi.fn((_url: string, options: IClientOptions) => {
      mqttOptions = options;
      options.createWebsocket?.(_url, ["mqtt"], options);
      queueMicrotask(() => client.emit("connect"));
      return client as unknown as MqttClient;
    });

    await openMqttClient(
      {
        websocketUrl: "wss://broker.example.com/mqtt",
        clientId: "fixed-client",
        username: "mqtt-user",
        password: "mqtt-password",
        protocolVersion: "3.1.1",
      },
      undefined,
      { connect, openWebSocket: vi.fn(async () => socket) },
    );

    expect(mqttOptions).toMatchObject({
      clientId: "fixed-client",
      username: "mqtt-user",
      password: "mqtt-password",
      protocolVersion: 4,
    });
  });
});

describe("Alibaba Cloud MQTT device credentials", () => {
  it("derives the documented CONNECT username and HMAC-SHA1 password from saved credentials", async () => {
    let openedCredential: unknown;
    const handlers = createMqttActionHandlers({
      openClient: async (credential) => {
        openedCredential = credential;
        return new FakeMqttClient() as unknown as MqttClient;
      },
    });
    const context = createMqttContext({
      websocketUrl: "wss://example.mqtt.aliyuncs.com/mqtt",
      clientId: "GID_Test@@@0001",
      aliyunInstanceId: "mqtt-xxxxx",
      aliyunDeviceAccessKeyId: "YYYYY",
      aliyunDeviceAccessKeySecret: "XXXXX",
    });

    await handlers.publish_message({ topic: "test", payload: "hello" }, context);

    expect(openedCredential).toMatchObject({
      clientId: "GID_Test@@@0001",
      username: "DeviceCredential|YYYYY|mqtt-xxxxx",
      password: "vI009IZJZVGRwBwZvnbwjfuXxVM=",
    });
  });

  it("defers validation when device credentials are intentionally supplied by each action", async () => {
    const openClient = vi.fn();

    await expect(
      validateMqttCredential(
        {
          websocketUrl: "wss://example.mqtt.aliyuncs.com/mqtt",
          clientId: "GID_Test@@@0001",
          aliyunInstanceId: "mqtt-xxxxx",
        },
        undefined,
        openClient,
      ),
    ).resolves.toMatchObject({ metadata: { protocolVersion: "3.1.1" } });
    expect(openClient).not.toHaveBeenCalled();
  });

  it("signs the Client ID with device credentials supplied to an action", async () => {
    let openedCredential: unknown;
    const handlers = createMqttActionHandlers({
      openClient: async (credential) => {
        openedCredential = credential;
        return new FakeMqttClient() as unknown as MqttClient;
      },
    });
    const context = createMqttContext({
      websocketUrl: "wss://example.mqtt.aliyuncs.com/mqtt",
      clientId: "GID_Test@@@0001",
      aliyunInstanceId: "mqtt-xxxxx",
    });

    await handlers.publish_message(
      {
        topic: "test",
        payload: "hello",
        aliyunDeviceAccessKeyId: "YYYYY",
        aliyunDeviceAccessKeySecret: "XXXXX",
      },
      context,
    );

    expect(openedCredential).toMatchObject({
      username: "DeviceCredential|YYYYY|mqtt-xxxxx",
      password: "vI009IZJZVGRwBwZvnbwjfuXxVM=",
    });
  });

  it("accepts runtime device credentials only as a complete pair", async () => {
    const handlers = createMqttActionHandlers({ openClient: vi.fn() });
    const context = createMqttContext({
      websocketUrl: "wss://example.mqtt.aliyuncs.com/mqtt",
      clientId: "GID_Test@@@0001",
      aliyunInstanceId: "mqtt-xxxxx",
    });

    await expect(
      handlers.publish_message({ topic: "test", payload: "hello", aliyunDeviceAccessKeyId: "YYYYY" }, context),
    ).rejects.toThrow("aliyunDeviceAccessKeyId and aliyunDeviceAccessKeySecret must be provided together");
  });
});
