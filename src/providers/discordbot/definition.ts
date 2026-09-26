import type { ProviderDefinition } from "../../core/types.ts";

import { discordbotGuildActions } from "./actions-guilds.ts";
import { discordbotActions } from "./actions.ts";

const service = "discordbot";

export const provider: ProviderDefinition = {
  service,
  displayName: "Discord Bot",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Bot Token",
      placeholder: "Discord bot token",
      description:
        "Discord bot token sent as Authorization: Bot <token>. Create a bot in the Discord Developer Portal and invite it to the guilds you want to manage.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://discord.com/developers/docs",
  actions: [...discordbotActions, ...discordbotGuildActions],
};
