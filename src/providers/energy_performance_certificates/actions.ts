import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "energy_performance_certificates";

const certificateNumberSchema = s.nonEmptyString(
  "The Energy Performance Certificate or Display Energy Certificate number.",
);
const certificateRowSchema = s.looseObject("An Energy Performance Certificate row returned by the API.");
const paginationSchema = s.looseObject("Pagination metadata returned by the API.");
const uprnDescription = "Unique Property Reference Number to search for.";
const searchInputSchema = s.object(
  "Input for searching Energy Performance Certificate rows.",
  {
    address: s.nonEmptyString("Address text to search for."),
    postcode: s.nonEmptyString("Postcode to search for."),
    uprn: s.anyOf(uprnDescription, [s.positiveInteger(uprnDescription), s.nonEmptyString(uprnDescription)]),
    councils: s.stringArray("Council names or codes to filter by.", {
      minItems: 1,
      itemDescription: "A council name or code.",
    }),
    constituencies: s.stringArray("Parliamentary constituency names or codes to filter by.", {
      minItems: 1,
      itemDescription: "A parliamentary constituency name or code.",
    }),
    energyRatings: s.array(
      "Energy efficiency ratings to filter by.",
      s.stringEnum("An energy efficiency rating.", ["A", "B", "C", "D", "E", "F", "G"]),
      { minItems: 1 },
    ),
    dateStart: s.date("Start date of the certificate registration date range."),
    dateEnd: s.date("End date of the certificate registration date range."),
    pageSize: s.integer("Maximum number of certificate rows to return per page.", {
      minimum: 1,
      maximum: 5000,
    }),
    currentPage: s.positiveInteger("Page number to fetch when retrieving paginated results."),
  },
  {
    optional: [
      "address",
      "postcode",
      "uprn",
      "councils",
      "constituencies",
      "energyRatings",
      "dateStart",
      "dateEnd",
      "pageSize",
      "currentPage",
    ],
  },
);
const searchOutputSchema = s.object("Rows returned by an EPC search endpoint.", {
  rows: s.array("Certificate rows returned by the API.", certificateRowSchema),
  pagination: s.nullable(paginationSchema),
  raw: s.looseObject("The raw Energy Performance Certificates API response."),
});
const certificateOutputSchema = s.object("A single EPC certificate result.", {
  certificate: certificateRowSchema,
  raw: s.looseObject("The raw Energy Performance Certificates API response."),
});
const certificateInputSchema = s.object("Input for retrieving one EPC certificate.", {
  certificateNumber: certificateNumberSchema,
});

export const energyPerformanceCertificatesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_domestic_certificates",
    description: "Search domestic Energy Performance Certificates with supported query filters.",
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_certificate",
    description:
      "Get full details for one Energy Performance Certificate or Display Energy Certificate by certificate number.",
    inputSchema: certificateInputSchema,
    outputSchema: certificateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_non_domestic_certificates",
    description: "Search non-domestic Energy Performance Certificates with supported query filters.",
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_display_certificates",
    description: "Search display Energy Performance Certificates for public buildings with supported query filters.",
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
];
