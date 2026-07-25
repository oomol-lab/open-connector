import type { ProviderDefinition } from "../../core/types.ts";

import { agentQQActions } from "./actions.ts";

const service = "agent_qq";

export const provider: ProviderDefinition = {
  service,
  displayName: "AgentMail (QQ)",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "OAuth Access Token",
      placeholder: "at_...",
      description:
        "AgentMail OAuth access token used with the Authorization Bearer header. Get one by running `agently-cli auth login` or completing the OAuth device flow.",
    },
  ],
  homepageUrl: "https://agent.qq.com",
  actions: agentQQActions,
};
