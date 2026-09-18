import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "full_contact";

const nullableLooseObject = (description: string) => s.nullable(s.looseObject(description));

const locationSchema = s.object(
  "A FullContact location identifier for a person query.",
  {
    addressLine1: s.nonEmptyString("The first line of the street address."),
    addressLine2: s.nonEmptyString("The second line of the street address."),
    city: s.nonEmptyString("The city for the address."),
    region: s.nonEmptyString("The state, province, or region name."),
    regionCode: s.nonEmptyString("The state, province, or region code."),
    postalCode: s.nonEmptyString("The postal code for the address."),
  },
  {
    optional: ["addressLine1", "addressLine2", "city", "region", "regionCode", "postalCode"],
  },
);

const personNameSchema = s.object(
  "A FullContact person name identifier.",
  {
    full: s.nonEmptyString("The full person name."),
    given: s.nonEmptyString("The given or first name."),
    family: s.nonEmptyString("The family or last name."),
  },
  {
    optional: ["full", "given", "family"],
  },
);

const profileSchema = s.object(
  "A FullContact social profile identifier.",
  {
    service: s.nonEmptyString("The profile service name, such as twitter or linkedin."),
    username: s.nonEmptyString("The username on the profile service."),
    userid: s.nonEmptyString("The user ID on the profile service."),
    url: s.url("The profile URL."),
  },
  {
    optional: ["service", "username", "userid", "url"],
  },
);

const multiFieldProperties = {
  email: s.email("A single email address to match."),
  emails: s.array("Email addresses to match.", s.email("One email address."), {
    minItems: 1,
  }),
  phone: s.nonEmptyString("A single phone number to match."),
  phones: s.array("Phone numbers to match.", s.nonEmptyString("One phone number."), {
    minItems: 1,
  }),
  location: locationSchema,
  name: personNameSchema,
  profiles: s.array("Social profiles to match.", profileSchema, {
    minItems: 1,
  }),
  maids: s.array("Mobile advertising IDs to match.", s.nonEmptyString("One mobile advertising ID."), {
    minItems: 1,
  }),
  placekey: s.nonEmptyString("A Placekey identifier to match."),
  recordId: s.nonEmptyString("A customer record ID already known to FullContact."),
  personId: s.nonEmptyString("A FullContact person ID to match."),
  partnerId: s.nonEmptyString("A partner identifier to match."),
  liNonId: s.nonEmptyString("A LiveIntent non-ID to match."),
  panoramaId: s.nonEmptyString("A Panorama ID to match."),
};

const multiFieldInputSchema = s.object("FullContact multi-field person identifiers.", multiFieldProperties);

const queuedLookupSchema = {
  queued: s.boolean("Whether FullContact queued the lookup instead of returning profile data immediately."),
  requestId: s.nullableString("The FullContact request ID when the lookup is queued."),
  message: s.nullableString("The FullContact queue or status message when provided."),
};

const rawObjectSchema = s.looseObject("The raw FullContact response payload.");

const personEnrichOutputSchema = s.requiredObject("The normalized FullContact person enrichment response.", {
  ...queuedLookupSchema,
  fullName: s.nullableString("The enriched full name."),
  ageRange: s.nullableString("The enriched age range."),
  gender: s.nullableString("The enriched gender."),
  location: s.nullableString("The enriched location string."),
  title: s.nullableString("The enriched job title."),
  organization: s.nullableString("The enriched organization name."),
  twitter: s.nullableString("The enriched Twitter profile URL."),
  linkedin: s.nullableString("The enriched LinkedIn profile URL."),
  facebook: s.nullableString("The enriched Facebook profile URL."),
  bio: s.nullableString("The enriched biography string."),
  avatar: s.nullableString("The enriched avatar URL."),
  website: s.nullableString("The enriched website URL."),
  details: nullableLooseObject("The detailed FullContact person profile object."),
  raw: rawObjectSchema,
});

