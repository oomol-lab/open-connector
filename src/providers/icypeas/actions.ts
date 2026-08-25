import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "icypeas";

const trimmedString = (description: string) => s.nonEmptyString(description);
const rawObjectSchema = s.looseObject("A raw object returned by Icypeas.");
const validationErrorSchema = s.looseObject("A validation error returned by Icypeas.", {
  expected: s.unknown("The expected value or type for the invalid field."),
  actual: s.unknown("The actual value that Icypeas received for the invalid field."),
  type: s.string("The Icypeas validation error type."),
  field: s.string("The field that caused the validation error."),
  message: s.string("The machine-readable validation error message."),
});
const statusSchema = s.string(
  "The Icypeas search item processing status, such as NONE, IN_PROGRESS, FOUND, or DEBITED.",
);
const searchItemSchema = s.looseObject("An Icypeas search item result.", {
  _id: s.string("The Icypeas search item ID."),
  status: statusSchema,
  name: s.string("The search item name returned by Icypeas."),
  file: s.string("The bulk file ID associated with the item, when present."),
  order: s.integer("The item order inside a bulk search, when present."),
  results: rawObjectSchema,
  userData: rawObjectSchema,
  system: rawObjectSchema,
});
const customTrackingSchema = s.object(
  "Optional custom tracking data attached to one Icypeas single search.",
  {
    webhookUrl: s.url("A webhook URL that Icypeas should call when this search finishes."),
    externalId: trimmedString("A custom ID that Icypeas stores with this search item."),
  },
  { optional: ["webhookUrl", "externalId"] },
);
const submitOutputSchema = s.object(
  "The normalized Icypeas single-search submission response.",
  {
    success: s.boolean("Whether Icypeas accepted the request."),
    searchId: s.nullableString("The created Icypeas search item ID."),
    status: s.nullable(statusSchema),
    item: s.nullable(searchItemSchema),
    validationErrors: s.array("Validation errors returned by Icypeas.", validationErrorSchema),
    raw: rawObjectSchema,
  },
  { optional: ["validationErrors"] },
);

const submitEmailSearchInputSchema = s.object(
  "Input for submitting one Icypeas email discovery search.",
  {
    firstname: trimmedString("The person's first name. Required when lastname is omitted."),
    lastname: trimmedString("The person's last name. Required when firstname is omitted."),
    domainOrCompany: trimmedString("The person's company domain or company name."),
    custom: customTrackingSchema,
  },
  { optional: ["firstname", "lastname", "custom"] },
);
submitEmailSearchInputSchema.anyOf = [{ required: ["firstname"] }, { required: ["lastname"] }];

const getSearchItemLifecycle = {
  startActionId: "icypeas.submit_email_search",
  statusActionId: "icypeas.get_search_item",
};

export const icypeasActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_subscription_information",
    description: "Fetch Icypeas subscription details and remaining credit balances by account email.",
    inputSchema: s.object("Input for fetching Icypeas subscription information.", {
      email: s.email("The email address of the Icypeas account owner."),
    }),
    outputSchema: s.object("The normalized Icypeas subscription information response.", {
      subscription: rawObjectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "submit_email_search",
    description: "Submit one Icypeas email discovery search for a person and company.",
    followUpActions: ["icypeas.get_search_item"],
    asyncLifecycle: getSearchItemLifecycle,
    inputSchema: submitEmailSearchInputSchema,
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_email_verification",
    description: "Submit one Icypeas email verification request and return the search item handle.",
    followUpActions: ["icypeas.get_search_item"],
    asyncLifecycle: {
      startActionId: "icypeas.submit_email_verification",
      statusActionId: "icypeas.get_search_item",
    },
    inputSchema: s.object(
      "Input for submitting one Icypeas email verification request.",
      {
        email: s.email("The email address to verify."),
        custom: customTrackingSchema,
      },
      { optional: ["custom"] },
    ),
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_domain_scan",
    description: "Submit one Icypeas domain scan for role-based email addresses.",
    followUpActions: ["icypeas.get_search_item"],
    asyncLifecycle: {
      startActionId: "icypeas.submit_domain_scan",
      statusActionId: "icypeas.get_search_item",
    },
    inputSchema: s.object(
      "Input for submitting one Icypeas domain scan.",
      {
        domainOrCompany: trimmedString("The domain or company name to scan."),
        custom: customTrackingSchema,
      },
      { optional: ["custom"] },
    ),
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_search_item",
    description: "Retrieve one Icypeas search item by ID and expose its processing status.",
    inputSchema: s.object("Input for retrieving one Icypeas search item.", {
      id: trimmedString("The Icypeas search item ID returned by a submit action."),
    }),
    outputSchema: s.object("The normalized Icypeas search item response.", {
      success: s.boolean("Whether Icypeas accepted the result lookup."),
      item: s.nullable(searchItemSchema),
      items: s.array("Search items returned by Icypeas.", searchItemSchema),
      status: s.nullable(statusSchema),
      total: s.nullableInteger("The total number of matching search items."),
      sorts: s.array("Pagination cursor tuples returned by Icypeas.", s.unknown("One sort tuple.")),
      validationErrors: s.array("Validation errors returned by Icypeas.", validationErrorSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "reverse_email_lookup",
    description: "Find a LinkedIn profile URL behind one professional email address with Icypeas.",
    inputSchema: s.object("Input for an Icypeas reverse email lookup.", {
      email: s.email("The professional email address to look up."),
    }),
    outputSchema: s.object(
      "The normalized Icypeas reverse email lookup response.",
      {
        success: s.boolean("Whether Icypeas processed the reverse email lookup request."),
        searchId: s.nullableString("The Icypeas search item ID for this reverse lookup."),
        status: s.nullable(statusSchema),
        result: s.nullableString("The LinkedIn profile URL returned by Icypeas, or an empty string when not found."),
        validationErrors: s.array("Validation errors returned by Icypeas.", validationErrorSchema),
        raw: rawObjectSchema,
      },
      { optional: ["validationErrors"] },
    ),
  }),
];
