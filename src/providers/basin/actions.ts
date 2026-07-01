import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "basin";

const projectIdSchema = s.positiveInteger("Basin project ID.");
const formIdSchema = s.nonEmptyString("Basin form ID.");
const formNumericIdSchema = s.positiveInteger("Basin form ID to attach the webhook to.");
const submissionIdSchema = s.positiveInteger("Basin submission ID.");
const webhookIdSchema = s.positiveInteger("Basin form webhook ID.");
const resourceSchema = s.looseObject("Basin resource response.");
const metaSchema = s.looseObject("Pagination metadata inferred from Basin list responses.", {
  count: s.integer("Total number of records available for the current query."),
  page: s.integer("Current page number."),
  per_page: s.integer("Maximum number of records returned on each page."),
});
const listInputSchema = s.object(
  "Pagination and search query parameters accepted by Basin list endpoints.",
  {
    page: s.positiveInteger("Page number to request from Basin."),
    query: s.nonEmptyString("Search query accepted by the Basin list endpoint."),
  },
  { optional: ["page", "query"] },
);
const successOutputSchema = s.object("Success marker returned after a Basin response with no JSON body.", {
  success: s.boolean("Whether Basin accepted the operation."),
});
const formFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("Form name."),
  timezone: s.nonEmptyString("IANA timezone used for form timestamps."),
  project_id: projectIdSchema,
  redirect_url: s.nonEmptyString("URL to redirect users to after submission."),
  use_ajax: s.boolean("Whether the form should submit via AJAX."),
  notification_emails: s.nonEmptyString("Comma-separated email addresses notified for each submission."),
  notification_cc_emails: s.nonEmptyString("Comma-separated CC email addresses for submission notifications."),
  notification_bcc_emails: s.nonEmptyString("Comma-separated BCC email addresses for submission notifications."),
  notification_subject: s.nonEmptyString("Subject for submission notification emails."),
  notification_from_name: s.nonEmptyString("From name for submission notification emails."),
  autoreply: s.boolean("Whether Basin should send auto-reply emails."),
  autoreply_body: s.nonEmptyString("Body text for auto-reply emails."),
  autoreply_subject: s.nonEmptyString("Subject for auto-reply emails."),
  autoreply_from_name: s.nonEmptyString("From name for auto-reply emails."),
  autoreply_greeting: s.nonEmptyString("Greeting text for auto-reply emails."),
  autoreply_name: s.nonEmptyString("Sender display name for auto-reply emails."),
  autoreply_title: s.nonEmptyString("Title text for auto-reply emails."),
  autoreply_email: s.nonEmptyString("Reply-to email address for auto-reply emails."),
  force_recaptcha: s.boolean("Whether Google reCAPTCHA is required."),
  force_hcaptcha: s.boolean("Whether hCaptcha is required."),
  force_turnstile: s.boolean("Whether Cloudflare Turnstile is required."),
  honeypot_field: s.nonEmptyString("Honeypot field name used for spam filtering."),
  retention_days: s.positiveInteger("Number of days to retain form submissions."),
  allowed_domains: s.stringArray("Domains allowed to submit the form."),
  blocked_domains: s.stringArray("Domains blocked from submitting the form."),
  duplicate_filter: s.boolean("Whether Basin should filter duplicate submissions."),
  smtp_email_validation: s.boolean("Whether SMTP email validation is enabled."),
};
const optionalFormFields = [
  "redirect_url",
  "use_ajax",
  "notification_emails",
  "notification_cc_emails",
  "notification_bcc_emails",
  "notification_subject",
  "notification_from_name",
  "autoreply",
  "autoreply_body",
  "autoreply_subject",
  "autoreply_from_name",
  "autoreply_greeting",
  "autoreply_name",
  "autoreply_title",
  "autoreply_email",
  "force_recaptcha",
  "force_hcaptcha",
  "force_turnstile",
  "honeypot_field",
  "retention_days",
  "allowed_domains",
  "blocked_domains",
  "duplicate_filter",
  "smtp_email_validation",
];
const webhookFields: Record<string, JsonSchema> = {
  form_id: formNumericIdSchema,
  name: s.nonEmptyString("Friendly webhook name."),
  url: s.url("Destination URL where Basin posts submission payloads."),
  format: s.nonEmptyString("Webhook payload format accepted by Basin."),
  enabled: s.boolean("Whether the webhook is enabled."),
  trigger_when_spam: s.boolean("Whether the webhook fires for spam submissions."),
};

