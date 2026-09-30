export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "feishu_app_bot.on_event",
    name: "Application Event",
    description:
      "Receives selected application events through a shared source and manages configured document, calendar or approval resource subscriptions.",
    providerPermissions: [],
    instructions:
      "Enable the selected events and their required API permissions in the Feishu app console. Resource subscriptions additionally require access to the selected document, calendar or approval definition; permissions vary by event and resource.",
  },
];
