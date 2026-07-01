import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "addressfinder";

const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });

const maxOneHundredSchema = s.integer("The maximum number of results to return.", {
  minimum: 1,
  maximum: 100,
});
const oneFlagSchema = s.literal("1", {
  description: "Set this flag to 1 when the option should be enabled.",
});
const zeroOneFlagSchema = s.stringEnum("Set this filter to 0 or 1.", ["0", "1"]);
const optionalDomainSchema = nonEmptyString(
  "Optional registered Addressfinder domain used for portal activity monitoring.",
);

const auStateCodeSchema = s.stringEnum("One Australian state or territory code.", [
  "ACT",
  "NSW",
  "NT",
  "QLD",
  "SA",
  "TAS",
  "VIC",
  "WA",
  "OT",
]);
const auStateCodesSchema = s.array("Australian state or territory codes used to filter results.", auStateCodeSchema, {
  minItems: 1,
});
const auSourceSchema = s.stringEnum("The Australian address dataset source to query.", ["GNAF,PAF", "GNAF", "PAF"]);
const auCensusSchema = s.integer("The Australian census year for statistical identifiers.", {
  minimum: 2016,
  maximum: 2021,
});
const nzCensusSchema = s.integer("The New Zealand census year for Statistics NZ metadata.", {
  minimum: 2018,
  maximum: 2023,
});
const nzRegionCodeSchema = s.stringEnum("The New Zealand regional authority code used to filter results.", [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
]);

const responseMetaSchema = s.object(
  "Connector metadata for the Addressfinder API request.",
  {
    endpoint: s.string("The Addressfinder API endpoint path used for the request."),
    country: s.stringEnum("The country-specific Addressfinder API family.", ["au", "nz"]),
  },
  { required: ["endpoint", "country"] },
);

const rawObjectSchema = s.looseObject({}, { description: "The raw Addressfinder object returned by the API." });

const auCompletionSchema = s.looseRequiredObject(
  "One Australian address autocomplete completion returned by Addressfinder.",
  {
    full_address: s.string("The full Australian address string."),
    id: s.string("The unique Addressfinder address identifier."),
    canonical_address_id: s.string("The canonical address identifier for this result."),
    highlighted_full_address: s.string("The highlighted full address when the highlight option is enabled."),
  },
  { optional: ["canonical_address_id", "highlighted_full_address"] },
);

const nzCompletionSchema = s.looseRequiredObject(
  "One New Zealand address autocomplete completion returned by Addressfinder.",
  {
    a: s.string("The canonical New Zealand address string."),
    pxid: s.string("The unique Addressfinder address identifier."),
    v: s.integer("Whether the result is postal or physical according to Addressfinder."),
    highlighted_a: s.string("The highlighted address when the highlight option is enabled."),
  },
  { optional: ["highlighted_a"] },
);

const auAddressAutocompleteInputSchema = s.object(
  "Input for Australian address autocomplete.",
  {
    query: nonEmptyString("The partial Australian address being searched."),
    max: maxOneHundredSchema,
    source: auSourceSchema,
    postBox: zeroOneFlagSchema,
    canonical: oneFlagSchema,
    stateCodes: auStateCodesSchema,
    domain: optionalDomainSchema,
    highlight: oneFlagSchema,
    ascii: oneFlagSchema,
  },
  {
    required: ["query"],
  },
);

const nzAddressAutocompleteInputSchema = s.object(
  "Input for New Zealand address autocomplete.",
  {
    query: nonEmptyString("The partial New Zealand address being searched."),
    max: maxOneHundredSchema,
    delivered: zeroOneFlagSchema,
    postBox: zeroOneFlagSchema,
    rural: zeroOneFlagSchema,
    strict: s.stringEnum("How closely Addressfinder should match the query.", ["0", "1", "2"]),
    regionCode: nzRegionCodeSchema,
    domain: optionalDomainSchema,
    highlight: oneFlagSchema,
    ascii: oneFlagSchema,
  },
  {
    required: ["query"],
  },
);

const auAddressMetadataInputSchema = {
  ...s.object("Input for retrieving Australian address metadata.", {
    id: nonEmptyString("The Addressfinder address identifier returned by autocomplete."),
    gnafId: nonEmptyString("The unique G-NAF address identifier."),
    dpid: nonEmptyString("The Australia Post delivery point identifier."),
    source: auSourceSchema,
    gps: oneFlagSchema,
    census: auCensusSchema,
    domain: optionalDomainSchema,
    ascii: oneFlagSchema,
  }),
  anyOf: [{ required: ["id"] }, { required: ["gnafId"] }, { required: ["dpid"] }],
} satisfies JsonSchema;

