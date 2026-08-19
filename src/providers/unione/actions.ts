import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "unione";

const utcDateTimeField = s.string('UTC datetime string in the "YYYY-MM-DD hh:mm:ss" format accepted by UniOne.');
const stringOrIntegerValue = s.anyOf("String or integer value accepted by UniOne.", [
  s.string("String value."),
  s.integer("Integer value."),
]);
const stringOrIntegerRecord = s.record(
  "String key-value object with string or integer values accepted by UniOne.",
  stringOrIntegerValue,
);
const templateEngineField = s.stringEnum("Template engine used for substitutions.", [
  "simple",
  "velocity",
  "liquid",
  "none",
]);
const languageField = s.stringEnum("Language used for the unsubscribe footer and page.", [
  "be",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "pl",
  "pt",
  "ru",
  "ua",
  "kz",
]);
const zeroOneField = (description: string): JsonSchema => s.integer(description, { minimum: 0, maximum: 1 });

const accountingSchema = s.looseObject("Accounting counters returned by UniOne.", {
  period_start: s.string("UTC start time of the accounting period."),
  period_end: s.string("UTC end time of the accounting period."),
  emails_included: s.integer("Number of emails included in the accounting period."),
  emails_sent: s.integer("Number of emails sent during the accounting period."),
});

const projectAccountingSchema = s.looseObject("Project email counters returned by UniOne.", {
  email_counter: s.integer("Number of emails sent by the project counter."),
  email_counter_limit: s.integer("Current project email counter limit."),
  email_counter_mode: s.string("Project email counter mode."),
});

const accountInfoOutputSchema = s.object(
  "User or project information returned by UniOne.",
  {
    status: s.string("API operation status."),
    user_id: s.integer("Unique UniOne user identifier."),
    email: s.email("UniOne account email address."),
    project_id: s.string("Project identifier when the API key belongs to a project."),
    project_name: s.string("Project name when the API key belongs to a project."),
    project_accounting: projectAccountingSchema,
    accounting: accountingSchema,
  },
  { optional: ["project_id", "project_name", "project_accounting", "accounting"] },
);

const emailRecipientSchema = s.object(
  "Recipient object accepted by UniOne email/send.",
  {
    email: s.email("Recipient email address."),
    substitutions: stringOrIntegerRecord,
    metadata: stringOrIntegerRecord,
  },
  { optional: ["substitutions", "metadata"] },
);

const emailBodySchema = {
  ...s.object(
    "Email body parts accepted by UniOne.",
    {
      html: s.string("HTML body part of the email."),
      plaintext: s.string("Plain-text body part of the email."),
      amp: s.string("AMP4Email body part of the email."),
    },
    { optional: ["html", "plaintext", "amp"] },
  ),
  anyOf: [{ required: ["html"] }, { required: ["plaintext"] }],
};

const emailOptionsSchema = s.object(
  "Additional email sending options accepted by UniOne.",
  {
    send_at: utcDateTimeField,
    unsubscribe_url: s.url("Custom unsubscribe URL."),
    custom_backend_id: s.integer("Backend-domain identifier used to send the message."),
    smtp_pool_id: s.uuid("SMTP pool identifier used to send the message."),
  },
  { optional: ["send_at", "unsubscribe_url", "custom_backend_id", "smtp_pool_id"] },
);

const sendEmailInputSchema = s.object(
  "Message fields for sending a UniOne email. The provider runtime wraps these fields in the official message object.",
  {
    recipients: s.array("Recipients accepted by UniOne.", emailRecipientSchema, {
      minItems: 1,
      maxItems: 500,
    }),
    body: emailBodySchema,
    subject: s.string("Email subject."),
    from_email: s.email("Sender email address."),
    from_name: s.string("Sender display name."),
    reply_to: s.email("Reply-To email address."),
    reply_to_name: s.string("Reply-To display name."),
    template_id: s.uuid("Template identifier created in UniOne."),
    tags: s.array("Up to four tags attached to the message.", s.string("Tag name."), {
      maxItems: 4,
    }),
    skip_unsubscribe: zeroOneField("Whether UniOne should skip appending the default unsubscribe footer."),
    global_language: languageField,
    template_engine: templateEngineField,
    global_substitutions: stringOrIntegerRecord,
    global_metadata: stringOrIntegerRecord,
    track_links: zeroOneField("Whether click tracking is enabled, where 1 is enabled and 0 is disabled."),
    track_read: zeroOneField("Whether read tracking is enabled, where 1 is enabled and 0 is disabled."),
    bypass_global: zeroOneField("Whether the global unavailability list should be ignored."),
    bypass_unavailable: zeroOneField("Whether the current account or project unavailability list should be ignored."),
    bypass_unsubscribed: zeroOneField("Whether the current unsubscribed list should be ignored."),
    bypass_complained: zeroOneField("Whether the current complaint list should be ignored."),
    idempotence_key: s.string("Unique message key used to prevent accidental duplicates.", {
      maxLength: 64,
    }),
    headers: s.record("Custom email headers accepted by UniOne.", s.string("Header value.")),
    options: emailOptionsSchema,
  },
  {
    optional: [
      "from_name",
      "reply_to",
      "reply_to_name",
      "template_id",
      "tags",
      "skip_unsubscribe",
      "global_language",
      "template_engine",
      "global_substitutions",
      "global_metadata",
      "track_links",
      "track_read",
      "bypass_global",
      "bypass_unavailable",
      "bypass_unsubscribed",
      "bypass_complained",
      "idempotence_key",
      "headers",
      "options",
    ],
  },
);

