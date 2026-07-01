import type { ProviderDefinition } from "../../core/types.ts";

import { agentMailActions } from "./actions.ts";

const service = "agent_mail";

export const provider: ProviderDefinition = {
  service,
  displayName: "AgentMail",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "am_...",
      description:
        "AgentMail API key used with the Authorization Bearer header. Create it in the AgentMail Console API Keys section.",
    },
  ],
  homepageUrl: "https://agentmail.to",
  actions: agentMailActions,
};
