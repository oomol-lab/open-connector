import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "google_address_validation";

const granularityEnum = s.stringEnum("Google Address Validation granularity enum value.", [
  "GRANULARITY_UNSPECIFIED",
  "SUB_PREMISE",
  "PREMISE",
  "PREMISE_PROXIMITY",
  "BLOCK",
  "ROUTE",
  "OTHER",
]);
const confirmationLevelEnum = s.stringEnum("Google Address Validation confirmation level enum value.", [
  "CONFIRMATION_LEVEL_UNSPECIFIED",
  "CONFIRMED",
  "UNCONFIRMED_BUT_PLAUSIBLE",
  "UNCONFIRMED_AND_SUSPICIOUS",
]);
const possibleNextActionEnum = s.stringEnum("Google Address Validation possible next action enum value.", [
  "POSSIBLE_NEXT_ACTION_UNSPECIFIED",
  "FIX",
  "CONFIRM_ADD_SUBPREMISES",
  "CONFIRM",
  "ACCEPT",
]);
const addressLineField = s.nonEmptyString("One unstructured address line in envelope order.");

const postalAddressInputSchema = s.object(
  "Structured postal address input accepted by Google Address Validation.",
  {
    regionCode: s.nonEmptyString("CLDR region code of the country or region, such as US."),
    addressLines: s.array("Unstructured address lines describing the lower levels of the address.", addressLineField, {
      minItems: 1,
    }),
    administrativeArea: s.nonEmptyString("Highest administrative subdivision, such as a state or province."),
    locality: s.nonEmptyString("City or town portion of the address."),
    postalCode: s.nonEmptyString("Postal or ZIP code."),
    sublocality: s.nonEmptyString("Neighborhood, borough, or district."),
    sortingCode: s.nonEmptyString("Country-specific sorting code when applicable."),
    languageCode: s.nonEmptyString("Optional BCP-47 language code of the address contents."),
    organization: s.nonEmptyString("Optional organization name included in the input address."),
    recipients: s.stringArray("Optional recipient lines included in the input address.", {
      minItems: 1,
      itemDescription: "One recipient line value.",
    }),
    revision: s.literal(0, { description: "PostalAddress schema revision. Only 0 is valid." }),
  },
  {
    optional: [
      "administrativeArea",
      "locality",
      "postalCode",
      "sublocality",
      "sortingCode",
      "languageCode",
      "organization",
      "recipients",
      "revision",
    ],
  },
);
const languageOptionsInputSchema = s.object(
  "Optional Google Address Validation language options.",
  {
    returnEnglishLatinAddress: s.boolean("Whether to request the preview englishLatinAddress output field."),
  },
  { optional: ["returnEnglishLatinAddress"] },
);
const validateAddressInputSchema = s.object(
  "The input payload for validating a postal address.",
  {
    address: postalAddressInputSchema,
    previousResponseId: s.nonEmptyString("The first responseId from the validation sequence for follow-up requests."),
    sessionToken: s.string({
      minLength: 1,
      maxLength: 36,
      description: "Optional Places Autocomplete session token for billing and workflow linking.",
    }),
    enableUspsCass: s.boolean("Whether to enable USPS CASS mode for US and PR addresses."),
    languageOptions: languageOptionsInputSchema,
  },
  { optional: ["previousResponseId", "sessionToken", "enableUspsCass", "languageOptions"] },
);

