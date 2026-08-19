import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kit";

const cursorSchema = s.string("Cursor returned by Kit pagination.", { minLength: 1 });
const perPageSchema = s.integer("Number of records to return per page. Kit defaults to 500.", {
  minimum: 1,
  maximum: 1000,
});
const includeTotalCountSchema = s.boolean("Whether Kit should include the total_count value in pagination metadata.");
const subscriberStatusSchema = s.stringEnum("Subscriber status used by Kit.", [
  "active",
  "inactive",
  "bounced",
  "complained",
  "cancelled",
  "all",
]);
const formStatusSchema = s.stringEnum("Form status used by Kit.", ["active", "archived", "trashed", "all"]);
const formTypeSchema = s.stringEnum("Kit form type.", ["embed", "hosted"]);
const sortOrderSchema = s.stringEnum("Sort direction used by Kit.", ["asc", "desc"]);
const subscriberSortFieldSchema = s.stringEnum("Subscriber field used for sorting.", [
  "id",
  "cancelled_at",
  "updated_at",
]);
const dateFilterSchema = s.string("Date or timestamp used by Kit filter parameters.", {
  minLength: 1,
});
const includeSchema = s.array(
  "Additional subscriber fields to include in Kit list responses.",
  s.stringEnum("One supported Kit subscriber include value.", ["attribution", "tags", "location", "canceled_at"]),
  { minItems: 1 },
);
const subscriberIdSchema = s.integer("Kit subscriber ID.", { minimum: 1 });
const formIdSchema = s.integer("Kit form ID.", { minimum: 1 });
const tagIdSchema = s.integer("Kit tag ID.", { minimum: 1 });
const customFieldsSchema = s.record(
  "Custom field values keyed by custom field label. Kit ignores fields that do not exist.",
  s.nullable(s.string("A custom field value.")),
);

const paginationInputSchema = {
  after: cursorSchema,
  before: cursorSchema,
  per_page: perPageSchema,
  include_total_count: includeTotalCountSchema,
};

const paginationOutputSchema = s.object("Kit pagination metadata.", {
  has_previous_page: s.boolean("Whether a previous page exists."),
  has_next_page: s.boolean("Whether a next page exists."),
  start_cursor: s.nullable(s.string("Cursor for the first item on the current page.")),
  end_cursor: s.nullable(s.string("Cursor for the last item on the current page.")),
  per_page: s.integer("Number of records returned per page."),
  total_count: s.nullable(s.integer("Total count when requested and returned by Kit.")),
});

const accountTimezoneSchema = s.object("Kit account timezone metadata.", {
  name: s.string("IANA timezone name configured for the Kit account."),
  friendly_name: s.string("Human-readable timezone name returned by Kit."),
  utc_offset: s.string("UTC offset returned by Kit."),
});

const sendingAddressSchema = s.object("A Kit sending address.", {
  email_address: s.email("Sending email address."),
  from_name: s.string("Display name used for the sending address."),
  status: s.string("Verification status of the sending address."),
  is_default: s.boolean("Whether this is the default sending address."),
  is_verified: s.boolean("Whether Kit has verified this sending address."),
  is_dmarc_configured: s.boolean("Whether DMARC is configured for the sending domain."),
});

const accountSchema = s.object("Kit account details.", {
  id: s.integer("Kit account ID."),
  name: s.string("Kit account name."),
  plan_type: s.string("Kit plan type for the account."),
  primary_email_address: s.email("Primary email address for the account."),
  created_at: s.string("Timestamp when the account was created."),
  timezone: accountTimezoneSchema,
  sending_addresses: s.array("Sending addresses configured for the account.", sendingAddressSchema),
});

const userSchema = s.object("Authenticated Kit user details.", {
  id: s.nullable(s.integer("Kit user ID when returned by Kit.")),
  email: s.email("Authenticated Kit user email address."),
});

const tagSummarySchema = s.object("A Kit tag summary.", {
  id: s.integer("Kit tag ID."),
  name: s.string("Kit tag name."),
  created_at: s.nullable(s.string("Timestamp when the tag was created.")),
});

