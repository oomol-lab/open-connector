import type { ProviderDefinition } from "../../core/types.ts";

import { postonceActions } from "./actions.ts";

const service = "postonce";

export const provider: ProviderDefinition = {
  service,
  displayName: "PostOnce",
  description:
    "Publish and schedule posts to LinkedIn, X, Threads, Bluesky, Facebook Pages, Instagram, TikTok, YouTube and Pinterest from one request, then track delivery and post analytics.",
  categories: ["Social", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "po_live_...",
      description:
        "PostOnce API key sent as Authorization: Bearer API_KEY. Create one in the PostOnce dashboard with the posts and accounts scopes the actions need: https://docs.postonce.to/getting-started/authentication.",
    },
  ],
  homepageUrl: "https://postonce.to",
  actions: postonceActions,
};
