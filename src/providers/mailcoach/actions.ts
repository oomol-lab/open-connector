import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailcoach";

const emailListUuidSchema = s.uuid("Mailcoach email list UUID.");
const subscriberUuidSchema = s.uuid("Mailcoach subscriber UUID.");
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableDateTimeSchema = (description: string) => s.nullable(s.dateTime(description));

const linksSchema = s.looseRequiredObject(
  "Pagination links returned by Mailcoach.",
  {
    first: s.string("URL of the first result page."),
    last: s.string("URL of the last result page."),
    prev: nullableStringSchema("URL of the previous page, or null when unavailable."),
    next: nullableStringSchema("URL of the next page, or null when unavailable."),
  },
  { optional: ["first", "last", "prev", "next"] },
);

const metaSchema = s.looseRequiredObject(
  "Pagination metadata returned by Mailcoach.",
  {
    current_page: s.integer("Current page number."),
    from: s.nullable(s.integer("One-based position of the first item, or null for an empty page.")),
    last_page: s.integer("Last available page number."),
    path: s.string("Base URL of the paginated resource."),
    per_page: s.integer("Number of items requested per page."),
    to: s.nullable(s.integer("One-based position of the last item, or null for an empty page.")),
    total: s.integer("Total number of matching items."),
  },
  { optional: ["current_page", "from", "last_page", "path", "per_page", "to", "total"] },
);

const emailListSchema = s.looseRequiredObject(
  "Mailcoach email list returned by the official API.",
  {
    uuid: emailListUuidSchema,
    name: s.string("Email list name."),
    active_subscribers_count: s.integer("Number of active subscribers in the list."),
    campaigns_feed_enabled: s.boolean("Whether the campaigns feed is enabled."),
    default_from_email: s.email("Default sender email address."),
    default_from_name: nullableStringSchema("Default sender name."),
    default_reply_to_email: nullableStringSchema("Default reply-to email address."),
    default_reply_to_name: nullableStringSchema("Default reply-to name."),
    allow_form_subscriptions: s.boolean("Whether public form subscriptions are allowed."),
    redirect_after_subscribed: nullableStringSchema("Redirect URL after a successful subscription."),
    redirect_after_already_subscribed: nullableStringSchema("Redirect URL when the address is already subscribed."),
    redirect_after_subscription_pending: nullableStringSchema(
      "Redirect URL when subscription confirmation is pending.",
    ),
    redirect_after_unsubscribed: nullableStringSchema("Redirect URL after an unsubscribe."),
    requires_confirmation: s.boolean("Whether new subscriptions require confirmation."),
    confirmation_mail_subject: nullableStringSchema("Custom confirmation email subject."),
    confirmation_mail_content: nullableStringSchema("Custom confirmation email content."),
    campaign_mailer: s.string("Mailer used for campaigns."),
    automation_mailer: s.string("Mailer used for automation messages."),
    transactional_mailer: s.string("Mailer used for transactional messages."),
    report_recipients: nullableStringSchema("Comma-delimited report recipient email addresses."),
    report_campaign_sent: s.boolean("Whether a campaign-sent report is enabled."),
    report_campaign_summary: s.boolean("Whether a campaign summary report is enabled."),
    report_email_list_summary: s.boolean("Whether an email-list summary report is enabled."),
    created_at: s.dateTime("Email list creation timestamp."),
    updated_at: s.dateTime("Email list update timestamp."),
  },
  {
    optional: [
      "active_subscribers_count",
      "campaigns_feed_enabled",
      "default_from_email",
      "default_from_name",
      "default_reply_to_email",
      "default_reply_to_name",
      "allow_form_subscriptions",
      "redirect_after_subscribed",
      "redirect_after_already_subscribed",
      "redirect_after_subscription_pending",
      "redirect_after_unsubscribed",
      "requires_confirmation",
      "confirmation_mail_subject",
      "confirmation_mail_content",
      "campaign_mailer",
      "automation_mailer",
      "transactional_mailer",
      "report_recipients",
      "report_campaign_sent",
      "report_campaign_summary",
      "report_email_list_summary",
      "created_at",
      "updated_at",
    ],
  },
);

