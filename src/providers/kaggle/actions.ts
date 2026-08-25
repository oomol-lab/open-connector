import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kaggle";

const positivePage = s.positiveInteger("One-based page number for Kaggle list endpoints.");
const pageSize = s.positiveInteger("Number of Kaggle records to request for a page.", { maximum: 100 });
const pageToken = s.nonEmptyString("Kaggle page token from a previous response.");
const search = s.nonEmptyString("Search query used to filter Kaggle resources.");
const rawKaggleObject = s.looseObject("A raw Kaggle resource object returned by the API.");

const competitionsInputSchema = s.object(
  "Filters for listing Kaggle competitions.",
  {
    group: s.stringEnum("Competition group filter.", ["general", "entered", "inClass"]),
    category: s.stringEnum("Competition category filter.", [
      "all",
      "featured",
      "research",
      "recruitment",
      "gettingStarted",
      "masters",
      "playground",
    ]),
    sortBy: s.stringEnum("Competition sort order.", [
      "grouped",
      "prize",
      "earliestDeadline",
      "latestDeadline",
      "numberOfTeams",
      "recentlyCreated",
    ]),
    page: positivePage,
    pageSize,
    pageToken,
    search,
  },
  { optional: ["group", "category", "sortBy", "page", "pageSize", "pageToken", "search"] },
);

const competitionsOutputSchema = s.object(
  "Kaggle competitions returned by the list endpoint.",
  {
    competitions: s.array("Competition objects returned by Kaggle.", rawKaggleObject),
    nextPageToken: s.nonEmptyString("Token for retrieving the next Kaggle page when one is returned."),
  },
  { optional: ["nextPageToken"] },
);

const datasetsInputSchema = s.object(
  "Filters for listing Kaggle datasets.",
  {
    sortBy: s.stringEnum("Dataset sort order.", ["hottest", "votes", "updated", "active", "published"]),
    fileType: s.stringEnum("Dataset file type filter.", ["all", "csv", "sqlite", "json", "bigQuery", "parquet"]),
    license: s.stringEnum("Dataset license family filter.", ["all", "cc", "gpl", "odb", "other"]),
    tagIds: s.stringArray("Tag identifiers to filter Kaggle datasets by.", {
      minItems: 1,
      itemDescription: "A Kaggle dataset tag identifier.",
    }),
    search,
    mine: s.boolean("Whether to return only datasets owned by the connected Kaggle account."),
    user: s.nonEmptyString("Kaggle username or organization slug to filter datasets by."),
    page: positivePage,
    maxSize: s.nonNegativeInteger("Maximum dataset size in bytes."),
    minSize: s.nonNegativeInteger("Minimum dataset size in bytes."),
  },
  {
    optional: ["sortBy", "fileType", "license", "tagIds", "search", "mine", "user", "page", "maxSize", "minSize"],
  },
);

const datasetsOutputSchema = s.object(
  "Kaggle datasets returned by the list endpoint.",
  {
    datasets: s.array("Dataset objects returned by Kaggle.", rawKaggleObject),
    nextPageToken: s.nonEmptyString("Token for retrieving the next Kaggle page when one is returned."),
  },
  { optional: ["nextPageToken"] },
);

const kernelsInputSchema = s.object(
  "Filters for listing Kaggle notebooks and scripts.",
  {
    mine: s.boolean("Whether to return only kernels owned by the connected Kaggle account."),
    page: positivePage,
    pageSize,
    search,
    parent: s.nonEmptyString("Parent kernel ref in owner/kernel-slug format."),
    competition: s.nonEmptyString("Competition slug used to filter kernels."),
    dataset: s.nonEmptyString("Dataset ref in owner/dataset-slug format."),
    user: s.nonEmptyString("Kaggle username to filter kernels by."),
    language: s.stringEnum("Kernel language filter.", ["all", "python", "r", "sqlite", "julia"]),
    kernelType: s.stringEnum("Kernel type filter.", ["all", "script", "notebook"]),
    outputType: s.stringEnum("Kernel output type filter.", ["all", "visualizations", "data"]),
    sortBy: s.stringEnum("Kernel sort order.", [
      "hotness",
      "commentCount",
      "dateCreated",
      "dateRun",
      "relevance",
      "scoreAscending",
      "scoreDescending",
      "viewCount",
      "voteCount",
    ]),
  },
  {
    optional: [
      "mine",
      "page",
      "pageSize",
      "search",
      "parent",
      "competition",
      "dataset",
      "user",
      "language",
      "kernelType",
      "outputType",
      "sortBy",
    ],
  },
);

const kernelsOutputSchema = s.object(
  "Kaggle kernels returned by the list endpoint.",
  {
    kernels: s.array("Kernel objects returned by Kaggle.", rawKaggleObject),
    nextPageToken: s.nonEmptyString("Token for retrieving the next Kaggle page when one is returned."),
  },
  { optional: ["nextPageToken"] },
);

const modelsInputSchema = s.object(
  "Filters for listing Kaggle models.",
  {
    owner: s.nonEmptyString("Kaggle username or organization slug to filter models by."),
    sortBy: s.stringEnum("Model sort order.", ["hotness", "downloadCount", "voteCount", "notebookCount", "createTime"]),
    search,
    pageSize,
    pageToken,
  },
  { optional: ["owner", "sortBy", "search", "pageSize", "pageToken"] },
);

const modelsOutputSchema = s.object(
  "Kaggle models returned by the list endpoint.",
  {
    models: s.array("Model objects returned by Kaggle.", rawKaggleObject),
    nextPageToken: s.nonEmptyString("Token for retrieving the next Kaggle page when one is returned."),
  },
  { optional: ["nextPageToken"] },
);

export const kaggleActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_competitions",
    description: "List Kaggle competitions with optional group, category, search, and pagination filters.",
    inputSchema: competitionsInputSchema,
    outputSchema: competitionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_datasets",
    description: "List Kaggle datasets with optional search, ownership, type, license, tag, and size filters.",
    inputSchema: datasetsInputSchema,
    outputSchema: datasetsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_kernels",
    description:
      "List Kaggle notebooks and scripts with optional search, source, language, type, and pagination filters.",
    inputSchema: kernelsInputSchema,
    outputSchema: kernelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_models",
    description: "List Kaggle models with optional owner, search, sort, and pagination filters.",
    inputSchema: modelsInputSchema,
    outputSchema: modelsOutputSchema,
  }),
];
