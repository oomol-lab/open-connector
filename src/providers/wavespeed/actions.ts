import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wavespeed";
const modelIdDescription =
  "The WaveSpeedAI model id, which is also its API path, such as bytedance/seedream-v5.0-pro or google/veo3.1-fast/text-to-video.";
const modelSummarySchema = s.looseRequiredObject("A WaveSpeedAI model.", {
  modelId: s.nonEmptyString("The model id used to run the model."),
  name: s.string("The model display name."),
  type: s.string("The task type, such as text-to-image or image-to-video."),
  description: s.string("A short description of what the model does."),
  basePrice: s.nullableNumber("The base price of one run in USD. The final price can depend on the inputs."),
});
const predictionSchema = s.looseRequiredObject("A WaveSpeedAI prediction.", {
  id: s.nonEmptyString("The prediction id used to fetch the result."),
  status: s.string("The prediction status: created, processing, completed or failed."),
  outputs: s.stringArray("URLs of the generated files. Empty until the prediction is completed."),
  error: s.nullableString("The failure reason when the prediction failed."),
});

export const wavespeedActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_balance",
    operationType: "read",
    description: "Retrieve the credit balance in USD of the WaveSpeedAI account behind the connected API key.",
    inputSchema: s.object("No input parameters are required.", {}),
    outputSchema: s.requiredObject("The WaveSpeedAI account balance.", {
      balance: s.number("The account balance in USD."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description:
      "Search the WaveSpeedAI model catalog for image, video, audio and 3D generation models by keyword or task type.",
    inputSchema: s.object(
      "Input for searching WaveSpeedAI models.",
      {
        query: s.nonEmptyString(
          "Words that must all appear in the model id, name or description, such as seedance image-to-video.",
        ),
        type: s.nonEmptyString(
          "An exact task type to filter by, such as text-to-image, image-to-video or text-to-video.",
        ),
        limit: s.integer("Maximum number of models to return.", { minimum: 1, maximum: 100, default: 20 }),
      },
      { optional: ["query", "type", "limit"] },
    ),
    outputSchema: s.requiredObject("Matching WaveSpeedAI models.", {
      models: s.array("The models that match the search, without their input schemas.", modelSummarySchema),
      total: s.nonNegativeInteger("The number of models that matched before the limit was applied."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_model",
    operationType: "read",
    description:
      "Retrieve one WaveSpeedAI model with its input schema, so the inputs for run_model can be built correctly.",
    inputSchema: s.object("Input for selecting a WaveSpeedAI model.", {
      modelId: s.nonEmptyString(modelIdDescription),
    }),
    outputSchema: s.requiredObject("A WaveSpeedAI model with its input schema.", {
      model: modelSummarySchema,
      inputSchema: s.nullable(s.looseObject("The JSON Schema of the model input, when the catalog provides one.")),
    }),
  }),
  defineProviderAction(service, {
    name: "run_model",
    asyncLifecycle: { startActionId: "wavespeed.run_model", statusActionId: "wavespeed.get_prediction" },
    operationType: "write",
    description:
      "Start a WaveSpeedAI prediction for a model with a JSON input and return its id. The run is billed; poll get_prediction with the id for the outputs.",
    inputSchema: s.object("Input for running a WaveSpeedAI model.", {
      modelId: s.nonEmptyString(modelIdDescription),
      input: s.looseObject("The model input, following the input schema returned by get_model."),
    }),
    outputSchema: s.requiredObject("The prediction that was started.", { prediction: predictionSchema }),
  }),
  defineProviderAction(service, {
    name: "get_prediction",
    asyncLifecycle: { startActionId: "wavespeed.run_model", statusActionId: "wavespeed.get_prediction" },
    operationType: "read",
    description:
      "Retrieve the status of a WaveSpeedAI prediction and, once it is completed, the URLs of the generated files.",
    inputSchema: s.object("Input for selecting a WaveSpeedAI prediction.", {
      predictionId: s.nonEmptyString("The prediction id returned by run_model."),
    }),
    outputSchema: s.requiredObject("The current state of the prediction.", { prediction: predictionSchema }),
  }),
];
