import type { ProviderDefinition } from "../../core/types.ts";

import { latchshotActions } from "./actions.ts";

const service = "latchshot";

export const provider: ProviderDefinition = {
  service,
  displayName: "Latchshot",
  description: "Render guarded screenshots and PDFs of public web pages without running a browser locally.",
  categories: ["Developer Tools", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ls_live_...",
      description:
        "Latchshot API key sent as a Bearer token. Get a recurring Free-plan key from https://latchshot.fly.dev/?intent=openconnector#trial.",
    },
  ],
  homepageUrl: "https://latchshot.fly.dev",
  actions: latchshotActions,
};
