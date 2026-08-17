import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mqtt";
const qosSchema = s.integer("MQTT quality of service level.", { minimum: 0, maximum: 2 });
const protocolVersionSchema = s.stringEnum("MQTT protocol version used for the connection.", ["3.1.1", "5.0"]);

export const mqttActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "publish_message",
    description: "Publish one UTF-8 or base64-encoded message through a short-lived MQTT-over-WebSocket connection.",
    inputSchema: s.object(
      "The message to publish to the connected MQTT broker.",
      {
        topic: s.nonEmptyString("Exact MQTT topic to publish to. Topic wildcards are not allowed."),
        payload: s.string("Message payload encoded according to payloadEncoding."),
        payloadEncoding: s.stringEnum("How to decode payload before publishing it.", ["utf8", "base64"]),
        qos: qosSchema,
        retain: s.boolean("Whether the broker should retain this message for future subscribers."),
      },
      { optional: ["payloadEncoding", "qos", "retain"] },
    ),
    outputSchema: s.object("The completed MQTT publish operation.", {
      topic: s.string("Topic the message was published to."),
      qos: qosSchema,
      retain: s.boolean("Whether the MQTT PUBLISH retain flag was requested."),
      protocolVersion: protocolVersionSchema,
      deliveryAcknowledged: s.boolean(
        "Whether the MQTT publish acknowledgement flow completed. This does not mean a consumer processed the message.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "receive_messages",
    description:
      "Wait briefly for new messages on an MQTT topic filter. This is not a persistent subscription and can miss messages between action calls.",
    inputSchema: s.object(
      "The bounded MQTT subscription to open for this action call.",
      {
        topicFilter: s.nonEmptyString("MQTT topic filter to subscribe to, including + or # wildcards when needed."),
        qos: qosSchema,
        timeoutSeconds: s.integer("Maximum time to wait for messages before returning.", { minimum: 1, maximum: 30 }),
        maxMessages: s.integer("Maximum number of messages to collect before returning.", { minimum: 1, maximum: 100 }),
        payloadEncoding: s.stringEnum("How received message payloads should be returned.", ["utf8", "base64"]),
      },
      { optional: ["qos", "timeoutSeconds", "maxMessages", "payloadEncoding"] },
    ),
    outputSchema: s.object("Messages observed during the bounded subscription window.", {
      messages: s.array(
        "Messages received after the subscription became active.",
        s.object("One MQTT message received from the broker.", {
          topic: s.string("Exact MQTT topic the message was published to."),
          payload: s.string("Message payload encoded according to payloadEncoding."),
          qos: qosSchema,
          retain: s.boolean("Whether the broker marked this as a retained message."),
          duplicate: s.boolean("Whether the MQTT DUP flag was set."),
        }),
        { maxItems: 100 },
      ),
      timedOut: s.boolean("Whether the collection window ended because timeoutSeconds elapsed."),
      protocolVersion: protocolVersionSchema,
    }),
  }),
];