const sendEmailOutputSchema = s.object(
  "Submission result returned by UniOne email/send.",
  {
    status: s.string("API operation status."),
    job_id: s.string("UniOne job identifier for the accepted send request."),
    emails: s.array("Recipient email addresses accepted for sending.", s.email("Accepted recipient email address.")),
    failed_emails: s.record(
      "Recipient email addresses rejected by UniOne with rejection reasons.",
      s.string("UniOne rejection reason."),
    ),
  },
  { optional: ["emails", "failed_emails"] },
);

const listTemplatesInputSchema = s.object(
  "Pagination fields for listing UniOne templates.",
  {
    limit: s.integer("Maximum number of templates to return. Defaults to 50.", { minimum: 1 }),
    offset: s.nonNegativeInteger("Index of the first template to return."),
  },
  { optional: ["limit", "offset"] },
);

const listTemplatesOutputSchema = s.object("Template list returned by UniOne.", {
  status: s.string("API operation status."),
  templates: s.array("Template objects returned by UniOne.", s.looseObject("UniOne template object.")),
});

const tagSchema = s.object("User-defined tag returned by UniOne.", {
  tag_id: s.integer("Unique tag identifier."),
  tag: s.string("Tag name."),
});

const listTagsOutputSchema = s.object("Tag list returned by UniOne.", {
  status: s.string("API operation status."),
  tags: s.array("User-defined tags returned by UniOne.", tagSchema),
});

const suppressionCauseField = s.stringEnum("Suppression cause filter.", [
  "unsubscribed",
  "temporary_unavailable",
  "permanent_unavailable",
  "complained",
  "blocked",
]);
const suppressionSourceField = s.stringEnum("Suppression source filter.", ["user", "system", "subscriber"]);

const listSuppressionsInputSchema = s.object(
  "Filters and pagination fields for listing UniOne suppressions.",
  {
    cause: suppressionCauseField,
    source: suppressionSourceField,
    start_time: utcDateTimeField,
    cursor: s.string("Pagination cursor from the previous UniOne response."),
    limit: s.integer("Maximum number of suppression records to return. Defaults to 50.", {
      minimum: 0,
    }),
  },
  { optional: ["cause", "source", "start_time", "cursor", "limit"] },
);

const suppressionSchema = s.object(
  "Suppression record returned by UniOne.",
  {
    email: s.email("Suppressed email address."),
    cause: s.string("Suppression cause."),
    source: s.string("Suppression source."),
    is_deletable: s.boolean("Whether the suppression can be removed."),
    created: s.string("UTC timestamp when the suppression was created."),
  },
  { optional: ["email"] },
);

const listSuppressionsOutputSchema = s.object(
  "Suppression list returned by UniOne.",
  {
    status: s.string("API operation status."),
    suppressions: s.array("Suppression records returned by UniOne.", suppressionSchema),
    cursor: s.string("Cursor for the next page of suppression records."),
  },
  { optional: ["cursor"] },
);

export const unioneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Get UniOne user or project information for the current API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {}),
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_email",
    description: "Send a transactional email through UniOne without attachments.",
    requiredScopes: [],
    inputSchema: sendEmailInputSchema,
    outputSchema: sendEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List UniOne templates available to the current API key.",
    requiredScopes: [],
    inputSchema: listTemplatesInputSchema,
    outputSchema: listTemplatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List UniOne user-defined tags.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {}),
    outputSchema: listTagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_suppressions",
    description: "List UniOne suppressed recipients with optional filters.",
    requiredScopes: [],
    inputSchema: listSuppressionsInputSchema,
    outputSchema: listSuppressionsOutputSchema,
  }),
];
