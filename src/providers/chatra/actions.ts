import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const id = s.string("Resource ID.", {
  minLength: 1,
  not: { enum: [".", ".."] },
});

const clientId = s.string("Secret visitor ID from a webhook or your bound user account.", {
  minLength: 1,
  not: { enum: [".", ".."] },
});

const text = s.string("Message text.", { minLength: 1 });

const message = s.object(
  "Chatra message, including additional upstream fields.",
  {
    id: s.string("Message ID."),
    type: s.string("Message author type: agent or client."),
    text: s.string("Message text or attachment filename."),
    clientId: s.string("Secret visitor ID."),
    agentId: s.string("Agent ID."),
    createdAt: s.number("Creation timestamp in milliseconds."),
    receivedFrom: s.string("Integration marker used to avoid webhook loops."),
    isPushed: s.boolean("Whether this is an automated pushed message."),
    file: s.looseObject("Attachment metadata returned by Chatra."),
  },
  {
    additionalProperties: true,
    required: ["id"],
  },
);

const client = s.object(
  "Chatra visitor information, including additional upstream fields.",
  {
    id: s.string("Secret visitor ID."),
    chatId: s.string("Chat ID."),
    chatLink: s.string("Chat URL in the Chatra dashboard."),
    displayedName: s.string("Visitor display name."),
    basicInfo: s.looseObject("Visitor information supplied by visitors or agents."),
    customFormData: s.looseObject("Custom form field values."),
    integrationData: s.looseObject("Information supplied through the widget integration."),
    info: s.looseObject("Combined visitor information, with visitor and agent edits taking precedence."),
  },
  {
    additionalProperties: true,
    required: ["id"],
  },
);

export const chatraActions: ActionDefinition[] = [
  defineProviderAction("chatra", {
    name: "send_message",
    operationType: "write",
    description:
      "Send a message as an agent using an agent ID or an email identity. An unknown agent email creates a dummy agent.",
    requiredScopes: [],
    inputSchema: s.object(
      "Agent message parameters.",
      {
        clientId,
        text,
        agentId: s.string("Existing agent ID.", { minLength: 1 }),
        agentEmail: s.string("Agent email; an unknown email creates a dummy agent.", {
          format: "email",
        }),
        agentName: s.string("Agent name required when using agentEmail.", { minLength: 1 }),
        receivedFrom: s.string("Integration marker; required when using agentEmail.", {
          minLength: 1,
        }),
      },
      {
        optional: ["agentId", "agentEmail", "agentName", "receivedFrom"],
        oneOf: [
          {
            required: ["agentId"],
            not: { anyOf: [{ required: ["agentEmail"] }, { required: ["agentName"] }] },
          },
          { required: ["agentEmail", "agentName", "receivedFrom"], not: { required: ["agentId"] } },
        ],
      },
    ),
    outputSchema: message,
  }),
  defineProviderAction("chatra", {
    name: "send_pushed_message",
    operationType: "write",
    description:
      "Send an automated message to a visitor as a random agent, a specific agent, or a random agent from a group.",
    requiredScopes: [],
    inputSchema: s.object(
      "Automated message parameters.",
      {
        clientId,
        text,
        agentId: s.string("Agent ID; omit to select a random agent.", { minLength: 1 }),
        groupId: s.string("Group from which to select a random agent.", { minLength: 1 }),
      },
      {
        optional: ["agentId", "groupId"],
        not: { required: ["agentId", "groupId"] },
      },
    ),
    outputSchema: message,
  }),
  ...(["message", "pushed_message"] as const).flatMap((kind) => [
    defineProviderAction("chatra", {
      name: `get_${kind}`,
      operationType: "read",
      description: `Get an existing ${kind === "message" ? "message" : "automated pushed message"} by ID.`,
      requiredScopes: [],
      inputSchema: s.requiredObject("Message lookup parameters.", { id }),
      outputSchema: message,
    }),
    defineProviderAction("chatra", {
      name: `update_${kind}`,
      operationType: "write",
      description: `Edit the text of an ${kind === "message" ? "agent message" : "automated pushed message"}.`,
      requiredScopes: [],
      inputSchema: s.requiredObject("Message edit parameters.", { id, text }),
      outputSchema: message,
    }),
    defineProviderAction("chatra", {
      name: `delete_${kind}`,
      operationType: "destructive",
      description: `Delete an ${kind === "message" ? "agent message" : "automated pushed message"} and return the deleted message.`,
      requiredScopes: [],
      inputSchema: s.requiredObject("Message deletion parameters.", { id }),
      outputSchema: message,
    }),
  ]),
  defineProviderAction("chatra", {
    name: "get_client",
    operationType: "read",
    description: "Get visitor information by the secret visitor ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Visitor lookup parameters.", { clientId }),
    outputSchema: client,
  }),
  defineProviderAction("chatra", {
    name: "update_client",
    operationType: "write",
    description: "Update basic visitor information. Omitted fields stay unchanged; null removes a field.",
    requiredScopes: [],
    inputSchema: s.object(
      "Visitor update parameters.",
      {
        clientId,
        name: s.nullable(s.string("Visitor name; null removes it.")),
        email: s.nullable(s.string("Visitor email; null removes it.")),
        phone: s.nullable(s.string("Visitor phone; null removes it.")),
        notes: s.nullable(s.string("Visitor notes; null removes them.")),
      },
      {
        optional: ["name", "email", "phone", "notes"],
        minProperties: 2,
      },
    ),
    outputSchema: client,
  }),
];
