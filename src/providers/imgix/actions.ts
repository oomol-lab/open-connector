import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "imgix";

const sourceResourceSchema = s.looseRequiredObject("An Imgix Source resource returned by the Management API.", {
  id: s.string("The unique Imgix Source identifier."),
  type: s.string("The JSON:API resource type returned by Imgix."),
  attributes: s.looseObject("The Source attributes returned by Imgix."),
});

const paginationMetaSchema = s.looseObject("Pagination metadata returned by Imgix for list endpoints.", {
  currentPage: s.integer("The current zero-indexed page number."),
  pageSize: s.integer("The page size returned by Imgix."),
  totalPages: s.integer("The total number of available pages."),
  totalRecords: s.integer("The total number of matching records."),
  hasNextPage: s.boolean("Whether another page is available."),
  hasPreviousPage: s.boolean("Whether a previous page is available."),
  nextPage: s.nullable(s.integer("The next page number when available.")),
  previousPage: s.nullable(s.integer("The previous page number when available.")),
});

const jsonApiObjectSchema = s.looseObject("The JSON:API metadata object returned by Imgix.");
const looseAttributesSchema = s.looseObject(
  "Source attributes to send to Imgix. Use the official Imgix Source attribute keys for the selected source type.",
);

const listSourcesInputSchema = s.object(
  "Input parameters for listing Imgix Sources.",
  {
    sort: s.string("Comma-separated sort fields accepted by Imgix, such as -date_deployed,name.", {
      minLength: 1,
    }),
    pageSize: s.positiveInteger("Number of Sources to return per page."),
    pageNumber: s.nonNegativeInteger("Zero-indexed page number to fetch."),
    fieldsSources: s.string("Comma-separated Source fields to return through the fields[sources] sparse fieldset.", {
      minLength: 1,
    }),
    filterName: s.string("Filter Sources by name.", { minLength: 1 }),
    filterEnabled: s.boolean("Filter Sources by enabled status."),
    filterDeploymentType: s.stringEnum("Filter Sources by deployment type.", [
      "azure",
      "gcs",
      "s3",
      "webfolder",
      "webproxy",
      "s3_compatible",
    ]),
    filterDeploymentRegion: s.string("Filter S3-compatible Sources by deployment region.", {
      minLength: 1,
    }),
    filterDeploymentS3Bucket: s.string("Filter Sources by S3 bucket name.", { minLength: 1 }),
    filterDeploymentGcsBucket: s.string("Filter Sources by GCS bucket name.", { minLength: 1 }),
    filterDeploymentBucketName: s.string("Filter S3-compatible Sources by deployment bucket name.", {
      minLength: 1,
    }),
    filterDeploymentAzureBucket: s.string("Filter Sources by Azure container name.", {
      minLength: 1,
    }),
    filterDeploymentCustomDomains: s.string("Filter Sources by custom domain.", {
      minLength: 1,
    }),
    filterDeploymentImgixSubdomains: s.string("Filter Sources by Imgix subdomain.", {
      minLength: 1,
    }),
    filterDeploymentStorageProvider: s.string("Filter S3-compatible Sources by storage provider.", {
      minLength: 1,
    }),
    filterDeploymentWebfolderBaseUrl: s.string("Filter Web Folder Sources by deployment base URL.", {
      minLength: 1,
    }),
  },
  {
    optional: [
      "sort",
      "pageSize",
      "pageNumber",
      "fieldsSources",
      "filterName",
      "filterEnabled",
      "filterDeploymentType",
      "filterDeploymentRegion",
      "filterDeploymentS3Bucket",
      "filterDeploymentGcsBucket",
      "filterDeploymentBucketName",
      "filterDeploymentAzureBucket",
      "filterDeploymentCustomDomains",
      "filterDeploymentImgixSubdomains",
      "filterDeploymentStorageProvider",
      "filterDeploymentWebfolderBaseUrl",
    ],
  },
);

const sourceIdInputFields = {
  sourceId: s.string("The unique Imgix Source identifier.", { minLength: 1 }),
  fieldsSources: s.string("Comma-separated Source fields to return through the fields[sources] sparse fieldset.", {
    minLength: 1,
  }),
};

const sourceResponseSchema = s.object("The normalized Imgix Source response.", {
  source: sourceResourceSchema,
  meta: s.nullable(s.looseObject("Response metadata returned by Imgix.")),
  jsonapi: s.nullable(jsonApiObjectSchema),
});

export const imgixActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sources",
    description: "List Imgix Sources with optional pagination, sorting, sparse fields, and source filters.",
    inputSchema: listSourcesInputSchema,
    outputSchema: s.object("The normalized Imgix Sources list response.", {
      sources: s.array("The Sources returned by Imgix.", sourceResourceSchema),
      meta: s.nullable(
        s.looseObject("Response metadata returned by Imgix.", {
          pagination: paginationMetaSchema,
        }),
      ),
      jsonapi: s.nullable(jsonApiObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_source",
    description: "Retrieve a single Imgix Source by its ID.",
    inputSchema: s.object("Input parameters for retrieving an Imgix Source.", sourceIdInputFields, {
      optional: ["fieldsSources"],
    }),
    outputSchema: sourceResponseSchema,
  }),
  defineProviderAction(service, {
    name: "update_source",
    description: "Update an Imgix Source by sending JSON:API Source attributes to the Management API.",
    inputSchema: s.object("Input parameters for updating an Imgix Source.", {
      sourceId: sourceIdInputFields.sourceId,
      attributes: looseAttributesSchema,
    }),
    outputSchema: sourceResponseSchema,
  }),
  defineProviderAction(service, {
    name: "purge_asset",
    description: "Purge an Imgix asset URL from cache so subsequent requests fetch a fresh origin copy.",
    inputSchema: s.object(
      "Input parameters for purging an Imgix asset.",
      {
        url: s.url("The full Imgix asset URL to purge."),
        sourceId: s.string("Optional Imgix Source ID used to scope the purge.", { minLength: 1 }),
        subImage: s.boolean("Whether to purge only sub-images or variants of the asset."),
      },
      { optional: ["sourceId", "subImage"] },
    ),
    outputSchema: s.object("The normalized Imgix purge response.", {
      purge: s.looseRequiredObject("The purge resource returned by Imgix.", {
        id: s.string("The purge request identifier."),
        type: s.string("The JSON:API resource type returned by Imgix."),
        attributes: s.looseObject("Purge attributes returned by Imgix."),
      }),
      jsonapi: s.nullable(jsonApiObjectSchema),
    }),
  }),
];
