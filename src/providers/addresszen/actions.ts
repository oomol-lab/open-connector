import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "addresszen";

const availableContextSchema = s.object(
  "One AddressZen context available to the connected API key.",
  {
    iso_3: s.string("The 3-letter ISO country code."),
    iso_2: s.string("The 2-letter ISO country code."),
    description: s.string("The human-readable context description."),
    emoji: s.string("The emoji associated with the context."),
    rgeo: s.boolean("Whether reverse geolocation is available in this context."),
  },
  { required: ["iso_3", "iso_2", "description", "emoji", "rgeo"] },
);

const keyAvailabilityOutputSchema = s.object(
  "The current key availability result returned by AddressZen.",
  {
    code: s.integer("The AddressZen response code."),
    message: s.string("The AddressZen response message."),
    result: s.object(
      "The AddressZen key availability payload.",
      {
        available: s.boolean("Whether the connected key is currently usable."),
        context: s.string("The current context returned by AddressZen, or an empty string."),
        contexts: s.array("The list of contexts available to the key.", availableContextSchema),
      },
      { required: ["available", "context", "contexts"] },
    ),
  },
  { required: ["code", "message", "result"] },
);

const findAddressInputSchema = s.object(
  "The input payload for retrieving address autocomplete suggestions from AddressZen.",
  {
    query: s.string("The partial address string to autocomplete.", {
      minLength: 1,
      maxLength: 150,
    }),
    context: s.string("The optional AddressZen context used to narrow the search.", {
      minLength: 1,
    }),
    country: s.string("The optional country name used to filter results.", {
      minLength: 1,
    }),
    limit: s.integer("The maximum number of suggestions to return.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  { required: ["query"] },
);

const suggestionHitSchema = s.looseRequiredObject(
  "One AddressZen autocomplete suggestion.",
  {
    id: s.string("The opaque suggestion identifier returned by AddressZen."),
    suggestion: s.string("The suggestion string that should be shown to the user."),
    urls: s.nullable(
      s.record(s.string("A related URL value."), {
        description: "Any related URLs that AddressZen returns for the suggestion.",
      }),
    ),
    udprn: s.integer("The optional UK delivery point reference number."),
  },
  { optional: ["udprn"] },
);

const findAddressOutputSchema = s.object(
  "The autocomplete suggestions returned by AddressZen.",
  {
    code: s.integer("The AddressZen response code."),
    message: s.string("The AddressZen response message."),
    result: s.object(
      "The AddressZen autocomplete payload.",
      {
        hits: s.array("The ordered list of suggestions returned by AddressZen.", suggestionHitSchema),
      },
      { required: ["hits"] },
    ),
  },
  { required: ["code", "message", "result"] },
);

const retrieveAddressUsaInputSchema = s.object(
  "The input payload for retrieving a USA-formatted address from AddressZen.",
  {
    address: s.string("The suggestion identifier returned by the AddressZen autocomplete API.", {
      minLength: 1,
    }),
  },
  { required: ["address"] },
);

const addressNativeSchema = s.looseObject({}, { description: "The native nested address payload, when present." });

const addressOptionalNumericStringSchema = s.anyOf(
  "The AddressZen value, which may be numeric or an empty string when unavailable.",
  [
    s.number("The numeric value returned by AddressZen when available."),
    s.string("An empty string returned by AddressZen when this value is unavailable."),
  ],
);

const retrieveAddressUsaResultSchema = s.looseRequiredObject(
  "The USA-formatted address object returned by AddressZen.",
  {
    id: s.string("The unique address identifier."),
    dataset: s.string("The AddressZen dataset that produced the address."),
    country: s.string("The full country name."),
    country_iso: s.string("The 3-letter ISO country code."),
    country_iso_2: s.string("The 2-letter ISO country code."),
    language: s.string("The language code for the address."),
    primary_number: s.string("The primary building or house number."),
    secondary_number: s.string("The secondary unit or apartment number."),
    plus_4_code: s.string("The USPS plus-4 component."),
    line_1: s.string("The first line of the address."),
    line_2: s.string("The second line of the address."),
    last_line: s.string("The combined city, state, and postal code line."),
    zip_code: s.string("The 5-digit ZIP code."),
    zip_plus_4_code: s.string("The full ZIP+4 code."),
    update_key_number: s.string("The update key number returned by AddressZen."),
    record_type_code: s.string("The USPS record type code."),
    carrier_route_id: s.string("The USPS carrier route identifier."),
    street_pre_directional_abbreviation: s.string("The street pre-directional abbreviation."),
    street_name: s.string("The street name."),
    street_suffix_abbreviation: s.string("The street suffix abbreviation."),
    street_post_directional_abbreviation: s.string("The street post-directional abbreviation."),
    building_or_firm_name: s.string("The building or firm name."),
    address_secondary_abbreviation: s.string("The secondary address abbreviation."),
    base_alternate_code: s.string("The base alternate code."),
    lacs_status_indicator: s.string("The LACS status indicator."),
    government_building_indicator: s.string("The government building indicator."),
    state_abbreviation: s.string("The state abbreviation."),
    state: s.string("The full state name."),
    municipality_city_state_key: s.string("The municipality city state key."),
    urbanization_city_state_key: s.string("The urbanization city state key."),
    preferred_last_line_city_state_key: s.string("The preferred last line city state key."),
    county: s.string("The county name."),
    city: s.string("The city name."),
    city_abbreviation: s.string("The city abbreviation."),
    preferred_city: s.string("The preferred city name."),
    city_state_name_facility_code: s.string("The city state name facility code."),
    zip_classification_code: s.string("The ZIP classification code."),
    city_state_mailing_name_indicator: s.string("The city state mailing name indicator."),
    carrier_route_rate_sortation: s.string("The carrier route rate sortation code."),
    finance_number: addressOptionalNumericStringSchema,
    congressional_district_number: addressOptionalNumericStringSchema,
    county_number: addressOptionalNumericStringSchema,
    native: addressNativeSchema,
  },
  { optional: ["native"] },
);

const retrieveAddressUsaOutputSchema = s.object(
  "The USA address retrieval result returned by AddressZen.",
  {
    code: s.integer("The AddressZen response code."),
    message: s.string("The AddressZen response message."),
    result: retrieveAddressUsaResultSchema,
  },
  { required: ["code", "message", "result"] },
);

export const addresszenActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_key_availability",
    description: "Retrieve the current AddressZen key availability and context list.",
    inputSchema: s.object(
      {},
      { description: "The input payload for retrieving the current AddressZen key availability." },
    ),
    outputSchema: keyAvailabilityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_address",
    description: "Autocomplete addresses from a partial query and return the official AddressZen suggestions.",
    inputSchema: findAddressInputSchema,
    outputSchema: findAddressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_address_usa",
    description:
      "Retrieve a USA-formatted address from an AddressZen suggestion identifier and return the official response wrapper.",
    inputSchema: retrieveAddressUsaInputSchema,
    outputSchema: retrieveAddressUsaOutputSchema,
  }),
];

export type AddresszenActionName = (typeof addresszenActions)[number]["name"];
