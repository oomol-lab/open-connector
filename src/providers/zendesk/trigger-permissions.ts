export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "zendesk.on_event",
    name: "Event Subscription",
    description:
      "Lists, creates, updates and deletes webhooks and reads their signing secrets to receive and verify selected Zendesk events.",
    providerPermissions: ["read", "write"],
    instructions:
      "Requires an administrator or a role allowed to manage webhooks. OAuth needs read and write access; API tokens inherit the connected user permissions.",
  },
];