const subscriberSchema = s.looseRequiredObject(
  "Mailcoach subscriber returned by the official API.",
  {
    uuid: subscriberUuidSchema,
    email_list_uuid: emailListUuidSchema,
    email: s.email("Subscriber email address."),
    first_name: nullableStringSchema("Subscriber first name."),
    last_name: nullableStringSchema("Subscriber last name."),
    extra_attributes: s.unknown("Subscriber extra attributes as returned by the Mailcoach installation."),
    tags: s.array("Tags attached to the subscriber.", s.unknown("Tag value returned by Mailcoach.")),
    subscribed_at: nullableDateTimeSchema("Subscription timestamp."),
    unsubscribed_at: nullableDateTimeSchema("Unsubscribe timestamp."),
    created_at: s.dateTime("Subscriber creation timestamp."),
    updated_at: s.dateTime("Subscriber update timestamp."),
  },
  {
    optional: [
      "first_name",
      "last_name",
      "extra_attributes",
      "tags",
      "subscribed_at",
      "unsubscribed_at",
      "created_at",
      "updated_at",
    ],
  },
);

const emailListWriteProperties = {
  name: s.nonEmptyString("Email list name."),
  default_from_email: s.email("Default sender email address."),
  default_from_name: s.string("Default sender name."),
  default_reply_to_email: s.email("Default reply-to email address."),
  default_reply_to_name: s.string("Default reply-to name."),
  campaign_mailer: s.nonEmptyString("Configured mailer for campaigns."),
  automation_mailer: s.nonEmptyString("Configured mailer for automation messages."),
  transactional_mailer: s.nonEmptyString("Configured mailer for transactional messages."),
  campaigns_feed_enabled: s.boolean("Whether to enable the public campaigns feed."),
  report_recipients: s.string("Comma-delimited report recipient email addresses."),
  report_campaign_sent: s.boolean("Whether to send a report when a campaign is sent."),
  report_campaign_summary: s.boolean("Whether to send campaign summary reports."),
  report_email_list_summary: s.boolean("Whether to send email-list summary reports."),
  allow_form_subscriptions: s.boolean("Whether to allow subscriptions through public forms."),
  requires_confirmation: s.boolean("Whether new subscriptions require confirmation."),
  allowed_form_subscription_tags: s.stringArray("Tags allowed through public subscription forms.", {
    itemDescription: "Allowed tag name.",
  }),
  redirect_after_subscribed: s.string("Redirect URL after a successful subscription."),
  redirect_after_already_subscribed: s.string("Redirect URL when the address is already subscribed."),
  redirect_after_subscription_pending: s.string("Redirect URL when subscription confirmation is pending."),
  redirect_after_unsubscribed: s.string("Redirect URL after an unsubscribe."),
  confirmation_mail: s.stringEnum("Confirmation email strategy.", [
    "send_default_confirmation_mail",
    "send_custom_confirmation_mail",
  ]),
  confirmation_mail_subject: s.string("Custom confirmation email subject."),
  confirmation_mail_content: s.string("Custom confirmation email content."),
};

const optionalEmailListWriteFields: readonly string[] = [
  "default_from_name",
  "default_reply_to_email",
  "default_reply_to_name",
  "campaign_mailer",
  "automation_mailer",
  "transactional_mailer",
  "campaigns_feed_enabled",
  "report_recipients",
  "report_campaign_sent",
  "report_campaign_summary",
  "report_email_list_summary",
  "allow_form_subscriptions",
  "requires_confirmation",
  "allowed_form_subscription_tags",
  "redirect_after_subscribed",
  "redirect_after_already_subscribed",
  "redirect_after_subscription_pending",
  "redirect_after_unsubscribed",
  "confirmation_mail",
  "confirmation_mail_subject",
  "confirmation_mail_content",
];

const emailListWriteSchema = s.object(
  "Email list fields accepted by Mailcoach create and update endpoints.",
  emailListWriteProperties,
  {
    optional: optionalEmailListWriteFields,
  },
);

const listEmailListsInputSchema = s.object(
  "Filters and pagination for listing Mailcoach email lists.",
  {
    search: s.nonEmptyString("Fuzzy email list name search term."),
    name: s.nonEmptyString("Exact email list name filter."),
    sort: s.stringEnum("Email list sort field and direction.", [
      "name",
      "-name",
      "created_at",
      "-created_at",
      "updated_at",
      "-updated_at",
      "active_subscribers_count",
      "-active_subscribers_count",
    ]),
    page: s.positiveInteger("Page number to request."),
  },
  { optional: ["search", "name", "sort", "page"] },
);

