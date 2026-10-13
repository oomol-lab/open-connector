import type { ShopifyActionHandler, ShopifyContext } from "./context.ts";

import { optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import {
  ProviderRequestError,
  runProviderRequest,
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
} from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";
import { readMutationResult, readNullableObject, readRequiredString } from "./runtime-common.ts";

const bulkResultDownloadTimeoutMs = 300_000;

const submitBulkQueryMutation = `mutation ShopifySubmitBulkQuery(
  $query: String!,
  $groupObjects: Boolean!
) {
  bulkOperationRunQuery(query: $query, groupObjects: $groupObjects) {
    bulkOperation {
      id
      status
      type
      createdAt
      completedAt
      errorCode
      objectCount
      rootObjectCount
      fileSize
      url
      partialDataUrl
      query
    }
    userErrors {
      code
      field
      message
    }
  }
}`;

const getBulkOperationQuery = `query ShopifyGetBulkOperation($id: ID!) {
  bulkOperation(id: $id) {
    id
    status
    type
    createdAt
    completedAt
    errorCode
    objectCount
    rootObjectCount
    fileSize
    url
    partialDataUrl
    query
  }
}`;

async function downloadShopifyBulkResult(input: Record<string, unknown>, context: ShopifyContext) {
  const transitFiles = context.transitFiles;
  if (!transitFiles) throw new ProviderRequestError(500, "Shopify bulk downloads require transit file storage");
  return runProviderRequest(
    { label: "Shopify bulk result download", signal: context.signal, timeoutMs: bulkResultDownloadTimeoutMs },
    async (signal) => {
      const response = await context.fetcher(requiredInputString(input.url, "url"), {
        signal,
        headers: {
          accept: "application/jsonl, application/x-ndjson, application/json, text/plain",
          "user-agent": providerUserAgent,
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderRequestError(
          response.status,
          `Shopify bulk result download failed with HTTP ${response.status}`,
          undefined,
          "provider_error",
        );
      }
      const name = optionalString(input.fileName) ?? "shopify-bulk-operation-result.jsonl";
      const mimeType =
        optionalString(response.headers.get("content-type"))?.split(";")[0]?.trim() || "application/x-ndjson";
      const file = await storeResponseInTransit(response, transitFiles, {
        name,
        mimeType,
        signal,
        fieldName: "Shopify bulk result",
        createError: (message) => new ProviderRequestError(502, message),
      });
      return { file };
    },
  );
}

function normalizeBulkOperation(raw: Record<string, unknown>) {
  return {
    id: readRequiredString(raw, "id"),
    status: readRequiredString(raw, "status"),
    type: readRequiredString(raw, "type"),
    createdAt: readRequiredString(raw, "createdAt"),
    completedAt: optionalString(raw.completedAt) ?? null,
    errorCode: optionalString(raw.errorCode) ?? null,
    objectCount: readUnsignedInt64(raw, "objectCount"),
    rootObjectCount: readUnsignedInt64(raw, "rootObjectCount"),
    fileSize: readOptionalUnsignedInt64(raw.fileSize),
    url: optionalString(raw.url) ?? null,
    partialDataUrl: optionalString(raw.partialDataUrl) ?? null,
    query: readRequiredString(raw, "query"),
    raw,
  };
}

function readUnsignedInt64(input: Record<string, unknown>, key: string) {
  const value = readOptionalUnsignedInt64(input[key]);
  if (value === null) {
    throw new ProviderRequestError(502, `shopify response is missing ${key}`);
  }
  return value;
}

function readOptionalUnsignedInt64(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  return null;
}

export const bulkHandlers: Record<string, ShopifyActionHandler> = {
  async submit_bulk_query(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: submitBulkQueryMutation,
      variables: {
        query: input.query,
        groupObjects: input.groupObjects ?? false,
      },
    });
    const result = readMutationResult(payload, "bulkOperationRunQuery");
    return {
      operation: normalizeBulkOperation(requiredResponseRecord(result.bulkOperation, "bulkOperation")),
    };
  },
  async get_bulk_operation(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getBulkOperationQuery,
      variables: {
        id: input.id,
      },
    });
    const operation = readNullableObject(requiredResponseRecord(payload.data, "data").bulkOperation, "bulkOperation");
    return {
      operation: operation ? normalizeBulkOperation(operation) : null,
    };
  },
  async download_bulk_result(input, context) {
    return downloadShopifyBulkResult(input, context);
  },
};
