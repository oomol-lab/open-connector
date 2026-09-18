import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pushover";
const raw = s.looseObject("Pushover API object returned for this request with upstream fields preserved.");
const status = s.looseObject("Common envelope returned by Pushover write operations.", {
  status: s.integer("Pushover status code. Successful requests return 1."),
  request: s.string("Unique request identifier returned by Pushover."),
  errors: s.array("Error messages returned by Pushover when the request fails.", s.string("One error message.")),
});
const tokenInput = s.looseObject("Input parameters accepted by this Pushover action.");
const sendMessageInput = s.looseObject("Input parameters for sending a Pushover message.", {
  token: s.string("Optional application API token override."),
  user: s.string("Pushover user key or delivery group key."),
  device: s.string("Optional target device name."),
  message: s.string("Message body to send."),
  title: s.string("Optional message title."),
  url: s.url("Supplementary URL to show with the message."),
  url_title: s.string("Display title for the supplementary URL."),
  priority: s.integer("Message priority accepted by Pushover."),
  ttl: s.integer("Seconds after which the message should expire."),
  retry: s.integer("Retry interval in seconds for emergency priority messages."),
  expire: s.integer("Retry expiration in seconds for emergency priority messages."),
  html: s.boolean("Whether message text contains HTML formatting."),
  monospace: s.boolean("Whether message text should use monospace formatting."),
  timestamp: s.integer("Unix timestamp to attach to the message."),
  callback: s.url("Callback URL for emergency notification receipts."),
  sound: s.string("Pushover sound name."),
  tags: s.string("Comma-separated tags for emergency retry cancellation."),
  attachment: s.transitFile("Optional image attachment uploaded through POST /api/files."),
  attachment_type: s.string("MIME type for legacy inline base64 attachment input."),
  attachment_base64: s.string("Legacy base64-encoded image attachment content."),
});

function action(
  name: PushoverActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  outputSchema = raw,
): ProviderActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema: tokenInput,
    outputSchema,
  });
}

export const pushoverActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description:
      "Send a Pushover notification to a user or delivery group, with optional emergency settings, URL metadata, and image attachment.",
    inputSchema: sendMessageInput,
    outputSchema: s.looseObject("Response returned after sending a Pushover notification.", {
      status: s.integer("Pushover status code. Successful requests return 1."),
      request: s.string("Unique request identifier returned by Pushover."),
      receipt: s.string("Receipt identifier returned for emergency notifications."),
    }),
  }),
  action(
    "validate_user_or_group",
    "read",
    "Validate that a Pushover user or delivery group key can receive notifications.",
    status,
  ),
  action(
    "get_app_limits",
    "read",
    "Get the current monthly message limit, remaining messages, and reset time for the connected Pushover application.",
    raw,
  ),
  action(
    "get_app_token",
    "read",
    "Return the application API token resolved from the action input or the connected credential.",
    raw,
  ),
  action(
    "get_team_api_token",
    "read",
    "Return the Team API token resolved from the action input or the connected credential.",
    raw,
  ),
  action("store_team_api_token", "read", "Validate and return metadata for a Pushover Team API token.", raw),
  action("get_app_icon_image", "read", "Fetch a Pushover application icon image.", raw),
  action("get_receipt_status", "read", "Get the status of an emergency notification receipt.", raw),
  action("cancel_receipt_retries", "destructive", "Cancel retries for one emergency notification receipt.", status),
  action("cancel_retries_by_tag", "destructive", "Cancel emergency notification retries by tag.", status),
  action("update_glances", "write", "Update Pushover glance data for a user or device.", status),
  action("create_group", "write", "Create a Pushover delivery group.", raw),
  action("list_groups", "read", "List Pushover delivery groups for the application token.", raw),
  action("get_group", "read", "Get one Pushover delivery group.", raw),
  action("add_group_user", "write", "Add one user to a Pushover delivery group.", status),
  action("remove_group_user", "destructive", "Remove one user from a Pushover delivery group.", status),
  action("disable_group_user", "destructive", "Disable one user in a Pushover delivery group.", status),
  action("enable_group_user", "write", "Enable one user in a Pushover delivery group.", status),
  action("rename_group", "write", "Rename a Pushover delivery group.", status),
  action("assign_license", "write", "Assign a Pushover license through the Team API.", raw),
  action("check_license_credits", "read", "Check available Pushover Team license credits.", raw),
  action("subscription_flow", "read", "Build or validate a Pushover subscription flow URL.", raw),
  action("add_team_user", "write", "Add a user to a Pushover Team.", raw),
  action("remove_team_user", "destructive", "Remove a user from a Pushover Team.", status),
  action("client_login", "write", "Log in to the Pushover Open Client API.", raw),
  action("register_client_device", "write", "Register a Pushover Open Client device.", raw),
  action("fetch_client_messages", "read", "Fetch messages from the Pushover Open Client message queue.", raw),
  action(
    "ack_delete_messages_up_to_id",
    "destructive",
    "Acknowledge and delete Pushover Open Client messages up to an ID.",
    status,
  ),
  action("listen_client_websocket", "write", "Listen briefly to the Pushover Open Client WebSocket server.", raw),
];

export type PushoverActionName =
  | "send_message"
  | "validate_user_or_group"
  | "get_app_limits"
  | "get_app_token"
  | "get_team_api_token"
  | "store_team_api_token"
  | "get_app_icon_image"
  | "get_receipt_status"
  | "cancel_receipt_retries"
  | "cancel_retries_by_tag"
  | "update_glances"
  | "create_group"
  | "list_groups"
  | "get_group"
  | "add_group_user"
  | "remove_group_user"
  | "disable_group_user"
  | "enable_group_user"
  | "rename_group"
  | "assign_license"
  | "check_license_credits"
  | "subscription_flow"
  | "add_team_user"
  | "remove_team_user"
  | "client_login"
  | "register_client_device"
  | "fetch_client_messages"
  | "ack_delete_messages_up_to_id"
  | "listen_client_websocket";
