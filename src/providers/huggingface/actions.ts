import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  huggingfaceInferenceScope,
  huggingfaceOpenIdScope,
  huggingfaceProfileScope,
  huggingfaceReadReposScope,
} from "./scopes.ts";

const service = "huggingface";

const jsonObjectSchema = s.record(s.unknown("Any JSON value."), {
  description: "A JSON-like object with arbitrary string keys.",
});
const nonEmptyStringSchema = s.nonEmptyString("A non-empty string.");
const timestampSchema = s.string("A timestamp returned by Hugging Face.");
const gatedSchema = s.union(
  [s.boolean("Whether the repository is gated."), s.string("The gating mode reported by Hugging Face.")],
  { description: "The Hugging Face gating status." },
);

const currentUserOrganizationSchema = s.object(
  "A Hugging Face organization summary.",
  {
    preferredUsername: s.string("The organization handle shown by Hugging Face."),
    name: s.string("The organization display name."),
    avatarUrl: s.string("The organization avatar URL."),
    profileUrl: s.string("The organization profile URL."),
  },
  { optional: ["preferredUsername", "name", "avatarUrl", "profileUrl"] },
);

const currentUserSchema = s.object(
  "The current authenticated Hugging Face user.",
  {
    id: s.string("The Hugging Face subject identifier."),
    preferredUsername: s.string("The Hugging Face handle."),
    name: s.string("The display name of the authenticated user."),
    email: s.string("The email address returned by Hugging Face."),
    avatarUrl: s.string("The avatar image URL."),
    profileUrl: s.string("The public profile URL."),
    organizations: s.array("The organizations attached to the authenticated user.", currentUserOrganizationSchema),
  },
  { optional: ["preferredUsername", "name", "email", "avatarUrl", "profileUrl", "organizations"] },
);

const modelSummarySchema = s.object(
  "A Hugging Face model summary.",
  {
    id: s.string("The full model identifier."),
    author: s.string("The model owner handle."),
    task: s.string("The primary pipeline task for the model."),
    private: s.boolean("Whether the model repository is private."),
    gated: gatedSchema,
    likes: s.integer("The number of likes on the model card."),
    downloads: s.integer("The number of model downloads."),
    lastModified: timestampSchema,
    createdAt: timestampSchema,
    tags: s.array("The tags attached to the model.", s.string("A model tag.")),
  },
  { optional: ["author", "task", "private", "gated", "likes", "downloads", "lastModified", "createdAt", "tags"] },
);

const modelInfoSchema = s.object(
  "Detailed metadata for a Hugging Face model.",
  {
    modelId: s.string("The full model identifier."),
    author: s.string("The model owner handle."),
    sha: s.string("The current repository SHA."),
    downloads: s.integer("The number of model downloads."),
    likes: s.integer("The number of likes on the model card."),
    private: s.boolean("Whether the model repository is private."),
    gated: gatedSchema,
    tags: s.array("The tags attached to the model.", s.string("A model tag.")),
    task: s.string("The primary pipeline task for the model."),
    createdAt: timestampSchema,
    lastModified: timestampSchema,
    libraryName: s.string("The primary library tag for the model."),
    config: jsonObjectSchema,
    cardData: jsonObjectSchema,
  },
  {
    optional: [
      "author",
      "sha",
      "downloads",
      "likes",
      "private",
      "gated",
      "tags",
      "task",
      "createdAt",
      "lastModified",
      "libraryName",
      "config",
      "cardData",
    ],
  },
);

const chatMessageTextPartSchema = s.object("A text message part.", {
  type: s.literal("text", { description: "The multimodal content type." }),
  text: s.string("The text content for this message part."),
});

const chatMessageImagePartSchema = s.object("An image message part.", {
  type: s.literal("image_url", { description: "The multimodal content type." }),
  image_url: s.object("The image reference payload.", {
    url: s.string("The image URL or data URI."),
  }),
});