export const basinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List projects available to the current Basin API key.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object("Project list response inferred from Basin API documentation.", {
      projects: s.array("Projects returned by the Basin projects list endpoint.", resourceSchema),
      meta: metaSchema,
    }, { optional: ["meta"] }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Fetch a single Basin project by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin project endpoint.", { project_id: projectIdSchema }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a new Basin project.",
    requiredScopes: [],
    inputSchema: s.object("Request payload for creating a Basin project.", {
      name: s.nonEmptyString("Project name."),
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update an existing Basin project by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path and body parameters for updating a Basin project.", {
      project_id: projectIdSchema,
      name: s.nonEmptyString("Project name."),
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete a Basin project by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin project endpoint.", { project_id: projectIdSchema }),
    outputSchema: s.anyOf("Basin project deletion response.", [resourceSchema, successOutputSchema]),
  }),
  defineProviderAction(service, {
    name: "list_forms",
    description: "List forms available to the current Basin API key.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object("Form list response inferred from Basin API documentation.", {
      forms: s.array("Forms returned by the Basin forms list endpoint.", resourceSchema),
      meta: metaSchema,
    }, { optional: ["meta"] }),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Fetch a single Basin form by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin form endpoint.", { form_id: formIdSchema }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "create_form",
    description: "Create a new Basin form.",
    requiredScopes: [],
    inputSchema: s.object("Request payload for creating a Basin form.", formFields, { optional: optionalFormFields }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "update_form",
    description: "Update an existing Basin form by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Path and body parameters for updating a Basin form.",
      {
        form_id: formIdSchema,
        ...formFields,
      },
      { optional: ["name", "timezone", "project_id", ...optionalFormFields] },
    ),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "delete_form",
    description: "Delete a Basin form by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin form endpoint.", { form_id: formIdSchema }),
    outputSchema: s.anyOf("Basin form deletion response.", [resourceSchema, successOutputSchema]),
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    description: "List Basin form submissions with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Query parameters accepted by the Basin submissions list endpoint.",
      {
        form_id: s.nonEmptyString("Basin form ID used to filter submissions."),
        filter_by: s.stringEnum("Submission status filter accepted by Basin.", ["new", "spam", "trash", "all"]),
        query: s.nonEmptyString("Search text for matching submissions."),
        order_by: s.stringEnum("Submission sort order accepted by Basin.", ["date_asc", "date_desc", "email_asc", "email_desc"]),
        date_range: s.nonEmptyString("Date range in YYYY-MM-DD+to+YYYY-MM-DD format accepted by Basin."),
      },
      { optional: ["form_id", "filter_by", "query", "order_by", "date_range"] },
    ),
    outputSchema: s.object("Submission list response inferred from Basin API documentation.", {
      submissions: s.array("Submissions returned by the Basin submissions list endpoint.", resourceSchema),
      meta: metaSchema,
    }, { optional: ["meta"] }),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    description: "Fetch a single Basin submission by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin submission endpoint.", { submission_id: submissionIdSchema }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "delete_submission",
    description: "Delete a Basin submission by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin submission endpoint.", { submission_id: submissionIdSchema }),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_form_webhooks",
    description: "List Basin form webhooks with optional filters.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object("Form webhook list response inferred from Basin API documentation.", {
      form_webhooks: s.array("Form webhooks returned by the Basin list endpoint.", resourceSchema),
      meta: metaSchema,
    }, { optional: ["meta"] }),
  }),
  defineProviderAction(service, {
    name: "get_form_webhook",
    description: "Fetch a single Basin form webhook by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin form webhook endpoint.", { webhook_id: webhookIdSchema }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "create_form_webhook",
    description: "Create a new Basin form webhook.",
    requiredScopes: [],
    inputSchema: s.object("Request payload for creating a Basin form webhook.", webhookFields, {
      optional: ["format", "enabled", "trigger_when_spam"],
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "update_form_webhook",
    description: "Update an existing Basin form webhook by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Path and body parameters for updating a Basin form webhook.",
      {
        webhook_id: webhookIdSchema,
        ...webhookFields,
      },
      { optional: ["form_id", "name", "url", "format", "enabled", "trigger_when_spam"] },
    ),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "delete_form_webhook",
    description: "Delete a Basin form webhook by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for a Basin form webhook endpoint.", { webhook_id: webhookIdSchema }),
    outputSchema: s.anyOf("Basin form webhook deletion response.", [resourceSchema, successOutputSchema]),
  }),
];

export type BasinActionName = (typeof basinActions)[number]["name"];
