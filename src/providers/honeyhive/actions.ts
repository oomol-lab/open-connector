import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "honeyhive";

const datasetIdSchema = s.nonEmptyString("The unique HoneyHive dataset identifier.");
const datapointIdSchema = s.nonEmptyString("A unique HoneyHive datapoint identifier.");
const datapointIdsSchema = (description: string) => s.array(description, datapointIdSchema);

const datasetSchema = s.looseRequiredObject(
  "A HoneyHive dataset.",
  {
    id: datasetIdSchema,
    name: s.string("The dataset name."),
    description: s.nullable(s.string("The dataset description.")),
    datapoints: datapointIdsSchema("The datapoint identifiers currently in the dataset."),
    created_at: s.string("The timestamp when the dataset was created."),
    updated_at: s.string("The timestamp when the dataset was last updated."),
  },
  { optional: ["description", "created_at", "updated_at"] },
);

const listDatasetsInputSchema = s.object(
  "Filters for listing HoneyHive datasets in the API key's project.",
  {
    datasetId: datasetIdSchema,
    name: s.string("The exact dataset name to filter by."),
  },
  { optional: ["datasetId", "name"] },
);

const listDatasetsOutputSchema = s.requiredObject("Datasets returned by HoneyHive.", {
  datasets: s.array("The matching HoneyHive datasets.", datasetSchema),
});

const createDatasetInputSchema = s.object(
  "Fields for creating a HoneyHive dataset.",
  {
    name: s.string("The dataset name. HoneyHive defaults to Untitled Dataset.", {
      maxLength: 200,
    }),
    description: s.string("The dataset description."),
    datapoints: datapointIdsSchema("Initial datapoint identifiers to include in the dataset."),
  },
  { optional: ["name", "description", "datapoints"] },
);

const insertResultSchema = s.requiredObject("The identifier of the newly created dataset.", {
  insertedId: datasetIdSchema,
});

const createDatasetOutputSchema = s.requiredObject("HoneyHive dataset creation result.", {
  inserted: s.boolean("Whether HoneyHive inserted the dataset."),
  result: insertResultSchema,
});

const updateDatasetInputSchema = s.object(
  "Fields for updating a HoneyHive dataset.",
  {
    datasetId: datasetIdSchema,
    name: s.string("The new dataset name.", { maxLength: 200 }),
    description: s.string("The new dataset description."),
    datapoints: datapointIdsSchema("The complete updated list of datapoint identifiers."),
  },
  { optional: ["name", "description", "datapoints"] },
);

const updateDatasetOutputSchema = s.requiredObject("HoneyHive dataset update result.", {
  result: datasetSchema,
});

const datasetIdInputSchema = s.requiredObject("A HoneyHive dataset identifier.", {
  datasetId: datasetIdSchema,
});

const deleteDatasetOutputSchema = s.requiredObject("HoneyHive dataset deletion result.", {
  result: s.requiredObject("The deleted dataset identifier.", {
    id: datasetIdSchema,
  }),
});

const datapointMappingSchema = s.object(
  "Source field names mapped into HoneyHive datapoint sections.",
  {
    inputs: s.array("Source fields to map into datapoint inputs.", s.string("A source field name.")),
    history: s.array("Source fields to map into datapoint conversation history.", s.string("A source field name.")),
    groundTruth: s.array("Source fields to map into datapoint ground truth.", s.string("A source field name.")),
  },
  { optional: ["inputs", "history", "groundTruth"] },
);

const addDatapointsInputSchema = s.requiredObject("Datapoints to create and add to a HoneyHive dataset.", {
  datasetId: datasetIdSchema,
  data: s.array(
    "Raw datapoint source objects to add.",
    s.looseObject("A raw datapoint source object to map into HoneyHive fields."),
    { minItems: 1 },
  ),
  mapping: datapointMappingSchema,
});

const addDatapointsOutputSchema = s.requiredObject("HoneyHive datapoint insertion result.", {
  inserted: s.boolean("Whether HoneyHive inserted the datapoints."),
  datapoint_ids: datapointIdsSchema("The identifiers of the inserted datapoints."),
});

const removeDatapointInputSchema = s.requiredObject("A dataset and datapoint association to remove.", {
  datasetId: datasetIdSchema,
  datapointId: datapointIdSchema,
});

const removeDatapointOutputSchema = s.requiredObject("HoneyHive datapoint dereference result.", {
  dereferenced: s.boolean("Whether the datapoint was removed from the dataset."),
  message: s.string("The result message returned by HoneyHive."),
});

export const honeyhiveActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_datasets",
    operationType: "read",
    description: "List HoneyHive datasets in the API key's project, optionally filtering by dataset ID or exact name.",
    requiredScopes: [],
    inputSchema: listDatasetsInputSchema,
    outputSchema: listDatasetsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_dataset",
    operationType: "write",
    description: "Create a HoneyHive dataset with an optional name, description, and initial datapoint identifiers.",
    requiredScopes: [],
    inputSchema: createDatasetInputSchema,
    outputSchema: createDatasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_dataset",
    operationType: "write",
    description: "Update a HoneyHive dataset's name, description, or complete datapoint identifier list.",
    requiredScopes: [],
    inputSchema: updateDatasetInputSchema,
    outputSchema: updateDatasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_dataset",
    operationType: "destructive",
    description: "Permanently delete a HoneyHive dataset by its unique identifier.",
    requiredScopes: [],
    inputSchema: datasetIdInputSchema,
    outputSchema: deleteDatasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_datapoints",
    operationType: "write",
    description: "Create datapoints from raw JSON objects and add them to a HoneyHive dataset using a field mapping.",
    requiredScopes: [],
    inputSchema: addDatapointsInputSchema,
    outputSchema: addDatapointsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_datapoint",
    operationType: "destructive",
    description: "Remove a datapoint association from a HoneyHive dataset without deleting the datapoint itself.",
    requiredScopes: [],
    inputSchema: removeDatapointInputSchema,
    outputSchema: removeDatapointOutputSchema,
  }),
];