const chatMessageContentSchema = s.union(
  [
    s.string("Plain text content."),
    s.array("Structured multimodal content.", s.union([chatMessageTextPartSchema, chatMessageImagePartSchema])),
  ],
  { description: "The content for a chat message." },
);

const chatMessageSchema = s.object(
  "A single chat message sent to the model.",
  {
    role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool"]),
    content: chatMessageContentSchema,
    name: s.string("The optional speaker name."),
  },
  { optional: ["name"] },
);

const chatToolSchema = s.object("A chat completion tool definition.", {
  type: s.literal("function", { description: "The tool type." }),
  function: s.object(
    "The function tool declaration.",
    {
      name: s.string("The tool function name."),
      description: s.string("A human-readable tool description."),
      parameters: jsonObjectSchema,
    },
    { optional: ["description", "parameters"] },
  ),
});

const chatChoiceSchema = s.object("A normalized chat completion choice.", {
  index: s.integer("The zero-based choice index."),
  message: s.object("The generated assistant message.", {
    role: s.string("The role of the generated message."),
    content: s.nullableString("The generated text content."),
  }),
  finishReason: s.nullableString("Why Hugging Face stopped generating this choice."),
});

const chatUsageSchema = s.object(
  "The normalized token usage object.",
  {
    promptTokens: s.integer("The prompt token count."),
    completionTokens: s.integer("The completion token count."),
    totalTokens: s.integer("The total token count."),
  },
  { optional: ["promptTokens", "completionTokens", "totalTokens"] },
);

const datasetSummarySchema = s.object(
  "A Hugging Face dataset summary.",
  {
    id: s.string("The full dataset identifier."),
    author: s.string("The dataset owner handle."),
    private: s.boolean("Whether the dataset repository is private."),
    gated: gatedSchema,
    disabled: s.boolean("Whether the dataset is disabled."),
    downloads: s.integer("The number of dataset downloads."),
    likes: s.integer("The number of likes on the dataset card."),
    tags: s.array("The tags attached to the dataset.", s.string("A dataset tag.")),
    createdAt: timestampSchema,
    lastModified: timestampSchema,
  },
  { optional: ["author", "private", "gated", "disabled", "downloads", "likes", "tags", "createdAt", "lastModified"] },
);

const datasetFeatureSchema = s.object("A dataset feature summary.", {
  featureIdx: s.integer("The zero-based feature index."),
  name: s.string("The feature name."),
  type: jsonObjectSchema,
});

const datasetRowSchema = s.object("A dataset row preview item.", {
  rowIdx: s.integer("The zero-based row index."),
  row: jsonObjectSchema,
  truncatedCells: s.array("The cells truncated by the upstream dataset viewer.", s.string("A truncated column name.")),
});

const datasetStatisticsEntrySchema = s.object(
  "A dataset statistics entry.",
  {
    columnName: s.string("The column name."),
    columnType: s.string("The upstream column type."),
    columnStatistics: jsonObjectSchema,
  },
  { optional: ["columnName", "columnType", "columnStatistics"] },
);

const spaceSummarySchema = s.object(
  "A Hugging Face Space summary.",
  {
    id: s.string("The full Space identifier."),
    author: s.string("The Space owner handle."),
    sdk: s.string("The SDK used by the Space."),
    host: s.string("The public host URL for the Space."),
    private: s.boolean("Whether the Space repository is private."),
    gated: gatedSchema,
    likes: s.integer("The number of likes on the Space."),
    models: s.array("The models linked from the Space.", s.string("A model identifier.")),
    datasets: s.array("The datasets linked from the Space.", s.string("A dataset identifier.")),
    tags: s.array("The tags attached to the Space.", s.string("A Space tag.")),
    createdAt: timestampSchema,
    lastModified: timestampSchema,
    runtime: jsonObjectSchema,
    cardData: jsonObjectSchema,
  },
  {
    optional: [
      "id",
      "author",
      "sdk",
      "host",
      "private",
      "gated",
      "likes",
      "models",
      "datasets",
      "tags",
      "createdAt",
      "lastModified",
      "runtime",
      "cardData",
    ],
  },
);

