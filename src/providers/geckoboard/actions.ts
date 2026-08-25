import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "geckoboard";

const datasetIdSchema = s.string({
  description: "The Geckoboard dataset identifier, such as sales.by_day.",
  minLength: 1,
  pattern: "\\S",
});

const fieldDefinitionSchema = s.looseObject(
  "A Geckoboard dataset field definition. Include the documented type, name, optional flag, and type-specific options such as currency_code or time_unit.",
);

const datasetFieldsSchema = s.record(
  "The dataset fields keyed by column name. Each field describes a Geckoboard column.",
  fieldDefinitionSchema,
);

const uniqueBySchema = s.stringArray("Field names whose values uniquely identify records in the dataset.", {
  minItems: 1,
  itemDescription: "A field name included in the dataset fields object.",
});

const recordSchema = s.looseObject(
  "A record whose keys match the dataset fields. Values must match the field types declared in Geckoboard.",
);

const recordsSchema = s.array("Dataset records to write to Geckoboard.", recordSchema, {
  maxItems: 500,
});

const emptyResultSchema = s.object({}, { description: "The empty object returned by Geckoboard for this request." });

const datasetSchema = s.requiredObject("A Geckoboard dataset definition.", {
  id: s.string("The Geckoboard dataset identifier."),
  fields: datasetFieldsSchema,
  unique_by: s.nullable(s.stringArray("The unique field names returned by Geckoboard when configured.")),
  raw: s.looseObject("The raw dataset object returned by Geckoboard."),
});

export const geckoboardActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "find_or_create_dataset",
    description: "Find or create a Geckoboard dataset with a declared field schema.",
    inputSchema: s.object(
      "Input parameters for finding or creating a Geckoboard dataset.",
      {
        datasetId: datasetIdSchema,
        fields: datasetFieldsSchema,
        uniqueBy: uniqueBySchema,
      },
      { required: ["datasetId", "fields"], optional: ["uniqueBy"] },
    ),
    outputSchema: s.actionOutput(
      {
        dataset: datasetSchema,
      },
      "The dataset definition returned by Geckoboard.",
    ),
  }),
  defineProviderAction(service, {
    name: "append_dataset_data",
    description: "Append records to a Geckoboard dataset, updating existing rows when unique_by fields match.",
    inputSchema: s.object(
      "Input parameters for appending records to a Geckoboard dataset.",
      {
        datasetId: datasetIdSchema,
        records: recordsSchema,
        deleteBy: s.string({
          description: "A date or datetime field name Geckoboard should use when truncating old records.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      { required: ["datasetId", "records"], optional: ["deleteBy"] },
    ),
    outputSchema: emptyResultSchema,
  }),
  defineProviderAction(service, {
    name: "replace_dataset_data",
    description: "Replace all records in a Geckoboard dataset with the supplied records.",
    inputSchema: s.requiredObject("Input parameters for replacing records in a Geckoboard dataset.", {
      datasetId: datasetIdSchema,
      records: recordsSchema,
    }),
    outputSchema: emptyResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_dataset",
    description: "Delete a Geckoboard dataset by identifier.",
    inputSchema: s.requiredObject("Input parameters for deleting a Geckoboard dataset.", {
      datasetId: datasetIdSchema,
    }),
    outputSchema: emptyResultSchema,
  }),
];
