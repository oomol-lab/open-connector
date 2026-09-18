import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "asin_data_api";

const actionResultSchema = s.object(
  "The ASIN Data API action result.",
  {
    data: s.looseObject("The ASIN Data API response payload returned by the action."),
    error: s.string("Error if any occurred during the action execution."),
    successful: s.boolean("Whether the action execution was successful."),
  },
  { optional: ["error"] },
);

const requestIdSchema = s.nonEmptyString("Unique identifier of a collection request.");
const destinationIdSchema = s.nonEmptyString("The unique identifier of the destination.");
const pageSchema = s.integer("Page number for pagination, starting at 1.", { minimum: 1 });
const destinationSortBySchema = s.stringEnum("Sort criteria for destinations.", ["type", "name"]);
const destinationSortDirectionSchema = s.stringEnum("Sort order for destinations.", ["ascending", "descending"]);

const updateDestinationFields = {
  name: s.nonEmptyString("New name for the destination."),
  enabled: s.boolean("Whether the destination should be enabled or disabled."),
  oss_region_id: s.nonEmptyString("Alibaba Cloud OSS region ID."),
  gcs_access_key: s.nonEmptyString("Google Cloud Storage access key for GCS authentication."),
  gcs_secret_key: s.nonEmptyString("Google Cloud Storage secret key for GCS authentication."),
  oss_access_key: s.nonEmptyString("Alibaba Cloud OSS access key for OSS authentication."),
  oss_secret_key: s.nonEmptyString("Alibaba Cloud OSS secret key for OSS authentication."),
  s3_bucket_name: s.nonEmptyString("AWS S3 bucket name for S3-type destinations."),
  s3_path_prefix: s.nonEmptyString("Path prefix within the S3 bucket where files will be stored."),
  gcs_bucket_name: s.nonEmptyString("Google Cloud Storage bucket name for GCS destinations."),
  gcs_path_prefix: s.nonEmptyString("Path prefix within the GCS bucket."),
  oss_bucket_name: s.nonEmptyString("Alibaba Cloud OSS bucket name for OSS destinations."),
  oss_path_prefix: s.nonEmptyString("Path prefix within the OSS bucket."),
  s3_access_key_id: s.nonEmptyString("AWS access key ID for S3 authentication."),
  azure_account_key: s.nonEmptyString("Azure storage account key for Azure authentication."),
  azure_path_prefix: s.nonEmptyString("Path prefix within the Azure container."),
  azure_account_name: s.nonEmptyString("Azure storage account name for Azure destinations."),
  azure_container_name: s.nonEmptyString("Azure container name where files will be stored."),
  s3_secret_access_key: s.nonEmptyString("AWS secret access key for S3 authentication."),
};

const updateDestinationInputSchema = s.object(
  "Input parameters for updating an ASIN Data API destination.",
  {
    destination_id: destinationIdSchema,
    ...updateDestinationFields,
  },
  { required: ["destination_id"] },
);
updateDestinationInputSchema.anyOf = Object.keys(updateDestinationFields).map((field) => ({ required: [field] }));

export const asinDataApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "clear_collection_requests",
    operationType: "destructive",
    description: "Delete multiple requests from a collection by their request IDs in ASIN Data API.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for deleting multiple collection requests.", {
      request_ids: s.array(
        "Array of request ID strings to delete. Use list_collection_requests to get valid request IDs for a collection.",
        requestIdSchema,
        { minItems: 1 },
      ),
      collection_id: s.nonEmptyString(
        "Unique identifier of the collection to clear requests from. Use ASIN Data API collection listings to get valid collection IDs.",
      ),
    }),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_destination",
    operationType: "destructive",
    description: "Delete a destination from the ASIN Data API account.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for deleting an ASIN Data API destination.", {
      destination_id: s.nonEmptyString(
        "The unique identifier of the destination to delete. Can be obtained from the list_destinations action.",
      ),
    }),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_collection",
    operationType: "read",
    description: "Get details of a specific ASIN Data API collection including status and request counts.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting an ASIN Data API collection.", {
      collection_id: s.nonEmptyString(
        "Unique identifier of the collection to retrieve. Can be obtained from ASIN Data API collection listings.",
      ),
    }),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_collection_requests",
    operationType: "read",
    description: "List requests in an ASIN Data API collection by page.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing ASIN Data API collection requests.",
      {
        page: s.integer("Page number for pagination, starting at 1. Each page returns up to 1000 requests.", {
          minimum: 1,
        }),
        collection_id: s.nonEmptyString(
          "Unique identifier of the collection whose requests are to be listed. Can be obtained from ASIN Data API collection listings.",
        ),
      },
      { optional: ["page"] },
    ),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_destinations",
    operationType: "read",
    description: "List destinations configured on the ASIN Data API account with optional filtering and sorting.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing ASIN Data API destinations.",
      {
        page: pageSchema,
        sort_by: destinationSortBySchema,
        search_term: s.nonEmptyString("Filter destinations by name."),
        sort_direction: destinationSortDirectionSchema,
      },
      { optional: ["page", "sort_by", "search_term", "sort_direction"] },
    ),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "update_destination",
    operationType: "write",
    description: "Update an existing ASIN Data API destination configuration. Only include fields you want to update.",
    requiredScopes: [],
    inputSchema: updateDestinationInputSchema,
    outputSchema: actionResultSchema,
  }),
];