const repoFileItemSchema = s.object(
  "A repository tree item.",
  {
    path: s.string("The repository-relative path."),
    type: s.string("The tree entry type."),
    oid: s.string("The object identifier for the tree entry."),
    size: s.integer("The entry size in bytes."),
    lastCommit: jsonObjectSchema,
    securityFileStatus: jsonObjectSchema,
  },
  { optional: ["path", "type", "oid", "size", "lastCommit", "securityFileStatus"] },
);

const trendingEntrySchema = s.object(
  "A trending repository entry.",
  {
    repoType: s.string("The repository type for the trending entry."),
    repoData: jsonObjectSchema,
  },
  { optional: ["repoType", "repoData"] },
);

export const huggingfaceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current authenticated Hugging Face user profile.",
    requiredScopes: [huggingfaceOpenIdScope, huggingfaceProfileScope],
    inputSchema: s.actionInput({}, [], "No input parameters are required for this action."),
    outputSchema: currentUserSchema,
  }),
  defineProviderAction(service, {
    name: "list_models",
    description: "List Hugging Face models using user-friendly search filters.",
    inputSchema: s.object(
      "The input payload for listing Hugging Face models.",
      {
        search: s.string("A keyword used to search model names and owners."),
        author: s.string("Filter models by author or organization."),
        task: s.string("Filter models by pipeline task."),
        limit: s.integer("The maximum number of models to return.", {
          minimum: 1,
          maximum: 100,
          default: 20,
        }),
      },
      { optional: ["search", "author", "task", "limit"] },
    ),
    outputSchema: s.actionOutput({
      models: s.array("The list of matching model summaries.", modelSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_model_info",
    description: "Get detailed metadata for a Hugging Face model by modelId.",
    inputSchema: s.actionInput(
      {
        modelId: s.nonEmptyString("The full model identifier, such as owner/model."),
      },
      ["modelId"],
      "The input payload for retrieving Hugging Face model metadata.",
    ),
    outputSchema: modelInfoSchema,
  }),
  defineProviderAction(service, {
    name: "list_datasets",
    description: "List Hugging Face datasets using user-friendly search filters.",
    inputSchema: s.object(
      "The input payload for listing Hugging Face datasets.",
      {
        search: s.string("A keyword used to search dataset names and owners."),
        author: s.string("Filter datasets by author or organization."),
        filter: s.string("Filter datasets by a Hub tag expression."),
        sort: s.stringEnum("The property used to sort results.", ["lastModified", "trending", "likes", "downloads"]),
        direction: s.stringEnum("The direction in which to sort results.", ["asc", "desc"]),
        limit: s.integer("The maximum number of datasets to return.", {
          minimum: 1,
          maximum: 500,
          default: 20,
        }),
      },
      { optional: ["search", "author", "filter", "sort", "direction", "limit"] },
    ),
    outputSchema: s.actionOutput({
      datasets: s.array("The list of matching dataset summaries.", datasetSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dataset_info",
    description: "Get detailed metadata for a Hugging Face dataset by dataset id.",
    inputSchema: s.object(
      "The input payload for retrieving Hugging Face dataset metadata.",
      {
        dataset: s.nonEmptyString("The full dataset identifier, such as owner/dataset."),
        config: s.string("The optional dataset config or subset name."),
      },
      { optional: ["config"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        dataset: s.string("The full dataset identifier."),
        config: s.string("The dataset config name."),
        description: s.string("The dataset description text."),
        citation: s.string("The dataset citation text."),
        homepage: s.string("The dataset homepage URL."),
        license: s.string("The dataset license string."),
        features: jsonObjectSchema,
        splits: jsonObjectSchema,
        partial: s.boolean("Whether the dataset metadata was computed on a partial source."),
      },
      { optional: ["config", "description", "citation", "homepage", "license", "features", "splits", "partial"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_dataset_first_rows",
    description: "Preview the first rows of a dataset split from the Hugging Face Dataset Viewer.",
    requiredScopes: [huggingfaceReadReposScope],
    inputSchema: s.actionInput(
      {
        dataset: s.nonEmptyString("The full dataset identifier, such as owner/dataset."),
        config: s.nonEmptyString("The dataset config or subset name."),
        split: s.nonEmptyString("The dataset split name to preview."),
      },
      ["dataset", "config", "split"],
      "The input payload for previewing a Hugging Face dataset split.",
    ),
    outputSchema: s.actionOutput({
      dataset: s.string("The dataset identifier that was queried."),
      config: s.string("The dataset config that was queried."),
      split: s.string("The dataset split that was queried."),
      features: s.array("The feature list returned by the viewer.", datasetFeatureSchema),
      rows: s.array("The row previews returned by the viewer.", datasetRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dataset_statistics",
    description: "Get column statistics for a dataset split from the Hugging Face Dataset Viewer.",
    requiredScopes: [huggingfaceReadReposScope],
    inputSchema: s.actionInput(
      {
        dataset: s.nonEmptyString("The full dataset identifier, such as owner/dataset."),
        config: s.nonEmptyString("The dataset config or subset name."),
        split: s.nonEmptyString("The dataset split name to analyze."),
      },
      ["dataset", "config", "split"],
      "The input payload for analyzing a Hugging Face dataset split.",
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        numExamples: s.integer("The number of examples analyzed."),
        partial: s.boolean("Whether the statistics were computed on only a partial source."),
        statistics: s.array("The statistics entries returned by the viewer.", datasetStatisticsEntrySchema),
      },
      { optional: ["numExamples"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    description: "List Hugging Face Spaces using user-friendly discovery filters.",
    inputSchema: s.object(
      "The input payload for listing Hugging Face Spaces.",
      {
        search: s.string("A keyword used to search Space names and owners."),
        author: s.string("Filter Spaces by author or organization."),
        filter: s.string("Filter Spaces by a Hub tag expression."),
        sort: s.string("The property used to sort results."),
        direction: s.stringEnum("The sort direction used by the Space listing API.", ["1", "-1"]),
        limit: s.integer("The maximum number of Spaces to return.", {
          minimum: 1,
          maximum: 500,
          default: 20,
        }),
      },
      { optional: ["search", "author", "filter", "sort", "direction", "limit"] },
    ),
    outputSchema: s.actionOutput({
      spaces: s.array("The list of matching Space summaries.", spaceSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_space_info",
    description: "Get detailed metadata for a Hugging Face Space by repo id.",
    requiredScopes: [huggingfaceReadReposScope],
    inputSchema: s.object(
      "The input payload for retrieving Hugging Face Space metadata.",
      {
        repoId: s.nonEmptyString("The full Space identifier, such as owner/space."),
        revision: s.string("The optional git revision to inspect."),
      },
      { optional: ["revision"] },
    ),
    outputSchema: spaceSummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_repo_files",
    description: "List files in a Hugging Face repository tree.",
    requiredScopes: [huggingfaceReadReposScope],
    inputSchema: s.object(
      "The input payload for listing a Hugging Face repository tree.",
      {
        repoType: s.stringEnum("The Hugging Face repository type.", ["model", "dataset", "space"]),
        repoId: s.nonEmptyString("The full repository identifier, such as owner/repo."),
        path: s.string("The optional repository-relative path to list.", { default: "" }),
        revision: s.string("The optional git revision to inspect."),
        recursive: s.boolean("Whether to recursively return all nested entries."),
        expand: s.boolean("Whether to request expanded commit and security metadata."),
        limit: s.integer("The maximum number of items to return.", { minimum: 1 }),
        cursor: s.string("The pagination cursor from a previous response."),
      },
      { optional: ["path", "revision", "recursive", "expand", "limit", "cursor"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        items: s.array("The repository tree items.", repoFileItemSchema),
        nextCursor: s.string("The cursor for the next page of results."),
      },
      { optional: ["nextCursor"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_trending",
    description: "Get trending Hugging Face repositories across models, datasets, and Spaces.",
    inputSchema: s.object(
      "The input payload for retrieving Hugging Face trending repositories.",
      {
        type: s.stringEnum("The repository type filter.", ["all", "model", "dataset", "space"]),
        limit: s.integer("The maximum number of trending items to return.", { minimum: 1 }),
      },
      { optional: ["type", "limit"] },
    ),
    outputSchema: s.actionOutput({
      recentlyTrending: s.array("The list of trending repositories.", trendingEntrySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_endpoints",
    description: "List Hugging Face Inference Endpoints for a namespace.",
    inputSchema: s.object(
      "The input payload for listing Hugging Face Inference Endpoints.",
      {
        namespace: s.nonEmptyString("The user or organization namespace."),
        search: s.string("Filter endpoints by a name substring."),
        tags: s.string("Filter endpoints by a comma-separated tag list."),
        limit: s.integer("The maximum number of endpoints to return.", { minimum: 1, maximum: 100 }),
        cursor: s.string("The pagination cursor from a previous response."),
      },
      { optional: ["search", "tags", "limit", "cursor"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        items: s.array("The endpoint records returned by the API.", jsonObjectSchema),
        nextCursor: s.string("The cursor for the next page of results."),
        prevCursor: s.string("The cursor for the previous page of results."),
      },
      { optional: ["nextCursor", "prevCursor"] },
    ),
  }),
  defineProviderAction(service, {
    name: "generate_chat_completion",
    description: "Generate a chat completion with Hugging Face Inference Providers.",
    requiredScopes: [huggingfaceInferenceScope],
    inputSchema: s.object(
      "The input payload for generating a Hugging Face chat completion.",
      {
        model: nonEmptyStringSchema,
        messages: s.array("The ordered conversation messages.", chatMessageSchema, { minItems: 1 }),
        max_tokens: s.integer("The maximum number of output tokens to generate.", { minimum: 1 }),
        temperature: s.number("The sampling temperature.", { minimum: 0, maximum: 2 }),
        top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
        stop: s.array("Up to 4 stop sequences.", s.string("A stop sequence."), { maxItems: 4 }),
        seed: s.integer("A random seed for deterministic generation."),
        stream: s.literal(false, {
          description:
            "Whether to request a streaming response. This connector only accepts false or an omitted value.",
        }),
        tools: s.array("The function tools available to the model.", chatToolSchema),
      },
      { optional: ["max_tokens", "temperature", "top_p", "stop", "seed", "stream", "tools"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        id: s.string("The chat completion identifier."),
        object: s.string("The upstream object type."),
        created: s.integer("The creation timestamp in Unix seconds."),
        model: s.string("The model used for generation."),
        text: s.string("The first assistant text content extracted from the response."),
        choices: s.array("The generated completion choices.", chatChoiceSchema),
        usage: chatUsageSchema,
      },
      { optional: ["created", "text", "usage"] },
    ),
  }),
  defineProviderAction(service, {
    name: "generate_embeddings",
    description: "Generate text embeddings with Hugging Face inference.",
    requiredScopes: [huggingfaceInferenceScope],
    inputSchema: s.object(
      "The input payload for generating Hugging Face embeddings.",
      {
        model: s.string("The embedding model identifier."),
        inputs: s.array("The list of texts to embed.", s.string("A text string to embed."), { minItems: 1 }),
      },
      { optional: ["model"] },
    ),
    outputSchema: s.actionOutput({
      model: s.string("The embedding model identifier."),
      embeddings: s.array(
        "The embedding vectors for each input string.",
        s.array("One embedding vector.", s.number("A single embedding dimension value.")),
      ),
      dimensions: s.integer("The embedding dimension count."),
    }),
  }),
];