const emailListUuidInputSchema = s.requiredObject("Input identifying a Mailcoach email list.", {
  email_list_uuid: emailListUuidSchema,
});

const updateEmailListInputSchema = s.object(
  "Input for updating a Mailcoach email list.",
  {
    ...emailListWriteProperties,
    email_list_uuid: emailListUuidSchema,
  },
  { optional: optionalEmailListWriteFields },
);

const subscriberStatusSchema = s.stringEnum("Subscriber status filter.", ["unconfirmed", "subscribed", "unsubscribed"]);

const listSubscribersInputSchema = s.object(
  "Filters and pagination for listing subscribers in a Mailcoach email list.",
  {
    email_list_uuid: emailListUuidSchema,
    email: s.email("Exact subscriber email filter."),
    search: s.nonEmptyString("Fuzzy search term for email, first name, last name, or tags."),
    status: subscriberStatusSchema,
    sort: s.stringEnum("Subscriber sort field and direction.", [
      "created_at",
      "-created_at",
      "updated_at",
      "-updated_at",
      "subscribed_at",
      "-subscribed_at",
      "unsubscribed_at",
      "-unsubscribed_at",
      "email",
      "-email",
      "first_name",
      "-first_name",
      "last_name",
      "-last_name",
    ]),
    page: s.positiveInteger("Page number to request."),
  },
  { optional: ["email", "search", "status", "sort", "page"] },
);

const subscriberUuidInputSchema = s.requiredObject("Input identifying a Mailcoach subscriber.", {
  subscriber_uuid: subscriberUuidSchema,
});

const subscribeInputSchema = s.object(
  "Subscriber fields accepted by the Mailcoach subscribe endpoint.",
  {
    email_list_uuid: emailListUuidSchema,
    email: s.email("Subscriber email address."),
    first_name: s.nullable(s.string("Subscriber first name.")),
    last_name: s.nullable(s.string("Subscriber last name.")),
    extra_attributes: s.nullable(s.looseObject("Subscriber-defined extra attributes.")),
    tags: s.stringArray("Tags to synchronize onto the subscriber.", {
      itemDescription: "Subscriber tag name.",
    }),
    skip_confirmation: s.boolean("Whether to skip the email list confirmation flow."),
    strict: s.boolean("Whether subscribing an existing address should return a validation error."),
  },
  {
    optional: ["first_name", "last_name", "extra_attributes", "tags", "skip_confirmation", "strict"],
  },
);

const updateSubscriberInputSchema = s.object(
  "Subscriber fields accepted by the Mailcoach update endpoint.",
  {
    subscriber_uuid: subscriberUuidSchema,
    email: s.email("Subscriber email address."),
    first_name: s.nullable(s.string("Subscriber first name.")),
    last_name: s.nullable(s.string("Subscriber last name.")),
    tags: s.stringArray("Tags to synchronize or append.", {
      itemDescription: "Subscriber tag name.",
    }),
    append_tags: s.boolean("Whether supplied tags should be appended instead of synchronized."),
    extra_attributes: s.nullable(s.looseObject("Subscriber-defined extra attributes.")),
  },
  { optional: ["first_name", "last_name", "tags", "append_tags", "extra_attributes"] },
);

const paginatedEmailListsOutputSchema = s.requiredObject("Paginated Mailcoach email list response.", {
  data: s.array("Email lists returned for the requested page.", emailListSchema),
  links: linksSchema,
  meta: metaSchema,
});

const paginatedSubscribersOutputSchema = s.requiredObject("Paginated Mailcoach subscriber response.", {
  data: s.array("Subscribers returned for the requested page.", subscriberSchema),
  links: linksSchema,
  meta: metaSchema,
});

const emailListOutputSchema = s.requiredObject("Single Mailcoach email list response.", {
  data: emailListSchema,
});

const subscriberOutputSchema = s.requiredObject("Single Mailcoach subscriber response.", {
  data: subscriberSchema,
});

const successOutputSchema = s.requiredObject("Successful Mailcoach no-content operation.", {
  success: s.boolean("Whether Mailcoach accepted the operation."),
});

