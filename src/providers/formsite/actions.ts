import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formsite";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const optionalUserDir = nonEmptyString(
  "Optional Formsite user directory. When omitted, the connected default userDir is used.",
);
const resultsLabels = nonEmptyString("Optional results labels ID to apply when reading item labels.");

const formPublishSchema = s.object(
  "The publish metadata returned for a Formsite form.",
  {
    embed_code: s.string("The embeddable code returned by Formsite for the form."),
    link: s.string("The public link returned by Formsite for the form."),
  },
  { optional: ["embed_code", "link"] },
);

const formStatsSchema = s.object(
  "The stored file and result statistics returned by Formsite.",
  {
    filesSize: s.nonNegativeInteger("The total uploaded file size in bytes stored for the form."),
    resultsCount: s.nonNegativeInteger("The number of results currently stored for the form."),
  },
  { optional: ["filesSize", "resultsCount"] },
);

const formSchema = s.object(
  "One normalized Formsite form object.",
  {
    description: s.string("The internal form description."),
    directory: nonEmptyString("The form directory identifier used in Formsite URLs."),
    name: nonEmptyString("The form display name."),
    publish: formPublishSchema,
    state: s.string("The form state returned by Formsite, such as open or a closed reason."),
    stats: formStatsSchema,
  },
  { optional: ["description", "publish", "state", "stats"] },
);

const formItemSchema = s.object(
  "One Formsite item definition.",
  {
    id: nonEmptyString("The unique Formsite item identifier."),
    position: s.nonNegativeInteger("The sequential position of the item inside the form."),
    label: nonEmptyString("The visible question label for the item."),
    children: s.array("The child item identifiers for compound items.", nonEmptyString("One child item identifier.")),
  },
  { optional: ["children"] },
);

const formResultItemValueSchema = s.union(
  [
    s.string("A string result item value."),
    s.number("A numeric result item value."),
    s.boolean("A boolean result item value."),
    { type: "null", description: "A null result item value." },
  ],
  { description: "One primitive value returned inside a multi-value Formsite result item." },
);

const formResultItemSchema = s.object(
  "One Formsite result item.",
  {
    id: nonEmptyString("The Formsite item identifier."),
    position: s.nonNegativeInteger("The sequential position of the item in the form."),
    value: s.string("The scalar text value returned for single-value items."),
    values: s.array(
      "The structured values returned for multi-value Formsite items.",
      s.record("One keyed value object returned for a multi-value item.", formResultItemValueSchema),
    ),
  },
  { optional: ["value", "values"] },
);

const formResultSchema = s.object(
  "One normalized Formsite result.",
  {
    id: nonEmptyString("The Formsite result identifier."),
    date_start: s.string("The timestamp when the result was started, when available."),
    date_finish: s.string("The timestamp when the result was finished, when available."),
    date_update: s.string("The timestamp when the result was last updated."),
    login_email: s.string("The Save & Return email associated with the result, when available."),
    login_username: s.string("The Save & Return username associated with the result, when available."),
    payment_amount: s.number("The payment amount associated with the result, when available."),
    payment_status: s.string("The payment status associated with the result, when available."),
    result_status: s.string("The result status returned by Formsite."),
    user_browser: s.string("The browser reported for the submitter."),
    user_device: s.string("The device type reported for the submitter."),
    user_ip: s.string("The IP address reported for the submitter."),
    user_referrer: s.string("The referring URL reported by Formsite, when available."),
    items: s.array("The captured item values for the result.", formResultItemSchema),
  },
  {
    optional: [
      "date_start",
      "date_finish",
      "date_update",
      "login_email",
      "login_username",
      "payment_amount",
      "payment_status",
      "result_status",
      "user_browser",
      "user_device",
      "user_ip",
      "user_referrer",
    ],
  },
);

const webhookSchema = s.object(
  "One Formsite webhook definition.",
  {
    event: nonEmptyString("The Formsite event subscribed by the webhook."),
    handshake_key: s.string("The optional handshake key configured for the webhook."),
    url: s.url("The webhook delivery URL."),
  },
  { optional: ["handshake_key"] },
);

const listFormsInputSchema = s.object(
  "Input payload for listing forms in a Formsite account.",
  {
    user_dir: optionalUserDir,
  },
  { optional: ["user_dir"] },
);

const formInputSchema = s.object(
  "Input payload for retrieving one Formsite form.",
  {
    form_dir: nonEmptyString("The form directory identifier to retrieve."),
    user_dir: optionalUserDir,
  },
  { optional: ["user_dir"] },
);

const getFormItemsInputSchema = s.object(
  "Input payload for listing item definitions on one Formsite form.",
  {
    form_dir: nonEmptyString("The form directory identifier whose items should be listed."),
    user_dir: optionalUserDir,
    results_labels: resultsLabels,
  },
  { optional: ["user_dir", "results_labels"] },
);

const searchMapSchema = s.record(
  "A map from Formsite item or meta field IDs to search values, encoded as search_*[fieldId]=value.",
  s.string("The value to compare against for this Formsite search field."),
);

