import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bigml";
const text = (description: string) => s.nonEmptyString(description);
const state = s.stringEnum("The normalized BigML resource state.", [
  "waiting",
  "queued",
  "started",
  "in_progress",
  "summarized",
  "finished",
  "faulty",
  "unknown",
]);
const status = s.object("The normalized BigML resource status.", {
  code: s.integer("The numeric status code."),
  message: s.nullableString("The status message."),
  progress: s.nullableNumber("The completion ratio."),
});
const modelSummaryProperties = {
  resource: text("The model resource identifier."),
  name: s.nullableString("The model name."),
  created: s.nullableString("The creation timestamp."),
  updated: s.nullableString("The update timestamp."),
  project: s.nullableString("The project resource."),
  state,
  status,
};
const modelSummary = s.object("A compact BigML model summary.", modelSummaryProperties);
const predictionValue = s.anyOf("A scalar prediction value.", [
  s.string("A string prediction."),
  s.number("A numeric prediction."),
]);
const prediction = s.object("A normalized BigML prediction.", {
  resource: text("The prediction resource identifier."),
  name: s.nullableString("The prediction name."),
  created: s.nullableString("The creation timestamp."),
  updated: s.nullableString("The update timestamp."),
  model: s.nullableString("The model resource."),
  project: s.nullableString("The project resource."),
  inputData: s.looseObject("The prediction input."),
  output: s.nullable(predictionValue),
  prediction: s.looseObject("Prediction values keyed by objective field."),
  confidence: s.nullableNumber("The confidence value."),
  objectiveFieldName: s.nullableString("The objective field name."),
  state,
  status,
});
const pagination = s.object("Credential-safe pagination metadata.", {
  totalCount: s.nonNegativeInteger("The total matching resources."),
  limit: s.positiveInteger("The page size."),
  offset: s.nonNegativeInteger("The page offset."),
  nextOffset: s.nullableInteger("The next offset.", { minimum: 0 }),
  previousOffset: s.nullableInteger("The previous offset.", { minimum: 0 }),
});
const listInput = s.actionInput(
  {
    limit: s.integer("The maximum resources to return.", { minimum: 1, maximum: 200 }),
    offset: s.nonNegativeInteger("The zero-based offset."),
    orderBy: text("The BigML ordering field."),
    project: text("A project resource identifier."),
    nameContains: text("A name substring filter."),
  },
  [],
  "Pagination and filtering input.",
);
const lifecycle = { startActionId: "bigml.create_prediction", statusActionId: "bigml.get_prediction" };

export const bigmlActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List existing BigML supervised models with compact status details.",
    inputSchema: listInput,
    outputSchema: s.actionOutput(
      { models: s.array("The returned models.", modelSummary), pagination },
      "A page of models.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_model",
    operationType: "read",
    description: "Retrieve compact BigML model metadata and field definitions needed for prediction input.",
    inputSchema: s.actionInput(
      {
        modelId: text("A model identifier as model/ID or a bare ID."),
        fieldLimit: s.positiveInteger("The maximum fields to return."),
        fieldOffset: s.nonNegativeInteger("The field offset."),
      },
      ["modelId"],
      "Model lookup input.",
    ),
    outputSchema: s.actionOutput(
      {
        model: s.object("Compact model details.", {
          ...modelSummaryProperties,
          objectiveField: s.nullableString("The objective field identifier."),
          objectiveFieldName: s.nullableString("The objective field name."),
          inputFields: s.array("Accepted input field identifiers.", s.string("One field identifier.")),
          fields: s.looseObject("Model field metadata."),
          fieldPagination: s.nullable(
            s.object("Field pagination.", {
              count: s.nullableInteger("Returned fields.", { minimum: 0 }),
              limit: s.nullableInteger("Field limit.", { minimum: 0 }),
              offset: s.nullableInteger("Field offset.", { minimum: 0 }),
              total: s.nullableInteger("Total fields.", { minimum: 0 }),
            }),
          ),
        }),
      },
      "The compact model details.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_prediction",
    operationType: "write",
    description: "Submit a JSON prediction against an existing BigML model.",
    followUpActions: ["bigml.get_prediction"],
    asyncLifecycle: lifecycle,
    inputSchema: s.actionInput(
      {
        modelId: text("A model identifier."),
        inputData: s.looseObject("Prediction input values."),
        name: text("An optional prediction name."),
        description: s.string("An optional description.", { maxLength: 8192 }),
        project: text("An optional project identifier."),
        tags: s.array("Prediction tags.", text("One tag.")),
        missingStrategy: s.integer("Missing-value strategy, 0 or 1.", { minimum: 0, maximum: 1 }),
        operatingKind: s.stringEnum("Classification output metric.", ["probability", "confidence"]),
        explain: s.boolean("Whether to compute an explanation."),
      },
      ["modelId", "inputData"],
      "Prediction creation input.",
    ),
    outputSchema: s.actionOutput({ prediction }, "The created prediction."),
  }),
  defineProviderAction(service, {
    name: "get_prediction",
    operationType: "read",
    description: "Retrieve the status and result of one BigML prediction.",
    asyncLifecycle: lifecycle,
    inputSchema: s.actionInput(
      { predictionId: text("A prediction identifier.") },
      ["predictionId"],
      "Prediction lookup input.",
    ),
    outputSchema: s.actionOutput({ prediction }, "The current prediction."),
  }),
  defineProviderAction(service, {
    name: "list_predictions",
    operationType: "read",
    description: "List stored BigML prediction resources.",
    inputSchema: listInput,
    outputSchema: s.actionOutput(
      { predictions: s.array("The returned predictions.", prediction), pagination },
      "A page of predictions.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_prediction",
    operationType: "destructive",
    description: "Permanently delete one stored BigML prediction resource.",
    inputSchema: s.actionInput(
      { predictionId: text("A prediction identifier.") },
      ["predictionId"],
      "Prediction deletion input.",
    ),
    outputSchema: s.actionOutput(
      { deleted: s.boolean("Whether the prediction was deleted."), resource: text("The deleted resource identifier.") },
      "Prediction deletion result.",
    ),
  }),
];
