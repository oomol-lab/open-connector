import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "superchat";

export type SuperchatActionName =
  | "get_me"
  | "list_channels"
  | "get_channel"
  | "create_contact"
  | "get_contact"
  | "list_contacts"
  | "search_contacts"
  | "update_contact"
  | "send_text_message"
  | "send_email_message"
  | "send_whatsapp_template_message";

function action(
  name: SuperchatActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema: s.looseObject(`Input parameters for ${name}.`),
    outputSchema: s.looseObject(`Superchat response for ${name}.`),
  });
}

export const superchatActions: ActionDefinition[] = [
  action("get_me", "read", "Get the authenticated Superchat user and workspace."),
  action("list_channels", "read", "List Superchat channels."),
  action("get_channel", "read", "Get a Superchat channel by ID."),
  action("create_contact", "write", "Create a Superchat contact."),
  action("get_contact", "read", "Get a Superchat contact by ID."),
  action("list_contacts", "read", "List Superchat contacts."),
  action("search_contacts", "read", "Search Superchat contacts by email, phone, or custom attribute."),
  action("update_contact", "write", "Update a Superchat contact."),
  action("send_text_message", "write", "Send an outbound Superchat text message."),
  action("send_email_message", "write", "Send an outbound Superchat email message."),
  action("send_whatsapp_template_message", "write", "Send an outbound Superchat WhatsApp template message."),
];
