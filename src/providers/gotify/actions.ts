import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gotify";

const messageExtrasSchema = s.looseObject("Optional Gotify message extras keyed by the official namespace format.");

const gotifyMessageSchema = s.object(
  "A Gotify message returned by the REST API.",
  {
    id: s.integer("The Gotify message id."),
    appid: s.integer("The id of the Gotify application that sent this message."),
    message: s.string("The Gotify message body. Markdown excluding HTML is allowed."),
    date: s.string("The date and time when the message was created."),
    title: s.string("The optional Gotify message title."),
    priority: s.integer("The Gotify message priority."),
    extras: messageExtrasSchema,
  },
  { optional: ["title", "priority", "extras"] },
);

const healthSchema = s.requiredObject("Gotify instance health information.", {
  health: s.string("The overall Gotify application health value."),
  database: s.string("The Gotify database health value."),
});

const versionSchema = s.requiredObject("Gotify instance version information.", {
  version: s.string("The current Gotify server version."),
  commit: s.string("The git commit hash used to build the Gotify server."),
  buildDate: s.string("The date when the Gotify server binary was built."),
});

export const gotifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Send a message through the connected Gotify application token and return the created message.",
    inputSchema: s.object(
      "Input parameters for creating one Gotify message.",
      {
        message: s.nonEmptyString("The message body to send. Markdown excluding HTML is allowed."),
        title: s.nonEmptyString("An optional title for the Gotify message."),
        priority: s.integer("An optional message priority. If omitted, Gotify uses the application default priority."),
        extras: messageExtrasSchema,
      },
      { required: ["message"] },
    ),
    outputSchema: gotifyMessageSchema,
  }),
  defineProviderAction(service, {
    name: "get_health",
    operationType: "read",
    description: "Fetch health information from the connected Gotify instance.",
    inputSchema: s.object({}, { description: "This action does not require any input parameters." }),
    outputSchema: healthSchema,
  }),
  defineProviderAction(service, {
    name: "get_version",
    operationType: "read",
    description: "Fetch version information from the connected Gotify instance.",
    inputSchema: s.object({}, { description: "This action does not require any input parameters." }),
    outputSchema: versionSchema,
  }),
];