const locationSchema = s.object("Subscriber location metadata returned by Kit.", {
  city: s.nullable(s.string("Subscriber city.")),
  state: s.nullable(s.string("Subscriber state or region.")),
  country: s.nullable(s.string("Subscriber country.")),
  latitude: s.nullable(s.number("Subscriber latitude.")),
  longitude: s.nullable(s.number("Subscriber longitude.")),
});

const attributionSchema = s.object("Subscriber attribution metadata returned by Kit.", {
  referrer: s.nullable(s.string("Referrer URL or source.")),
  utm_source: s.nullable(s.string("UTM source value.")),
  utm_medium: s.nullable(s.string("UTM medium value.")),
  utm_campaign: s.nullable(s.string("UTM campaign value.")),
  utm_term: s.nullable(s.string("UTM term value.")),
  utm_content: s.nullable(s.string("UTM content value.")),
  source_type: s.nullable(s.string("Kit source type value.")),
  source_name: s.nullable(s.string("Kit source name value.")),
  source_mechanism: s.nullable(s.string("Kit source mechanism value.")),
});

const utmParametersSchema = s.object("UTM parameters returned for a form subscriber.", {
  source: s.nullable(s.string("UTM source value.")),
  medium: s.nullable(s.string("UTM medium value.")),
  campaign: s.nullable(s.string("UTM campaign value.")),
  term: s.nullable(s.string("UTM term value.")),
  content: s.nullable(s.string("UTM content value.")),
});

const subscriberSchema = s.object("A Kit subscriber.", {
  id: s.integer("Kit subscriber ID."),
  first_name: s.nullable(s.string("Subscriber first name.")),
  email_address: s.email("Subscriber email address."),
  state: s.string("Subscriber state returned by Kit."),
  created_at: s.string("Timestamp when the subscriber was created."),
  fields: customFieldsSchema,
  canceled_at: s.nullable(s.string("Timestamp when the subscriber cancelled, when returned.")),
  attribution: s.nullable(attributionSchema),
  tags: s.array("Tags included on the subscriber when requested.", tagSummarySchema),
  location: s.nullable(locationSchema),
  added_at: s.nullable(s.string("Timestamp when the subscriber was added to a form.")),
  tagged_at: s.nullable(s.string("Timestamp when the subscriber was tagged.")),
  referrer: s.nullable(s.string("Referrer returned for a form subscriber.")),
  referrer_utm_parameters: s.nullable(utmParametersSchema),
});

const subscriberOutputSchema = s.object("The response returned for a single Kit subscriber.", {
  subscriber: subscriberSchema,
});

const subscribersOutputSchema = s.object("The response returned when listing Kit subscribers.", {
  subscribers: s.array("Kit subscribers returned by the request.", subscriberSchema),
  pagination: paginationOutputSchema,
});

const formSchema = s.object("A Kit form or landing page.", {
  id: s.integer("Kit form ID."),
  name: s.string("Kit form name."),
  created_at: s.string("Timestamp when the form was created."),
  type: s.string("Form type returned by Kit."),
  format: s.nullable(s.string("Form format returned by Kit.")),
  embed_js: s.string("URL for the form embed JavaScript."),
  embed_url: s.url("URL for the hosted form."),
  archived: s.boolean("Whether the form is archived."),
  uid: s.string("Kit form UID."),
});

const formsOutputSchema = s.object("The response returned when listing Kit forms.", {
  forms: s.array("Kit forms returned by the request.", formSchema),
  pagination: paginationOutputSchema,
});

const tagsOutputSchema = s.object("The response returned when listing Kit tags.", {
  tags: s.array("Kit tags returned by the request.", tagSummarySchema),
  pagination: paginationOutputSchema,
});

const getCurrentAccountAction = defineProviderAction(service, {
  name: "get_current_account",
  description: "Get the current Kit account and authenticated user details.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the current Kit account.", {}),
  outputSchema: s.object("The response returned when getting the current Kit account.", {
    user: userSchema,
    account: accountSchema,
  }),
});

