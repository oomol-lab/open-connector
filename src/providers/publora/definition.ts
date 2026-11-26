import type { ProviderDefinition } from "../../core/types.ts";

import { publoraActions } from "./actions.ts";

const service = "publora";

export const provider: ProviderDefinition = {
  service,
  displayName: "Publora",
  description:
    "Draft, schedule and publish posts to LinkedIn, X, Instagram, Threads, TikTok, YouTube, Facebook Pages, Bluesky, Mastodon and Telegram, then follow each post's delivery on every account.",
  categories: ["Social", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk_...",
      description:
        "Publora API key sent in the x-publora-key header. Create one on the API page of the Publora dashboard: https://docs.publora.com/authentication.",
    },
  ],
  homepageUrl: "https://publora.com",
  actions: publoraActions,
};
