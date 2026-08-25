import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kobotoolbox";

const assetUidSchema = s.nonEmptyString("The KoboToolbox asset UID.");
const submissionIdSchema = s.nonEmptyString("The submission numeric ID, UUID, or root UUID accepted by KoboToolbox.");

const assetSchema = s.looseRequiredObject(
  "A KoboToolbox project or library asset with provider-defined nested content.",
  {
    uid: s.nonEmptyString("The asset UID."),
    name: s.string("The asset name."),
    asset_type: s.string("The KoboToolbox asset type."),
    date_created: s.optional(s.dateTime("When the asset was created.")),
    date_modified: s.optional(s.dateTime("When the asset was last modified.")),
    date_deployed: s.optional(s.nullable(s.dateTime("When the asset was last deployed."))),
    deployment_status: s.optional(s.string("The current asset deployment status.")),
    has_deployment: s.optional(s.boolean("Whether the asset has been deployed.")),
  },
  {
    optional: ["date_created", "date_modified", "date_deployed", "deployment_status", "has_deployment"],
  },
);

const submissionSchema = s.looseObject("A KoboToolbox submission including form-defined answer fields.", {
  _id: s.optional(s.integer("The numeric submission ID.")),
  _uuid: s.optional(s.string("The submission UUID.")),
  _submission_time: s.optional(s.dateTime("When the submission was received.")),
  _submitted_by: s.optional(s.nullable(s.string("The username that submitted the record, or null when anonymous."))),
  _status: s.optional(s.string("The submission status.")),
});

const exportSchema = s.looseRequiredObject(
  "A KoboToolbox asynchronous export task.",
  {
    uid: s.nonEmptyString("The export task UID."),
    status: s.nonEmptyString("The export task status."),
    result: s.optional(s.nullable(s.string("The generated export file URL when processing is complete."))),
    date_created: s.optional(s.dateTime("When the export task was created.")),
    last_submission_time: s.optional(s.nullable(s.dateTime("The latest submission time included in the export."))),
    message: s.optional(s.unknown("Provider-defined export progress or error details.")),
  },
  { optional: ["result", "date_created", "last_submission_time", "message"] },
);

const queryObjectSchema = s.record(
  "A Mongo-style KoboToolbox query object.",
  s.unknown("A provider-defined query value."),
);