const companyEnrichOutputSchema = s.requiredObject("The normalized FullContact company enrichment response.", {
  ...queuedLookupSchema,
  name: s.nullableString("The enriched company name."),
  location: s.nullableString("The enriched company location string."),
  twitter: s.nullableString("The enriched Twitter profile URL."),
  linkedin: s.nullableString("The enriched LinkedIn profile URL."),
  facebook: s.nullableString("The enriched Facebook profile URL."),
  bio: s.nullableString("The enriched company biography string."),
  logo: s.nullableString("The enriched company logo URL."),
  website: s.nullableString("The enriched company website URL."),
  founded: s.nullable(s.integer("The company founding year when returned.")),
  employees: s.nullable(s.integer("The company employee count when returned.")),
  locale: s.nullableString("The company locale returned by FullContact."),
  category: s.nullableString("The company category returned by FullContact."),
  details: nullableLooseObject("The detailed FullContact company profile object."),
  raw: rawObjectSchema,
});

const verifyMatchOutputSchema = s.requiredObject("The normalized FullContact verify.match response.", {
  city: s.nullableBoolean("Whether the city matched."),
  region: s.nullableBoolean("Whether the region matched."),
  country: s.nullableBoolean("Whether the country matched."),
  continent: s.nullableBoolean("Whether the continent matched."),
  postalCode: s.nullableBoolean("Whether the postal code matched."),
  familyName: s.nullableBoolean("Whether the family name matched."),
  givenName: s.nullableBoolean("Whether the given name matched."),
  phone: s.nullableBoolean("Whether the phone matched."),
  email: s.nullableBoolean("Whether the email matched."),
  social: s.nullableBoolean("Whether a social profile matched."),
  maid: s.nullableBoolean("Whether a mobile advertising ID matched."),
  nonId: s.nullableBoolean("Whether a non-ID matched."),
  raw: rawObjectSchema,
});

const verifySignalsOutputSchema = s.requiredObject("The normalized FullContact verify.signals response.", {
  emails: s.nullable(
    s.array("Email signal records returned by FullContact.", s.looseObject("One FullContact email signal record.")),
  ),
  personIds: s.nullable(s.array("FullContact person IDs returned by the signal lookup.", s.string("One person ID."))),
  name: nullableLooseObject("The FullContact name signal object."),
  socialProfiles: nullableLooseObject("The FullContact social profile signal object."),
  demographics: nullableLooseObject("The FullContact demographic signal object."),
  employment: nullableLooseObject("The FullContact employment signal object."),
  locations: s.nullable(
    s.array("Location signal records returned by FullContact.", s.looseObject("One location signal record.")),
  ),
  raw: rawObjectSchema,
});

const verifyActivityOutputSchema = s.requiredObject("The normalized FullContact verify.activity response.", {
  emails: s.nullableNumber("The email activity score returned by FullContact."),
  raw: rawObjectSchema,
});

export const fullContactActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "enrich_person",
    operationType: "read",
    description: "Enrich a person profile with FullContact by sending one or more known identifiers.",
    inputSchema: s.object("Input parameters for FullContact person enrichment.", {
      ...multiFieldProperties,
      confidence: s.nonEmptyString("Optional FullContact confidence threshold."),
      dataFilter: s.array("Optional FullContact data filters.", s.nonEmptyString("One data filter."), {
        minItems: 1,
      }),
      infer: s.boolean("Whether FullContact should infer additional identifiers when supported."),
      maxMaids: s.positiveInteger("The maximum number of mobile advertising IDs to return."),
    }),
    outputSchema: personEnrichOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    operationType: "read",
    description: "Enrich a company profile with FullContact by domain.",
    inputSchema: s.requiredObject("Input parameters for FullContact company enrichment.", {
      domain: s.nonEmptyString("The company domain to enrich, such as fullcontact.com."),
    }),
    outputSchema: companyEnrichOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_match",
    operationType: "read",
    description: "Compare person identifiers with FullContact and return field-level match flags.",
    inputSchema: multiFieldInputSchema,
    outputSchema: verifyMatchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_signals",
    operationType: "read",
    description: "Resolve person identifiers with FullContact and return identity signal details.",
    inputSchema: multiFieldInputSchema,
    outputSchema: verifySignalsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_activity",
    operationType: "read",
    description: "Return FullContact activity scores for matched person identifiers.",
    inputSchema: multiFieldInputSchema,
    outputSchema: verifyActivityOutputSchema,
  }),
];
