import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "easypost";

const rawObjectSchema = s.looseObject("A JSON object returned by EasyPost.");
const easypostIdSchema = s.nonEmptyString("The EasyPost resource ID.");
const pageSizeSchema = s.integer("The number of records to return on each page.", {
  minimum: 1,
  maximum: 100,
});
const addressInputSchema = s.object(
  "The EasyPost address fields to create.",
  {
    street1: s.nonEmptyString("The first line of the address."),
    street2: s.nonEmptyString("The second line of the address."),
    city: s.nonEmptyString("The full city name."),
    state: s.nonEmptyString("The state or province."),
    zip: s.nonEmptyString("The ZIP or postal code."),
    country: s.nonEmptyString("The ISO 3166 country code."),
    name: s.nonEmptyString("The person name for the address."),
    company: s.nonEmptyString("The organization name for the address."),
    phone: s.nonEmptyString("The phone number for the person or organization."),
    email: s.email("The email address for the person or organization."),
    residential: s.boolean("Whether the address should be treated as residential."),
    carrier_facility: s.nonEmptyString("The carrier facility designation when relevant."),
    federal_tax_id: s.nonEmptyString("The federal tax identifier for the person or organization."),
    state_tax_id: s.nonEmptyString("The state tax identifier for the person or organization."),
    verify: s.boolean("Set true to request EasyPost delivery and ZIP verification."),
    verify_strict: s.boolean("Set true to request strict EasyPost delivery and ZIP verification."),
    verify_carrier: s.stringEnum("The carrier-specific address verification service to use.", ["ups", "fedex"]),
  },
  {
    optional: [
      "street2",
      "name",
      "company",
      "phone",
      "email",
      "residential",
      "carrier_facility",
      "federal_tax_id",
      "state_tax_id",
      "verify",
      "verify_strict",
      "verify_carrier",
    ],
  },
);
const trackerCreateInputSchema = s.object(
  "The EasyPost standalone tracker fields to create.",
  {
    tracking_code: s.nonEmptyString("The tracking code associated with the package."),
    carrier: s.nonEmptyString("The carrier associated with the tracking code."),
  },
  { optional: ["carrier"] },
);
const trackerListInputSchema = s.object(
  "The filters and pagination parameters for listing EasyPost trackers.",
  {
    before_id: easypostIdSchema,
    after_id: easypostIdSchema,
    page_size: pageSizeSchema,
    start_datetime: s.dateTime("Only return trackers created after this timestamp."),
    end_datetime: s.dateTime("Only return trackers created before this timestamp."),
    tracking_codes: s.array(
      "Only return trackers with these tracking codes.",
      s.nonEmptyString("One carrier tracking code."),
      { minItems: 1 },
    ),
    carrier: s.nonEmptyString("Only return trackers with this carrier."),
  },
  {
    optional: ["before_id", "after_id", "page_size", "start_datetime", "end_datetime", "tracking_codes", "carrier"],
  },
);

export type EasypostActionName =
  | "create_address"
  | "get_address"
  | "create_tracker"
  | "get_tracker"
  | "list_trackers"
  | "list_carrier_types";

export const easypostActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_address",
    description: "Create an immutable EasyPost address for shipping workflows.",
    inputSchema: addressInputSchema,
    outputSchema: s.object("The response returned after creating an EasyPost address.", {
      address: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_address",
    description: "Retrieve an EasyPost address by ID.",
    inputSchema: s.object("The input for retrieving an EasyPost address.", {
      address_id: easypostIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving an EasyPost address.", {
      address: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_tracker",
    description: "Create an EasyPost standalone tracker from a carrier tracking code.",
    inputSchema: trackerCreateInputSchema,
    outputSchema: s.object("The response returned after creating an EasyPost tracker.", {
      tracker: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_tracker",
    description: "Retrieve an EasyPost tracker by ID.",
    inputSchema: s.object("The input for retrieving an EasyPost tracker.", {
      tracker_id: easypostIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving an EasyPost tracker.", {
      tracker: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_trackers",
    description: "List EasyPost trackers with pagination and optional carrier filters.",
    inputSchema: trackerListInputSchema,
    outputSchema: s.object("The response returned when listing EasyPost trackers.", {
      trackers: s.array("The EasyPost trackers returned for the page.", rawObjectSchema),
      hasMore: s.boolean("Whether another page of trackers is available."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_carrier_types",
    description: "List carrier types available to the EasyPost account.",
    inputSchema: s.object("The input for listing EasyPost carrier types.", {}),
    outputSchema: s.object("The response returned when listing EasyPost carrier types.", {
      carrierTypes: s.array("The EasyPost carrier types available to the account.", rawObjectSchema),
    }),
  }),
];