const getFormResultsInputSchema: JsonSchema = {
  ...s.object(
    "Input payload for listing results on one Formsite form.",
    {
      form_dir: nonEmptyString(
        "Optional alias for the form directory identifier. form_id is preferred and wins when both are provided.",
      ),
      form_id: nonEmptyString("The form directory identifier whose results should be listed."),
      user_dir: optionalUserDir,
      limit: s.positiveInteger("Maximum number of results to return, up to 500."),
      page: s.positiveInteger("The page number to request."),
      after_date: nonEmptyString("Only return results updated after this timestamp or local datetime string."),
      before_date: nonEmptyString("Only return results updated before this timestamp or local datetime string."),
      after_id: nonEmptyString("Only return results whose IDs are greater than this result ID."),
      before_id: nonEmptyString("Only return results whose IDs are less than this result ID."),
      sort_id: nonEmptyString("Optional item or meta field identifier to use as the upstream sort key."),
      results_view: nonEmptyString("Optional results view identifier to apply."),
      sort_direction: s.stringEnum("The upstream result sort direction.", ["asc", "desc"]),
      search_method: s.stringEnum("How multiple search clauses should be combined.", ["and", "or"]),
      search_equals: searchMapSchema,
      search_contains: searchMapSchema,
      search_begins: searchMapSchema,
      search_ends: searchMapSchema,
    },
    {
      optional: [
        "form_dir",
        "form_id",
        "user_dir",
        "limit",
        "page",
        "after_date",
        "before_date",
        "after_id",
        "before_id",
        "sort_id",
        "results_view",
        "sort_direction",
        "search_method",
        "search_equals",
        "search_contains",
        "search_begins",
        "search_ends",
      ],
    },
  ),
  anyOf: [{ required: ["form_id"] }, { required: ["form_dir"] }],
};

const listWebhooksInputSchema = s.object(
  "Input payload for listing webhooks on one Formsite form.",
  {
    form_dir: nonEmptyString("The form directory identifier whose webhooks should be listed."),
    user_dir: optionalUserDir,
  },
  { optional: ["user_dir"] },
);

const upsertWebhookInputSchema = s.object(
  "Input payload for creating or updating a Formsite webhook.",
  {
    form_dir: nonEmptyString("The form directory identifier whose webhook should be created or updated."),
    user_dir: optionalUserDir,
    event: nonEmptyString("The event name to subscribe, such as result_completed."),
    url: s.url("The webhook destination URL."),
    handshake_key: nonEmptyString("Optional handshake key to include in deliveries."),
  },
  { optional: ["user_dir", "handshake_key"] },
);

const deleteWebhookInputSchema = s.object(
  "Input payload for deleting a Formsite webhook by URL.",
  {
    form_dir: nonEmptyString("The form directory identifier whose webhook should be deleted."),
    user_dir: optionalUserDir,
    url: s.url("The webhook URL to delete from the form."),
  },
  { optional: ["user_dir"] },
);

export const formsiteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List all forms available in the connected Formsite account user directory.",
    requiredScopes: [],
    inputSchema: listFormsInputSchema,
    outputSchema: s.requiredObject("The normalized form-list response returned by Formsite.", {
      forms: s.array("The forms returned by Formsite.", formSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Get one Formsite form by its form directory identifier.",
    requiredScopes: [],
    inputSchema: formInputSchema,
    outputSchema: s.requiredObject("The normalized single-form response returned by Formsite.", {
      form: formSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_form_items",
    description: "List the item definitions for one Formsite form.",
    requiredScopes: [],
    inputSchema: getFormItemsInputSchema,
    outputSchema: s.requiredObject("The normalized form-item response returned by Formsite.", {
      items: s.array("The item definitions returned by Formsite.", formItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form_results",
    description:
      "List results for one Formsite form with pagination, date windows, result ID windows, and upstream search filters.",
    requiredScopes: [],
    inputSchema: getFormResultsInputSchema,
    outputSchema: s.requiredObject("The normalized form-result response returned by Formsite.", {
      results: s.array("The results returned by Formsite.", formResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    description: "List all webhooks configured for one Formsite form.",
    requiredScopes: [],
    inputSchema: listWebhooksInputSchema,
    outputSchema: s.requiredObject("The normalized webhook-list response returned by Formsite.", {
      webhooks: s.array("The webhooks configured on the form.", webhookSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_webhook",
    description: "Create a new Formsite webhook, or update the existing webhook that matches the same URL.",
    requiredScopes: [],
    inputSchema: upsertWebhookInputSchema,
    outputSchema: s.requiredObject("The normalized single-webhook response returned by Formsite.", {
      webhook: webhookSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    description: "Delete one Formsite webhook from a form by its destination URL.",
    requiredScopes: [],
    inputSchema: deleteWebhookInputSchema,
    outputSchema: s.requiredObject("The normalized delete response returned by the Formsite webhook endpoint.", {
      deleted: s.boolean("Whether the webhook delete request completed."),
    }),
  }),
];
