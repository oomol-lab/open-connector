import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ntfy";

const ntfyIdentifierDescription = "Use 1 to 64 ASCII letters, numbers, underscores, or dashes.";
const ntfyIdentifierPattern = "^[A-Za-z0-9_-]+$";

const ntfyTopicSchema = s.string({
  description: `The ntfy topic name. ${ntfyIdentifierDescription}`,
  minLength: 1,
  maxLength: 64,
  pattern: ntfyIdentifierPattern,
});

const ntfySequenceIdSchema = s.string({
  description: `The ntfy sequence ID. ${ntfyIdentifierDescription}`,
  minLength: 1,
  maxLength: 64,
  pattern: ntfyIdentifierPattern,
});

const ntfyToggleSchema = s.stringEnum(["yes", "no"], {
  description: "Whether ntfy should enable this publish option.",
});

const ntfyAccountLimitsSchema = s.looseObject("ntfy account limits.", {
  basis: s.string("The limit basis, such as ip or tier."),
  messages: s.integer("The message limit."),
  messages_expiry_duration: s.integer("The message expiry duration in seconds."),
  emails: s.integer("The email publishing limit."),
  calls: s.integer("The phone call publishing limit."),
  reservations: s.integer("The topic reservation limit."),
  attachment_total_size: s.integer("The total attachment size limit."),
  attachment_file_size: s.integer("The per-file attachment size limit."),
  attachment_expiry_duration: s.integer("The attachment expiry duration in seconds."),
  attachment_bandwidth: s.integer("The attachment bandwidth limit."),
});

const ntfyAccountStatsSchema = s.looseObject("ntfy account usage statistics.", {
  messages: s.integer("The number of messages used."),
  messages_remaining: s.integer("The number of remaining messages."),
  emails: s.integer("The number of emails used."),
  emails_remaining: s.integer("The number of remaining emails."),
  calls: s.integer("The number of calls used."),
  calls_remaining: s.integer("The number of remaining calls."),
  reservations: s.integer("The number of topic reservations used."),
  reservations_remaining: s.integer("The number of remaining topic reservations."),
  attachment_total_size: s.integer("The attachment storage used."),
  attachment_total_size_remaining: s.integer("The remaining attachment storage."),
});

const ntfyAccountOutputSchema = s.object(
  {
    username: s.string("The authenticated ntfy username."),
    role: s.string("The ntfy account role."),
    sync_topic: s.string("The account sync topic."),
    provisioned: s.boolean("Whether the account is provisioned by server configuration."),
    language: s.string("The preferred account language."),
    date_format: s.string("The preferred date format."),
    time_format: s.string("The preferred time format."),
    tier: s.looseObject("The ntfy account tier.", {
      code: s.string("The ntfy tier code."),
      name: s.string("The ntfy tier name."),
    }),
    limits: ntfyAccountLimitsSchema,
    stats: ntfyAccountStatsSchema,
    raw: s.looseObject("The raw ntfy account response."),
  },
  {
    required: ["raw"],
    description: "ntfy account profile, limits, and usage returned by GET /v1/account.",
  },
);

const ntfyAttachmentSchema = s.looseObject("Attachment metadata returned by ntfy.", {
  name: s.string("The attachment file name."),
  type: s.string("The attachment MIME type."),
  size: s.integer("The attachment size in bytes."),
  expires: s.integer("The Unix timestamp when the attachment expires."),
  url: s.url("The attachment URL."),
});

const ntfyPublishInputSchema = s.object(
  {
    topic: ntfyTopicSchema,
    message: s.string("The notification body text. If omitted or empty, ntfy publishes an empty body."),
    title: s.string("The notification title."),
    priority: s.integer("The notification priority from 1 to 5.", { minimum: 1, maximum: 5 }),
    tags: s.array("Comma-separated ntfy tags represented as an array.", s.string("A ntfy tag.")),
    click: s.url("The URL opened when the notification is clicked."),
    attach: s.url("A file URL that ntfy should attach to the notification."),
    icon: s.url("A JPEG or PNG icon URL that ntfy clients should show."),
    filename: s.string("The attachment filename shown by ntfy clients."),
    markdown: s.boolean("Whether ntfy should render the notification body as Markdown."),
    email: s.string("An email address or yes to forward the notification by email."),
    call: s.string("A phone number or yes to trigger a phone call notification."),
    delay: s.string("A ntfy scheduled delivery timestamp or duration."),
    cache: ntfyToggleSchema,
    firebase: ntfyToggleSchema,
    sequence_id: ntfySequenceIdSchema,
  },
  {
    required: ["topic"],
    description: "Input parameters for publishing a notification with ntfy.",
  },
);

const ntfyMessageOutputSchema = s.object(
  {
    id: s.string("The ntfy message ID."),
    sequence_id: s.string("The ntfy sequence ID when it differs from the message ID."),
    time: s.integer("The Unix timestamp when ntfy accepted the message."),
    expires: s.integer("The Unix timestamp when the message expires."),
    event: s.string("The ntfy event type."),
    topic: s.string("The ntfy topic."),
    title: s.string("The notification title."),
    message: s.string("The notification body text."),
    priority: s.integer("The notification priority."),
    tags: s.array("The ntfy tags returned for the message.", s.string("A ntfy tag.")),
    click: s.url("The click URL returned by ntfy."),
    icon: s.url("The icon URL returned by ntfy."),
    attachment: ntfyAttachmentSchema,
    content_type: s.string("The message content type returned by ntfy."),
    raw: s.looseObject("The raw ntfy message response."),
  },
  {
    required: ["id", "time", "event", "topic", "raw"],
    description: "The message object returned by ntfy after publishing.",
  },
);

export const ntfyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Retrieve ntfy account profile, limits, and usage for the access token.",
    inputSchema: s.object({}, { required: [], description: "Input parameters for retrieving the ntfy account." }),
    outputSchema: ntfyAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "publish_message",
    operationType: "write",
    description: "Publish a notification message to a ntfy topic.",
    inputSchema: ntfyPublishInputSchema,
    outputSchema: ntfyMessageOutputSchema,
  }),
];
