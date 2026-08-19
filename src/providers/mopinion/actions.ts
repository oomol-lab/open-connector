import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mopinion";

const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");
const optionalPositiveIntegerSchema = s.positiveInteger("The collection page number to retrieve.");
const limitSchema = s.integer("The maximum number of items to return in one page.", { minimum: 1, maximum: 1000 });

const listPageProperties = {
  page: optionalPositiveIntegerSchema,
  limit: limitSchema,
};

const feedbackFilterValueSchema = s.union(
  [
    s.string("A string feedback filter value."),
    s.number("A numeric feedback filter value."),
    s.boolean("A boolean feedback filter value."),
  ],
  { description: "A Mopinion feedback filter value." },
);

const feedbackListProperties = {
  ...listPageProperties,
  sort: s.stringEnum("The Mopinion feedback sort field.", ["created", "datetime"]),
  order: s.stringEnum("The Mopinion feedback sort order.", ["asc", "desc"]),
  filters: s.record(
    "Mopinion feedback filters serialized as filter[key]=value query parameters.",
    feedbackFilterValueSchema,
  ),
};

const reportIdInputSchema = s.actionInput(
  {
    reportId: s.nonEmptyString("The Mopinion report identifier."),
  },
  ["reportId"],
  "Input parameters for retrieving one Mopinion report.",
);

const datasetIdInputSchema = s.actionInput(
  {
    datasetId: s.nonEmptyString("The Mopinion dataset identifier."),
  },
  ["datasetId"],
  "Input parameters for retrieving one Mopinion dataset.",
);

const deploymentIdInputSchema = s.actionInput(
  {
    deploymentId: s.nonEmptyString("The Mopinion deployment identifier."),
  },
  ["deploymentId"],
  "Input parameters for retrieving one Mopinion deployment.",
);

const metadataSchema = s.looseObject("Mopinion response metadata when the API includes it.", {
  code: s.integer("The upstream HTTP status code."),
  message: s.string("The upstream status message."),
  has_more: s.boolean("Whether more results are available."),
  previous: s.union([s.string("The previous page URI."), s.boolean("False when there is no previous page.")], {
    description: "The previous page URI or false when there is no previous page.",
  }),
  next: s.union([s.string("The next page URI."), s.boolean("False when there is no next page.")], {
    description: "The next page URI or false when there is no next page.",
  }),
  count: s.integer("The number of items in the response."),
  total: s.integer("The total number of available items."),
});

const reportSchema = s.looseObject("A Mopinion report object.", {
  id: s.integer("The Mopinion report identifier."),
  name: s.string("The Mopinion report name."),
  description: s.string("The Mopinion report description."),
  language: s.string("The Mopinion report language."),
  created: s.string("The Mopinion report creation date."),
});

const datasetSchema = s.looseObject("A Mopinion dataset object.", {
  id: s.integer("The Mopinion dataset identifier."),
  name: s.nullableString("The Mopinion dataset name."),
  report_id: s.integer("The parent Mopinion report identifier."),
  description: s.string("The Mopinion dataset description."),
  data_source: s.string("The Mopinion dataset source type."),
});

const accountSchema = s.looseObject("The Mopinion account object.", {
  name: s.string("The Mopinion account name."),
  package: s.string("The Mopinion account package."),
  enddate: s.string("The current Mopinion package end date."),
  number_users: s.integer("The number of users allowed."),
  number_charts: s.integer("The number of charts allowed."),
  number_forms: s.integer("The number of forms allowed."),
  number_reports: s.integer("The number of reports allowed."),
  reports: s.array("The reports included in the account.", reportSchema),
  _meta: metadataSchema,
});

const deploymentSchema = s.looseObject("A Mopinion deployment object.", {
  key: s.string("The Mopinion deployment key."),
  id: s.string("The Mopinion deployment identifier."),
  name: s.string("The Mopinion deployment name."),
  domain: s.string("The domain configured for the deployment."),
  org_id: s.integer("The Mopinion organization identifier."),
  rules: s.array("The deployment rules returned by Mopinion.", s.string("One deployment rule.")),
});

const feedbackSchema = s.looseObject(
  "A Mopinion feedback object including any dynamic answer fields returned by the API.",
  {
    id: s.integer("The Mopinion feedback identifier."),
    created: s.string("The feedback creation timestamp."),
    report_id: s.integer("The parent Mopinion report identifier."),
    dataset_id: s.integer("The parent Mopinion dataset identifier."),
    tags: s.array("The tags assigned to the feedback item.", s.string("One feedback tag.")),
  },
);

