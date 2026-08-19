import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "census_bureau";

const datasetPathSchema = s.string("The Census dataset path after /data, for example 2022/acs/acs5.", {
  minLength: 1,
});
const variableNameSchema = s.nonEmptyString("A Census variable name such as NAME or B01001_001E.");
const scalarPredicateValueSchema = s.anyOf("A scalar Census query predicate value.", [
  s.string("A string predicate value."),
  s.number("A numeric predicate value."),
  s.boolean("A boolean predicate value."),
]);
const predicateValueSchema = s.anyOf("A Census query predicate value.", [
  scalarPredicateValueSchema,
  s.array(
    "Multiple values for the same Census query predicate, sent as repeated query parameters.",
    scalarPredicateValueSchema,
    {
      minItems: 1,
    },
  ),
]);
const rawObjectSchema = s.looseObject("The raw object returned by the Census Data API.");

const datasetSchema = s.object("A Census API dataset summary.", {
  title: s.string("The dataset title."),
  description: s.nullable(s.string("The dataset description when provided.")),
  vintage: s.nullable(s.integer("The dataset vintage year when published in metadata.")),
  datasetPath: s.nullable(s.string("The normalized Census API dataset path when derivable.")),
  identifier: s.array(
    "The dataset identifier components returned by Census metadata.",
    s.string("One dataset identifier component."),
  ),
  distributionUrl: s.nullable(s.string("The first dataset access URL when provided.")),
  raw: rawObjectSchema,
});

const variableSchema = s.object("A Census variable metadata entry.", {
  name: s.string("The Census variable name."),
  label: s.nullable(s.string("The variable label returned by Census metadata.")),
  concept: s.nullable(s.string("The variable concept returned by Census metadata.")),
  predicateType: s.nullable(s.string("The variable predicate type when provided.")),
  group: s.nullable(s.string("The variable group name when provided.")),
  limit: s.nullable(s.integer("The variable limit value when provided.")),
  predicateOnly: s.nullable(s.boolean("Whether the variable is predicate-only when indicated.")),
  required: s.nullable(s.boolean("Whether Census marks the variable as required.")),
  attributes: s.nullable(s.string("The attributes string returned for the variable.")),
  values: s.nullable(s.looseObject("The enumerated values object for the variable.")),
  raw: rawObjectSchema,
});

const groupSchema = s.object("A Census variable group summary.", {
  name: s.string("The group name."),
  description: s.nullable(s.string("The group description when provided.")),
  variablesUrl: s.nullable(s.string("The official variables URL for the group when provided.")),
  raw: rawObjectSchema,
});

const queryRowsSchema = s.array(
  "The raw Census response rows, including the header row as the first entry.",
  s.array("A raw Census response row.", s.nullable(s.string("One Census response cell."))),
);

export const censusBureauActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_datasets",
    description: "List Census Data API datasets with optional client-side search, vintage, and pagination filters.",
    inputSchema: s.object(
      "The input payload for listing Census Data API datasets.",
      {
        search: s.string("Case-insensitive text used to filter dataset title or description.", { minLength: 1 }),
        vintage: s.integer("The dataset vintage year used to filter Census metadata."),
        limit: s.integer("Maximum number of matched datasets to return.", { minimum: 1, maximum: 500 }),
        offset: s.integer("Zero-based offset into the matched dataset list.", { minimum: 0 }),
      },
      { optional: ["search", "vintage", "limit", "offset"] },
    ),
    outputSchema: s.object("The response returned when listing Census datasets.", {
      datasets: s.array("The matched Census datasets.", datasetSchema),
      count: s.integer("The number of datasets returned in this page."),
      totalMatched: s.integer("The total number of datasets matched before pagination."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_variables",
    description: "List variables for a Census Data API dataset.",
    inputSchema: s.object("The input payload for listing Census dataset variables.", {
      datasetPath: datasetPathSchema,
    }),
    outputSchema: s.object("The response returned when listing Census dataset variables.", {
      variables: s.array("The variables returned for the dataset.", variableSchema),
      count: s.integer("The number of variables returned."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List variable groups for a Census Data API dataset.",
    inputSchema: s.object("The input payload for listing Census dataset groups.", {
      datasetPath: datasetPathSchema,
    }),
    outputSchema: s.object("The response returned when listing Census dataset groups.", {
      groups: s.array("The groups returned for the dataset.", groupSchema),
      count: s.integer("The number of groups returned."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Census Data API variable group and its variables.",
    inputSchema: s.object("The input payload for getting a Census dataset group.", {
      datasetPath: datasetPathSchema,
      group: s.nonEmptyString("The Census variable group name, for example B01001."),
    }),
    outputSchema: s.object("The response returned when getting a Census dataset group.", {
      group: s.object("The requested Census variable group.", {
        name: s.string("The group name."),
        description: s.nullable(s.string("The group description when provided.")),
        variables: s.array("The variables in the group.", variableSchema),
        raw: rawObjectSchema,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "query_dataset",
    description: "Query a Census Data API dataset with variables, geography predicates, and optional filters.",
    inputSchema: s.object(
      "The input payload for querying a Census dataset.",
      {
        datasetPath: datasetPathSchema,
        variables: s.array("The Census variables to request through the get parameter.", variableNameSchema, {
          minItems: 1,
          maxItems: 50,
        }),
        for: s.nonEmptyString("The official Census for predicate, for example state:*."),
        in: s.anyOf("The optional official Census in predicate value or values.", [
          s.nonEmptyString("A single Census in predicate."),
          s.array(
            "Multiple Census in predicate fragments joined with plus signs.",
            s.nonEmptyString("One Census in predicate fragment."),
            {
              minItems: 1,
            },
          ),
        ]),
        predicates: s.record("Additional Census query predicates besides get, for, in, and key.", predicateValueSchema),
      },
      { optional: ["in", "predicates"] },
    ),
    outputSchema: s.object("The normalized response returned when querying a Census dataset.", {
      columns: s.array("The Census response column names.", s.string("One response column name.")),
      rows: s.array(
        "The Census response rows normalized as objects keyed by column name.",
        s.record(
          "A Census response row keyed by response column name.",
          s.nullable(s.string("One Census response cell value.")),
        ),
      ),
      rawRows: queryRowsSchema,
      rowCount: s.integer("The number of data rows returned, excluding the header row."),
    }),
  }),
];
