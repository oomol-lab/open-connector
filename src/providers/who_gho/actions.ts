import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "who_gho";

const paginationInput = {
  top: s.integer("The maximum number of records to return. Defaults to 100.", {
    minimum: 1,
    maximum: 1000,
  }),
  skip: s.integer("The number of records to skip before collecting results.", { minimum: 0 }),
};

const paginationOptional = ["top", "skip"];
const rawObject = s.looseObject("The raw record returned by the WHO GHO OData API.");

const pagedOutput = (description: string, itemDescription: string) =>
  s.object(description, {
    items: s.array(itemDescription, rawObject),
    count: s.integer("The number of records returned in this page."),
  });

export const whoGhoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_dimensions",
    operationType: "read",
    description: "List dimensions available in the WHO Global Health Observatory OData API.",
    requiredScopes: [],
    inputSchema: s.object("Pagination options for listing GHO dimensions.", paginationInput, {
      optional: paginationOptional,
    }),
    outputSchema: pagedOutput("A page of WHO GHO dimensions.", "The dimension records in this page."),
  }),
  defineProviderAction(service, {
    name: "list_dimension_values",
    operationType: "read",
    description: "List the available values for one WHO GHO dimension.",
    requiredScopes: [],
    inputSchema: s.object(
      "A WHO GHO dimension code and pagination options.",
      {
        dimensionCode: s.nonEmptyString("The dimension code, such as COUNTRY or AGEGROUP."),
        ...paginationInput,
      },
      { optional: paginationOptional },
    ),
    outputSchema: pagedOutput(
      "A page of values for one WHO GHO dimension.",
      "The dimension value records in this page.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_indicators",
    operationType: "read",
    description: "Search WHO GHO indicators by partial or exact indicator name.",
    requiredScopes: [],
    inputSchema: s.object(
      "Search and pagination options for WHO GHO indicators.",
      {
        query: s.nonEmptyString("Text contained in the indicator name."),
        exactMatch: s.boolean("Whether the query must equal the complete indicator name."),
        ...paginationInput,
      },
      { optional: ["query", "exactMatch", ...paginationOptional] },
    ),
    outputSchema: pagedOutput("A page of WHO GHO indicators.", "The indicator records in this page."),
  }),
  defineProviderAction(service, {
    name: "get_indicator_data",
    operationType: "read",
    description: "Retrieve WHO GHO observations for an indicator with structured dimension and year filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "An indicator code, optional filters, and pagination options.",
      {
        indicatorCode: s.nonEmptyString("The indicator code, such as WHOSIS_000001."),
        filters: s.array(
          "Dimension field filters joined with the OData and operator.",
          s.object("One exact or null dimension filter.", {
            field: s.stringEnum("The observation field to filter.", [
              "SpatialDimType",
              "SpatialDim",
              "ParentLocationCode",
              "TimeDimType",
              "Dim1Type",
              "Dim1",
              "Dim2Type",
              "Dim2",
              "Dim3Type",
              "Dim3",
              "DataSourceDimType",
              "DataSourceDim",
            ]),
            operator: s.stringEnum("The comparison operator.", ["eq", "ne"]),
            value: s.nullable(s.string("The exact dimension code, or null for a null check.")),
          }),
          { minItems: 1 },
        ),
        startYear: s.integer("The first observation year to include.", { minimum: 1 }),
        endYear: s.integer("The last observation year to include.", { minimum: 1 }),
        ...paginationInput,
      },
      { optional: ["filters", "startYear", "endYear", ...paginationOptional] },
    ),
    outputSchema: pagedOutput(
      "A page of WHO GHO indicator observations.",
      "The indicator observation records in this page.",
    ),
  }),
];
