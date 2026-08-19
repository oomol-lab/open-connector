import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "peopledatalabs";

const nullableNonEmptyString = (description: string) => s.nullable(s.nonEmptyString(description));
const matchMetadataSchema = s.looseObject(
  "Field match metadata returned by People Data Labs when include_if_matched is enabled.",
);
const personRecordSchema = s.looseObject(
  "Person record returned by People Data Labs using the official Person Schema field names.",
);
const companyRecordSchema = s.looseObject(
  "Company record returned by People Data Labs using the official Company Schema field names.",
);
const likelihoodSchema = s.integer("Likelihood score returned by People Data Labs.", {
  minimum: 0,
  maximum: 10,
});

const commonEnrichFields = {
  pretty: s.boolean("Whether to return human-readable JSON indentation."),
  include_if_matched: s.boolean("Whether to include top-level matched field metadata in the response."),
  min_likelihood: likelihoodSchema,
  required: nullableNonEmptyString(
    "Boolean expression describing fields that must exist for the response to count as a match.",
  ),
  titlecase: s.boolean("Whether text fields in successful responses should be title-cased."),
  data_include: nullableNonEmptyString("Comma-separated fields to include, or prefixed with - to exclude fields."),
};

const personEnrichInputSchema = s.object(
  "Input parameters for enriching a single person with People Data Labs. Provide pdl_id, profile, email, phone, email_hash, lid, or a name plus locality, region, company, school, location, or postal_code.",
  {
    pdl_id: nullableNonEmptyString("People Data Labs person identifier to enrich."),
    name: nullableNonEmptyString("Person full name, including at least the first and last name when provided."),
    first_name: nullableNonEmptyString("Person first name."),
    last_name: nullableNonEmptyString("Person last name."),
    middle_name: nullableNonEmptyString("Person middle name."),
    location: nullableNonEmptyString("Location where the person lives."),
    street_address: nullableNonEmptyString("Street address where the person lives."),
    locality: nullableNonEmptyString("Locality where the person lives."),
    region: nullableNonEmptyString("State or region where the person lives."),
    country: nullableNonEmptyString("Country where the person lives."),
    postal_code: nullableNonEmptyString("Postal code where the person lives."),
    company: nullableNonEmptyString("Company name, website, or social URL where the person has worked."),
    school: nullableNonEmptyString("School name, website, or social URL the person attended."),
    phone: nullableNonEmptyString("Phone number the person has used, including the country code prefix."),
    email: nullableNonEmptyString("Email address the person has used."),
    email_hash: nullableNonEmptyString("SHA-256 or MD5 hash of the person's email."),
    profile: nullableNonEmptyString("Social profile URL the person has used."),
    lid: nullableNonEmptyString("LinkedIn ID of the person."),
    birth_date: nullableNonEmptyString("Birth year or full birth date in YYYY-MM-DD format."),
    ...commonEnrichFields,
  },
  {
    optional: [
      "pdl_id",
      "name",
      "first_name",
      "last_name",
      "middle_name",
      "location",
      "street_address",
      "locality",
      "region",
      "country",
      "postal_code",
      "company",
      "school",
      "phone",
      "email",
      "email_hash",
      "profile",
      "lid",
      "birth_date",
      "pretty",
      "min_likelihood",
      "include_if_matched",
      "required",
      "titlecase",
      "data_include",
    ],
  },
);

const companyEnrichInputSchema = s.object(
  "Input parameters for enriching a single company with People Data Labs. pdl_id, name, profile, ticker, or website is required.",
  {
    pdl_id: nullableNonEmptyString("People Data Labs company identifier to enrich."),
    name: nullableNonEmptyString("Company name."),
    profile: nullableNonEmptyString("Company social profile URL."),
    ticker: nullableNonEmptyString("Company stock ticker."),
    website: nullableNonEmptyString("Company website or domain."),
    location: nullableNonEmptyString("Full or partial company location."),
    locality: nullableNonEmptyString("Company locality."),
    region: nullableNonEmptyString("Company state or region."),
    country: nullableNonEmptyString("Company country."),
    street_address: nullableNonEmptyString("Company street address."),
    postal_code: nullableNonEmptyString("Company postal code."),
    ...commonEnrichFields,
  },
  {
    optional: [
      "pdl_id",
      "name",
      "profile",
      "ticker",
      "website",
      "location",
      "locality",
      "region",
      "country",
      "street_address",
      "postal_code",
      "pretty",
      "titlecase",
      "include_if_matched",
      "min_likelihood",
      "required",
      "data_include",
    ],
  },
);

