import type { ProviderDefinition } from "../../core/types.ts";

import { linkfoxAiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "linkfox_ai",
  displayName: "LinkFox AI",
  categories: ["AI", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "LinkFox AI API Key",
      placeholder: "LINKFOX_API_KEY",
      description:
        "Use a LinkFox AI Team plan API key from https://ai.linkfox.com/usercenter/team/api-guide (Team menu → API Settings → Member API Credentials). This is separate from LinkFox Selection keys. Requests use Bearer authentication.",
    },
  ],
  homepageUrl: "https://ai.linkfox.com",
  actions: linkfoxAiActions,
};