const componentNameSchema = s.looseObject(
  {
    text: s.string("The display text for the address component."),
    languageCode: s.string("BCP-47 language code for the component text when Google returns one."),
  },
  { description: "The name payload for one validated address component." },
);
const addressComponentSchema = s.looseObject(
  {
    componentName: componentNameSchema,
    componentType: s.string("The address component type returned by Google."),
    confirmationLevel: confirmationLevelEnum,
    inferred: s.boolean("Whether Google inferred the component instead of receiving it in the input."),
    replaced: s.boolean("Whether Google replaced the input component with a different value."),
    spellCorrected: s.boolean("Whether Google spell-corrected the component."),
    unexpected: s.boolean("Whether the component is unexpected in a postal address for the region."),
  },
  { description: "One validated address component with confirmation signals." },
);
const postalAddressOutputSchema = s.looseObject(
  {
    regionCode: s.string("CLDR region code of the country or region."),
    addressLines: s.array("Unstructured address lines in envelope order.", addressLineField),
    administrativeArea: s.string("Highest administrative subdivision, such as a state or province."),
    locality: s.string("City or town portion of the address."),
    postalCode: s.string("Postal or ZIP code."),
    sublocality: s.string("Neighborhood, borough, or district."),
    sortingCode: s.string("Country-specific sorting code when applicable."),
    languageCode: s.string("BCP-47 language code of the address contents."),
    revision: s.integer("PostalAddress schema revision."),
  },
  { description: "Google postal address payload." },
);
const validatedAddressSchema = s.looseObject(
  {
    formattedAddress: s.string("The post-processed address formatted as a single-line address."),
    postalAddress: postalAddressOutputSchema,
    addressComponents: s.array("Validated address components returned by Google.", addressComponentSchema),
    missingComponentTypes: s.stringArray("Address component types that were expected but missing.", {
      itemDescription: "One missing component type.",
    }),
    unresolvedTokens: s.stringArray("Input tokens that Google could not resolve.", {
      itemDescription: "One unresolved input token.",
    }),
    unconfirmedComponentTypes: s.stringArray("Component types that Google could not fully confirm.", {
      itemDescription: "One unconfirmed component type.",
    }),
  },
  { description: "Google validated address payload." },
);
const verdictSchema = s.looseObject(
  {
    inputGranularity: granularityEnum,
    validationGranularity: granularityEnum,
    geocodeGranularity: granularityEnum,
    addressComplete: s.boolean("Whether the post-processed address is considered complete."),
    hasInferredComponents: s.boolean("Whether Google inferred one or more address components."),
    hasReplacedComponents: s.boolean("Whether Google replaced one or more address components."),
    hasSpellCorrectedComponents: s.boolean("Whether Google spell-corrected one or more address components."),
    hasUnconfirmedComponents: s.boolean("Whether Google could not fully confirm one or more components."),
    possibleNextAction: possibleNextActionEnum,
  },
  { description: "High-level validation verdict returned by Google." },
);
const addressMetadataSchema = s.looseObject(
  {
    business: s.boolean("Whether the address is known to be a business."),
    residential: s.boolean("Whether the address is known to be a residence."),
    poBox: s.boolean("Whether the address is a PO box."),
  },
  { description: "Deliverability metadata returned by Google." },
);
const latLngSchema = s.object("A latitude and longitude pair.", {
  latitude: s.number("Latitude in degrees."),
  longitude: s.number("Longitude in degrees."),
});
const viewportSchema = s.object("Bounding viewport around the geocoded place.", {
  low: latLngSchema,
  high: latLngSchema,
});
const plusCodeSchema = s.looseObject(
  {
    globalCode: s.string("Global plus code for the place."),
    compoundCode: s.string("Compound plus code for the place."),
  },
  { description: "Plus code information returned by Google." },
);
const geocodeSchema = s.looseObject(
  {
    location: latLngSchema,
    bounds: viewportSchema,
    placeId: s.string("Place ID of the geocoded place."),
    featureSizeMeters: s.number("Approximate size of the feature in meters."),
    placeTypes: s.stringArray("Place types associated with the geocoded place.", {
      itemDescription: "One Google place type.",
    }),
    plusCode: plusCodeSchema,
  },
  { description: "Geocoding information returned by Google." },
);
const uspsAddressSchema = s.looseObject(
  {
    city: s.string("USPS city name."),
    state: s.string("USPS state abbreviation."),
    firstAddressLine: s.string("USPS first address line."),
    secondAddressLine: s.string("USPS second address line."),
    urbanization: s.string("USPS urbanization for Puerto Rico when present."),
    zipCode: s.string("USPS ZIP code."),
    zipCodeExtension: s.string("USPS ZIP+4 extension."),
  },
  { description: "USPS standardized address payload." },
);
const uspsDataSchema = s.looseObject(
  {
    cassProcessed: s.boolean("Whether Google processed the request with USPS CASS."),
    standardizedAddress: uspsAddressSchema,
    deliveryPointCode: s.string("USPS delivery point code."),
    deliveryPointCheckDigit: s.string("USPS delivery point check digit."),
    carrierRoute: s.string("USPS carrier route code."),
    dpvConfirmation: s.string("Delivery Point Validation confirmation result."),
    dpvFootnote: s.string("Delivery Point Validation footnotes."),
    dpvCmra: s.string("Whether the address is a CMRA according to USPS."),
    dpvVacant: s.string("Whether USPS reports the address as vacant."),
    errorMessage: s.string("USPS processing error message when Google exposes one."),
  },
  { description: "USPS-specific deliverability data returned by Google." },
);
const validationResultSchema = s.looseObject(
  {
    verdict: verdictSchema,
    address: validatedAddressSchema,
    englishLatinAddress: validatedAddressSchema,
    metadata: addressMetadataSchema,
    geocode: geocodeSchema,
    uspsData: uspsDataSchema,
  },
  { description: "Result payload returned by Google Address Validation." },
);
const validateAddressOutputSchema = s.object("Response payload returned by validate_address.", {
  responseId: s.string("Response ID that identifies the validation sequence for future follow-up requests."),
  result: validationResultSchema,
});
const provideValidationFeedbackInputSchema = s.object("The input payload for sending address validation feedback.", {
  responseId: s.nonEmptyString("The first responseId from the validation sequence."),
  conclusion: s.stringEnum("Outcome of the completed address validation sequence.", [
    "VALIDATED_VERSION_USED",
    "USER_VERSION_USED",
    "UNVALIDATED_VERSION_USED",
    "UNUSED",
  ]),
});

export const googleAddressValidationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_address",
    description:
      "Validate and standardize a postal address with Google Address Validation and return verdict, parsed address, and geocode details.",
    requiredScopes: [],
    inputSchema: validateAddressInputSchema,
    outputSchema: validateAddressOutputSchema,
    followUpActions: ["google_address_validation.provide_validation_feedback"],
  }),
  defineProviderAction(service, {
    name: "provide_validation_feedback",
    description:
      "Send the final outcome of a completed Google address validation sequence using the first responseId from that sequence.",
    requiredScopes: [],
    inputSchema: provideValidationFeedbackInputSchema,
    outputSchema: s.object("Empty response returned after Google accepts the feedback.", {}),
  }),
];
