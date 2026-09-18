import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "systeme_io";

export type SystemeIoActionName =
  | "list_contacts"
  | "get_contact"
  | "create_contact"
  | "update_contact"
  | "delete_contact"
  | "attach_contact_tag"
  | "detach_contact_tag"
  | "list_contact_fields"
  | "list_tags"
  | "get_tag"
  | "create_tag"
  | "delete_tag"
  | "update_tag"
  | "list_webhooks"
  | "get_webhook"
  | "create_webhook"
  | "update_webhook"
  | "delete_webhook"
  | "list_courses"
  | "list_enrollments"
  | "create_enrollment"
  | "delete_enrollment"
  | "list_subscriptions"
  | "cancel_subscription";

function action(
  name: SystemeIoActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema: s.looseObject(`Input parameters for ${name}.`),
    outputSchema: s.looseObject(`Systeme.io response for ${name}.`),
  });
}

export const systemeIoActions: ActionDefinition[] = [
  action("list_contacts", "read", "List Systeme.io contacts."),
  action("get_contact", "read", "Get a Systeme.io contact."),
  action("create_contact", "write", "Create a Systeme.io contact."),
  action("update_contact", "write", "Update a Systeme.io contact."),
  action("delete_contact", "destructive", "Delete a Systeme.io contact."),
  action("attach_contact_tag", "write", "Attach a tag to a Systeme.io contact."),
  action("detach_contact_tag", "destructive", "Detach a tag from a Systeme.io contact."),
  action("list_contact_fields", "read", "List Systeme.io contact fields."),
  action("list_tags", "read", "List Systeme.io tags."),
  action("get_tag", "read", "Get a Systeme.io tag."),
  action("create_tag", "write", "Create a Systeme.io tag."),
  action("delete_tag", "destructive", "Delete a Systeme.io tag."),
  action("update_tag", "write", "Update a Systeme.io tag."),
  action("list_webhooks", "read", "List Systeme.io webhooks."),
  action("get_webhook", "read", "Get a Systeme.io webhook."),
  action("create_webhook", "write", "Create a Systeme.io webhook."),
  action("update_webhook", "write", "Update a Systeme.io webhook."),
  action("delete_webhook", "destructive", "Delete a Systeme.io webhook."),
  action("list_courses", "read", "List Systeme.io courses."),
  action("list_enrollments", "read", "List course enrollments in Systeme.io."),
  action("create_enrollment", "write", "Create a course enrollment in Systeme.io."),
  action("delete_enrollment", "destructive", "Delete a course enrollment in Systeme.io."),
  action("list_subscriptions", "read", "List Systeme.io subscriptions."),
  action("cancel_subscription", "destructive", "Cancel a Systeme.io subscription."),
];
