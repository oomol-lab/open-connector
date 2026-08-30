import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "deepgram" as const;

const nonEmptyString = (description: string) => s.string({ minLength: 1, pattern: "\\S", description });

const projectIdSchema = nonEmptyString("The unique identifier of the Deepgram project.");
const modelIdSchema = nonEmptyString("The unique identifier of the Deepgram model.");

const projectSummarySchema = s.object("A Deepgram project summary.", {
  project_id: s.nullable(s.string("The unique identifier of the project.")),
  name: s.nullable(s.string("The display name of the project.")),
});

const projectSchema = s.object(
  "A Deepgram project object returned by the Management API.",
  {
    project_id: s.nullable(s.string("The unique identifier of the project.")),
    name: s.nullable(s.string("The display name of the project.")),
    mip_opt_out: s.nullable(s.boolean("Whether the project is opted out of the Model Improvement Program.")),
  },
  { optional: ["mip_opt_out"] },
);

const projectMemberSchema = s.object("A Deepgram project member attached to an API key.", {
  member_id: s.nullable(s.string("The unique identifier of the member.")),
  email: s.nullable(s.string("The email address of the member.")),
});

const projectApiKeySchema = s.object("A Deepgram API key descriptor.", {
  api_key_id: s.nullable(s.string("The unique identifier of the API key.")),
  comment: s.nullable(s.string("The comment attached to the API key.")),
  scopes: s.array("The scopes granted to the API key.", s.string("One Deepgram API key scope.")),
  created: s.nullable(s.string("The ISO 8601 timestamp when the API key was created.")),
});

const projectKeyEntrySchema = s.object("A Deepgram project API key record.", {
  member: projectMemberSchema,
  api_key: projectApiKeySchema,
});

const projectBalanceSchema = s.object("A Deepgram project balance entry.", {
  balance_id: s.nullable(s.string("The unique identifier of the balance.")),
  amount: s.nullable(s.number("The remaining balance amount.")),
  units: s.nullable(s.string("The units of the balance, such as USD.")),
  purchase_order_id: s.nullable(s.string("The purchase order or reference identifier.")),
});

const modelMetadataSchema = s.object(
  "Additional metadata for a Deepgram text-to-speech model.",
  {
    accent: s.nullable(s.string("The accent of the model voice.")),
    age: s.nullable(s.string("The age descriptor of the model voice.")),
    color: s.nullable(s.string("The accent color associated with the model.")),
    display_name: s.nullable(s.string("The display name of the model.")),
    image: s.nullable(s.string("The image URL for the model.")),
    sample: s.nullable(s.string("The sample audio URL for the model.")),
    tags: s.array("The descriptive tags attached to the model.", s.string("One model tag.")),
    use_cases: s.array("The suggested use cases attached to the model.", s.string("One model use case.")),
  },
  {
    optional: ["accent", "age", "color", "display_name", "image", "sample", "tags", "use_cases"],
  },
);

const modelSchema = s.object(
  "A Deepgram model object that can represent either a speech-to-text or text-to-speech model.",
  {
    name: s.nullable(s.string("The human-readable model name.")),
    canonical_name: s.nullable(s.string("The canonical model identifier.")),
    architecture: s.nullable(s.string("The architecture family of the model.")),
    languages: s.array("The language codes supported by the model.", s.string("One language code.")),
    version: s.nullable(s.string("The model version string.")),
    uuid: s.nullable(s.string("The unique identifier of the model.")),
    batch: s.nullable(s.boolean("Whether the model supports batch processing.")),
    streaming: s.nullable(s.boolean("Whether the model supports streaming processing.")),
    formatted_output: s.nullable(s.boolean("Whether the model supports formatted output.")),
    metadata: s.nullable(modelMetadataSchema),
  },
  {
    optional: ["batch", "streaming", "formatted_output", "metadata"],
  },
);

const includeOutdatedSchema = s.boolean("Whether to include non-latest Deepgram model versions in the response.");

