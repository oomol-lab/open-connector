export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "woocommerce.on_store_event",
    name: "Store Event",
    description: "Lists, creates, updates and deletes store webhooks for the selected WooCommerce topic.",
    providerPermissions: [],
    instructions:
      "Use a REST API consumer key with Read/Write permissions and an associated user permitted to manage webhooks.",
  },
];
