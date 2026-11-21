import type { ProviderDefinition } from "../../core/types.ts";

import { lurkapiActions } from "./actions.ts";

const service = "lurkapi";

export const provider: ProviderDefinition = {
  service,
  displayName: "LurkAPI",
  description:
    "Read public social media data as JSON: profiles, posts, comments, transcripts and ad libraries from TikTok, Instagram, YouTube, Facebook, Reddit, LinkedIn, X, Google and more, plus any web page.",
  categories: ["Social", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "lk_live_...",
      description:
        "LurkAPI key sent with the x-api-key header. Sign in at https://lurkapi.com/login and create a key on the dashboard. New accounts start with free credits.",
    },
  ],
  homepageUrl: "https://lurkapi.com",
  actions: lurkapiActions,
};