const projectKeyStatusSchema = s.stringEnum("The Deepgram project API key status to filter by.", ["active", "expired"]);

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  description: "List the Deepgram projects available to the current API key.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Deepgram projects.", {}),
  outputSchema: s.object("The response returned when listing Deepgram projects.", {
    projects: s.array("The Deepgram projects returned by the Management API.", projectSummarySchema),
    raw: s.looseObject("The raw Deepgram response payload."),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  description: "Get details for one Deepgram project.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Deepgram project.", {
    projectId: projectIdSchema,
  }),
  outputSchema: s.object("The response returned when retrieving a Deepgram project.", {
    project: projectSchema,
  }),
});

const listProjectKeysAction = defineProviderAction(service, {
  name: "list_project_keys",
  description: "List the API keys associated with a Deepgram project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing API keys in a Deepgram project.",
    {
      projectId: projectIdSchema,
      status: projectKeyStatusSchema,
    },
    { optional: ["status"] },
  ),
  outputSchema: s.object("The response returned when listing Deepgram project API keys.", {
    apiKeys: s.array("The API keys returned for the project.", projectKeyEntrySchema),
    raw: s.looseObject("The raw Deepgram response payload."),
  }),
});

const listProjectBalancesAction = defineProviderAction(service, {
  name: "list_project_balances",
  description: "List the outstanding balances for a Deepgram project.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Deepgram project balances.", {
    projectId: projectIdSchema,
  }),
  outputSchema: s.object("The response returned when listing Deepgram project balances.", {
    balances: s.array("The balance entries returned for the project.", projectBalanceSchema),
    raw: s.looseObject("The raw Deepgram response payload."),
  }),
});

const listModelsAction = defineProviderAction(service, {
  name: "list_models",
  description: "List the latest public Deepgram models.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Deepgram public models.",
    {
      includeOutdated: includeOutdatedSchema,
    },
    { optional: ["includeOutdated"] },
  ),
  outputSchema: s.object("The response returned when listing Deepgram public models.", {
    stt: s.array("The speech-to-text models returned by Deepgram.", modelSchema),
    tts: s.array("The text-to-speech models returned by Deepgram.", modelSchema),
    raw: s.looseObject("The raw Deepgram response payload."),
  }),
});

const getModelAction = defineProviderAction(service, {
  name: "get_model",
  description: "Get metadata for one public Deepgram model.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Deepgram model.", {
    modelId: modelIdSchema,
  }),
  outputSchema: s.object("The response returned when retrieving a Deepgram model.", {
    model: modelSchema,
  }),
});

const listProjectModelsAction = defineProviderAction(service, {
  name: "list_project_models",
  description: "List the models available to a specific Deepgram project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing models available to a Deepgram project.",
    {
      projectId: projectIdSchema,
      includeOutdated: includeOutdatedSchema,
    },
    { optional: ["includeOutdated"] },
  ),
  outputSchema: s.object("The response returned when listing Deepgram project models.", {
    stt: s.array("The speech-to-text models available to the project.", modelSchema),
    tts: s.array("The text-to-speech models available to the project.", modelSchema),
    raw: s.looseObject("The raw Deepgram response payload."),
  }),
});

const getProjectModelAction = defineProviderAction(service, {
  name: "get_project_model",
  description: "Get metadata for one model available to a Deepgram project.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a model available to a Deepgram project.", {
    projectId: projectIdSchema,
    modelId: modelIdSchema,
  }),
  outputSchema: s.object("The response returned when retrieving a model available to a Deepgram project.", {
    model: modelSchema,
  }),
});

export const deepgramActions: readonly ProviderActionDefinition[] = [
  listProjectsAction,
  getProjectAction,
  listProjectKeysAction,
  listProjectBalancesAction,
  listModelsAction,
  getModelAction,
  listProjectModelsAction,
  getProjectModelAction,
];