const searchInputFields = {
  query: nullableNonEmptyString("Elasticsearch v7.7 query string encoded as JSON text."),
  sql: nullableNonEmptyString("SQL query of the form SELECT * FROM the matching dataset WHERE ..."),
  size: s.integer("Maximum number of matched records to return.", {
    minimum: 1,
    maximum: 100,
  }),
  from: s.integer("Legacy offset for paginating between batches.", {
    minimum: 0,
    maximum: 9999,
  }),
  scroll_token: nullableNonEmptyString("Offset token returned by a previous People Data Labs search response."),
  titlecase: s.boolean("Whether returned records should be title-cased."),
  pretty: s.boolean("Whether to return human-readable JSON indentation."),
};

const personSearchInputSchema = s.object(
  "Input parameters for searching the People Data Labs person dataset. Exactly one of query or sql is required, and from cannot be used with scroll_token.",
  {
    ...searchInputFields,
    dataset: nullableNonEmptyString("Comma-separated dataset categories to search, such as resume or all."),
    data_include: nullableNonEmptyString("Comma-separated fields to include, or prefixed with - to exclude fields."),
  },
  {
    optional: ["query", "sql", "size", "from", "scroll_token", "dataset", "titlecase", "data_include", "pretty"],
  },
);

const companySearchInputSchema = s.object(
  "Input parameters for searching the People Data Labs company dataset. Exactly one of query or sql is required, and from cannot be used with scroll_token.",
  searchInputFields,
  { optional: ["query", "sql", "size", "from", "scroll_token", "titlecase", "pretty"] },
);

const personEnrichOutputSchema = s.object(
  "Normalized People Data Labs person enrichment response.",
  {
    status: s.integer("People Data Labs status code returned for the enrichment request."),
    likelihood: likelihoodSchema,
    data: personRecordSchema,
    matched: matchMetadataSchema,
  },
  { optional: ["likelihood", "matched"] },
);

const companyEnrichOutputSchema = s.object(
  "Normalized People Data Labs company enrichment response.",
  {
    status: s.integer("People Data Labs status code returned for the enrichment request."),
    likelihood: likelihoodSchema,
    data: companyRecordSchema,
    matched: matchMetadataSchema,
  },
  { optional: ["likelihood", "matched"] },
);

const personSearchOutputSchema = s.object(
  "Normalized People Data Labs person search response.",
  {
    status: s.integer("People Data Labs status code returned for the search request."),
    total: s.integer("Number of records matching the People Data Labs search."),
    data: s.array("Matched person records returned by People Data Labs.", personRecordSchema),
    scroll_token: s.nullableString("Scroll token for fetching the next page of matched people."),
  },
  { optional: ["scroll_token"] },
);

const companySearchOutputSchema = s.object(
  "Normalized People Data Labs company search response.",
  {
    status: s.integer("People Data Labs status code returned for the search request."),
    total: s.integer("Number of records matching the People Data Labs search."),
    data: s.array("Matched company records returned by People Data Labs.", companyRecordSchema),
    scroll_token: s.nullableString("Scroll token for fetching the next page of matched companies."),
  },
  { optional: ["scroll_token"] },
);

export const peopledatalabsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "enrich_person",
    description: "Match a single person in People Data Labs and return the top matched person record.",
    requiredScopes: [],
    inputSchema: personEnrichInputSchema,
    outputSchema: personEnrichOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Search the People Data Labs person dataset with either an Elasticsearch query or SQL query.",
    requiredScopes: [],
    inputSchema: personSearchInputSchema,
    outputSchema: personSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    description: "Match a single company in People Data Labs and return the top matched company record.",
    requiredScopes: [],
    inputSchema: companyEnrichInputSchema,
    outputSchema: companyEnrichOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search the People Data Labs company dataset with either an Elasticsearch query or SQL query.",
    requiredScopes: [],
    inputSchema: companySearchInputSchema,
    outputSchema: companySearchOutputSchema,
  }),
];
