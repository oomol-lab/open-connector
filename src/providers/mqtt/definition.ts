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
          secret: false,
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
      ],
    },
  ],
  homepageUrl: "https://mqtt.org",
  actions: mqttActions,
};