const listEmailListsAction = defineProviderAction(service, {
  name: "list_email_lists",
  operationType: "read",
  description: "List email lists available to the connected Mailcoach API token.",
  requiredScopes: [],
  inputSchema: listEmailListsInputSchema,
  outputSchema: paginatedEmailListsOutputSchema,
});

const getEmailListAction = defineProviderAction(service, {
  name: "get_email_list",
  operationType: "read",
  description: "Get one Mailcoach email list by UUID.",
  requiredScopes: [],
  inputSchema: emailListUuidInputSchema,
  outputSchema: emailListOutputSchema,
});

const createEmailListAction = defineProviderAction(service, {
  name: "create_email_list",
  operationType: "write",
  description: "Create a Mailcoach email list.",
  requiredScopes: [],
  inputSchema: emailListWriteSchema,
  outputSchema: emailListOutputSchema,
});

const updateEmailListAction = defineProviderAction(service, {
  name: "update_email_list",
  operationType: "write",
  description: "Update a Mailcoach email list by UUID.",
  requiredScopes: [],
  inputSchema: updateEmailListInputSchema,
  outputSchema: emailListOutputSchema,
});

const deleteEmailListAction = defineProviderAction(service, {
  name: "delete_email_list",
  operationType: "destructive",
  description: "Delete a Mailcoach email list by UUID.",
  requiredScopes: [],
  inputSchema: emailListUuidInputSchema,
  outputSchema: successOutputSchema,
});

const listSubscribersAction = defineProviderAction(service, {
  name: "list_subscribers",
  operationType: "read",
  description: "List subscribers in a Mailcoach email list.",
  requiredScopes: [],
  inputSchema: listSubscribersInputSchema,
  outputSchema: paginatedSubscribersOutputSchema,
});

const getSubscriberAction = defineProviderAction(service, {
  name: "get_subscriber",
  operationType: "read",
  description: "Get one Mailcoach subscriber by UUID.",
  requiredScopes: [],
  inputSchema: subscriberUuidInputSchema,
  outputSchema: subscriberOutputSchema,
});

const subscribeAction = defineProviderAction(service, {
  name: "subscribe",
  operationType: "write",
  description: "Subscribe an email address to a Mailcoach email list.",
  requiredScopes: [],
  inputSchema: subscribeInputSchema,
  outputSchema: subscriberOutputSchema,
});

const updateSubscriberAction = defineProviderAction(service, {
  name: "update_subscriber",
  operationType: "write",
  description: "Update a Mailcoach subscriber by UUID.",
  requiredScopes: [],
  inputSchema: updateSubscriberInputSchema,
  outputSchema: subscriberOutputSchema,
});

const deleteSubscriberAction = defineProviderAction(service, {
  name: "delete_subscriber",
  operationType: "destructive",
  description: "Permanently delete a Mailcoach subscriber by UUID.",
  requiredScopes: [],
  inputSchema: subscriberUuidInputSchema,
  outputSchema: successOutputSchema,
});

const confirmSubscriberAction = defineProviderAction(service, {
  name: "confirm_subscriber",
  operationType: "write",
  description: "Confirm a pending Mailcoach subscriber by UUID.",
  requiredScopes: [],
  inputSchema: subscriberUuidInputSchema,
  outputSchema: successOutputSchema,
});

const unsubscribeSubscriberAction = defineProviderAction(service, {
  name: "unsubscribe_subscriber",
  operationType: "destructive",
  description: "Unsubscribe a Mailcoach subscriber by UUID.",
  requiredScopes: [],
  inputSchema: subscriberUuidInputSchema,
  outputSchema: successOutputSchema,
});

const resendSubscriberConfirmationAction = defineProviderAction(service, {
  name: "resend_subscriber_confirmation",
  operationType: "write",
  description: "Resend the confirmation email for a Mailcoach subscriber by UUID.",
  requiredScopes: [],
  inputSchema: subscriberUuidInputSchema,
  outputSchema: successOutputSchema,
});

export const mailcoachActions: readonly ActionDefinition[] = [
  listEmailListsAction,
  getEmailListAction,
  createEmailListAction,
  updateEmailListAction,
  deleteEmailListAction,
  listSubscribersAction,
  getSubscriberAction,
  subscribeAction,
  updateSubscriberAction,
  deleteSubscriberAction,
  confirmSubscriberAction,
  unsubscribeSubscriberAction,
  resendSubscriberConfirmationAction,
];