export const koboToolboxActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_assets",
    description: "List KoboToolbox projects and library assets visible to the connected account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing KoboToolbox assets.",
      {
        query: s.nonEmptyString("A KoboToolbox asset search expression for the `q` parameter."),
        ordering: s.nonEmptyString(
          "The KoboToolbox field used to order assets, optionally prefixed with a minus sign.",
        ),
        limit: s.integer("The maximum number of assets to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        start: s.integer("The zero-based result index to start from.", { minimum: 0 }),
      },
      { optional: ["query", "ordering", "limit", "start"] },
    ),
    outputSchema: s.object("The paginated KoboToolbox asset list.", {
      assets: s.array("Assets returned by KoboToolbox.", assetSchema),
      count: s.nonNegativeInteger("The total number of matching assets."),
      nextUrl: s.nullable(s.url("The next result page URL when available.")),
      previousUrl: s.nullable(s.url("The previous result page URL when available.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_asset",
    description: "Retrieve one KoboToolbox project or library asset by UID.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox asset to retrieve.", {
      assetUid: assetUidSchema,
    }),
    outputSchema: s.object("The KoboToolbox asset response.", { asset: assetSchema }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a new draft KoboToolbox survey project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The draft KoboToolbox project to create.",
      {
        name: s.nonEmptyString("The project name.", { maxLength: 255 }),
        description: s.string("The project description."),
        sector: s.string("The project sector value used by KoboToolbox."),
        country: s.string("The project country value used by KoboToolbox."),
        shareMetadata: s.boolean("Whether KoboToolbox may share the project metadata."),
      },
      { optional: ["description", "sector", "country", "shareMetadata"] },
    ),
    outputSchema: s.object("The created KoboToolbox project.", { asset: assetSchema }),
  }),
  defineProviderAction(service, {
    name: "clone_project",
    description: "Clone an existing KoboToolbox asset into a new survey project.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox asset clone request.", {
      sourceAssetUid: s.nonEmptyString("The UID of the asset to clone."),
      name: s.nonEmptyString("The name for the cloned project.", { maxLength: 255 }),
    }),
    outputSchema: s.object("The cloned KoboToolbox project.", { asset: assetSchema }),
  }),
  defineProviderAction(service, {
    name: "deploy_project",
    description: "Deploy or redeploy the current form version for a KoboToolbox project.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox project to deploy.", {
      assetUid: assetUidSchema,
    }),
    outputSchema: s.object("The KoboToolbox deployment response.", {
      deployment: s.looseRequiredObject("The deployed KoboToolbox form version.", {
        active: s.boolean("Whether the deployment is active."),
        version_id: s.nonEmptyString("The deployed form version UID."),
        asset: assetSchema,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    description: "List form submissions for a KoboToolbox project.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing KoboToolbox submissions.",
      {
        assetUid: assetUidSchema,
        query: queryObjectSchema,
        sort: s.record(
          'A KoboToolbox sort object such as `{"_id": -1}`.',
          s.anyOf("The sort direction for one submission field.", [
            s.literal(1, { description: "Sort the field in ascending order." }),
            s.literal(-1, { description: "Sort the field in descending order." }),
          ]),
        ),
        fields: s.array("The form field names to include in each submission.", s.nonEmptyString("A form field name.")),
        limit: s.integer("The maximum number of submissions to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        start: s.integer("The zero-based result index to start from.", { minimum: 0 }),
      },
      { optional: ["query", "sort", "fields", "limit", "start"] },
    ),
    outputSchema: s.object("The paginated KoboToolbox submission list.", {
      submissions: s.array("Submissions returned by KoboToolbox.", submissionSchema),
      count: s.nonNegativeInteger("The total number of matching submissions."),
      nextUrl: s.nullable(s.url("The next result page URL when available.")),
      previousUrl: s.nullable(s.url("The previous result page URL when available.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    description: "Retrieve one KoboToolbox form submission by ID or UUID.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox submission to retrieve.", {
      assetUid: assetUidSchema,
      submissionId: submissionIdSchema,
    }),
    outputSchema: s.object("The KoboToolbox submission response.", {
      submission: submissionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "set_submission_validation",
    description: "Replace the validation status of one KoboToolbox submission.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox submission validation update.", {
      assetUid: assetUidSchema,
      submissionId: submissionIdSchema,
      status: s.stringEnum("The new KoboToolbox validation status.", [
        "validation_status_approved",
        "validation_status_not_approved",
        "validation_status_on_hold",
      ]),
    }),
    outputSchema: s.object("The updated KoboToolbox validation status.", {
      validation: s.looseRequiredObject("The recorded validation status.", {
        uid: s.nonEmptyString("The validation status UID."),
        label: s.string("The human-readable validation status label."),
        timestamp: s.dateTime("When the validation status was updated."),
        by_whom: s.string("The KoboToolbox user that updated the status."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_submission",
    description: "Permanently delete one KoboToolbox form submission.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox submission to delete.", {
      assetUid: assetUidSchema,
      submissionId: submissionIdSchema,
    }),
    outputSchema: s.object("The KoboToolbox submission deletion result.", {
      deleted: s.boolean("Whether KoboToolbox accepted the deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "start_export",
    description: "Start an asynchronous KoboToolbox submission data export.",
    requiredScopes: [],
    inputSchema: s.object(
      "The KoboToolbox export settings.",
      {
        assetUid: assetUidSchema,
        format: s.stringEnum("The export file format.", ["csv", "geojson", "spss_labels", "xls"]),
        fields: s.array(
          "The XML field names to include, or an empty array for every field.",
          s.nonEmptyString("An XML form field name."),
        ),
        fieldsFromAllVersions: s.boolean("Whether to include fields from every deployed form version."),
        groupSeparator: s.nonEmptyString("The separator used between nested group names."),
        hierarchyInLabels: s.boolean("Whether labels include their group hierarchy."),
        includeMediaUrls: s.boolean("Whether CSV and XLS exports include hosted media URLs."),
        language: s.nonEmptyString("The form translation label to export, or `_xml` for XML names and values."),
        multipleSelect: s.stringEnum("How multiple-select answers are represented.", ["both", "summary", "details"]),
        submissionIds: s.array(
          "The numeric submission IDs to include, or an empty array for all submissions.",
          s.positiveInteger("A numeric submission ID."),
        ),
        query: queryObjectSchema,
        flatten: s.boolean("Whether GeoJSON output is flattened."),
        xlsTypesAsText: s.boolean("Whether XLS values are exported as text."),
      },
      {
        optional: [
          "fields",
          "fieldsFromAllVersions",
          "groupSeparator",
          "hierarchyInLabels",
          "includeMediaUrls",
          "language",
          "multipleSelect",
          "submissionIds",
          "query",
          "flatten",
          "xlsTypesAsText",
        ],
      },
    ),
    outputSchema: s.object("The queued KoboToolbox export task.", {
      export: exportSchema,
      exportHandle: s.nonEmptyString(
        "An opaque handle containing the project and export identifiers for status polling.",
      ),
    }),
    followUpActions: ["kobotoolbox.get_export"],
    asyncLifecycle: {
      startActionId: "kobotoolbox.start_export",
      statusActionId: "kobotoolbox.get_export",
    },
  }),
  defineProviderAction(service, {
    name: "get_export",
    description: "Get the status and download URL of a KoboToolbox export task.",
    requiredScopes: [],
    inputSchema: s.object("The KoboToolbox export task to retrieve.", {
      exportHandle: s.nonEmptyString("The opaque handle returned by start_export."),
    }),
    outputSchema: s.object("The KoboToolbox export task response.", { export: exportSchema }),
    asyncLifecycle: {
      startActionId: "kobotoolbox.start_export",
      statusActionId: "kobotoolbox.get_export",
    },
  }),
];
