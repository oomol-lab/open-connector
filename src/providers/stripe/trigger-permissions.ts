export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "stripe.on_event",
    name: "Account Event",
    description: "Lists, creates, updates and deletes webhook endpoints to receive selected Stripe account events.",
    providerPermissions: [],
    instructions:
      "Use a secret key or restricted key with permission to read and write webhook endpoints in the selected account and mode.",
  },
];