const nzAddressMetadataInputSchema = {
  ...s.object("Input for retrieving New Zealand address metadata.", {
    pxid: nonEmptyString("The Addressfinder PXID returned by autocomplete."),
    dpid: nonEmptyString("The NZ Post delivery point identifier."),
    census: nzCensusSchema,
    domain: optionalDomainSchema,
    ascii: oneFlagSchema,
  }),
  anyOf: [{ required: ["pxid"] }, { required: ["dpid"] }],
} satisfies JsonSchema;

const auAddressVerificationInputSchema = s.object(
  "Input for verifying an Australian address.",
  {
    query: nonEmptyString("The Australian address to verify."),
    gnaf: oneFlagSchema,
    paf: oneFlagSchema,
    postBox: s.literal("0", {
      description: "Exclude box type addresses from the verification results.",
    }),
    gps: oneFlagSchema,
    extended: oneFlagSchema,
    census: auCensusSchema,
    stateCodes: auStateCodesSchema,
    domain: optionalDomainSchema,
    ascii: oneFlagSchema,
  },
  {
    required: ["query"],
  },
);

const nzAddressVerificationInputSchema = s.object(
  "Input for verifying a New Zealand address.",
  {
    query: nonEmptyString("The New Zealand address to verify."),
    postBox: zeroOneFlagSchema,
    regionCode: nzRegionCodeSchema,
    census: nzCensusSchema,
    domain: optionalDomainSchema,
    ascii: oneFlagSchema,
  },
  {
    required: ["query"],
  },
);

function autocompleteOutputSchema(countryDescription: string, completionSchema: JsonSchema): JsonSchema {
  return s.object(
    `The Addressfinder ${countryDescription} autocomplete response.`,
    {
      success: s.boolean("Whether Addressfinder reported the request as successful."),
      completions: s.array("The autocomplete completions returned by Addressfinder.", completionSchema),
      meta: responseMetaSchema,
      raw: rawObjectSchema,
    },
    { required: ["success", "completions", "meta", "raw"] },
  );
}

function metadataOutputSchema(countryDescription: string): JsonSchema {
  return s.object(
    `The Addressfinder ${countryDescription} metadata response.`,
    {
      success: s.boolean("Whether Addressfinder reported the request as successful."),
      address: rawObjectSchema,
      meta: responseMetaSchema,
    },
    { required: ["success", "address", "meta"] },
  );
}

function verificationOutputSchema(countryDescription: string): JsonSchema {
  return s.object(
    `The Addressfinder ${countryDescription} verification response.`,
    {
      success: s.boolean("Whether Addressfinder reported the request as successful."),
      matched: s.nullable(s.boolean("Whether Addressfinder matched the submitted address.")),
      address: s.nullable(rawObjectSchema),
      meta: responseMetaSchema,
      raw: rawObjectSchema,
    },
    { required: ["success", "matched", "address", "meta", "raw"] },
  );
}

export const addressfinderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "find_au_addresses",
    description: "Search Australian addresses with Addressfinder autocomplete and return matching address completions.",
    followUpActions: ["addressfinder.get_au_address_metadata"],
    inputSchema: auAddressAutocompleteInputSchema,
    outputSchema: autocompleteOutputSchema("Australian address", auCompletionSchema),
  }),
  defineProviderAction(service, {
    name: "get_au_address_metadata",
    description: "Retrieve full metadata for an Australian address selected from Addressfinder autocomplete.",
    inputSchema: auAddressMetadataInputSchema,
    outputSchema: metadataOutputSchema("Australian address"),
  }),
  defineProviderAction(service, {
    name: "verify_au_address",
    description: "Verify and enrich an Australian address with Addressfinder address verification.",
    inputSchema: auAddressVerificationInputSchema,
    outputSchema: verificationOutputSchema("Australian address"),
  }),
  defineProviderAction(service, {
    name: "find_nz_addresses",
    description:
      "Search New Zealand addresses with Addressfinder autocomplete and return matching address completions.",
    followUpActions: ["addressfinder.get_nz_address_metadata"],
    inputSchema: nzAddressAutocompleteInputSchema,
    outputSchema: autocompleteOutputSchema("New Zealand address", nzCompletionSchema),
  }),
  defineProviderAction(service, {
    name: "get_nz_address_metadata",
    description: "Retrieve full metadata for a New Zealand address selected from Addressfinder autocomplete.",
    inputSchema: nzAddressMetadataInputSchema,
    outputSchema: metadataOutputSchema("New Zealand address"),
  }),
  defineProviderAction(service, {
    name: "verify_nz_address",
    description: "Verify and enrich a New Zealand address with Addressfinder address verification.",
    inputSchema: nzAddressVerificationInputSchema,
    outputSchema: verificationOutputSchema("New Zealand address"),
  }),
];

export type AddressfinderActionName = (typeof addressfinderActions)[number]["name"];
