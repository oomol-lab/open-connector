import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hotspotsystem";

const paginationInputFields: Record<string, JsonSchema> = {
  fields: s.nonEmptyString("A comma-separated list of HotspotSystem fields to include in the response."),
  sort: s.nonEmptyString("One HotspotSystem property name to sort by. Prefix with - for descending order."),
  limit: s.positiveInteger("The page size to request from HotspotSystem."),
  offset: s.nonNegativeInteger("The zero-based offset to request from HotspotSystem."),
};

const paginationSchema = s.object("Pagination metadata derived from the HotspotSystem Link header.", {
  self: s.nullableString("The current page URL from the Link header."),
  next: s.nullableString("The next page URL from the Link header when available."),
  prev: s.nullableString("The previous page URL from the Link header when available."),
  limit: s.nullableInteger("The requested page size parsed from the page links."),
  offset: s.nullableInteger("The zero-based offset parsed from the current page link."),
  nextOffset: s.nullableInteger("The zero-based offset for the next page when available."),
  prevOffset: s.nullableInteger("The zero-based offset for the previous page when available."),
});

const ownerSchema = s.object("The authenticated HotspotSystem operator account.", {
  userId: s.number("The numeric HotspotSystem operator identifier."),
  operator: s.nonEmptyString("The operator name returned by HotspotSystem."),
});

const locationSchema = s.object("One HotspotSystem location record.", {
  id: s.nonEmptyString("The location identifier."),
  name: s.nonEmptyString("The location name."),
});

const locationOptionSchema = s.object("One HotspotSystem location option record.", {
  id: s.nonEmptyString("The location identifier."),
  name: s.nonEmptyString("The location display label."),
});

const personRecordSchema = s.object("A normalized HotspotSystem customer or subscriber record.", {
  id: s.nullableString("The user identifier."),
  userName: s.nullableString("The username returned by HotspotSystem."),
  name: s.nullableString("The full name returned by HotspotSystem."),
  email: s.nullableString("The email address returned by HotspotSystem."),
  companyName: s.nullableString("The company name returned by HotspotSystem."),
  address: s.nullableString("The street address returned by HotspotSystem."),
  city: s.nullableString("The city returned by HotspotSystem."),
  state: s.nullableString("The state or county returned by HotspotSystem."),
  zip: s.nullableString("The postal code returned by HotspotSystem."),
  countryCode: s.nullableString("The two-letter country code returned by HotspotSystem."),
  phone: s.nullableString("The phone number returned by HotspotSystem."),
  socialNetwork: s.nullableString("The social network name returned by HotspotSystem."),
  socialId: s.nullableString("The social network identifier returned by HotspotSystem."),
  socialUsername: s.nullableString("The social network username returned by HotspotSystem."),
  socialLink: s.nullableString("The social profile link returned by HotspotSystem."),
  socialGender: s.nullableString("The social gender field returned by HotspotSystem."),
  socialAgeRange: s.nullableString("The social age range field returned by HotspotSystem."),
  socialFollowersCount: s.nullableString("The social followers count field returned by HotspotSystem."),
  registeredAt: s.nullableString("The user creation timestamp returned by HotspotSystem."),
});

const paginationOptionalKeys = ["fields", "sort", "limit", "offset"];

const listScopedPeopleInputSchema = s.object(
  "Input parameters for listing HotspotSystem customers or subscribers at one location.",
  {
    locationId: s.nonEmptyString("The HotspotSystem location identifier."),
    ...paginationInputFields,
  },
  { optional: paginationOptionalKeys },
);

const listGlobalPeopleInputSchema = s.object(
  "Input parameters for listing HotspotSystem customers or subscribers.",
  {
    ...paginationInputFields,
  },
  { optional: paginationOptionalKeys },
);

export const hotspotsystemActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_owner",
    description: "Verify the HotspotSystem API key and return the connected operator account.",
    inputSchema: s.actionInput({}, [], "The input payload for reading the current HotspotSystem operator."),
    outputSchema: s.actionOutput(
      {
        owner: ownerSchema,
      },
      "The normalized response returned for the current HotspotSystem operator.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List HotspotSystem locations owned by the authenticated operator.",
    inputSchema: s.object(
      "Input parameters for listing HotspotSystem locations.",
      {
        ...paginationInputFields,
      },
      { optional: paginationOptionalKeys },
    ),
    outputSchema: s.actionOutput(
      {
        locations: s.array("The HotspotSystem locations returned for the current page.", locationSchema),
        pagination: paginationSchema,
      },
      "The normalized response returned for HotspotSystem locations.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_location_options",
    description: "List HotspotSystem locations as lightweight id-name options.",
    inputSchema: s.actionInput({}, [], "The input payload for listing HotspotSystem location options."),
    outputSchema: s.actionOutput(
      {
        locationOptions: s.array("The HotspotSystem location options returned by the API.", locationOptionSchema),
      },
      "The normalized response returned for HotspotSystem location options.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List HotspotSystem customers across all accessible locations.",
    inputSchema: listGlobalPeopleInputSchema,
    outputSchema: s.actionOutput(
      {
        customers: s.array("The HotspotSystem customers returned for the current page.", personRecordSchema),
        pagination: paginationSchema,
      },
      "The normalized response returned for HotspotSystem customers.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_location_customers",
    description: "List HotspotSystem customers for one specific location.",
    inputSchema: listScopedPeopleInputSchema,
    outputSchema: s.actionOutput(
      {
        customers: s.array("The HotspotSystem customers returned for the current page.", personRecordSchema),
        pagination: paginationSchema,
      },
      "The normalized response returned for HotspotSystem customers at one location.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List HotspotSystem subscribers across all accessible locations.",
    inputSchema: listGlobalPeopleInputSchema,
    outputSchema: s.actionOutput(
      {
        subscribers: s.array("The HotspotSystem subscribers returned for the current page.", personRecordSchema),
        pagination: paginationSchema,
      },
      "The normalized response returned for HotspotSystem subscribers.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_location_subscribers",
    description: "List HotspotSystem subscribers for one specific location.",
    inputSchema: listScopedPeopleInputSchema,
    outputSchema: s.actionOutput(
      {
        subscribers: s.array("The HotspotSystem subscribers returned for the current page.", personRecordSchema),
        pagination: paginationSchema,
      },
      "The normalized response returned for HotspotSystem subscribers at one location.",
    ),
  }),
];
