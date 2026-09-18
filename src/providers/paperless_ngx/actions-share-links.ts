import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { extendObject } from "./schemas.ts";
import {
  additionalFiltersInputField,
  deletedOutputSchema,
  idArrayField,
  idField,
  pageInputFields,
  paginatedOutputSchema,
  shareLinkSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const fileVersionValues = ["archive", "original"];
const fileVersionDescription =
  "Which file the link serves: archive (the archived PDF, falling back to the original when none exists) or original. Defaults to archive.";

const shareUrlField = s.string(
  "Public URL of the share, derived by the connector as <instance>/share/<slug>. Anyone holding it can download the file without logging in until expiration.",
);

function dateTimeFilterInputFields(field: string, label: string): Record<string, JsonSchema> {
  return {
    [`${field}__year`]: s.integer(`Only entries whose ${label} falls in this year.`),
    [`${field}__month`]: s.integer(`Only entries whose ${label} falls in this month (1-12).`, {
      minimum: 1,
      maximum: 12,
    }),
    [`${field}__day`]: s.integer(`Only entries whose ${label} falls on this day of month (1-31).`, {
      minimum: 1,
      maximum: 31,
    }),
    [`${field}__gt`]: s.dateTime(`Only entries whose ${label} is after this ISO 8601 timestamp.`),
    [`${field}__gte`]: s.dateTime(`Only entries whose ${label} is at or after this ISO 8601 timestamp.`),
    [`${field}__lt`]: s.dateTime(`Only entries whose ${label} is before this ISO 8601 timestamp.`),
    [`${field}__lte`]: s.dateTime(`Only entries whose ${label} is at or before this ISO 8601 timestamp.`),
    [`${field}__date__gt`]: s.date(`Only entries whose ${label} date is after this YYYY-MM-DD date.`),
    [`${field}__date__gte`]: s.date(`Only entries whose ${label} date is on or after this YYYY-MM-DD date.`),
    [`${field}__date__lt`]: s.date(`Only entries whose ${label} date is before this YYYY-MM-DD date.`),
    [`${field}__date__lte`]: s.date(`Only entries whose ${label} date is on or before this YYYY-MM-DD date.`),
  };
}

function orderingField(fields: readonly string[]): JsonSchema {
  return s.nonEmptyString(
    `Field to order by, prefixed with - for descending order. Accepted fields: ${fields.join(", ")}.`,
  );
}

export const shareLinkDetailSchema: JsonSchema = extendObject(
  "A Paperless-ngx share link.",
  shareLinkSchema,
  { share_url: shareUrlField },
  { optional: ["share_url"] },
);

const shareLinkListInputFields = {
  page: pageInputFields.page,
  page_size: pageInputFields.page_size,
  ordering: orderingField(["created", "expiration", "document"]),
  ...dateTimeFilterInputFields("created", "creation time"),
  ...dateTimeFilterInputFields("expiration", "expiration time"),
  additional_filters: additionalFiltersInputField,
};

const shareLinkIdField = idField("The share link id.");

const bundleStatusValues = ["pending", "processing", "ready", "failed"];
const bundleStatusDescription =
  "Build status of the zip archive: pending (queued), processing (being built), ready (downloadable) or failed (see last_error).";

export const shareLinkBundleSchema: JsonSchema = s.looseObject(
  "A Paperless-ngx share link bundle: one public link that serves a zip archive of several documents.",
  {
    id: s.integer("The bundle id."),
    created: s.string("ISO 8601 creation timestamp."),
    expiration: s.nullableString("ISO 8601 expiration timestamp, or null when the bundle never expires."),
    slug: s.string("Slug that forms the public URL <instance>/share/<slug>."),
    file_version: s.string("Which file version is packed for each document: archive or original."),
    status: s.string(bundleStatusDescription),
    size_bytes: s.nullableInteger("Size of the built zip archive in bytes, or null until built."),
    last_error: s.unknown("Details of the last failed build, or null when the build succeeded."),
    built_at: s.nullableString("ISO 8601 timestamp of the last successful build, or null."),
    documents: s.array("Ids of the documents in the bundle.", s.integer("A document id.")),
    document_count: s.integer("Number of documents in the bundle."),
    share_url: shareUrlField,
  },
);

const bundleListInputFields = {
  page: pageInputFields.page,
  page_size: pageInputFields.page_size,
  ordering: orderingField(["created", "expiration", "status"]),
  status: s.stringEnum(`Only bundles in this status. ${bundleStatusDescription}`, bundleStatusValues),
  documents: idArrayField("Only bundles containing at least one of these document ids.", "A document id."),
  ...dateTimeFilterInputFields("created", "creation time"),
  ...dateTimeFilterInputFields("expiration", "expiration time"),
  additional_filters: additionalFiltersInputField,
};

const bundleIdField = idField("The share link bundle id.");

const bundleFollowUp = "paperless_ngx.get_share_link_bundle";

export const paperlessNgxShareLinkActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_share_links",
    operationType: "read",
    description:
      "List share links visible to the connected user (own links plus links shared with them), with optional creation and expiration time filters. Each result carries share_url, the public download URL. Requires the view_sharelink permission.",
    requiredScopes: [],
    inputSchema: s.object("Filters and pagination for the share link list.", shareLinkListInputFields, {
      optional: Object.keys(shareLinkListInputFields),
    }),
    outputSchema: paginatedOutputSchema("A page of share links.", shareLinkDetailSchema),
  }),
  defineProviderAction(service, {
    name: "get_share_link",
    operationType: "read",
    description:
      "Get one share link by id, including its public share_url. Requires the view_sharelink permission and access to the link.",
    requiredScopes: [],
    inputSchema: s.object("The share link to read.", { id: shareLinkIdField }),
    outputSchema: shareLinkDetailSchema,
  }),
  defineProviderAction(service, {
    name: "create_share_link",
    operationType: "write",
    description:
      "Create a public share link for one document. The link is owned by the connected user, who must be allowed to view the document. The response includes slug and the derived share_url; share links cannot be edited afterwards, so delete and recreate to change the expiration or file version. Requires the add_sharelink permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The share link to create.",
      {
        document: idField("Id of the document to share."),
        file_version: s.stringEnum(fileVersionDescription, fileVersionValues),
        expiration: s.nullable(
          s.dateTime(
            "ISO 8601 timestamp after which the link stops working, or null for no expiration. Defaults to null.",
          ),
        ),
      },
      { optional: ["file_version", "expiration"] },
    ),
    outputSchema: shareLinkDetailSchema,
  }),
  defineProviderAction(service, {
    name: "delete_share_link",
    operationType: "destructive",
    description:
      "Delete a share link so its public URL stops working. Requires the delete_sharelink permission and ownership of the link (or superuser).",
    requiredScopes: [],
    inputSchema: s.object("The share link to delete.", { id: shareLinkIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted share link."),
  }),

  defineProviderAction(service, {
    name: "list_share_link_bundles",
    operationType: "read",
    description:
      "List share link bundles visible to the connected user, filterable by status, contained documents and creation or expiration time. Each result carries share_url and the build status. Requires the view_sharelinkbundle permission.",
    requiredScopes: [],
    inputSchema: s.object("Filters and pagination for the bundle list.", bundleListInputFields, {
      optional: Object.keys(bundleListInputFields),
    }),
    outputSchema: paginatedOutputSchema("A page of share link bundles.", shareLinkBundleSchema),
  }),
  defineProviderAction(service, {
    name: "get_share_link_bundle",
    operationType: "read",
    description:
      "Get one share link bundle by id, including its build status, size and public share_url. Use it to poll a bundle after create_share_link_bundle or rebuild_share_link_bundle until status is ready. Requires the view_sharelinkbundle permission.",
    requiredScopes: [],
    inputSchema: s.object("The bundle to read.", { id: bundleIdField }),
    outputSchema: shareLinkBundleSchema,
  }),
  defineProviderAction(service, {
    name: "create_share_link_bundle",
    operationType: "write",
    description:
      "Create a share link bundle: one public link serving a zip archive of several documents. The connected user must be allowed to view every document and duplicate ids are rejected. The zip is built by a background task, so the bundle is returned with status pending; poll get_share_link_bundle until it is ready. Bundles cannot be edited afterwards. Requires the add_sharelinkbundle permission.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "paperless_ngx.create_share_link_bundle",
      statusActionId: "paperless_ngx.get_share_link_bundle",
    },
    followUpActions: [bundleFollowUp],
    inputSchema: s.object(
      "The bundle to create.",
      {
        document_ids: s.array(
          "Ids of the documents to pack, in archive order. At least one, without duplicates.",
          idField("A document id."),
          { minItems: 1, uniqueItems: true },
        ),
        file_version: s.stringEnum(fileVersionDescription, fileVersionValues),
        expiration_days: s.nullableInteger(
          "Number of days from now after which the bundle expires (at least 1), or null for no expiration. Defaults to null.",
          { minimum: 1 },
        ),
      },
      { optional: ["file_version", "expiration_days"] },
    ),
    outputSchema: shareLinkBundleSchema,
  }),
  defineProviderAction(service, {
    name: "rebuild_share_link_bundle",
    operationType: "write",
    description:
      "Discard the built zip archive of a share link bundle and queue it for rebuilding, for example after its documents changed. The bundle is returned with status pending; Paperless-ngx rejects the request with 400 while a build is still processing. Requires the change_sharelinkbundle permission.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "paperless_ngx.rebuild_share_link_bundle",
      statusActionId: "paperless_ngx.get_share_link_bundle",
    },
    followUpActions: [bundleFollowUp],
    inputSchema: s.object("The bundle to rebuild.", { id: bundleIdField }),
    outputSchema: shareLinkBundleSchema,
  }),
  defineProviderAction(service, {
    name: "delete_share_link_bundle",
    operationType: "destructive",
    description:
      "Delete a share link bundle and its zip archive so the public URL stops working. Requires the delete_sharelinkbundle permission and ownership of the bundle (or superuser).",
    requiredScopes: [],
    inputSchema: s.object("The bundle to delete.", { id: bundleIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted share link bundle."),
  }),
];
