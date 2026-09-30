export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "shopify.on_shop_event",
    name: "Store Event",
    description: "Creates and deletes shop webhooks and receives the configured store event topic.",
    providerPermissions: [],
    instructions:
      "The Admin API token must have the access scopes required by the selected webhook topic; protected customer data topics may require additional approval. Topic-specific permissions are checked by Shopify.",
  },
];
