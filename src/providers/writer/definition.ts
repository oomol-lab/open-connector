import type { ProviderDefinition } from "../../core/types.ts";

import { writerActions } from "./actions.ts";

const service = "writer";

export const provider: ProviderDefinition = {
  service,
  displayName: "Writer",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WRITER_API_KEY",
      description:
        "Writer API key used with the Authorization Bearer header. Create it in AI Studio Admin Settings > API Keys.",
    },
  ],
  homepageUrl: "https://writer.com",
  actions: writerActions,
};