const fieldSchema = s.looseObject("A Mopinion report or dataset field object.", {
  report_id: s.integer("The parent Mopinion report identifier."),
  dataset_id: s.integer("The parent Mopinion dataset identifier."),
  label: s.string("The Mopinion field label."),
  short_label: s.string("The Mopinion field short label."),
  key: s.string("The Mopinion field key."),
  type: s.string("The Mopinion field type."),
  answer_values: s.nullable(s.unknown("The answer values defined for this field.")),
  answer_options: s.nullable(s.unknown("The answer options defined for this field.")),
  group_key: s.nullableString("The Mopinion field group key."),
});

export const mopinionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Fetch the current Mopinion account profile and available account limits.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        account: accountSchema,
      },
      "The output payload for retrieving the current Mopinion account.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_report",
    description: "Fetch basic metadata for one Mopinion report.",
    inputSchema: reportIdInputSchema,
    outputSchema: s.actionOutput(
      {
        report: reportSchema,
      },
      "The output payload for retrieving one Mopinion report.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dataset",
    description: "Fetch basic metadata for one Mopinion dataset or feedback form.",
    inputSchema: datasetIdInputSchema,
    outputSchema: s.actionOutput(
      {
        dataset: datasetSchema,
      },
      "The output payload for retrieving one Mopinion dataset.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    description: "List Mopinion deployments for the connected account.",
    inputSchema: s.actionInput(listPageProperties, [], "Pagination options for a Mopinion collection endpoint."),
    outputSchema: s.actionOutput(
      {
        deployments: s.array("The Mopinion deployments.", deploymentSchema),
        meta: s.nullable(metadataSchema),
      },
      "The output payload for listing Mopinion deployments.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    description: "Fetch one Mopinion deployment by deployment identifier.",
    inputSchema: deploymentIdInputSchema,
    outputSchema: s.actionOutput(
      {
        deployment: deploymentSchema,
      },
      "The output payload for retrieving one Mopinion deployment.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_dataset_feedback",
    description: "List feedback items collected by one Mopinion dataset or feedback form.",
    inputSchema: s.actionInput(
      {
        datasetId: s.nonEmptyString("The Mopinion dataset identifier."),
        ...feedbackListProperties,
      },
      ["datasetId"],
      "Input parameters for listing feedback from one Mopinion dataset.",
    ),
    outputSchema: s.actionOutput(
      {
        feedback: s.array("The Mopinion feedback items.", feedbackSchema),
        meta: s.nullable(metadataSchema),
      },
      "The output payload for listing Mopinion dataset feedback.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dataset_feedback",
    description: "Fetch one feedback item from a Mopinion dataset or feedback form.",
    inputSchema: s.actionInput(
      {
        datasetId: s.nonEmptyString("The Mopinion dataset identifier."),
        feedbackId: s.nonEmptyString("The Mopinion feedback identifier."),
      },
      ["datasetId", "feedbackId"],
      "Input parameters for retrieving one Mopinion dataset feedback item.",
    ),
    outputSchema: s.actionOutput(
      {
        feedback: feedbackSchema,
      },
      "The output payload for retrieving one Mopinion dataset feedback item.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_report_feedback",
    description: "List feedback items available through one Mopinion report.",
    inputSchema: s.actionInput(
      {
        reportId: s.nonEmptyString("The Mopinion report identifier."),
        ...feedbackListProperties,
      },
      ["reportId"],
      "Input parameters for listing feedback from one Mopinion report.",
    ),
    outputSchema: s.actionOutput(
      {
        feedback: s.array("The Mopinion feedback items.", feedbackSchema),
        meta: s.nullable(metadataSchema),
      },
      "The output payload for listing Mopinion report feedback.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_report_feedback",
    description: "Fetch one feedback item from a Mopinion report.",
    inputSchema: s.actionInput(
      {
        reportId: s.nonEmptyString("The Mopinion report identifier."),
        feedbackId: s.nonEmptyString("The Mopinion feedback identifier."),
      },
      ["reportId", "feedbackId"],
      "Input parameters for retrieving one Mopinion report feedback item.",
    ),
    outputSchema: s.actionOutput(
      {
        feedback: feedbackSchema,
      },
      "The output payload for retrieving one Mopinion report feedback item.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_dataset_fields",
    description: "List the field definitions configured for one Mopinion dataset.",
    inputSchema: datasetIdInputSchema,
    outputSchema: s.actionOutput(
      {
        fields: s.array("The Mopinion dataset fields.", fieldSchema),
        meta: s.nullable(metadataSchema),
      },
      "The output payload for listing Mopinion dataset fields.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_report_fields",
    description: "List the field definitions configured for one Mopinion report.",
    inputSchema: reportIdInputSchema,
    outputSchema: s.actionOutput(
      {
        fields: s.array("The Mopinion report fields.", fieldSchema),
        meta: s.nullable(metadataSchema),
      },
      "The output payload for listing Mopinion report fields.",
    ),
  }),
];
