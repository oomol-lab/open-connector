import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "uspto";

const serialNumberSchema = s.string(
  "The eight-digit USPTO trademark application serial number without spaces or punctuation.",
  {
    minLength: 8,
    maxLength: 8,
    pattern: "^[0-9]{8}$",
  },
);

const xmlOutputSchema = (description: string) =>
  s.nullable(
    s.object(description, {
      xml: s.string("The raw XML document returned by the USPTO TSDR API.", { minLength: 1 }),
    }),
  );

export const usptoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_trademark_case_status",
    operationType: "read",
    description: "Get the official TSDR case status record for a trademark application serial number as XML.",
    requiredScopes: [],
    inputSchema: s.object("A USPTO trademark application selector.", {
      serialNumber: serialNumberSchema,
    }),
    outputSchema: xmlOutputSchema("The official TSDR trademark case status record."),
  }),
  defineProviderAction(service, {
    name: "get_trademark_documents_metadata",
    operationType: "read",
    description: "Get TSDR metadata for documents associated with a trademark application serial number.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for retrieving USPTO trademark document metadata.",
      {
        serialNumber: serialNumberSchema,
        fromDate: s.date("The earliest document date to include, in YYYY-MM-DD format."),
        toDate: s.date("The latest document date to include, in YYYY-MM-DD format."),
        sort: s.stringEnum("The chronological order for returned document metadata.", ["asc", "desc"]),
      },
      { optional: ["fromDate", "toDate", "sort"] },
    ),
    outputSchema: xmlOutputSchema("The TSDR metadata for matching trademark case documents."),
  }),
  defineProviderAction(service, {
    name: "get_trademark_case_last_update",
    operationType: "read",
    description: "Get the latest recorded TSDR update dates for a trademark application serial number.",
    requiredScopes: [],
    inputSchema: s.object("A USPTO trademark application selector.", {
      serialNumber: serialNumberSchema,
    }),
    outputSchema: s.nullable(
      s.object(
        "The normalized latest update information for the trademark application.",
        {
          serialNumber: s.string("The USPTO trademark application serial number."),
          lastModifiedDate: s.string("The latest modification date reported for the case."),
          statusLastModifiedDate: s.string("The latest modification date reported for case status data."),
          prosecutionLastModifiedDate: s.string("The latest modification date reported for prosecution history data."),
          documentsLastModifiedDate: s.string("The latest modification date reported for case document data."),
          raw: s.looseObject("The original case update item returned by the USPTO TSDR API.", {}),
        },
        {
          optional: [
            "lastModifiedDate",
            "statusLastModifiedDate",
            "prosecutionLastModifiedDate",
            "documentsLastModifiedDate",
          ],
        },
      ),
    ),
  }),
];
