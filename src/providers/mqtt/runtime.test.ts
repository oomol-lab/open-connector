import type { GuardedWebSocketOptions, WebSocketLike } from "../../core/guarded-websocket.ts";
import type { IClientOptions, MqttClient } from "mqtt";

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openMqttClient } from "./runtime.ts";

class FakeMqttClient extends EventEmitter {
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
  });
});
