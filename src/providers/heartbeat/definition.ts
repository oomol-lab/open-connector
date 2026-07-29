import type { ProviderDefinition } from "../../core/types.ts";

import { heartbeatActions } from "./actions.ts";

const credentialHelpUrl = "https://help.heartbeat.chat/hc/en-us/articles/33257714954001-Heartbeat-API";

export const provider: ProviderDefinition = {
  service: "heartbeat",
  displayName: "Heartbeat",
  categories: ["Communication", "Social"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "heartbeat_api_key",
      description: `Heartbeat API key sent as a Bearer token. Create it from Settings > System > API Keys in your Heartbeat community: ${credentialHelpUrl}.`,
    },
  ],
  homepageUrl: "https://www.heartbeat.chat",
  actions: heartbeatActions,
};
