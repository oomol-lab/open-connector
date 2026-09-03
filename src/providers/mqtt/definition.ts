import type { ProviderDefinition } from "../../core/types.ts";

import { mqttActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mqtt",
  displayName: "MQTT",
  description:
    "Publish messages or briefly wait for new messages on any MQTT broker that exposes a WebSocket listener.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "websocketUrl",
          label: "WebSocket URL",
          inputType: "text",
          required: true,
          secret: true,
          placeholder: "wss://broker.example.com/mqtt",
          description:
            "The complete ws:// or wss:// URL of the broker's MQTT-over-WebSocket listener, including its path. Private targets require a self-hosted runtime with OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK enabled.",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "mqtt-user",
          description: "Optional MQTT CONNECT username configured by the broker operator.",
        },
        {
          key: "clientId",
          label: "Client ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "GID_example@@@device-1",
          description:
            "Optional fixed MQTT Client ID. When omitted, each action uses a random Client ID. Alibaba Cloud device credentials require GroupID@@@DeviceID.",
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "mqtt-password",
          description:
            "Optional MQTT CONNECT password configured by the broker operator. A username is required when set.",
        },
        {
          key: "protocolVersion",
          label: "Protocol Version",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "3.1.1",
          description: "MQTT protocol version. Use 3.1.1 by default, or enter 5.0 when the broker supports MQTT 5.",
        },
        {
          key: "aliyunInstanceId",
          label: "Alibaba Cloud Instance ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "mqtt-xxxxxxxx",
          description:
            "Alibaba Cloud ApsaraMQ instance ID for unique-certificate-per-device authentication. Configure it with a Client ID, then either save both device access key fields or pass them to each action.",
        },
        {
          key: "aliyunDeviceAccessKeyId",
          label: "Alibaba Cloud Device AccessKey ID",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "device-access-key-id",
          description:
            "Optional Alibaba Cloud device AccessKey ID. Leave both device key fields empty to provide them at action runtime.",
        },
        {
          key: "aliyunDeviceAccessKeySecret",
          label: "Alibaba Cloud Device AccessKey Secret",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "device-access-key-secret",
          description: "Optional Alibaba Cloud device AccessKey secret used to sign the Client ID.",
        },
      ],
    },
  ],
  homepageUrl: "https://mqtt.org",
  actions: mqttActions,
};
