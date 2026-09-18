import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openfda";

const drugDatasetSchema = s.stringEnum("The openFDA drug dataset to query.", [
  "event",
  "label",
  "ndc",
  "enforcement",
  "orangebook",
  "drugsfda",
  "shortages",
]);

const searchSchema = s.nonEmptyString(
  "An openFDA search expression, such as openfda.brand_name:Advil or receivedate:[20240101 TO 20241231].",
);
const sortSchema = s.nonEmptyString(
  "An openFDA sort expression containing a field and optional :asc or :desc modifier.",
);
const limitSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
  maximum: 99,
});
const skipSchema = s.integer(
  "The number of matching records to skip before returning results. The sum of skip and limit cannot exceed 26,000.",
  {
    minimum: 0,
    maximum: 25999,
  },
);

const rawObjectSchema = s.looseObject("A raw object returned by openFDA.");
const metaSchema = s.object("Metadata returned by openFDA.", {
  disclaimer: s.nullable(s.string("The openFDA data-use disclaimer.")),
  terms: s.nullable(s.string("The URL of the openFDA terms of service.")),
  license: s.nullable(s.string("The URL of the openFDA data license.")),
  lastUpdated: s.nullable(s.string("The dataset update date reported by openFDA.")),
  skip: s.nullable(s.integer("The result offset reported by openFDA.")),
  limit: s.nullable(s.integer("The result page size reported by openFDA.")),
  total: s.nullable(s.integer("The total number of records matching the query.")),
  raw: rawObjectSchema,
});

const searchDrugRecordsAction = defineProviderAction(service, {
  name: "search_drug_records",
  operationType: "read",
  description:
    "Search and page through records from a supported openFDA drug dataset. Results are informational and must not be used as medical advice.",
  inputSchema: s.object(
    "Input parameters for searching an openFDA drug dataset.",
    {
      dataset: drugDatasetSchema,
      search: searchSchema,
      sort: sortSchema,
      limit: limitSchema,
      skip: skipSchema,
    },
    { optional: ["search", "sort", "limit", "skip"] },
  ),
  outputSchema: s.object("The matching openFDA drug records and response metadata.", {
    meta: metaSchema,
    records: s.array("The raw records returned by the selected openFDA dataset.", rawObjectSchema),
  }),
});

const countDrugValuesAction = defineProviderAction(service, {
  name: "count_drug_values",
  operationType: "read",
  description:
    "Count the most frequent values of a field in a supported openFDA drug dataset, optionally filtered by a search expression.",
  inputSchema: s.object(
    "Input parameters for counting field values in an openFDA drug dataset.",
    {
      dataset: drugDatasetSchema,
      field: s.nonEmptyString(
        "The searchable openFDA field to count, such as patient.reaction.reactionmeddrapt.exact.",
      ),
      search: searchSchema,
      limit: limitSchema,
    },
    { optional: ["search", "limit"] },
  ),
  outputSchema: s.object("The field value counts and response metadata returned by openFDA.", {
    meta: metaSchema,
    counts: s.array(
      "The field values ordered by frequency by openFDA.",
      s.object("One openFDA field value count.", {
        term: s.string("The field value returned by openFDA."),
        count: s.integer("The number of matching records containing the field value."),
      }),
    ),
  }),
});

export const openfdaActions: ActionDefinition[] = [searchDrugRecordsAction, countDrugValuesAction];
