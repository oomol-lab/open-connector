import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "postgrid_verify";

const trimmedString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const statusSchema = s.string("The status returned by PostGrid Verify.");
const messageSchema = s.string("The message returned by PostGrid Verify.");
const errorsSchema = s.record(
  "Field-level validation errors returned by PostGrid Verify.",
  s.array("The validation messages for one field.", s.string("A validation message returned by PostGrid Verify.")),
);

const verifiedAddressSchema = s.looseObject("The verified address details returned by PostGrid.", {
  line1: s.string("The first address line."),
  line2: s.string("The second address line when present."),
  city: s.string("The city of the verified address."),
  provinceOrState: s.string("The state or province of the verified address."),
  postalOrZip: s.string("The postal or ZIP code of the verified address."),
  country: s.string("The country code of the verified address."),
  status: s.string("The address verification status."),
  errors: errorsSchema,
});

const completionAddressSchema = s.looseObject("The completed address details returned by PostGrid.", {
  address: s.string("The completed street address line."),
  city: s.string("The city name."),
  prov: s.string("The province or state abbreviation."),
  pc: s.string("The postal or ZIP code."),
  country: s.string("The country code."),
});

const completionSchema = s.looseObject("One PostGrid autocomplete result.", {
  address: completionAddressSchema,
  errors: errorsSchema,
});

const parsedAddressSchema = s.looseObject("The parsed address components returned by PostGrid.", {
  houseNumber: s.string("The house or street number."),
  road: s.string("The street name."),
  unit: s.string("The apartment, suite, or secondary unit designator."),
  level: s.string("The floor number."),
  house: s.string("The building or location name."),
  poBox: s.string("The postal office box."),
  city: s.string("The city name."),
  cityDistrict: s.string("The borough or city district."),
  state: s.string("The state or province."),
  stateDistrict: s.string("The county or state district."),
  postcode: s.string("The postal or ZIP code."),
  country: s.string("The country name."),
  suburb: s.string("The neighborhood or suburb."),
  island: s.string("The island name."),
  category: s.string("The location category."),
  near: s.string("The nearby location reference from the input query."),
});

const cityStateSchema = s.looseObject("One city and state or province match.", {
  city: s.string("The city name corresponding to the postal or ZIP code."),
  provinceOrState: s.string("The state or province corresponding to the postal or ZIP code."),
});

const verifyAddressInputSchema = s.object(
  "The input payload for verifying and standardizing a US or Canadian address.",
  {
    address: trimmedString("The freeform address written on a single line."),
    line1: trimmedString("The first line of a structured address."),
    line2: trimmedString("The optional second line of a structured address."),
    city: trimmedString("The city name for a structured address."),
    provinceOrState: trimmedString("The state or province code for a structured address."),
    postalOrZip: trimmedString("The ZIP or postal code for a structured address."),
    country: trimmedString("The ISO 2-letter country code for a structured address."),
    includeDetails: s.boolean("Whether to include additional address details in the response."),
    geocode: s.boolean("Whether to include latitude and longitude data in the response."),
    properCase: s.boolean("Whether to return address fields in proper case."),
  },
  {
    optional: [
      "address",
      "line1",
      "line2",
      "city",
      "provinceOrState",
      "postalOrZip",
      "country",
      "includeDetails",
      "geocode",
      "properCase",
    ],
  },
);

const verifyAddressOutputSchema = s.object("The address verification response from PostGrid.", {
  status: statusSchema,
  message: messageSchema,
  data: verifiedAddressSchema,
});

const autocompleteAddressInputSchema = s.object(
  "The input payload for autocompleting a partially specified US or Canadian address.",
  {
    partialStreet: trimmedString("The partially written street address to autocomplete."),
    index: trimmedString("The optional completion result index to retrieve."),
    pcFilter: trimmedString("Only return addresses within this postal or ZIP code."),
    cityFilter: trimmedString("Only return addresses from this city."),
    stateFilter: trimmedString("Only return addresses within this state or province."),
    countryFilter: trimmedString("Only return addresses within this country."),
  },
  {
    optional: ["index", "pcFilter", "cityFilter", "stateFilter", "countryFilter"],
  },
);

const autocompleteAddressOutputSchema = s.object("The address autocomplete response from PostGrid.", {
  status: statusSchema,
  message: messageSchema,
  data: s.array("The address completion results.", completionSchema),
});

const parseAddressInputSchema = s.object("The input payload for parsing a single-line address.", {
  address: trimmedString("The address to parse on a single line."),
});

const parseAddressOutputSchema = s.object("The parsed address response from PostGrid.", {
  status: statusSchema,
  message: messageSchema,
  data: parsedAddressSchema,
});

const lookupCityStateInputSchema = s.object(
  "The input payload for looking up city and state or province values from a postal code.",
  {
    postalOrZip: trimmedString("The postal or ZIP code used for the lookup."),
  },
);

const lookupCityStateOutputSchema = s.object("The postal lookup response from PostGrid.", {
  status: statusSchema,
  message: messageSchema,
  data: s.array("The matching city and state or province records.", cityStateSchema),
});

export const postgridVerifyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_address",
    operationType: "read",
    description:
      "Verify and standardize a US or Canadian address with PostGrid Verify using either freeform or structured address input.",
    requiredScopes: [],
    inputSchema: verifyAddressInputSchema,
    outputSchema: verifyAddressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "autocomplete_address",
    operationType: "read",
    description: "Autocomplete a partially specified US or Canadian address with optional location filters.",
    requiredScopes: [],
    inputSchema: autocompleteAddressInputSchema,
    outputSchema: autocompleteAddressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "parse_address",
    operationType: "read",
    description: "Parse a single-line address into component fields with PostGrid Verify.",
    requiredScopes: [],
    inputSchema: parseAddressInputSchema,
    outputSchema: parseAddressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_city_state_from_postal",
    operationType: "read",
    description: "Look up city and state or province matches for a postal or ZIP code with PostGrid Verify.",
    requiredScopes: [],
    inputSchema: lookupCityStateInputSchema,
    outputSchema: lookupCityStateOutputSchema,
  }),
];
