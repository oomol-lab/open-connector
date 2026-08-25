import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shippo";

const trimmedString = (description: string, options: { maxLength?: number } = {}) =>
  s.string({ description, minLength: 1, maxLength: options.maxLength });

const paginationInputSchema = s.object(
  "Pagination options for Shippo list endpoints.",
  {
    page: s.positiveInteger("The page number to retrieve."),
    results: s.positiveInteger("The number of results to return per page."),
  },
  { optional: ["page", "results"] },
);

const paginatedMetaSchema = {
  count: s.integer("The total number of matching Shippo objects."),
  next: s.nullable(s.string("The URL for the next page, when available.")),
  previous: s.nullable(s.string("The URL for the previous page, when available.")),
  raw: s.looseObject("The raw paginated Shippo response."),
};

const rawObjectSchema = s.looseObject("The raw Shippo object returned by the API.");
const addressSchema = s.looseObject("A Shippo address object.", {
  object_id: s.string("The Shippo address object ID."),
  is_complete: s.boolean("Whether Shippo considers the address complete."),
  validation_results: s.looseObject("Shippo validation details for the address."),
});
const parcelSchema = s.looseObject("A Shippo parcel object.", {
  object_id: s.string("The Shippo parcel object ID."),
  object_state: s.string("The validation state of the parcel object."),
});
const trackSchema = s.looseObject("A Shippo tracking status object.", {
  carrier: s.string("The package carrier."),
  tracking_number: s.string("The tracking number."),
  tracking_status: s.looseObject("The latest Shippo tracking status."),
  tracking_history: s.array("The full Shippo tracking event history.", rawObjectSchema),
  messages: s.array("Carrier or Shippo messages for the tracking object.", s.string("A message.")),
});

const addressIdInputSchema = s.object("Input for retrieving a Shippo address.", {
  addressId: trimmedString("The Shippo address object ID."),
});
const addressCreateInputSchema = s.object(
  "Input for creating a Shippo address.",
  {
    name: trimmedString("The first and last name of the addressee."),
    company: trimmedString("The company name for the address."),
    street1: trimmedString("The first street line."),
    street2: trimmedString("The second street line."),
    street3: trimmedString("The third street line."),
    streetNo: trimmedString("The street number for carriers that require it."),
    city: trimmedString("The city name."),
    state: trimmedString("The state or province code."),
    zip: trimmedString("The postal code."),
    country: trimmedString("The ISO country code."),
    phone: trimmedString("The phone number for the address."),
    email: s.email("The email address for the address."),
    isResidential: s.boolean("Whether the address is residential."),
    metadata: trimmedString("Metadata to attach to the address.", { maxLength: 100 }),
    validate: s.boolean("Whether Shippo should validate the address during creation."),
  },
  {
    optional: [
      "name",
      "company",
      "street1",
      "street2",
      "street3",
      "streetNo",
      "city",
      "state",
      "zip",
      "phone",
      "email",
      "isResidential",
      "metadata",
      "validate",
    ],
  },
);

const parcelIdInputSchema = s.object("Input for retrieving a Shippo parcel.", {
  parcelId: trimmedString("The Shippo parcel object ID."),
});
const parcelCreateInputSchema = s.object(
  "Input for creating a Shippo parcel.",
  {
    length: trimmedString("The parcel length."),
    width: trimmedString("The parcel width."),
    height: trimmedString("The parcel height."),
    distanceUnit: s.stringEnum("The distance unit for parcel dimensions.", ["cm", "in", "ft", "mm", "m", "yd"]),
    weight: trimmedString("The parcel weight."),
    massUnit: s.stringEnum("The mass unit for parcel weight.", ["g", "kg", "lb", "oz"]),
    template: trimmedString("A Shippo parcel template token."),
    metadata: trimmedString("Metadata to attach to the parcel.", { maxLength: 100 }),
    extra: s.looseObject("Optional Shippo parcel extra services."),
  },
  { optional: ["length", "width", "height", "distanceUnit", "template", "metadata", "extra"] },
);
const trackingInputSchema = s.object("Input for retrieving Shippo tracking status.", {
  carrier: trimmedString("The Shippo carrier token, such as usps or fedex."),
  trackingNumber: trimmedString("The package tracking number."),
});

const addressOutputSchema = s.object("Shippo address action output.", { address: addressSchema });
const parcelOutputSchema = s.object("Shippo parcel action output.", { parcel: parcelSchema });
const trackOutputSchema = s.object("Shippo tracking action output.", { track: trackSchema });

export const shippoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_addresses",
    description: "List address objects created in the connected Shippo account.",
    inputSchema: paginationInputSchema,
    outputSchema: s.object("Paginated Shippo address output.", {
      results: s.array("Shippo address objects on this page.", addressSchema),
      ...paginatedMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_address",
    description: "Create a Shippo address object and optionally validate it.",
    inputSchema: addressCreateInputSchema,
    outputSchema: addressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_address",
    description: "Retrieve a Shippo address by object ID.",
    inputSchema: addressIdInputSchema,
    outputSchema: addressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "validate_address",
    description: "Validate an existing Shippo address by object ID.",
    inputSchema: addressIdInputSchema,
    outputSchema: addressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_parcels",
    description: "List parcel objects created in the connected Shippo account.",
    inputSchema: paginationInputSchema,
    outputSchema: s.object("Paginated Shippo parcel output.", {
      results: s.array("Shippo parcel objects on this page.", parcelSchema),
      ...paginatedMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_parcel",
    description: "Create a Shippo parcel object from dimensions or a template.",
    inputSchema: parcelCreateInputSchema,
    outputSchema: parcelOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_parcel",
    description: "Retrieve a Shippo parcel by object ID.",
    inputSchema: parcelIdInputSchema,
    outputSchema: parcelOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tracking_status",
    description: "Retrieve Shippo tracking status using a carrier and tracking number.",
    inputSchema: trackingInputSchema,
    outputSchema: trackOutputSchema,
  }),
];
