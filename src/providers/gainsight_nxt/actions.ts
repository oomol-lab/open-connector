import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gainsight_nxt";

const trimmedNonEmptyString = (description: string) => s.nonEmptyString(description);

const gainsightRecordSchema = s.looseObject(
  "A Gainsight object record keyed by field names from your tenant's Data Management schema.",
);

const gainsightRecordsSchema = s.array("Gainsight records returned by the Company API.", gainsightRecordSchema);

const gainsightLookupsSchema = s.looseObject(
  "Optional Gainsight import lookup configuration used to populate GSID fields from the same or another object.",
);

const gainsightRawResponseSchema = s.looseObject(
  "The raw Gainsight API response wrapper, including result, errorCode, errorDesc, requestId, data, and message when returned.",
);

const gainsightErrorsSchema = s.unknown("Raw Gainsight validation or processing errors returned for failed records.");

const mutationDataSchema = s.requiredObject("Normalized Gainsight Company mutation data.", {
  count: s.nullable(s.integer("Number of records Gainsight reported for the mutation.")),
  records: gainsightRecordsSchema,
  errors: gainsightErrorsSchema,
});

const mutationOutputSchema = s.requiredObject("Normalized response for a Gainsight Company mutation request.", {
  result: s.boolean("Whether Gainsight reported a successful request."),
  requestId: s.nullable(s.string("Gainsight request identifier for troubleshooting.")),
  data: mutationDataSchema,
  rawResponse: gainsightRawResponseSchema,
});

const insertCompaniesInputSchema = s.object(
  "Request body for inserting one or more Gainsight Company records.",
  {
    records: s.array(
      "Company records to insert. Each record must use field names from your Gainsight Company schema.",
      gainsightRecordSchema,
      { minItems: 1, maxItems: 50 },
    ),
    lookups: gainsightLookupsSchema,
  },
  { optional: ["lookups"] },
);

const updateCompaniesInputSchema = s.object(
  "Request body for updating one or more Gainsight Company records.",
  {
    keys: s.array(
      "Company field names used to identify records. Gainsight supports up to three String, GSID, Number, or Email keys and combines them with AND.",
      trimmedNonEmptyString("A Company field name used as an update key."),
      { minItems: 1, maxItems: 3 },
    ),
    records: s.array(
      "Company records to update. Each record must contain the key fields and the values to update.",
      gainsightRecordSchema,
      { minItems: 1, maxItems: 50 },
    ),
    lookups: gainsightLookupsSchema,
  },
  { optional: ["lookups"] },
);

const whereConditionProperties = {
  name: trimmedNonEmptyString("Company field name used by this condition."),
  alias: trimmedNonEmptyString("Condition alias used in the where expression."),
  operator: trimmedNonEmptyString("Gainsight query operator such as EQ, IN, BTW, GT, or LT."),
  value: s.unknown("Condition value or values accepted by the Gainsight operator."),
};

const whereConditionSchema = s.object(
  "A Gainsight query condition. Include the documented fields such as name, alias, operator, and value.",
  whereConditionProperties,
  { required: Object.keys(whereConditionProperties), additionalProperties: true },
);

const queryCompaniesInputSchema = s.object(
  "Request body for querying Gainsight Company records.",
  {
    select: s.array(
      "Company fields to return, including relationship paths such as csm__gr.email when supported by your tenant schema.",
      trimmedNonEmptyString("A Company field name or relationship field path to return."),
      { minItems: 1 },
    ),
    where: s.object(
      "Optional Gainsight where clause.",
      {
        conditions: s.array("Conditions used by the Gainsight where expression.", whereConditionSchema, {
          minItems: 1,
        }),
        expression: trimmedNonEmptyString("Boolean expression over condition aliases, such as A OR B."),
      },
      { optional: ["conditions", "expression"] },
    ),
    orderBy: s.record(
      "Optional sort map whose keys are Company fields and whose values are asc or desc.",
      s.stringEnum("Sort direction for a Company field.", ["asc", "desc"]),
    ),
    limit: s.integer("Maximum number of records to return. Gainsight documents a maximum of 5000.", {
      minimum: 1,
      maximum: 5000,
    }),
    offset: s.nonNegativeInteger("Zero-based result offset for fetching additional records."),
  },
  { optional: ["where", "orderBy", "limit", "offset"] },
);

const queryCompaniesOutputSchema = s.requiredObject("Normalized response for a Gainsight Company query request.", {
  result: s.boolean("Whether Gainsight reported a successful request."),
  requestId: s.nullable(s.string("Gainsight request identifier for troubleshooting.")),
  records: gainsightRecordsSchema,
  rawResponse: gainsightRawResponseSchema,
});

const deleteCompanyInputSchema = s.requiredObject("Request parameters for deleting a Gainsight Company.", {
  gsid: trimmedNonEmptyString("The Gainsight GSID of the Company record to delete."),
});

const deleteCompanyOutputSchema = s.requiredObject("Normalized response for a Gainsight Company delete request.", {
  result: s.boolean("Whether Gainsight reported a successful request."),
  requestId: s.nullable(s.string("Gainsight request identifier for troubleshooting.")),
  data: s.nullable(s.string("Gainsight deletion status message.")),
  rawResponse: gainsightRawResponseSchema,
});

export const gainsightNxtActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "insert_companies",
    operationType: "write",
    description:
      "Insert up to 50 records into the Gainsight NXT Company object using field names from your tenant's Data Management schema.",
    inputSchema: insertCompaniesInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_companies",
    operationType: "write",
    description: "Update up to 50 Gainsight NXT Company records identified by one to three Company key fields.",
    inputSchema: updateCompaniesInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "query_companies",
    operationType: "read",
    description:
      "Query Gainsight NXT Company records with selected fields, optional where conditions, sorting, limit, and offset.",
    inputSchema: queryCompaniesInputSchema,
    outputSchema: queryCompaniesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_company",
    operationType: "destructive",
    description: "Delete one Gainsight NXT Company record by its GSID.",
    inputSchema: deleteCompanyInputSchema,
    outputSchema: deleteCompanyOutputSchema,
  }),
];