const listSubscribersAction = defineProviderAction(service, {
  name: "list_subscribers",
  description: "List Kit subscribers with optional filtering, sorting, and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Kit subscribers.",
    {
      ...paginationInputSchema,
      created_after: dateFilterSchema,
      created_before: dateFilterSchema,
      updated_after: dateFilterSchema,
      updated_before: dateFilterSchema,
      email_address: s.string("Exact subscriber email address or comma-separated emails."),
      include: includeSchema,
      sort_field: subscriberSortFieldSchema,
      sort_order: sortOrderSchema,
      status: subscriberStatusSchema,
    },
    {
      optional: [
        "after",
        "before",
        "per_page",
        "include_total_count",
        "created_after",
        "created_before",
        "updated_after",
        "updated_before",
        "email_address",
        "include",
        "sort_field",
        "sort_order",
        "status",
      ],
    },
  ),
  outputSchema: subscribersOutputSchema,
});

const getSubscriberAction = defineProviderAction(service, {
  name: "get_subscriber",
  description: "Get one Kit subscriber by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Kit subscriber.", {
    id: subscriberIdSchema,
  }),
  outputSchema: subscriberOutputSchema,
});

const createSubscriberAction = defineProviderAction(service, {
  name: "create_subscriber",
  description: "Create a Kit subscriber, or update the existing subscriber with the same email address.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating or upserting a Kit subscriber.",
    {
      email_address: s.email("Subscriber email address."),
      first_name: s.nullable(s.string("Subscriber first name.")),
      state: subscriberStatusSchema,
      fields: customFieldsSchema,
    },
    { optional: ["first_name", "state", "fields"] },
  ),
  outputSchema: subscriberOutputSchema,
});

const updateSubscriberAction = defineProviderAction(service, {
  name: "update_subscriber",
  description: "Update a Kit subscriber's email address, first name, and custom fields.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a Kit subscriber.",
    {
      id: subscriberIdSchema,
      email_address: s.email("Subscriber email address."),
      first_name: s.nullable(s.string("Subscriber first name.")),
      fields: customFieldsSchema,
    },
    { optional: ["first_name", "fields"] },
  ),
  outputSchema: subscriberOutputSchema,
});

const listFormsAction = defineProviderAction(service, {
  name: "list_forms",
  description: "List Kit forms and landing pages with optional filters and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Kit forms.",
    {
      ...paginationInputSchema,
      status: formStatusSchema,
      type: formTypeSchema,
    },
    { optional: ["after", "before", "per_page", "include_total_count", "status", "type"] },
  ),
  outputSchema: formsOutputSchema,
});

const listTagsAction = defineProviderAction(service, {
  name: "list_tags",
  description: "List Kit tags with optional pagination.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Kit tags.", paginationInputSchema, {
    optional: ["after", "before", "per_page", "include_total_count"],
  }),
  outputSchema: tagsOutputSchema,
});

const listFormSubscribersAction = defineProviderAction(service, {
  name: "list_form_subscribers",
  description: "List Kit subscribers who joined through a specific form.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing subscribers for a Kit form.",
    {
      form_id: formIdSchema,
      ...paginationInputSchema,
      added_after: dateFilterSchema,
      added_before: dateFilterSchema,
      created_after: dateFilterSchema,
      created_before: dateFilterSchema,
      status: subscriberStatusSchema,
    },
    {
      optional: [
        "after",
        "before",
        "per_page",
        "include_total_count",
        "added_after",
        "added_before",
        "created_after",
        "created_before",
        "status",
      ],
    },
  ),
  outputSchema: subscribersOutputSchema,
});

const listTagSubscribersAction = defineProviderAction(service, {
  name: "list_tag_subscribers",
  description: "List Kit subscribers who have a specific tag.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing subscribers for a Kit tag.",
    {
      tag_id: tagIdSchema,
      ...paginationInputSchema,
      created_after: dateFilterSchema,
      created_before: dateFilterSchema,
      tagged_after: dateFilterSchema,
      tagged_before: dateFilterSchema,
      status: subscriberStatusSchema,
    },
    {
      optional: [
        "after",
        "before",
        "per_page",
        "include_total_count",
        "created_after",
        "created_before",
        "tagged_after",
        "tagged_before",
        "status",
      ],
    },
  ),
  outputSchema: subscribersOutputSchema,
});

export const kitActions: ActionDefinition[] = [
  getCurrentAccountAction,
  listSubscribersAction,
  getSubscriberAction,
  createSubscriberAction,
  updateSubscriberAction,
  listFormsAction,
  listTagsAction,
  listFormSubscribersAction,
  listTagSubscribersAction,
];
