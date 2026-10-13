import type { ActionDefinition } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { operations } from "./operation-definitions.ts";

const lifecycleByName: Record<string, ActionDefinition["asyncLifecycle"]> = {
  remove_collection_products: {
    startActionId: "shopify.remove_collection_products",
    statusActionId: "shopify.get_job",
  },
  cancel_order: { startActionId: "shopify.cancel_order", statusActionId: "shopify.get_job" },
  delete_product: { startActionId: "shopify.delete_product", statusActionId: "shopify.get_product_operation" },
  duplicate_product: { startActionId: "shopify.duplicate_product", statusActionId: "shopify.get_product_operation" },
  create_files: { startActionId: "shopify.create_files", statusActionId: "shopify.get_file" },
};

export const operationActions: ActionDefinition[] = operations.map((operation) => {
  return defineProviderAction("shopify", {
    name: operation.name,
    description: operation.description,
    operationType: operation.operationType,
    requiredScopes: [],
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
    asyncLifecycle: lifecycleByName[operation.name],
    followUpActions:
      operation.name === "delete_product" || operation.name === "duplicate_product"
        ? ["shopify.get_product_operation"]
        : operation.name === "create_files"
          ? ["shopify.get_file"]
          : undefined,
  });
});
