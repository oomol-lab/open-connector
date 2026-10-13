import type { ShopifyActionHandler } from "./context.ts";

import { optionalRecord } from "../../core/cast.ts";
import { ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";
import { operations } from "./operation-definitions.ts";
import { readMutationUserErrors } from "./runtime-common.ts";

export const operationHandlers: Record<string, ShopifyActionHandler> = Object.fromEntries(
  operations.map((operation) => [
    operation.name,
    async (input, context) => {
      const variables = { ...input };
      const properties = operation.inputSchema.properties as Record<string, unknown>;
      if ("first" in properties && variables.first == null && variables.last == null) variables.first = 50;
      const payload = await requestShopifyGraphQL(context, context.fetcher, {
        query: operation.query,
        variables,
      });
      const data = requiredResponseRecord(payload.data, "Shopify data");
      const value = data[operation.field];
      if (value === undefined) throw new ProviderRequestError(502, `Shopify response is missing ${operation.field}`);
      const record = optionalRecord(value);
      const errors = [
        ...readMutationUserErrors(record?.userErrors),
        ...readMutationUserErrors(record?.orderCancelUserErrors),
      ];
      const hasPartialVariants =
        operation.name === "update_product_variants" &&
        input.allowPartialUpdates === true &&
        Array.isArray(record?.productVariants) &&
        record.productVariants.length > 0;
      const hasPartialFiles =
        operation.name === "create_files" && Array.isArray(record?.files) && record.files.length > 0;
      if (errors.length && !hasPartialVariants && !hasPartialFiles)
        throw new ProviderRequestError(422, `Shopify ${operation.field}: ${errors.join("; ")}`);
      if (operation.name === "get_job" && record) {
        if (typeof record.done !== "boolean") throw new ProviderRequestError(502, "Shopify job is missing done");
        return { job: { ...record, status: record.done ? "COMPLETED" : "RUNNING" } };
      }
      if (operation.name === "get_file" && record && typeof record.fileStatus !== "string") {
        throw new ProviderRequestError(400, "The supplied ID does not identify a Shopify file");
      }
      return operation.operationType === "read"
        ? { [operation.field]: value }
        : requiredResponseRecord(value, operation.field);
    },
  ]),
);
